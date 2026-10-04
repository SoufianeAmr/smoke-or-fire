"""Live mode: the real services.

Wind: the whole 693-point grid is refreshed in a background thread every 3 hours.
One refresh is 693 Open-Meteo calls, over the free tier's 600 a minute, so it
takes about 2 minutes; requests never wait for it, they read the last grid.
Each refresh is saved to disk; after a restart a saved grid under 6 hours old
is used at once, so live mode answers immediately.
NASA FIRMS: the 4 near-real-time sources are refreshed in another background
thread every 10 minutes, and saved to disk the same way. Detections older than
30 minutes count as FIRMS being down. The MAP_KEY is masked in every log line,
error and saved file.
CWFIS fires and AQHI: fetched when asked, cached for 15 minutes.
ECCC alerts: asked at every check, never cached, and given 5 seconds to answer. When an alert is active, a
second query asks for its zone's outline (for the map), with 5 seconds of its own.
New Brunswick burn categories: the list of all 15 counties, fetched when asked, kept for the 15-minute slot and
given 5 seconds in all to answer; a failure is remembered for 2 minutes. The person's point is never sent.
"""

import json
import logging
import os
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

from smoke_engine.feeds import FeedUnavailable, sources
from smoke_engine.wind import GRID_POINTS

log = logging.getLogger("smoke_engine.live")

WIND_REFRESH_EVERY = timedelta(hours=3)
WIND_RETRY_AFTER = timedelta(minutes=5)
SAVED_WIND_MAX_AGE = timedelta(hours=6)
CACHE_FOR = timedelta(minutes=15)
WIND_FILE = Path(__file__).resolve().parents[2] / ".cache" / "live-wind.json"
FIRMS_REFRESH_EVERY = timedelta(minutes=10)
FIRMS_MAX_AGE = timedelta(minutes=30)
FIRMS_DAY_RANGE = 2  # today and yesterday (UTC); the verdict keeps the 24 hours before the check
FIRMS_FILE = WIND_FILE.with_name("live-firms.json")
ALERTS_TIMEOUT = 5.0  # seconds: a slow alerts service must never hold up the verdict
BURN_TIMEOUT = 5.0  # seconds for its three requests together, for the same reason
BURN_RETRY_AFTER = timedelta(minutes=2)  # while the province does not answer, checks do not each wait for it


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class _MaskKey(logging.Filter):
    """Replaces the MAP_KEY in log records (httpx logs every request URL at INFO)."""

    def __init__(self, key: str):
        super().__init__()
        self._key = key

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        if self._key in message:
            record.msg, record.args = sources.mask_key(message, self._key), None
        return True


def _bucket(t: datetime) -> datetime:
    """Start of the 15-minute slot holding t; fire and AQHI queries are cached per slot."""
    minutes = int(CACHE_FOR.total_seconds() // 60)
    return t.replace(minute=t.minute - t.minute % minutes, second=0, microsecond=0)


class LiveFeeds:
    def __init__(
        self,
        client: httpx.Client | None = None,
        wind_file: Path = WIND_FILE,
        firms_file: Path = FIRMS_FILE,
        firms_key: str | None = None,
        now=_utc_now,
        sleep=time.sleep,
    ):
        self._client = client or httpx.Client(headers={"User-Agent": sources.USER_AGENT}, timeout=120)
        self._wind_file = Path(wind_file)
        self._now = now
        self._sleep = sleep
        self._lock = threading.Lock()
        self._wind: list | None = None
        self._wind_fetched_at: datetime | None = None
        self._wind_run: datetime | None = None
        self._wind_error: str | None = None
        self._firms_file = Path(firms_file)
        self._firms_key = firms_key
        self._firms: dict[str, str] | None = None
        self._firms_fetched_at: datetime | None = None
        self._firms_error: str | None = None
        if firms_key:
            for name in ("httpx", "httpcore"):
                logging.getLogger(name).addFilter(_MaskKey(firms_key))
        self._cache: dict = {}
        self._burn_lock = threading.Lock()
        self._burn: tuple[datetime, dict] | None = None  # the 15-minute slot, and the province's answer in it
        self._burn_down_until: datetime | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    # --- background wind refresh ---------------------------------------------------------------

    @asynccontextmanager
    async def lifespan(self, app):
        """FastAPI lifespan: load the saved grid and start refreshing; stop on shutdown."""
        self.start()
        yield
        self.stop()

    def start(self) -> None:
        self._load_saved_wind()
        self._load_saved_firms()
        self._thread = threading.Thread(target=self._refresh_loop, name="wind-refresh", daemon=True)
        self._thread.start()
        threading.Thread(target=self._firms_loop, name="firms-refresh", daemon=True).start()

    def stop(self) -> None:
        self._stop.set()

    def _load_saved_wind(self) -> None:
        try:
            saved = json.loads(self._wind_file.read_text(encoding="utf-8"))
            fetched_at = datetime.fromisoformat(saved["fetchedAt"].replace("Z", "+00:00"))
        except (OSError, ValueError, KeyError) as error:
            log.info("no saved wind grid used (%s)", type(error).__name__)
            return
        age = self._now() - fetched_at
        if age >= SAVED_WIND_MAX_AGE or len(saved.get("answer", [])) != len(GRID_POINTS):
            log.info("saved wind grid from %s not used (%.1f h old)", saved["fetchedAt"], age.total_seconds() / 3600)
            return
        try:
            run = datetime.fromisoformat(saved["modelRun"].replace("Z", "+00:00"))
        except (KeyError, AttributeError, ValueError):
            run = None
        with self._lock:
            self._wind, self._wind_fetched_at, self._wind_run = saved["answer"], fetched_at, run
        log.info("using saved wind grid from %s (%.1f h old)", saved["fetchedAt"], age.total_seconds() / 3600)

    def _refresh_loop(self) -> None:
        with self._lock:
            fetched_at = self._wind_fetched_at
        # A fresh saved grid sets the schedule: refresh when it turns 3 hours old.
        first_wait = (fetched_at + WIND_REFRESH_EVERY - self._now()) if fetched_at else timedelta(0)
        self._stop.wait(max(0.0, first_wait.total_seconds()))
        while not self._stop.is_set():
            try:
                self.refresh_wind()
                wait = WIND_REFRESH_EVERY
            except Exception as error:  # keep the last good grid; try again soon
                self._wind_error = f"{type(error).__name__}: {error}"
                log.warning("wind refresh failed: %s", self._wind_error)
                wait = WIND_RETRY_AFTER
            self._stop.wait(wait.total_seconds())

    def refresh_wind(self) -> None:
        started = time.monotonic()
        answer, _ = sources.fetch_open_meteo(
            self._client, sources.OPEN_METEO_LIVE, GRID_POINTS, sleep=self._sleep, past_days="2", forecast_days="2"
        )
        if len(answer) != len(GRID_POINTS):
            raise FeedUnavailable(f"Open-Meteo answered for {len(answer)} of {len(GRID_POINTS)} grid points")
        fetched_at = self._now()
        run = self._model_run()
        with self._lock:
            self._wind = answer
            self._wind_fetched_at = fetched_at
            self._wind_run = run
            self._wind_error = None
        self._save_wind(answer, fetched_at, run)
        log.info("wind grid refreshed in %.0f s", time.monotonic() - started)

    def _model_run(self) -> datetime | None:
        """The newest model run Open-Meteo holds, read just after the grid. The winds never wait on it: None if it fails."""
        try:
            response = self._client.get(sources.OPEN_METEO_MODEL_RUN, timeout=30)
            response.raise_for_status()
            return datetime.fromtimestamp(response.json()["last_run_initialisation_time"], timezone.utc)
        except (httpx.HTTPError, ValueError, KeyError, TypeError, OverflowError, OSError) as error:
            log.warning("no model run time from Open-Meteo: %s", type(error).__name__)
            return None

    def _save_wind(self, answer: list, fetched_at: datetime, run: datetime | None) -> None:
        """Write the grid next to its fetch time and model run; replace the old file only once fully written."""
        self._wind_file.parent.mkdir(parents=True, exist_ok=True)
        partial = self._wind_file.with_suffix(".partial")
        saved = {
            "fetchedAt": fetched_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "modelRun": run.strftime("%Y-%m-%dT%H:%M:%SZ") if run else None,
            "answer": answer,
        }
        partial.write_text(json.dumps(saved, separators=(",", ":")), encoding="utf-8")
        os.replace(partial, self._wind_file)

    # --- background FIRMS refresh --------------------------------------------------------------

    def _load_saved_firms(self) -> None:
        try:
            saved = json.loads(self._firms_file.read_text(encoding="utf-8"))
            fetched_at = datetime.fromisoformat(saved["fetchedAt"].replace("Z", "+00:00"))
            answers = saved["answers"]
        except (OSError, ValueError, KeyError) as error:
            log.info("no saved FIRMS detections used (%s)", type(error).__name__)
            return
        age = self._now() - fetched_at
        if age >= FIRMS_MAX_AGE or set(answers) != set(sources.FIRMS_LIVE_SOURCES):
            log.info("saved FIRMS detections from %s not used (%.0f min old)", saved["fetchedAt"], age.total_seconds() / 60)
            return
        with self._lock:
            self._firms, self._firms_fetched_at = answers, fetched_at
        log.info("using saved FIRMS detections from %s (%.0f min old)", saved["fetchedAt"], age.total_seconds() / 60)

    def _firms_loop(self) -> None:
        with self._lock:
            fetched_at = self._firms_fetched_at
        first_wait = (fetched_at + FIRMS_REFRESH_EVERY - self._now()) if fetched_at else timedelta(0)
        self._stop.wait(max(0.0, first_wait.total_seconds()))
        while not self._stop.is_set():
            try:
                self.refresh_firms()
            except FeedUnavailable:
                pass  # logged by refresh_firms; the last good detections stay until they are 30 minutes old
            self._stop.wait(FIRMS_REFRESH_EVERY.total_seconds())

    def refresh_firms(self) -> None:
        """Fetch the 4 near-real-time FIRMS sources; all must answer with CSV, or the last good set is kept."""
        key = self._firms_key
        answers = {}
        try:
            if not key:
                raise FeedUnavailable("FIRMS_MAP_KEY is not set")
            for source in sources.FIRMS_LIVE_SOURCES:
                response = self._client.get(sources.firms_area_url(key, source, FIRMS_DAY_RANGE))
                response.raise_for_status()
                if not response.text.startswith("latitude,"):
                    raise FeedUnavailable(f"{source}: FIRMS answered without CSV: {response.text[:120]!r}")
                answers[source] = response.text
        except (httpx.HTTPError, FeedUnavailable) as error:
            message = sources.mask_key(f"{type(error).__name__}: {error}", key)
            with self._lock:
                self._firms_error = message
            log.warning("FIRMS refresh failed: %s", message)
            raise FeedUnavailable(message) from None
        fetched_at = self._now()
        with self._lock:
            self._firms, self._firms_fetched_at, self._firms_error = answers, fetched_at, None
        self._save_firms(answers, fetched_at)
        rows = sum(max(0, len(text.strip().splitlines()) - 1) for text in answers.values())
        log.info("FIRMS refreshed: %d detections from %d sources", rows, len(answers))

    def _save_firms(self, answers: dict[str, str], fetched_at: datetime) -> None:
        self._firms_file.parent.mkdir(parents=True, exist_ok=True)
        partial = self._firms_file.with_suffix(".partial")
        partial.write_text(
            json.dumps({"fetchedAt": fetched_at.strftime("%Y-%m-%dT%H:%M:%SZ"), "answers": answers}, separators=(",", ":")),
            encoding="utf-8",
        )
        os.replace(partial, self._firms_file)

    def warming(self) -> bool:
        """True while the first wind grid since the start is still loading: no grid yet, and no refresh has failed.

        Render wipes a free service's disk when it spins down, so after a wake-up the grid takes about two minutes
        to load. A live verdict asked in that time says the engine is warming up, and the app keeps trying."""
        with self._lock:
            return self._wind is None and self._wind_error is None

    def status(self) -> dict:
        with self._lock:
            hours = self._wind[0]["hourly"]["time"] if self._wind else []
            return {
                "windReady": self._wind is not None,
                "windFetchedAt": self._wind_fetched_at.strftime("%Y-%m-%dT%H:%M:%SZ") if self._wind_fetched_at else None,
                "windCovers": [hours[0] + "Z", hours[-1] + "Z"] if hours else None,
                "windLastError": self._wind_error,
                "firmsFetchedAt": self._firms_fetched_at.strftime("%Y-%m-%dT%H:%M:%SZ") if self._firms_fetched_at else None,
                "firmsLastError": self._firms_error,
            }

    # --- feed interface ------------------------------------------------------------------------

    def wind(self, points, start, end):
        with self._lock:
            if self._wind is None:
                raise FeedUnavailable("the live wind grid has not loaded yet")
            return self._wind

    def wind_facts(self):
        """The newest model run in the live winds; they are fetched, not recorded."""
        with self._lock:
            return {"run": self._wind_run, "recordedAt": None}

    def firms(self, start, end):
        with self._lock:
            if self._firms is None or self._now() - self._firms_fetched_at >= FIRMS_MAX_AGE:
                raise FeedUnavailable("no FIRMS detections fetched in the last 30 minutes")
            return self._firms

    def checked_at(self, source, at):
        """When the answer used for a check at `at` was fetched: FIRMS's last refresh, or the older
        of the two cached CWFIS answers (active fires and hotspots)."""
        with self._lock:
            if source == "firms":
                return self._firms_fetched_at
            entries = [self._cache.get((name, _bucket(at))) for name in ("active_fires", "hotspots")]
            return min(e[2] for e in entries) if all(entries) else None

    def active_fires(self, at):
        slot = _bucket(at)
        params = sources.active_fires_params(slot, slot + CACHE_FOR)
        return self._cached(("active_fires", slot), sources.CWFIS_ACTIVE_FIRES, params)

    def hotspots(self, start, end):
        slot = _bucket(end)
        params = sources.hotspots_params(slot - timedelta(hours=24) - CACHE_FOR, slot + CACHE_FOR)
        return self._cached(("hotspots", slot), sources.CWFIS_HOTSPOTS, params)

    def aqhi_stations(self):
        slot = _bucket(self._now())
        return self._cached(("aqhi_stations", slot), sources.ECCC_STATIONS, sources.stations_params())

    def aqhi_readings(self, station_id, start, end):
        slot = _bucket(end)
        params = sources.readings_params(station_id, slot - timedelta(hours=2) - CACHE_FOR, slot + CACHE_FOR)
        return self._cached(("aqhi_readings", station_id, slot), sources.ECCC_READINGS, params)

    def alerts(self, lat, lon, at):
        """ECCC's alerts in effect at the point. It lists what is in effect now, so a check for another time gets no answer."""
        if abs(self._now() - at) > CACHE_FOR:
            raise FeedUnavailable(f"{sources.ECCC_ALERTS}: no alerts kept for {at:%Y-%m-%dT%H:%MZ}")
        try:
            response = self._client.get(sources.ECCC_ALERTS, params=sources.alerts_params(lat, lon), timeout=ALERTS_TIMEOUT)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise FeedUnavailable(f"{sources.ECCC_ALERTS}: {type(error).__name__}: {error}") from error

    def alert_zones(self, lat, lon, at):
        """The alerts in effect at the point with their zones' outlines, for the map: asked only when an alert is
        active, in a query of its own, so the alert check above stays as small and as quick as it was. An answer
        is kept 15 minutes for its point: checks from one town under one alert ask ECCC for the outline once."""
        if abs(self._now() - at) > CACHE_FOR:
            raise FeedUnavailable(f"{sources.ECCC_ALERTS}: no alerts kept for {at:%Y-%m-%dT%H:%MZ}")
        return self._cached(("alert_zones", lat, lon), sources.ECCC_ALERTS, sources.alert_zones_params(lat, lon), timeout=ALERTS_TIMEOUT)

    def burn_categories(self, at):
        """The province's burn category of every county: its two lists, the first layer's description, and when they
        were fetched. It lists what is in effect now, so a check for another time gets no answer."""
        now = self._now()
        if abs(now - at) > CACHE_FOR:
            raise FeedUnavailable(f"{sources.GNB_BURN_SERVICE}: no burn categories kept for {at:%Y-%m-%dT%H:%MZ}")
        slot = _bucket(now)
        # One fetch at a time: checks that arrive together wait for the same answer, and for 5 seconds at most.
        with self._burn_lock:
            if self._burn and self._burn[0] == slot:
                return self._burn[1]
            if self._burn_down_until and now < self._burn_down_until:
                raise FeedUnavailable(f"{sources.GNB_BURN_SERVICE}: did not answer; asked again after {self._burn_down_until:%H:%M:%SZ}")
            answer, deadline = {}, time.monotonic() + BURN_TIMEOUT
            try:
                for name, (url, params) in sources.burn_requests().items():
                    left = deadline - time.monotonic()  # the three requests share the 5 seconds
                    if left <= 0:
                        raise FeedUnavailable(f"{url}: not asked, the province took over {BURN_TIMEOUT:g} seconds")
                    response = self._client.get(url, params=params, timeout=left)
                    response.raise_for_status()
                    answer[name] = response.json()
                    # ArcGIS sends its errors with HTTP 200: one is a failure, never an answer to keep.
                    if isinstance(answer[name], dict) and "error" in answer[name]:
                        raise FeedUnavailable(f"{url}: {answer[name]['error']}")
            except (httpx.HTTPError, ValueError, FeedUnavailable) as error:
                self._burn_down_until = now + BURN_RETRY_AFTER
                raise FeedUnavailable(f"{sources.GNB_BURN_SERVICE}: {type(error).__name__}: {error}") from error
            self._burn = (slot, {**answer, "checkedAt": now})
            return self._burn[1]

    def _cached(self, key, url: str, params: dict, timeout: float | None = None):
        now = time.monotonic()
        with self._lock:
            self._cache = {k: v for k, v in self._cache.items() if v[0] > now}
            if key in self._cache:
                return self._cache[key][1]
        fetched_at = self._now()
        try:
            response = self._client.get(url, params=params, **({} if timeout is None else {"timeout": timeout}))
            response.raise_for_status()
            answer = response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise FeedUnavailable(f"{url}: {type(error).__name__}: {error}") from error
        with self._lock:
            self._cache[key] = (now + CACHE_FOR.total_seconds(), answer, fetched_at)
        return answer
