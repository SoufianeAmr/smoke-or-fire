"""GET /verdict, tested over HTTP with fake outside data sources."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from smoke_engine.app import create_app
from tests.fakes import (
    MONCTON_STATION,
    SUMMERSIDE_STATION,
    FakeFeeds,
    active_fire,
    aqhi_reading,
    firms_detection,
    hotspot,
    uniform_wind,
    wind_by_height,
    wind_shift,
)

MONCTON = {"lat": 46.09, "lon": -64.78}
NOON_UTC = "2025-08-25T12:00:00Z"


def get_verdict(feeds, **params):
    client = TestClient(create_app({"live": feeds, "replay": feeds}))
    query = {**MONCTON, "time": NOON_UTC, "mode": "live", **params}
    return client.get("/verdict", params=query)


def test_health_answers_ok():
    client = TestClient(create_app({"live": FakeFeeds(wind=uniform_wind(270, 5))}))

    response = client.get("/health")

    assert (response.status_code, response.json()["status"]) == (200, "ok")


def test_a_web_page_on_another_origin_may_call_the_engine():
    client = TestClient(create_app({"live": FakeFeeds(wind=uniform_wind(270, 5))}))

    response = client.get("/health", headers={"Origin": "https://smoke-or-fire.example"})

    assert response.headers.get("access-control-allow-origin") == "*"


@pytest.mark.parametrize(
    ("mode", "expected_time"),
    [("replay", "2025-08-25T12:00:00Z"), ("live", "2026-09-26T19:30:00Z")],
)
def test_time_defaults_to_the_replay_moment_or_now(mode, expected_time):
    feeds = FakeFeeds(wind=uniform_wind(from_deg=270, speed_ms=5))
    now = lambda: datetime(2026, 9, 26, 19, 30, tzinfo=timezone.utc)  # noqa: E731
    client = TestClient(create_app({"live": feeds, "replay": feeds}, now=now))

    body = client.get("/verdict", params={**MONCTON, "mode": mode}).json()

    assert body["time"] == expected_time


def test_wind_from_the_west_traces_the_air_back_to_the_west():
    feeds = FakeFeeds(wind=uniform_wind(from_deg=270, speed_ms=5))

    body = get_verdict(feeds).json()

    for path in body["heights"]["paths"].values():
        earlier_points = path["points"][1:]
        assert earlier_points and all(p["lon"] < MONCTON["lon"] for p in earlier_points)


def test_no_fires_in_range_gives_unexplained_smoke():
    feeds = FakeFeeds(wind=uniform_wind(from_deg=270, speed_ms=5), active_fires=[], hotspots=[])

    body = get_verdict(feeds).json()

    assert (body["verdict"], body["noFiresInRange"]) == ("unexplained", True)


def test_the_place_and_where_the_air_came_from_are_described():
    # 2 m/s from the west for 24 h = 172.8 km due west of Moncton, still in N.B.
    feeds = FakeFeeds(wind=uniform_wind(from_deg=270, speed_ms=2))

    body = get_verdict(feeds).json()

    described = (body["location"]["name"], body["path"]["hoursTraced"], body["path"]["origin"])
    assert described == ("Moncton", 24, {"hoursAgo": 24, "area": "NB", "km": 173, "compass": "W"})


def test_the_biggest_wind_shift_is_timed():
    # The wind turns from 270° to 200° at 03:00 UTC, 9 hours before the noon check.
    feeds = FakeFeeds(wind=wind_shift(before=270, after=200, at="2025-08-25T03:00:00Z", speed_ms=3))

    shift = get_verdict(feeds).json()["wind"]["biggestShift"]

    assert shift == {"time": "2025-08-25T03:00:00Z", "hoursAgo": 9, "fromDeg": 270, "toDeg": 200}


def test_both_fire_sources_down_is_an_error_not_no_fires():
    feeds = FakeFeeds(wind=uniform_wind(from_deg=270, speed_ms=5), down={"hotspots", "firms"})

    response = get_verdict(feeds)

    assert (response.status_code, response.json()["error"]) == (503, "fire_data_unavailable")


# A 5 m/s west wind carries the air 18 km an hour along 46.09°N. A hotspot
# 90 km west of Moncton and 5 km north of that line is passed 5 hours back.
KM_PER_DEGREE_LON = 111.32 * 0.6934  # cos(46.09°)
FIRE_WEST_OF_MONCTON = hotspot(lat=46.09 + 5 / 111.2, lon=-64.78 - 90 / KM_PER_DEGREE_LON, seen="2025-08-25T06:00:00Z")


def test_fire_5_km_from_the_path_is_drifting_smoke_with_high_confidence():
    feeds = FakeFeeds(wind=uniform_wind(from_deg=270, speed_ms=5), hotspots=[FIRE_WEST_OF_MONCTON])

    body = get_verdict(feeds).json()

    approach = body["closestApproach"]
    assert (body["verdict"], body["confidence"], approach["km"], approach["hoursAgo"]) == ("drifting", "high", 5, 5)


def test_unnamed_fire_is_described_by_its_nearest_community():
    # Two hotspots 1 km either side of Salisbury, N.B. (NRCan: 46.02885, -65.04329),
    # 21.42 km from the Moncton check point at a bearing of 251.6° (WSW). Newest seen 3 h before noon.
    one_km_lon = 0.01295
    feeds = FakeFeeds(
        wind=uniform_wind(from_deg=270, speed_ms=5),
        hotspots=[
            hotspot(lat=46.02885, lon=-65.04329 - one_km_lon, seen="2025-08-25T06:00:00Z"),
            hotspot(lat=46.02885, lon=-65.04329 + one_km_lon, seen="2025-08-25T09:00:00Z"),
        ],
    )

    fire = get_verdict(feeds).json()["closestApproach"]["fire"]

    described = {k: fire[k] for k in ("name", "nearCommunity", "province", "km", "compass", "lastSeenHoursAgo")}
    assert described == {"name": None, "nearCommunity": "Salisbury", "province": "NB", "km": 21, "compass": "WSW", "lastSeenHoursAgo": 3}


def test_fire_listed_in_fire_names_takes_its_public_name():
    at_long_lake = hotspot(lat=44.694, lon=-65.206, seen="2025-08-25T07:00:00Z")
    feeds = FakeFeeds(wind=uniform_wind(from_deg=270, speed_ms=5), hotspots=[at_long_lake])

    fire = get_verdict(feeds).json()["nearestFire"]

    assert (fire["name"], fire["locality"]) == ("Long Lake", "West Dalhousie")


def test_aqhi_is_the_nearest_stations_newest_reading_at_or_before_the_time():
    feeds = FakeFeeds(
        wind=uniform_wind(from_deg=270, speed_ms=5),
        aqhi_stations=[SUMMERSIDE_STATION, MONCTON_STATION],
        aqhi_readings=[
            aqhi_reading("DADHJ", "2025-08-25T10:00:00Z", 3.2),
            aqhi_reading("DADHJ", "2025-08-25T11:00:00Z", 6.6),
            aqhi_reading("DADHJ", "2025-08-25T13:00:00Z", 2.0),  # after the check time
            aqhi_reading("BADSZ", "2025-08-25T12:00:00Z", 1.0),  # farther station
        ],
    )

    aqhi = get_verdict(feeds).json()["aqhi"]

    shown = (aqhi["station"]["id"], aqhi["observedAt"], aqhi["display"], aqhi["segments"], aqhi["category"])
    assert shown == ("DADHJ", "2025-08-25T11:00:00Z", "7", 7, "high")


def test_aqhi_above_10_shows_as_10_plus():
    feeds = FakeFeeds(
        wind=uniform_wind(from_deg=270, speed_ms=5),
        aqhi_stations=[MONCTON_STATION],
        aqhi_readings=[aqhi_reading("DADHJ", "2025-08-25T12:00:00Z", 11.0)],
    )

    aqhi = get_verdict(feeds).json()["aqhi"]

    assert (aqhi["display"], aqhi["segments"], aqhi["category"]) == ("10+", 11, "very_high")


@pytest.mark.parametrize(
    ("readings", "down"),
    [
        ([aqhi_reading("DADHJ", "2025-08-25T09:59:00Z", 4.0)], ()),  # just over 2 h old
        ([aqhi_reading("DADHJ", "2025-08-25T12:00:00Z", 4.0)], ("aqhi",)),  # service down
    ],
    ids=["stale", "down"],
)
def test_aqhi_is_null_without_a_reading_from_the_last_2_hours(readings, down):
    feeds = FakeFeeds(
        wind=uniform_wind(from_deg=270, speed_ms=5),
        aqhi_stations=[MONCTON_STATION],
        aqhi_readings=readings,
        down=down,
    )

    response = get_verdict(feeds)

    assert (response.status_code, response.json()["aqhi"]) == (200, None)


@pytest.mark.parametrize(("stage", "counted"), [("OC", True), ("BH", True), ("UC", False)])
def test_only_fires_out_of_control_or_being_held_count(stage, counted):
    beside_moncton = active_fire(lat=46.14, lon=-64.85, stage=stage)
    feeds = FakeFeeds(wind=uniform_wind(from_deg=270, speed_ms=5), active_fires=[beside_moncton])

    body = get_verdict(feeds).json()

    assert body["noFiresInRange"] is not counted


def test_fire_15_km_downwind_is_not_drifting_smoke_and_is_reported_as_nearest_fire():
    # A west wind brings the air from the west; this fire is 15 km EAST of Moncton,
    # so the closest point of the path to it is the start (the user), not the air's route.
    downwind = hotspot(lat=46.09, lon=-64.78 + 15 / KM_PER_DEGREE_LON, seen="2025-08-25T06:00:00Z")
    feeds = FakeFeeds(wind=uniform_wind(from_deg=270, speed_ms=5), hotspots=[downwind])

    body = get_verdict(feeds).json()

    assert (body["verdict"], body["closestApproach"], body["nearestFire"]["km"]) == ("unexplained", None, 15)


def test_heights_that_disagree_lower_confidence_by_one_level():
    # At 100 m the air passes the fire (drifting, high); higher up it comes from
    # the east and never nears it (unexplained). The closest height gives the verdict.
    winds = wind_by_height({"100m": (270, 5), "925hPa": (90, 5), "850hPa": (90, 5)})
    feeds = FakeFeeds(wind=winds, hotspots=[FIRE_WEST_OF_MONCTON])

    body = get_verdict(feeds).json()

    assert (body["verdict"], body["confidence"], body["heights"]["agree"]) == ("drifting", "medium", False)


# FIRE_WEST_OF_MONCTON, 0.5 km (or 2 km) farther east.
KM_EAST = 1 / KM_PER_DEGREE_LON


def test_a_firms_detection_and_a_cwfis_hotspot_within_1_km_and_30_minutes_are_one_detection():
    lat, lon = FIRE_WEST_OF_MONCTON["lat"], FIRE_WEST_OF_MONCTON["lon"]
    feeds = FakeFeeds(
        wind=uniform_wind(from_deg=270, speed_ms=5),
        hotspots=[FIRE_WEST_OF_MONCTON],  # seen 06:00 UTC
        firms=[firms_detection(lat, lon + 0.5 * KM_EAST, seen="2025-08-25T06:20:00Z")],
    )

    detections = get_verdict(feeds).json()["closestApproach"]["fire"]["detections"]

    assert (detections["total"], detections["bySource"]) == (1, {"FIRMS": 0, "CWFIS": 0, "both": 1})


def test_a_firms_detection_2_km_from_a_cwfis_hotspot_is_a_second_detection_of_the_same_fire():
    lat, lon = FIRE_WEST_OF_MONCTON["lat"], FIRE_WEST_OF_MONCTON["lon"]
    feeds = FakeFeeds(
        wind=uniform_wind(from_deg=270, speed_ms=5),
        hotspots=[FIRE_WEST_OF_MONCTON],
        firms=[firms_detection(lat, lon + 2 * KM_EAST, seen="2025-08-25T06:00:00Z")],
    )

    detections = get_verdict(feeds).json()["closestApproach"]["fire"]["detections"]

    assert (detections["total"], detections["bySource"]) == (2, {"FIRMS": 1, "CWFIS": 1, "both": 0})


def test_firms_down_gives_the_verdict_from_cwfis_alone():
    feeds = FakeFeeds(wind=uniform_wind(from_deg=270, speed_ms=5), hotspots=[FIRE_WEST_OF_MONCTON], down={"firms"})

    response = get_verdict(feeds)

    body = response.json()
    assert (response.status_code, body["verdict"], body["sources"]["cwfis"]["ok"], body["sources"]["firms"]["ok"]) == (
        200, "drifting", True, False
    )


def test_cwfis_down_gives_the_verdict_from_firms_alone():
    lat, lon = FIRE_WEST_OF_MONCTON["lat"], FIRE_WEST_OF_MONCTON["lon"]
    feeds = FakeFeeds(
        wind=uniform_wind(from_deg=270, speed_ms=5),
        firms=[firms_detection(lat, lon, seen="2025-08-25T06:12:00Z")],
        down={"hotspots"},
    )

    body = get_verdict(feeds).json()

    assert (body["verdict"], body["sources"]["cwfis"]["ok"], body["sources"]["firms"]["ok"]) == ("drifting", False, True)


def test_a_fires_last_sighting_names_the_satellite_and_how_fast_its_data_came_in():
    # CWFIS saw the fire at 06:00; NOAA-21 saw it again at 11:20, 40 minutes before the noon check (ultra real-time).
    lat, lon = FIRE_WEST_OF_MONCTON["lat"], FIRE_WEST_OF_MONCTON["lon"]
    feeds = FakeFeeds(
        wind=uniform_wind(from_deg=270, speed_ms=5),
        hotspots=[FIRE_WEST_OF_MONCTON],
        firms=[firms_detection(lat, lon, seen="2025-08-25T11:20:00Z", satellite="N21", version="2.0URT")],
    )

    fire = get_verdict(feeds).json()["closestApproach"]["fire"]

    assert fire["lastSeen"] == {
        "time": "2025-08-25T11:20:00Z",
        "hoursAgo": 1,
        "minutesAgo": 40,
        "satellite": "NOAA-21",
        "instrument": "VIIRS",
        "latencyClass": "URT",
    }


def test_a_merged_observation_keeps_the_firms_satellite_instrument_and_latency():
    # CWFIS names no satellite for its 06:00 hotspot; FIRMS saw the same spot at 06:10 from NOAA-21 (ultra real-time).
    lat, lon = FIRE_WEST_OF_MONCTON["lat"], FIRE_WEST_OF_MONCTON["lon"]
    feeds = FakeFeeds(
        wind=uniform_wind(from_deg=270, speed_ms=5),
        hotspots=[FIRE_WEST_OF_MONCTON],
        firms=[firms_detection(lat, lon + 0.5 * KM_EAST, seen="2025-08-25T06:10:00Z", satellite="N21", version="2.0URT")],
    )

    fire = get_verdict(feeds).json()["closestApproach"]["fire"]

    assert (fire["detections"]["bySource"]["both"], fire["lastSeen"]["satellite"], fire["lastSeen"]["instrument"], fire["lastSeen"]["latencyClass"]) == (
        1, "NOAA-21", "VIIRS", "URT"
    )


def test_with_no_fire_in_range_sources_say_when_the_data_was_checked_and_the_newest_detection_in_the_region():
    # CWFIS answered 3 minutes ago and FIRMS 6 min 20 s ago. FIRMS's only detection is 26 hours old,
    # outside the 24-hour window, so no fire is in range; it is still the newest detection in the region.
    noon = datetime(2025, 8, 25, 12, tzinfo=timezone.utc)
    feeds = FakeFeeds(
        wind=uniform_wind(from_deg=270, speed_ms=5),
        firms=[firms_detection(48.19, -64.92, seen="2025-08-24T10:00:00Z")],
        checked_at={"cwfis": noon - timedelta(minutes=3), "firms": noon - timedelta(minutes=6, seconds=20)},
    )
    client = TestClient(create_app({"live": feeds}, now=lambda: noon))

    body = client.get("/verdict", params={**MONCTON, "mode": "live"}).json()

    shown = (body["noFiresInRange"], body["sources"]["checkedMinutesAgo"], body["sources"]["newestDetection"])
    assert shown == (True, 7, {"time": "2025-08-24T10:00:00Z", "hoursAgo": 26, "minutesAgo": 1560})


def test_a_fire_lists_the_satellites_that_saw_it_in_the_last_24_hours_from_both_sources():
    # The NOAA-21 hotspot (06:00) and the Suomi NPP detection (06:30, 1 km west) merge as one
    # observation; both satellites still count.
    lat, lon = FIRE_WEST_OF_MONCTON["lat"], FIRE_WEST_OF_MONCTON["lon"]
    feeds = FakeFeeds(
        wind=uniform_wind(from_deg=270, speed_ms=5),
        hotspots=[
            hotspot(lat, lon, seen="2025-08-25T06:00:00Z", satellite="NOAA-21"),
            hotspot(lat, lon + 2 * KM_EAST, seen="2025-08-25T07:00:00Z"),  # no satellite named
        ],
        firms=[
            firms_detection(lat, lon + KM_EAST, seen="2025-08-25T05:10:00Z", satellite="N20"),
            firms_detection(lat, lon - KM_EAST, seen="2025-08-25T06:30:00Z", satellite="N"),
            firms_detection(lat, lon - KM_EAST, seen="2025-08-24T10:00:00Z", satellite="T"),  # 26 h old
        ],
    )

    fire = get_verdict(feeds).json()["closestApproach"]["fire"]

    assert fire["detections"]["satellites"] == ["NOAA-20", "NOAA-21", "Suomi NPP"]
