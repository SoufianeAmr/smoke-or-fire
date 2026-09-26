"""Live mode: the real services.

Wind: the whole 693-point grid is refreshed in a background thread every 3 hours.
One refresh is 693 Open-Meteo calls, over the free tier's 600 a minute, so it
takes about 2 minutes; requests never wait for it, they read the last grid.
Fires and AQHI: fetched when asked, cached for 15 minutes.
"""

import logging
import threading
import time
from datetime import datetime, timedelta, timezone

import httpx

from smoke_engine.feeds import FeedUnavailable, sources
from smoke_engine.wind import GRID_POINTS

log = logging.getLogger("smoke_engine.live")

WIND_REFRESH_EVERY = timedelta(hours=3)
WIND_RETRY_AFTER = timedelta(minutes=5)
CACHE_FOR = timedelta(minutes=15)


def _bucket(t: datetime) -> datetime:
    """Start of the 15-minute slot holding t; fire and AQHI queries are cached per slot."""
    minutes = int(CACHE_FOR.total_seconds() // 60)
    return t.replace(minute=t.minute - t.minute % minutes, second=0, microsecond=0)


class LiveFeeds:
    def __init__(self, client: httpx.Client | None = None):
        self._client = client or httpx.Client(headers={"User-Agent": sources.USER_AGENT}, timeout=120)
        self._lock = threading.Lock()
        self._wind: list | None = None
        self._wind_fetched_at: datetime | None = None
        self._wind_error: str | None = None
        self._cache: dict = {}
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    # --- background wind refresh ---------------------------------------------------------------

    def start(self) -> None:
        self._thread = threading.Thread(target=self._refresh_loop, name="wind-refresh", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _refresh_loop(self) -> None:
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
            self._client, sources.OPEN_METEO_LIVE, GRID_POINTS, past_days="2", forecast_days="2"
        )
        if len(answer) != len(GRID_POINTS):
            raise FeedUnavailable(f"Open-Meteo answered for {len(answer)} of {len(GRID_POINTS)} grid points")
        with self._lock:
            self._wind = answer
            self._wind_fetched_at = datetime.now(timezone.utc)
            self._wind_error = None
        log.info("wind grid refreshed in %.0f s", time.monotonic() - started)

    def status(self) -> dict:
        with self._lock:
            hours = self._wind[0]["hourly"]["time"] if self._wind else []
            return {
                "windReady": self._wind is not None,
                "windFetchedAt": self._wind_fetched_at.strftime("%Y-%m-%dT%H:%M:%SZ") if self._wind_fetched_at else None,
                "windCovers": [hours[0] + "Z", hours[-1] + "Z"] if hours else None,
                "windLastError": self._wind_error,
            }

    # --- feed interface ------------------------------------------------------------------------

    def wind(self, points, start, end):
        with self._lock:
            if self._wind is None:
                raise FeedUnavailable("the live wind grid has not loaded yet")
            return self._wind

    def active_fires(self, at):
        slot = _bucket(at)
        params = sources.active_fires_params(slot, slot + CACHE_FOR)
        return self._cached(("active_fires", slot), sources.CWFIS_ACTIVE_FIRES, params)

    def hotspots(self, start, end):
        slot = _bucket(end)
        params = sources.hotspots_params(slot - timedelta(hours=24) - CACHE_FOR, slot + CACHE_FOR)
        return self._cached(("hotspots", slot), sources.CWFIS_HOTSPOTS, params)

    def aqhi_stations(self):
        slot = _bucket(datetime.now(timezone.utc))
        return self._cached(("aqhi_stations", slot), sources.ECCC_STATIONS, sources.stations_params())

    def aqhi_readings(self, station_id, start, end):
        slot = _bucket(end)
        params = sources.readings_params(station_id, slot - timedelta(hours=2) - CACHE_FOR, slot + CACHE_FOR)
        return self._cached(("aqhi_readings", station_id, slot), sources.ECCC_READINGS, params)

    def _cached(self, key, url: str, params: dict):
        now = time.monotonic()
        with self._lock:
            self._cache = {k: v for k, v in self._cache.items() if v[0] > now}
            if key in self._cache:
                return self._cache[key][1]
        try:
            response = self._client.get(url, params=params)
            response.raise_for_status()
            answer = response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise FeedUnavailable(f"{url}: {type(error).__name__}: {error}") from error
        with self._lock:
            self._cache[key] = (now + CACHE_FOR.total_seconds(), answer)
        return answer
