"""The "map" key on GET /verdict: what the map draws, and where each layer comes from.

Informational only: it is built after the verdict and never changes it. Its shape is version 1 of
smoke_engine/schemas/map.v1.schema.json. Fake feeds first, then the live feed with HTTP faked at the
transport, then the recorded data of Aug 25, 2025 (no network).
"""

import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator

from smoke_engine.app import REPLAY_TIME, create_app
from smoke_engine.feeds.live import LiveFeeds
from smoke_engine.feeds.replay import ReplayFeeds
from smoke_engine.geo import distance_km
from smoke_engine.map import MAP_VERSION, SCHEMA_FILE, ZONE_MAX_POINTS, ZONE_TOLERANCE_DEG, _rings, _simplified, simplify_ring
from tests.fakes import (
    ALERTS_ANSWERED_AT,
    FROST_ADVISORY,
    FakeFeeds,
    active_fire,
    alerts_answer,
    firms_detection,
    hotspot,
    uniform_wind,
    weather_alert,
    wind_by_height,
    zone_of,
)

MONCTON = {"lat": 46.09, "lon": -64.78}
NOON_UTC = "2025-08-25T12:00:00Z"
WEST_WIND = uniform_wind(from_deg=270, speed_ms=5)
# 78 km due west of Moncton: a west wind carries its smoke straight there (drifting).
FIRE_WEST = hotspot(46.09, -65.78, "2025-08-25T06:00:00Z", satellite="N20", frp=31.4)
FIRE_20_KM_NORTH_OF_THE_PATH = hotspot(46.27, -65.78, "2025-08-25T06:00:00Z", satellite="N20", frp=5.0)
FIRE_FAR_NORTH = hotspot(48.0, -64.78, "2025-08-25T06:00:00Z", satellite="N20", frp=5.0)
MONCTON_ZONE = [[-65.5, 45.6], [-64.2, 45.6], [-64.2, 46.6], [-65.5, 46.6], [-65.5, 45.6]]
ROOT = Path(__file__).resolve().parents[2]
SCHEMA = Draft202012Validator(json.loads(SCHEMA_FILE.read_text(encoding="utf-8")))


def verdict(feeds, **params) -> dict:
    client = TestClient(create_app({"live": feeds, "replay": feeds}))
    return client.get("/verdict", params={**MONCTON, "time": NOON_UTC, "mode": "live", **params}).json()


def problems(map_key) -> list[str]:
    """What the schema finds wrong with a map key, as "where: what"."""
    return sorted(f"{'/'.join(str(p) for p in e.absolute_path)}: {e.message}" for e in SCHEMA.iter_errors(map_key))


# --- the contract ------------------------------------------------------------------------------------

ANSWERS = {
    "drifting": dict(hotspots=[FIRE_WEST]),
    "no-fire-in-range": dict(),
    "official-fire-and-alert-zone": dict(
        active_fires=[active_fire(46.09, -65.78, "OC")], hotspots=[FIRE_WEST], alerts=[weather_alert()],
        zones=[zone_of(weather_alert(), [MONCTON_ZONE])],
    ),
    "firms-and-cwfis": dict(hotspots=[FIRE_WEST], firms=[firms_detection(46.1, -65.7, "2025-08-25T05:10:00Z", frp=12.5)]),
    "alerts-down": dict(hotspots=[FIRE_WEST], down={"alerts"}),
}


@pytest.mark.parametrize("feeds", ANSWERS.values(), ids=ANSWERS.keys())
def test_the_map_key_is_version_1_and_matches_its_schema(feeds):
    body = verdict(FakeFeeds(wind=WEST_WIND, **feeds))

    assert (body["map"]["version"], MAP_VERSION, problems(body["map"])) == (1, 1, [])


def test_the_schema_refuses_a_layer_that_does_not_name_its_source_and_time():
    good = verdict(FakeFeeds(wind=WEST_WIND, hotspots=[FIRE_WEST]))["map"]
    without = {
        "trails": {**good, "layers": {**good["layers"], "trails": {"source": "open_meteo_gfs", "model": "gfs025"}}},
        "detections": {**good, "layers": {**good["layers"], "detections": {k: v for k, v in good["layers"]["detections"].items() if k != "newest"}}},
        "fires": {**good, "layers": {k: v for k, v in good["layers"].items() if k != "fires"}},
        "alertZone": {**good, "layers": {**good["layers"], "alertZone": {"state": "none", "outline": False}}},
    }

    assert [bool(problems(broken)) for broken in without.values()] == [True, True, True, True]


@pytest.mark.parametrize("fires", [[], [FIRE_WEST], [FIRE_20_KM_NORTH_OF_THE_PATH]], ids=["unexplained", "drifting", "drifting-20-km"])
def test_the_map_never_changes_the_verdict_or_its_confidence(fires, monkeypatch):
    feeds = FakeFeeds(wind=WEST_WIND, hotspots=fires, alerts=[weather_alert()], zones=[zone_of(weather_alert(), [MONCTON_ZONE])])
    with_map = verdict(feeds)
    monkeypatch.setattr("smoke_engine.app.map_json", lambda **kwargs: None)

    without_map = verdict(feeds)

    assert (with_map.pop("map") is not None, without_map.pop("map")) == (True, None)
    assert with_map == without_map


def test_a_map_that_cannot_be_built_never_fails_the_verdict(monkeypatch):
    def broken(**kwargs):
        raise RuntimeError("no map today")

    feeds = FakeFeeds(wind=WEST_WIND, hotspots=[FIRE_WEST])
    expected = verdict(feeds)
    monkeypatch.setattr("smoke_engine.app.map_json", broken)

    body = verdict(feeds)

    assert (body["map"], body["verdict"], body["confidence"]) == (None, expected["verdict"], expected["confidence"])


def test_a_browser_that_asks_for_it_gets_the_answer_compressed_and_it_is_the_same_answer():
    spots = [hotspot(46.09 + i / 1000, -65.78, "2025-08-25T06:00:00Z", satellite="N20", frp=float(i)) for i in range(300)]
    client = TestClient(create_app({"live": FakeFeeds(wind=WEST_WIND, hotspots=spots)}))
    query = {**MONCTON, "time": NOON_UTC, "mode": "live"}

    plain = client.get("/verdict", params=query, headers={"Accept-Encoding": "identity"})
    packed = client.get("/verdict", params=query, headers={"Accept-Encoding": "gzip"})

    assert (plain.headers.get("content-encoding"), packed.headers.get("content-encoding")) == (None, "gzip")
    assert packed.json() == plain.json() and len(packed.json()["map"]["detections"]) == 300
    # Sent as fewer than a third of the bytes.
    assert int(packed.headers["content-length"]) * 3 < int(plain.headers["content-length"])


# --- what it draws -----------------------------------------------------------------------------------


def test_the_person_and_the_three_heights_as_trails_with_a_point_every_hour():
    winds = wind_by_height({"100m": (270, 5), "925hPa": (250, 8), "850hPa": (230, 10)})
    body = verdict(FakeFeeds(wind=winds, hotspots=[FIRE_WEST]))
    trails = body["map"]["trails"]

    assert body["map"]["you"] == MONCTON
    assert [t["height"] for t in trails] == body["rules"]["heights"]
    assert [t["chosen"] for t in trails] == [t["height"] == body["heights"]["chosen"] for t in trails]
    for trail in trails:
        path = body["heights"]["paths"][trail["height"]]["points"]
        assert trail["points"] == [{"lat": p["lat"], "lon": p["lon"], "hoursAgo": p["hoursAgo"]} for p in path]
        assert [p["hoursAgo"] for p in trail["points"]] == list(range(len(path)))


def test_every_detection_the_verdict_used_with_its_time_its_power_and_who_reported_it():
    feeds = FakeFeeds(
        wind=WEST_WIND,
        hotspots=[
            FIRE_WEST,  # CWFIS alone: a report time, not an observation
            hotspot(46.1, -65.7, "2025-08-25T07:00:00Z", satellite="N20", frp=12.5),  # the FIRMS detection below, republished
            hotspot(46.3, -65.9, "2025-08-23T06:00:00Z"),  # two days old: not in the last 24 hours
            hotspot(40.0, -80.0, "2025-08-25T06:00:00Z"),  # more than 500 km away
        ],
        firms=[firms_detection(46.1, -65.7, "2025-08-25T05:10:00Z", frp=12.5), firms_detection(46.11, -65.71, "2025-08-25T05:12:00Z", confidence="l")],
    )

    body = verdict(feeds)

    assert body["map"]["detections"] == [
        {"lat": 46.1, "lon": -65.7, "time": "2025-08-25T05:10:00Z", "observed": True, "frp": 12.5, "by": "both"},
        {"lat": 46.09, "lon": -65.78, "time": "2025-08-25T06:00:00Z", "observed": False, "frp": 31.4, "by": "CWFIS"},
    ]
    assert body["map"]["layers"]["detections"] == {
        "hours": 24, "radiusKm": 500, "count": 2, "shown": 2, "newest": "2025-08-25T05:10:00Z",
        "firms": {"ok": True, "checkedAt": None}, "cwfis": {"ok": True, "checkedAt": None},
    }


def test_a_detection_with_no_power_reported_says_so():
    body = verdict(FakeFeeds(wind=WEST_WIND, hotspots=[hotspot(46.09, -65.78, "2025-08-25T06:00:00Z")]))

    assert [d["frp"] for d in body["map"]["detections"]] == [None]


def test_more_detections_than_the_map_can_carry_keeps_the_newest_and_says_how_many_there_are(monkeypatch):
    monkeypatch.setattr("smoke_engine.map.MAX_DETECTIONS", 2)
    spots = [hotspot(46.09 + i / 1000, -65.78, f"2025-08-25T0{i}:00:00Z") for i in range(1, 6)]

    body = verdict(FakeFeeds(wind=WEST_WIND, hotspots=spots))

    assert [d["time"] for d in body["map"]["detections"]] == ["2025-08-25T04:00:00Z", "2025-08-25T05:00:00Z"]
    assert (body["map"]["layers"]["detections"]["count"], body["map"]["layers"]["detections"]["shown"]) == (5, 2)


def test_only_fires_on_canada_s_official_list_are_fires_on_the_map():
    feeds = FakeFeeds(
        wind=WEST_WIND,
        active_fires=[
            active_fire(46.09, -65.78, "OC", fire_id="2025_NB_00007", size_ha=120.5),
            active_fire(47.0, -66.5, "BH", fire_id="2025_NB_00009"),
            active_fire(45.5, -66.0, "UC", fire_id="2025_NB_00011"),  # under control: the engine leaves it out
        ],
        hotspots=[FIRE_WEST, FIRE_FAR_NORTH],  # the second is a cluster with no record: detections, not a fire
        checked_at={"cwfis": datetime(2025, 8, 25, 11, 52, tzinfo=timezone.utc)},
    )

    body = verdict(feeds)

    assert body["map"]["fires"] == [
        {"id": "2025_NB_00007", "lat": 46.09, "lon": -65.78, "stage": "OC", "sizeHa": 120.5, "name": None},
        {"id": "2025_NB_00009", "lat": 47.0, "lon": -66.5, "stage": "BH", "sizeHa": 12.0, "name": None},
    ]
    assert body["map"]["layers"]["fires"] == {"source": "nrcan_cwfis", "ok": True, "checkedAt": "2025-08-25T11:52:00Z", "count": 2}


@pytest.mark.parametrize(
    ("fires", "focus"),
    [([FIRE_WEST], {"lat": 46.09, "lon": -65.78}), ([FIRE_FAR_NORTH], {"lat": 48.0, "lon": -64.78}), ([], None)],
    ids=["the-fire-on-the-path", "the-nearest-fire", "no-fire"],
)
def test_the_map_opens_on_the_fire_the_verdict_features(fires, focus):
    body = verdict(FakeFeeds(wind=WEST_WIND, hotspots=fires))
    # The fire the screen features: the one on the air's path for drifting and unclear, else the nearest.
    featured = body["closestApproach"]["fire"] if body["verdict"] in ("drifting", "unclear") else body["nearestFire"]

    assert body["map"]["focus"] == focus
    assert body["map"]["focus"] == (featured and {"lat": featured["lat"], "lon": featured["lon"]})


def test_the_winds_say_which_model_and_run_they_are():
    run = datetime(2025, 8, 25, 6, tzinfo=timezone.utc)
    body = verdict(FakeFeeds(wind=WEST_WIND, wind_facts={"run": run}))

    assert body["map"]["layers"]["trails"] == {"source": "open_meteo_gfs", "model": "gfs025", "run": "2025-08-25T06:00:00Z", "recordedAt": None}


def test_a_fire_source_that_did_not_answer_is_named_as_down():
    body = verdict(FakeFeeds(wind=WEST_WIND, hotspots=[FIRE_WEST], down={"firms"}, checked_at={"cwfis": datetime(2025, 8, 25, 11, 52, tzinfo=timezone.utc)}))

    assert body["map"]["layers"]["detections"]["firms"] == {"ok": False, "checkedAt": None}
    assert body["map"]["layers"]["detections"]["cwfis"] == {"ok": True, "checkedAt": "2025-08-25T11:52:00Z"}


# --- ECCC's alert zone -------------------------------------------------------------------------------


def test_an_active_alert_draws_its_forecast_zone_and_says_when_it_was_issued():
    alert = weather_alert()
    feeds = FakeFeeds(wind=WEST_WIND, alerts=[alert], zones=[zone_of(FROST_ADVISORY, [[[0, 0], [1, 0], [1, 1], [0, 0]]]), zone_of(alert, [MONCTON_ZONE])])

    body = verdict(feeds)

    assert body["map"]["alertZone"] == {"rings": [MONCTON_ZONE]}
    assert body["map"]["layers"]["alertZone"] == {
        "source": "eccc_geomet", "state": "active", "issued": "2025-08-25T07:50:39Z", "checkedAt": ALERTS_ANSWERED_AT[:19] + "Z", "outline": True,
    }


def test_a_zone_in_several_parts_draws_each_part():
    alert = weather_alert()
    island = [[-64.0, 46.2], [-63.9, 46.2], [-63.9, 46.3], [-64.0, 46.3], [-64.0, 46.2]]
    feeds = FakeFeeds(wind=WEST_WIND, alerts=[alert], zones=[zone_of(alert, [[MONCTON_ZONE], [island]], kind="MultiPolygon")])

    assert verdict(feeds)["map"]["alertZone"] == {"rings": [MONCTON_ZONE, island]}


@pytest.mark.parametrize(
    ("alerts", "state", "issued"),
    [([], "none", None), ([FROST_ADVISORY], "none", None), ({"type": "FeatureCollection"}, "not_checked", None)],
    ids=["none", "another-kind-of-alert", "an-answer-that-cannot-be-read"],
)
def test_without_an_active_alert_no_zone_is_drawn_and_eccc_is_not_asked_for_one(alerts, state, issued):
    feeds = FakeFeeds(wind=WEST_WIND, alerts=alerts, zones=[zone_of(weather_alert(), [MONCTON_ZONE])])

    body = verdict(feeds)

    assert (body["map"]["alertZone"], feeds.zones_asked) == (None, [])
    assert {k: body["map"]["layers"]["alertZone"][k] for k in ("state", "issued", "outline")} == {"state": state, "issued": issued, "outline": False}


ZONE_ANSWERS = {
    "the-zones-do-not-answer": dict(down={"zones"}),
    "no-zone-for-this-alert": dict(zones=[zone_of(FROST_ADVISORY, [MONCTON_ZONE])]),
    "a-zone-with-no-outline": dict(zones=[weather_alert()]),
    "an-outline-that-is-not-one": dict(zones=[{**weather_alert(), "geometry": {"type": "Polygon", "coordinates": [[["west", "north"], [1, 2]]]}}]),
    "an-answer-that-is-not-a-list": dict(zones={"oops": True}),
}


@pytest.mark.parametrize("zones", ZONE_ANSWERS.values(), ids=ZONE_ANSWERS.keys())
def test_an_active_alert_whose_zone_cannot_be_read_stays_active_with_no_outline(zones):
    body = verdict(FakeFeeds(wind=WEST_WIND, alerts=[weather_alert()], **zones))

    assert (body["alerts"]["airQuality"]["state"], body["map"]["alertZone"]) == ("active", None)
    assert {k: body["map"]["layers"]["alertZone"][k] for k in ("state", "outline")} == {"state": "active", "outline": False}


def test_a_detailed_outline_is_simplified_to_what_a_map_this_size_can_show():
    # A zone outline with a point every 100 m along a straight shore: the map needs its corners.
    shore = [[-65.5 + i / 1000, 45.6] for i in range(1300)]
    ring = [*shore, [-64.2, 46.6], [-65.5, 46.6], [-65.5, 45.6]]
    alert = weather_alert()

    zone = verdict(FakeFeeds(wind=WEST_WIND, alerts=[alert], zones=[zone_of(alert, [ring])]))["map"]["alertZone"]

    assert zone == {"rings": [[[-65.5, 45.6], [-64.201, 45.6], [-64.2, 46.6], [-65.5, 46.6], [-65.5, 45.6]]]}


def test_an_outline_too_detailed_to_send_even_simplified_is_not_sent_and_the_alert_stays_active():
    # A saw of 1,000 teeth, each three degrees tall: no tolerance the map allows removes them.
    saw = [[-70 + i / 100, 47.0 if i % 2 else 44.0] for i in range(2000)]
    alert = weather_alert()

    body = verdict(FakeFeeds(wind=WEST_WIND, alerts=[alert], zones=[zone_of(alert, [[*saw, saw[0]]])]))

    assert (body["alerts"]["airQuality"]["state"], body["map"]["alertZone"]) == ("active", None)
    assert body["map"]["layers"]["alertZone"]["outline"] is False
    assert problems(body["map"]) == []


def test_a_very_long_outline_is_thinned_first_and_still_drawn_whole():
    # A circle of 300,000 points, about a point every metre: thinned to 20,000, then simplified as any other.
    circle = [[-65.0 + 0.5 * math.cos(2 * math.pi * i / 300_000), 46.0 + 0.5 * math.sin(2 * math.pi * i / 300_000)] for i in range(300_000)]
    alert = weather_alert()

    zone = verdict(FakeFeeds(wind=WEST_WIND, alerts=[alert], zones=[zone_of(alert, [[*circle, circle[0]]])]))["map"]["alertZone"]

    [ring] = zone["rings"]
    assert ring[0] == ring[-1] and 12 <= len(ring) <= ZONE_MAX_POINTS
    assert all(abs(math.hypot((x + 65.0) * math.cos(math.radians(46.0)), y - 46.0) - 0.5) < 0.16 for x, y in ring)  # still on the circle
    lons, lats = [x for x, _ in ring], [y for _, y in ring]
    assert (round(min(lons), 1), round(max(lons), 1), round(min(lats), 1), round(max(lats), 1)) == (-65.5, -64.5, 45.5, 46.5)


def test_a_real_eccc_zone_outline_is_drawn_small_closed_and_within_500_m_of_the_original():
    """One zone outline as ECCC's API gave it on Oct 4, 2026 (tests/data/): 801 points, simplified for the map."""
    feature = json.loads((Path(__file__).parent / "data" / "eccc-alert-zone-2026-10-04.json").read_text(encoding="utf-8"))
    original = _rings(feature["geometry"])

    rings = _simplified(original)

    assert (len(original), len(original[0])) == (1, 801)
    [ring] = rings
    assert ring[0] == ring[-1] and 20 <= len(ring) <= 80
    k = math.cos(math.radians(sum(y for _, y in ring) / len(ring)))

    def off_the_outline(x: float, y: float) -> float:
        best = math.inf
        for (ax, ay), (bx, by) in zip(ring, ring[1:]):
            dx, dy = (bx - ax) * k, by - ay
            f = 0.0 if dx == dy == 0 else max(0.0, min(1.0, (((x - ax) * k) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
            best = min(best, math.hypot((x - ax) * k - f * dx, y - ay - f * dy))
        return best

    assert max(off_the_outline(x, y) for x, y in original[0]) <= ZONE_TOLERANCE_DEG + 1e-4  # 1e-4: the rounding to 4 decimals


def test_simplifying_keeps_a_ring_closed_and_its_corners():
    square = [[0.0, 0.0], [0.5, 0.0001], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], [0.0, 0.0]]

    assert simplify_ring(square, 0.01) == [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], [0.0, 0.0]]


# --- the live feed, with ECCC faked at the HTTP transport -----------------------------------------------

NOW = datetime(2026, 9, 26, 19, 30, tzinfo=timezone.utc)
LIVE_ALERT = weather_alert(issued="2026-09-26T09:31:43.913Z", expires="2026-09-27T01:31:43.913Z")


def live_feeds(tmp_path, eccc, requests: list):
    """The real live feed. Open-Meteo answers with a west wind; `eccc(request)` answers each alerts query."""

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if "open-meteo" in request.url.host:
            if request.url.path.endswith("meta.json"):
                return httpx.Response(200, json={"last_run_initialisation_time": 1790359200})
            lats = [float(v) for v in request.url.params["latitude"].split(",")]
            lons = [float(v) for v in request.url.params["longitude"].split(",")]
            return httpx.Response(200, json=WEST_WIND(list(zip(lats, lons)), NOW - timedelta(days=2), NOW + timedelta(days=2)))
        if "weather-alerts" in request.url.path:
            return eccc(request)
        return httpx.Response(200, json={"type": "FeatureCollection", "features": []})

    feeds = LiveFeeds(
        client=httpx.Client(transport=httpx.MockTransport(handle)),
        wind_file=tmp_path / "live-wind.json",
        firms_file=tmp_path / "live-firms.json",
        now=lambda: NOW,
        sleep=lambda s: None,
    )
    feeds.refresh_wind()
    return feeds


def live_verdict(feeds) -> dict:
    return TestClient(create_app({"live": feeds}, now=lambda: NOW)).get("/verdict", params={**MONCTON, "mode": "live"}).json()


def with_or_without_outline(request: httpx.Request) -> httpx.Response:
    """ECCC: the alert in effect; its zone's outline when the query does not skip geometry."""
    feature = LIVE_ALERT if request.url.params.get("skipGeometry") == "true" else zone_of(LIVE_ALERT, [MONCTON_ZONE])
    return httpx.Response(200, json=alerts_answer([feature]))


def test_live_asks_eccc_for_the_zone_s_outline_only_when_an_alert_is_active_and_in_a_second_query(tmp_path):
    requests = []
    body = live_verdict(live_feeds(tmp_path, with_or_without_outline, requests))

    asked = [dict(r.url.params) for r in requests if "weather-alerts" in r.url.path]
    assert asked == [
        {"f": "json", "bbox": "-64.78,46.09,-64.78,46.09", "skipGeometry": "true", "limit": "50"},  # the alert check, as it was
        {"f": "json", "bbox": "-64.78,46.09,-64.78,46.09", "limit": "50"},
    ]
    assert (body["alerts"]["airQuality"]["state"], body["map"]["alertZone"]) == ("active", {"rings": [MONCTON_ZONE]})

    requests.clear()
    live_verdict(live_feeds(tmp_path, lambda request: httpx.Response(200, json=alerts_answer([])), requests))
    assert len([r for r in requests if "weather-alerts" in r.url.path]) == 1


def test_live_asks_eccc_for_a_town_s_outline_once_in_15_minutes_and_for_the_alert_every_time(tmp_path):
    requests = []
    feeds = live_feeds(tmp_path, with_or_without_outline, requests)

    first, second = live_verdict(feeds), live_verdict(feeds)

    asked = ["skipGeometry" in r.url.params for r in requests if "weather-alerts" in r.url.path]
    assert asked == [True, False, True]  # the alert check, the outline, the alert check again
    assert first["map"]["alertZone"] == second["map"]["alertZone"] == {"rings": [MONCTON_ZONE]}


def test_live_waits_at_most_5_seconds_for_the_outline_and_gives_the_verdict_without_it(tmp_path):
    timeouts = []

    def eccc(request: httpx.Request) -> httpx.Response:
        if request.url.params.get("skipGeometry") == "true":
            return httpx.Response(200, json=alerts_answer([LIVE_ALERT]))
        timeouts.append(request.extensions["timeout"]["read"])
        raise httpx.ReadTimeout("ECCC did not answer in time")

    body = live_verdict(live_feeds(tmp_path, eccc, []))

    assert timeouts == [5.0]
    assert (body["verdict"], body["alerts"]["airQuality"]["state"], body["map"]["alertZone"]) == ("unexplained", "active", None)
    assert problems(body["map"]) == []


# --- the recorded data of Aug 25, 2025 ----------------------------------------------------------------


def moncton(mode: str) -> dict:
    # The replay feed under both names: live mode asked about the same moment reads the same data.
    client = TestClient(create_app({"live": ReplayFeeds(), "replay": ReplayFeeds()}, now=lambda: REPLAY_TIME))
    return client.get("/verdict", params={"lat": 46.09948, "lon": -64.7998, "time": NOON_UTC, "mode": mode}).json()


def test_moncton_on_aug_25_2025_live_and_replay_build_the_same_map():
    live, replay = moncton("live")["map"], moncton("replay")["map"]

    # One thing names the mode: where the alert was read from.
    assert (live["layers"]["alertZone"].pop("source"), replay["layers"]["alertZone"].pop("source")) == ("eccc_geomet", "naad_archive")
    assert live == replay
    assert problems(replay) == ["layers/alertZone: 'source' is a required property"]  # only what was just taken out


def test_moncton_on_aug_25_2025_the_map_shows_long_lake_its_detections_and_eccc_s_zone():
    body = moncton("replay")
    drawn = body["map"]
    long_lake = body["closestApproach"]["fire"]

    assert drawn["focus"] == {"lat": long_lake["lat"], "lon": long_lake["lon"]}
    # Long Lake has no record on Canada's list in the recorded data: it is its 456 satellite detections, never a flame.
    assert (long_lake["cwfisIds"], [f for f in drawn["fires"] if distance_km(f["lat"], f["lon"], long_lake["lat"], long_lake["lon"]) < 25]) == ([], [])
    near = [d for d in drawn["detections"] if distance_km(d["lat"], d["lon"], long_lake["lat"], long_lake["lon"]) < 25]
    assert len(near) == long_lake["detections"]["total"] == 456
    assert len(drawn["detections"]) == drawn["layers"]["detections"]["count"] == drawn["layers"]["detections"]["shown"]
    assert len(drawn["fires"]) == drawn["layers"]["fires"]["count"] > 0
    assert drawn["layers"]["detections"]["newest"] >= long_lake["lastSeen"]["time"]
    assert drawn["layers"]["trails"] == {"source": "open_meteo_gfs", "model": "gfs025", "run": None, "recordedAt": body["wind"]["recordedAt"]}
    # ECCC's special air quality statement for Moncton and Southeast New Brunswick, issued 07:50 UTC: its zone holds Moncton.
    assert drawn["layers"]["alertZone"] == {"source": "naad_archive", "state": "active", "issued": "2025-08-25T07:50:39Z", "checkedAt": None, "outline": True}
    lons = [lon for ring in drawn["alertZone"]["rings"] for lon, _ in ring]
    lats = [lat for ring in drawn["alertZone"]["rings"] for _, lat in ring]
    assert min(lons) < -64.7998 < max(lons) and min(lats) < 46.09948 < max(lats)


SAVED = sorted([*(ROOT / "data" / "demo").glob("*.json"), *(ROOT / "data" / "validation" / "answers").glob("*.json")])


@pytest.mark.parametrize("file", [f for f in SAVED if f.name != "index.json"], ids=lambda f: f"{f.parent.name}/{f.stem}")
def test_every_saved_answer_carries_a_map_that_matches_the_schema(file):
    assert problems(json.loads(file.read_text(encoding="utf-8")).get("map")) == []
