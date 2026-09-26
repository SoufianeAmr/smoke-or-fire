"""Live mode with NASA FIRMS: refreshed in the background, and its MAP_KEY kept secret.

The outside services are faked at the HTTP transport; the engine's live feed is real.
"""

import json
import logging
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from smoke_engine.app import create_app
from smoke_engine.feeds import FeedUnavailable
from smoke_engine.feeds.live import LiveFeeds
from smoke_engine.feeds.replay import REPLAY_DIR
from smoke_engine.feeds.sources import firms_key
from tests.fakes import FIRMS_HEADER, firms_detection, uniform_wind

NOW = datetime(2026, 9, 26, 19, 30, tzinfo=timezone.utc)
KEY = "0123456789abcdef0123456789abcdef"  # not a real MAP_KEY
MONCTON_LIVE = {"lat": 46.09, "lon": -64.78, "mode": "live"}
# 90 km west of Moncton, on the path of a 5 m/s west wind; NOAA-21 saw it 40 minutes ago.
FIRE = firms_detection(46.09, -64.78 - 90 / (111.32 * 0.6934), seen="2026-09-26T18:50:00Z", satellite="N21", version="2.0URT")


def services(firms: dict) -> httpx.Client:
    """Open-Meteo answers with a west wind; FIRMS with one fire (or an error while firms["up"] is False);
    CWFIS and ECCC with nothing."""
    wind = uniform_wind(from_deg=270, speed_ms=5)

    def handle(request: httpx.Request) -> httpx.Response:
        if "open-meteo" in request.url.host:
            lats = [float(v) for v in request.url.params["latitude"].split(",")]
            lons = [float(v) for v in request.url.params["longitude"].split(",")]
            return httpx.Response(200, json=wind(list(zip(lats, lons)), NOW - timedelta(days=2), NOW + timedelta(days=2)))
        if "firms" in request.url.host:
            if not firms["up"]:
                return httpx.Response(500, text="Internal Server Error")
            return httpx.Response(200, text=f"{FIRMS_HEADER}\n{FIRE}\n")
        return httpx.Response(200, json={"type": "FeatureCollection", "features": []})

    return httpx.Client(transport=httpx.MockTransport(handle))


def live_feeds(tmp_path, firms: dict, now=NOW) -> LiveFeeds:
    return LiveFeeds(
        client=services(firms),
        wind_file=tmp_path / "live-wind.json",
        firms_file=tmp_path / "live-firms.json",
        firms_key=KEY,
        now=lambda: now,
        sleep=lambda s: None,
    )


@pytest.mark.parametrize(("firms_up", "expected"), [(True, (True, "drifting")), (False, (False, "unexplained"))])
def test_live_verdicts_use_firms_while_it_answers_and_cwfis_alone_when_it_is_down(tmp_path, firms_up, expected):
    feeds = live_feeds(tmp_path, {"up": firms_up})
    feeds.refresh_wind()
    try:
        feeds.refresh_firms()
    except FeedUnavailable:
        pass

    response = TestClient(create_app({"live": feeds}, now=lambda: NOW)).get("/verdict", params=MONCTON_LIVE)

    body = response.json()
    assert (response.status_code, body["sources"]["firms"]["ok"], body["verdict"]) == (200, *expected)


@pytest.mark.parametrize(("minutes_later", "firms_ok"), [(20, True), (40, False)], ids=["saved-20min-ago", "saved-40min-ago"])
def test_after_a_restart_live_mode_uses_saved_firms_detections_only_if_under_30_minutes_old(tmp_path, minutes_later, firms_ok):
    before_restart = live_feeds(tmp_path, {"up": True})
    before_restart.refresh_wind()
    before_restart.refresh_firms()

    later = NOW + timedelta(minutes=minutes_later)
    restarted = live_feeds(tmp_path, {"up": False}, now=later)
    app = create_app({"live": restarted}, now=lambda: later, lifespan=restarted.lifespan)
    with TestClient(app) as client:
        body = client.get("/verdict", params=MONCTON_LIVE).json()

    assert body["sources"]["firms"]["ok"] is firms_ok


def test_the_firms_key_is_never_saved_logged_or_shown(tmp_path, caplog):
    caplog.set_level(logging.DEBUG)
    firms = {"up": False}
    feeds = live_feeds(tmp_path, firms)
    with pytest.raises(FeedUnavailable) as failed:
        feeds.refresh_firms()
    firms["up"] = True
    feeds.refresh_firms()
    feeds.refresh_wind()
    client = TestClient(create_app({"live": feeds}, now=lambda: NOW))

    shown = [str(failed.value), client.get("/health").text, client.get("/verdict", params=MONCTON_LIVE).text]
    saved = [f.read_text(encoding="utf-8") for f in tmp_path.iterdir()]
    assert [KEY in text for text in (caplog.text, *shown, *saved)] == [False] * (1 + len(shown) + len(saved))


def test_the_replay_manifest_masks_the_firms_key():
    manifest = json.loads((REPLAY_DIR / "manifest.json").read_text(encoding="utf-8"))
    urls = [f["url"] for name, f in manifest["files"].items() if name.startswith("firms/")]
    urls.append(manifest["firms"]["availability"]["url"])

    assert urls and all("/csv/***/" in url for url in urls)
    real_key = firms_key()
    if real_key:  # a configured key must not be in any replay file
        assert not [f.name for f in REPLAY_DIR.rglob("*") if f.is_file() and real_key in f.read_text(encoding="utf-8")]


def test_live_verdicts_say_how_long_ago_the_fire_data_was_checked(tmp_path):
    # FIRMS was refreshed 4 minutes before the request; CWFIS is fetched during it.
    clock = [NOW - timedelta(minutes=4)]
    feeds = LiveFeeds(
        client=services({"up": True}),
        wind_file=tmp_path / "live-wind.json",
        firms_file=tmp_path / "live-firms.json",
        firms_key=KEY,
        now=lambda: clock[0],
        sleep=lambda s: None,
    )
    feeds.refresh_wind()
    feeds.refresh_firms()
    clock[0] = NOW

    body = TestClient(create_app({"live": feeds}, now=lambda: clock[0])).get("/verdict", params=MONCTON_LIVE).json()

    assert body["sources"]["checkedMinutesAgo"] == 4
