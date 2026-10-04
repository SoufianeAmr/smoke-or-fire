"""Live mode after a restart: the saved wind grid is used if it is under 6 hours old.

The outside services are faked at the HTTP transport; the engine's live feed is real.
"""

import threading
import time
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from smoke_engine.app import create_app
from smoke_engine.feeds.live import LiveFeeds
from tests.fakes import uniform_wind

REFRESHED_AT = datetime(2025, 8, 25, 12, tzinfo=timezone.utc)
MONCTON_LIVE = {"lat": 46.09, "lon": -64.78, "mode": "live"}


def services(open_meteo_up: bool) -> httpx.Client:
    """Open-Meteo answers with a west wind (or is down); CWFIS and ECCC answer with nothing."""
    wind = uniform_wind(from_deg=270, speed_ms=5)

    def handle(request: httpx.Request) -> httpx.Response:
        if "open-meteo" in request.url.host:
            if not open_meteo_up:
                return httpx.Response(503)
            lats = [float(v) for v in request.url.params["latitude"].split(",")]
            lons = [float(v) for v in request.url.params["longitude"].split(",")]
            answer = wind(list(zip(lats, lons)), REFRESHED_AT - timedelta(days=2), REFRESHED_AT + timedelta(days=2))
            return httpx.Response(200, json=answer)
        return httpx.Response(200, json={"type": "FeatureCollection", "features": []})

    return httpx.Client(transport=httpx.MockTransport(handle))


@pytest.mark.parametrize(
    ("hours_later", "expected"),
    [(1, (200, None)), (7, (503, "wind_data_unavailable"))],
    ids=["saved-1h-ago", "saved-7h-ago"],
)
def test_after_a_restart_live_mode_uses_the_saved_wind_grid_only_if_under_6_hours_old(tmp_path, hours_later, expected):
    wind_file = tmp_path / "live-wind.json"
    before_restart = LiveFeeds(client=services(True), wind_file=wind_file, now=lambda: REFRESHED_AT, sleep=lambda s: None)
    before_restart.refresh_wind()

    restart_time = REFRESHED_AT + timedelta(hours=hours_later)
    restarted = LiveFeeds(
        client=services(False), wind_file=wind_file, now=lambda: restart_time, sleep=lambda s: None
    )
    app = create_app({"live": restarted}, now=lambda: restart_time, lifespan=restarted.lifespan)
    with TestClient(app) as client:
        response = client.get("/verdict", params=MONCTON_LIVE)

    assert (response.status_code, response.json().get("error")) == expected


# --- A cold start: Render wipes the disk when a free service spins down, so the first wind grid takes about
# two minutes to load. Until then a live verdict says the engine is warming up, so the app keeps trying
# instead of showing "no data". ---------------------------------------------------------------------


def _slow_services(grid_ready: threading.Event) -> httpx.Client:
    """Open-Meteo answers only once `grid_ready` is set (the first grid is still loading); the rest answer with nothing."""
    wind = uniform_wind(from_deg=270, speed_ms=5)

    def handle(request: httpx.Request) -> httpx.Response:
        if "open-meteo" in request.url.host:
            grid_ready.wait(5)
            lats = [float(v) for v in request.url.params["latitude"].split(",")]
            lons = [float(v) for v in request.url.params["longitude"].split(",")]
            answer = wind(list(zip(lats, lons)), REFRESHED_AT - timedelta(days=2), REFRESHED_AT + timedelta(days=2))
            return httpx.Response(200, json=answer)
        return httpx.Response(200, json={"type": "FeatureCollection", "features": []})

    return httpx.Client(transport=httpx.MockTransport(handle))


def test_before_the_first_wind_grid_has_loaded_a_live_verdict_says_the_engine_is_warming_up(tmp_path):
    grid_ready = threading.Event()
    feeds = LiveFeeds(client=_slow_services(grid_ready), wind_file=tmp_path / "live-wind.json", now=lambda: REFRESHED_AT, sleep=lambda s: None)
    app = create_app({"live": feeds}, now=lambda: REFRESHED_AT, lifespan=feeds.lifespan)
    with TestClient(app) as client:
        response = client.get("/verdict", params=MONCTON_LIVE)
        grid_ready.set()

    assert (response.status_code, response.json(), response.headers.get("retry-after")) == (
        503,
        {"error": "wind_data_unavailable", "status": "warming"},
        "15",
    )


def test_after_a_failed_first_refresh_a_live_verdict_is_plainly_unavailable_not_warming(tmp_path):
    feeds = LiveFeeds(client=services(False), wind_file=tmp_path / "live-wind.json", now=lambda: REFRESHED_AT, sleep=lambda s: None)
    app = create_app({"live": feeds}, now=lambda: REFRESHED_AT, lifespan=feeds.lifespan)
    with TestClient(app) as client:
        deadline = time.monotonic() + 5
        while feeds.status()["windLastError"] is None and time.monotonic() < deadline:
            time.sleep(0.02)
        response = client.get("/verdict", params=MONCTON_LIVE)

    assert feeds.status()["windLastError"] is not None
    assert (response.status_code, response.json(), response.headers.get("retry-after")) == (503, {"error": "wind_data_unavailable"}, None)
