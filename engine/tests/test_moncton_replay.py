"""Acceptance: Moncton, 2025-08-25 12:00 UTC, from the recorded data in data/replay/ (no network)."""

from fastapi.testclient import TestClient

from smoke_engine.app import create_app
from smoke_engine.feeds.replay import ReplayFeeds
from smoke_engine.geo import distance_km

# Centre of the 463 CWFIS hotspots within 15 km of the Long Lake fire, Aug 24–25, 2025.
LONG_LAKE_HOTSPOT_CENTRE = (44.694, -65.206)


def test_moncton_on_aug_25_2025_is_drifting_smoke_from_the_long_lake_fire():
    client = TestClient(create_app({"replay": ReplayFeeds()}))

    body = client.get(
        "/verdict", params={"lat": 46.09, "lon": -64.78, "time": "2025-08-25T12:00:00Z", "mode": "replay"}
    ).json()

    fire = (body.get("closestApproach") or {}).get("fire") or {}
    km_from_long_lake = distance_km(fire.get("lat", 0), fire.get("lon", 0), *LONG_LAKE_HOTSPOT_CENTRE)
    assert (body["verdict"], fire.get("name"), km_from_long_lake <= 15) == ("drifting", "Long Lake", True)


def test_the_moncton_replay_uses_the_saved_firms_archive_detections_of_the_long_lake_fire():
    client = TestClient(create_app({"replay": ReplayFeeds()}))

    body = client.get(
        "/verdict", params={"lat": 46.09, "lon": -64.78, "time": "2025-08-25T12:00:00Z", "mode": "replay"}
    ).json()

    firms = body["sources"]["firms"]
    seen_by = body["closestApproach"]["fire"]["detections"]["bySource"]
    assert (firms["ok"], firms["countsByLatencyClass"]["SP"] > 0, seen_by["FIRMS"] + seen_by["both"] > 0) == (True, True, True)


def test_recorded_replay_data_has_no_check_age():
    client = TestClient(create_app({"replay": ReplayFeeds()}))

    body = client.get(
        "/verdict", params={"lat": 46.09, "lon": -64.78, "time": "2025-08-25T12:00:00Z", "mode": "replay"}
    ).json()

    assert body["sources"]["checkedMinutesAgo"] is None
