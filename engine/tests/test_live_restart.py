"""Live mode after a restart: the saved wind grid is used if it is under 6 hours old.

The outside services are faked at the HTTP transport; the engine's live feed is real.
"""

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
