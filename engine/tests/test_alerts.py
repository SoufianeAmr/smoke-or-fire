"""The ECCC air-quality alert on GET /verdict: active, none in effect, or not checked. Never a guess.

First with fake feeds that answer in ECCC's shape, then the live feed with HTTP faked at the
transport, then the recorded messages of Aug 23 to 26, 2025 (no network).
"""

from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from smoke_engine.alerts import air_quality_alert
from smoke_engine.app import create_app
from smoke_engine.feeds.live import LiveFeeds
from smoke_engine.feeds.replay import REPLAY_DIR, ReplayFeeds
from tests.fakes import ALERTS_ANSWERED_AT, FROST_ADVISORY, FakeFeeds, alerts_answer, hotspot, uniform_wind, weather_alert

MONCTON = {"lat": 46.09, "lon": -64.78}
BANGOR_MAINE = {"lat": 44.8, "lon": -68.77}
MID_BAY_OF_FUNDY = {"lat": 45.0, "lon": -65.75}
SAINT_JOHN = {"lat": 45.25917, "lon": -66.03889}
NOON_UTC = "2025-08-25T12:00:00Z"
WEST_WIND = uniform_wind(from_deg=270, speed_ms=5)
HEAT_WARNING = weather_alert(code="EHW", name_en="heat warning", name_fr="avertissement de chaleur")


def air_quality(feeds, **params) -> dict:
    client = TestClient(create_app({"live": feeds, "replay": feeds}))
    response = client.get("/verdict", params={**MONCTON, "time": NOON_UTC, "mode": "live", **params})
    return response.json()["alerts"]["airQuality"]


@pytest.mark.parametrize(
    ("alerts", "state"),
    [
        ([], "none"),
        ([FROST_ADVISORY], "none"),
        ([weather_alert()], "active"),
        ([weather_alert(status="issued")], "active"),
        ([weather_alert(status="changed_from")], "active"),
        ([HEAT_WARNING, weather_alert()], "active"),
        ([weather_alert(status="ended")], "none"),
        # The code AQW has not changed since 2024; the name has, three times. Either one is enough.
        ([weather_alert(code=None)], "active"),
        ([weather_alert(code="XYZ", name_en="yellow warning - air quality", name_fr="avertissement jaune - qualité de l’air")], "active"),
        ([weather_alert(code="AQW", name_en="", name_fr="")], "active"),
        ([weather_alert(code="SAS", name_en="special air quality statement", name_fr="bulletin spécial sur la qualité de l'air", colour=None)], "active"),
        # Either language's name is enough, with or without its accents and its curly apostrophe.
        ([weather_alert(code="XYZ", name_en="", name_fr="avertissement jaune - qualité de l’air")], "active"),
        ([weather_alert(code="XYZ", name_en="yellow warning - air quality", name_fr="")], "active"),
        ([weather_alert(code="XYZ", name_en="", name_fr="AVERTISSEMENT - QUALITE DE L'AIR")], "active"),
        # Quebec's air-quality alert is a smog warning.
        ([weather_alert(code="SMW", name_en="smog warning", name_fr="avertissement de smog")], "active"),
    ],
    ids=[
        "nothing-listed", "only-a-frost-advisory", "continued", "issued", "changed", "heat-and-air-quality", "ended",
        "no-code", "new-code-and-name", "code-alone", "statement-of-2025", "french-name-alone", "english-name-alone",
        "french-name-plain", "smog-warning",
    ],
)
def test_an_air_quality_alert_listed_for_the_point_and_still_in_effect_is_active(alerts, state):
    feeds = FakeFeeds(wind=WEST_WIND, alerts=alerts)

    assert air_quality(feeds)["state"] == state


def test_an_active_alert_is_passed_on_in_eccc_s_own_words_with_its_zone_and_times():
    feeds = FakeFeeds(wind=WEST_WIND, alerts=[HEAT_WARNING, weather_alert()])

    assert air_quality(feeds) == {
        "state": "active",
        "source": "eccc_geomet",
        "checkedAt": "2025-08-25T12:00:02Z",
        "alert": {
            "code": "AQW",
            "nameEn": "air quality warning",
            "nameFr": "avertissement de qualité de l'air",
            "colourEn": "yellow",
            "colourFr": "jaune",
            "zoneEn": "Moncton and Southeast New Brunswick",
            "zoneFr": "Moncton et sud-est du Nouveau-Brunswick",
            "issued": "2025-08-25T07:50:39Z",
            "expires": "2025-08-25T23:50:39Z",
            "url": None,
        },
    }


def test_alert_times_given_with_another_offset_are_passed_on_in_utc():
    feeds = FakeFeeds(wind=WEST_WIND, alerts=[weather_alert(issued="2025-08-25T04:50:39-03:00", expires="2025-08-25T20:50:39-03:00")])

    alert = air_quality(feeds)["alert"]

    assert (alert["issued"], alert["expires"]) == ("2025-08-25T07:50:39Z", "2025-08-25T23:50:39Z")


def test_of_two_air_quality_alerts_in_effect_the_newest_is_given():
    older = weather_alert(issued="2025-08-25T01:00:00.000Z", colour=("yellow", "jaune"))
    newer = weather_alert(issued="2025-08-25T09:00:00.000Z", colour=("orange", "orange"))
    feeds = FakeFeeds(wind=WEST_WIND, alerts=[newer, older])

    alert = air_quality(feeds)["alert"]

    assert (alert["issued"], alert["colourEn"]) == ("2025-08-25T09:00:00Z", "orange")


def test_no_alert_in_effect_says_when_eccc_answered_and_gives_no_alert():
    feeds = FakeFeeds(wind=WEST_WIND, alerts=[FROST_ADVISORY])

    assert air_quality(feeds) == {"state": "none", "source": "eccc_geomet", "checkedAt": "2025-08-25T12:00:02Z", "alert": None}


NOT_AN_ANSWER = {
    "service-down": None,
    "an-error-object": {"code": "NoApplicableCode", "description": "query error (check logs)"},
    "not-a-collection": {"type": "ServiceExceptionReport", "features": []},
    "no-features-list": {"type": "FeatureCollection", "numberMatched": 0, "numberReturned": 0},
    "no-count": {"type": "FeatureCollection", "features": []},
    # A cut-off page: ECCC matched more alerts than it sent.
    "more-matched-than-sent": {**alerts_answer([weather_alert()]), "numberMatched": 81},
    "a-feature-without-properties": {**alerts_answer([{"type": "Feature", "id": "x"}])},
    # Nothing tells what kind of alert this is.
    "a-feature-with-no-code-or-name": alerts_answer([{"type": "Feature", "properties": {"status_en": "continued"}}]),
    # The statuses ECCC uses are not documented: one never seen before is not read as in effect, or as over.
    "an-unknown-status": alerts_answer([weather_alert(status="weird")]),
    "no-status": alerts_answer([weather_alert(status=None)]),
    # ECCC lists only alerts that have not expired: one past its expiry means the list is stale.
    "already-expired": alerts_answer([weather_alert(expires="2025-08-25T11:59:00.000Z")]),
    "no-expiry-time": alerts_answer([{**weather_alert(), "properties": {k: v for k, v in weather_alert()["properties"].items() if k != "expiration_datetime"}}]),
    "a-time-without-a-zone": alerts_answer([weather_alert(expires="2025-08-25T23:50:39")]),
    "a-time-that-is-not-one": alerts_answer([weather_alert(issued="soon")]),
    # A value in a shape ECCC has never sent: still an answer to the person, never an error.
    "a-code-that-is-a-list": alerts_answer([{**weather_alert(), "properties": {**weather_alert()["properties"], "alert_code": ["AQW"]}}]),
    "a-status-that-is-a-list": alerts_answer([{**weather_alert(), "properties": {**weather_alert()["properties"], "status_en": ["continued"]}}]),
    "a-name-that-is-a-number": alerts_answer([{**weather_alert(code=None), "properties": {**weather_alert(code=None)["properties"], "alert_name_en": 7, "alert_name_fr": 7}}]),
}


@pytest.mark.parametrize("answer", NOT_AN_ANSWER.values(), ids=NOT_AN_ANSWER.keys())
def test_an_answer_that_cannot_be_read_for_certain_is_not_checked_and_the_verdict_is_still_given(answer):
    feeds = FakeFeeds(wind=WEST_WIND, alerts=answer or [], down={"alerts"} if answer is None else ())
    client = TestClient(create_app({"live": feeds}))

    response = client.get("/verdict", params={**MONCTON, "time": NOON_UTC, "mode": "live"})

    body = response.json()
    assert (response.status_code, body["verdict"], body["alerts"]["airQuality"]) == (
        200,
        "unexplained",
        {"state": "not_checked", "source": "eccc_geomet", "checkedAt": None, "alert": None},
    )


@pytest.mark.parametrize("place", [BANGOR_MAINE, MID_BAY_OF_FUNDY], ids=["bangor", "mid-bay-of-fundy"])
def test_outside_canada_eccc_is_not_asked_because_its_silence_there_is_not_no_alert(place):
    # ECCC answers 200 with nothing for Maine and for open water: its zones stop at the border and near the shore.
    feeds = FakeFeeds(wind=WEST_WIND, alerts=[])

    assert (air_quality(feeds, **place)["state"], feeds.alerts_asked) == ("not_checked", [])


# Along the border the map's simplified outlines cannot tell Canada from the United States: they put Lubec, Maine in
# the Bay of Fundy 5 km from New Brunswick, leave New Hampshire outside every outline beside Quebec, and put the
# New Brunswick side of the St. Croix River at St. Stephen inside Maine.
BORDER = {
    "lubec-maine": {"lat": 44.8606, "lon": -66.9842},
    "colebrook-new-hampshire": {"lat": 44.894, "lon": -71.496},
    "st-stephen-new-brunswick": {"lat": 45.194, "lon": -67.275},
}


@pytest.mark.parametrize("place", BORDER.values(), ids=BORDER.keys())
def test_in_the_border_strip_eccc_is_asked_and_its_silence_is_not_checked(place):
    feeds = FakeFeeds(wind=WEST_WIND, alerts=[])

    assert (air_quality(feeds, **place)["state"], len(feeds.alerts_asked)) == ("not_checked", 1)


@pytest.mark.parametrize(
    ("alerts", "state"),
    [([weather_alert()], "active"), ([FROST_ADVISORY], "none"), ([FROST_ADVISORY, weather_alert()], "active")],
    ids=["air-quality", "only-a-frost-advisory", "both"],
)
def test_in_the_border_strip_any_alert_eccc_lists_shows_the_point_is_in_one_of_its_zones(alerts, state):
    feeds = FakeFeeds(wind=WEST_WIND, alerts=alerts)

    assert air_quality(feeds, **BORDER["st-stephen-new-brunswick"])["state"] == state


def test_a_harbour_town_the_map_outline_leaves_in_the_water_is_still_checked():
    # Saint John's point falls in the Bay of Fundy on the simplified outlines, 2 km from New Brunswick's shore.
    feeds = FakeFeeds(wind=WEST_WIND, alerts=[weather_alert()])

    assert (air_quality(feeds, **SAINT_JOHN)["state"], feeds.alerts_asked) == ("active", [(45.25917, -66.03889)])


# 90 km west of Moncton and 5 km off the path of a 5 m/s west wind: drifting smoke, high confidence.
FIRE_WEST_OF_MONCTON = hotspot(lat=46.09 + 5 / 111.2, lon=-64.78 - 90 / (111.32 * 0.6934), seen="2025-08-25T06:00:00Z")


@pytest.mark.parametrize("fires", [[], [FIRE_WEST_OF_MONCTON]], ids=["unexplained", "drifting"])
def test_the_alert_never_changes_the_verdict(fires):
    answers = []
    for alerts in ({"alerts": [weather_alert()]}, {"alerts": []}, {"down": {"alerts"}}):
        feeds = FakeFeeds(wind=WEST_WIND, hotspots=fires, **alerts)
        client = TestClient(create_app({"live": feeds}))
        answers.append(client.get("/verdict", params={**MONCTON, "time": NOON_UTC, "mode": "live"}).json())

    states = [body.pop("alerts")["airQuality"]["state"] for body in answers]
    assert (states, answers[0] == answers[1] == answers[2]) == (["active", "none", "not_checked"], True)


# --- the live feed, with ECCC and Open-Meteo faked at the HTTP transport ---------------------------

NOW = datetime(2026, 9, 26, 19, 30, tzinfo=timezone.utc)
LIVE_ALERT = weather_alert(issued="2026-09-26T09:31:43.913Z", expires="2026-09-27T01:31:43.913Z")
MODEL_RUN = 1790359200  # 2026-09-25T18:00:00Z, as Open-Meteo gives it: seconds since 1970


def live_feeds(tmp_path, eccc, requests: list, model_run=lambda: httpx.Response(200, json={"last_run_initialisation_time": MODEL_RUN})):
    """The real live feed. Open-Meteo answers with a west wind and its newest model run; `eccc` answers the
    alerts query; CWFIS and the AQHI answer with nothing."""

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if "open-meteo" in request.url.host:
            if request.url.path.endswith("meta.json"):
                return model_run()
            lats = [float(v) for v in request.url.params["latitude"].split(",")]
            lons = [float(v) for v in request.url.params["longitude"].split(",")]
            return httpx.Response(200, json=WEST_WIND(list(zip(lats, lons)), NOW - timedelta(days=2), NOW + timedelta(days=2)))
        if "weather-alerts" in request.url.path:
            return eccc()
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


def live_verdict(feeds, **params) -> dict:
    client = TestClient(create_app({"live": feeds}, now=lambda: NOW))
    return client.get("/verdict", params={**MONCTON, "mode": "live", **params}).json()


def test_live_asks_eccc_for_the_alerts_at_the_point_longitude_first_and_filters_nothing_else(tmp_path):
    # Latitude first, or a filter on the alert type that matches nothing, gets a 200 with no alerts: a false "none".
    requests = []
    feeds = live_feeds(tmp_path, lambda: httpx.Response(200, json=alerts_answer([])), requests)

    live_verdict(feeds)

    asked = [r for r in requests if "weather-alerts" in r.url.path]
    assert [(str(r.url.copy_with(query=None)), dict(r.url.params)) for r in asked] == [
        (
            "https://api.weather.gc.ca/collections/weather-alerts/items",
            {"f": "json", "bbox": "-64.78,46.09,-64.78,46.09", "skipGeometry": "true", "limit": "50"},
        )
    ]


def test_live_gives_the_alert_in_effect_and_the_time_of_eccc_s_answer(tmp_path):
    answer = {**alerts_answer([LIVE_ALERT]), "timeStamp": "2026-09-26T19:30:01.897964Z"}
    feeds = live_feeds(tmp_path, lambda: httpx.Response(200, json=answer), [])

    alert = live_verdict(feeds)["alerts"]["airQuality"]

    assert (alert["state"], alert["checkedAt"], alert["alert"]["issued"]) == ("active", "2026-09-26T19:30:01Z", "2026-09-26T09:31:43Z")


def _timeout():
    raise httpx.ReadTimeout("ECCC did not answer in time")


ECCC_FAILS = {
    "a-server-error": lambda: httpx.Response(500, json={"code": "NoApplicableCode", "description": "query error (check logs)"}),
    "a-bad-request": lambda: httpx.Response(400, json={"code": "InvalidParameterValue"}),
    "a-web-page": lambda: httpx.Response(200, text="<html><body>Service unavailable</body></html>"),
    "an-xml-error-with-200": lambda: httpx.Response(200, text="<?xml version='1.0'?><ServiceExceptionReport/>"),
    "no-answer-in-time": _timeout,
}


@pytest.mark.parametrize("eccc", ECCC_FAILS.values(), ids=ECCC_FAILS.keys())
def test_when_eccc_fails_live_says_not_checked_and_still_gives_the_verdict(tmp_path, eccc):
    feeds = live_feeds(tmp_path, eccc, [])

    body = live_verdict(feeds)

    assert (body["verdict"], body["alerts"]["airQuality"]["state"]) == ("unexplained", "not_checked")


def test_live_waits_at_most_5_seconds_for_eccc(tmp_path):
    # The web app gives up on the whole verdict after 60 seconds; the engine's other calls may take 120.
    requests = []
    feeds = live_feeds(tmp_path, lambda: httpx.Response(200, json=alerts_answer([])), requests)

    live_verdict(feeds)

    asked = [r for r in requests if "weather-alerts" in r.url.path]
    assert [set(r.extensions["timeout"].values()) for r in asked] == [{5.0}]


def test_live_cannot_say_which_alerts_were_in_effect_at_another_time(tmp_path):
    # ECCC lists what is in effect now. Asked about last week, its list today is not an answer.
    requests = []
    feeds = live_feeds(tmp_path, lambda: httpx.Response(200, json=alerts_answer([])), requests)

    state = live_verdict(feeds, time="2026-09-26T10:00:00Z")["alerts"]["airQuality"]["state"]

    assert (state, [r for r in requests if "weather-alerts" in r.url.path]) == ("not_checked", [])


# --- the wind's source: the newest model run (live), or when the winds were recorded (replay) ------


def test_live_names_the_newest_model_run_in_its_winds(tmp_path):
    feeds = live_feeds(tmp_path, lambda: httpx.Response(200, json=alerts_answer([])), requests := [])

    wind = live_verdict(feeds)["wind"]

    asked = [str(r.url) for r in requests if r.url.path.endswith("meta.json")]
    assert (wind["model"], wind["run"], wind["recordedAt"], asked) == (
        "gfs025",
        "2026-09-25T18:00:00Z",
        None,
        ["https://api.open-meteo.com/data/ncep_gfs025/static/meta.json"],
    )


@pytest.mark.parametrize(
    "model_run",
    [lambda: httpx.Response(503), lambda: httpx.Response(200, json={"chunk_time_length": 481}), lambda: httpx.Response(200, text="not json")],
    ids=["down", "no-run-time", "not-json"],
)
def test_without_the_model_run_live_still_traces_and_gives_no_run(tmp_path, model_run):
    feeds = live_feeds(tmp_path, lambda: httpx.Response(200, json=alerts_answer([])), [], model_run=model_run)

    body = live_verdict(feeds)

    assert (body["verdict"], body["wind"]["run"]) == ("unexplained", None)


def test_after_a_restart_the_saved_winds_keep_their_model_run(tmp_path):
    live_feeds(tmp_path, lambda: httpx.Response(200, json=alerts_answer([])), [])

    def open_meteo_down(request: httpx.Request) -> httpx.Response:
        if "open-meteo" in request.url.host:
            return httpx.Response(503)
        return httpx.Response(200, json={"type": "FeatureCollection", "features": []})

    restarted = LiveFeeds(
        client=httpx.Client(transport=httpx.MockTransport(open_meteo_down)),
        wind_file=tmp_path / "live-wind.json",
        firms_file=tmp_path / "live-firms.json",
        now=lambda: NOW,
        sleep=lambda s: None,
    )
    app = create_app({"live": restarted}, now=lambda: NOW, lifespan=restarted.lifespan)
    with TestClient(app) as client:
        wind = client.get("/verdict", params={**MONCTON, "mode": "live"}).json()["wind"]

    assert wind["run"] == "2026-09-25T18:00:00Z"


# --- replay: ECCC's own messages of Aug 23 to 26, 2025, converted from the NAAD System archive copy ----

REPLAY_MONCTON = {"lat": 46.09948, "lon": -64.7998}
ARCHIVE = "https://alertsarchive.pelmorex.com/archive/"


def replay_verdict(feeds=None, **params) -> dict:
    client = TestClient(create_app({"replay": feeds or ReplayFeeds()}))
    return client.get("/verdict", params={**REPLAY_MONCTON, "mode": "replay", **params}).json()


def test_moncton_on_aug_25_2025_was_under_eccc_s_special_air_quality_statement():
    # The message in force at 12:00 UTC was sent at 07:50:39 UTC (04:50 ADT); the next came at 13:51 UTC.
    assert replay_verdict()["alerts"]["airQuality"] == {
        "state": "active",
        "source": "naad_archive",
        "checkedAt": None,
        "alert": {
            "code": "SAS",
            "nameEn": "special air quality statement",
            "nameFr": "bulletin spécial sur la qualité de l'air",
            "colourEn": None,
            "colourFr": None,
            "zoneEn": "Moncton and Southeast New Brunswick",
            "zoneFr": "Moncton et sud-est du Nouveau-Brunswick",
            "issued": "2025-08-25T07:50:39Z",
            "expires": "2025-08-25T23:50:39Z",
            "url": ARCHIVE + "2025-08-25/2025-08-25T07_51_32_18Iurn%263oid%2632.49.0.1.124.3033216116.2025_001.xml",
        },
    }


@pytest.mark.parametrize(
    ("time", "issued"),
    [("2025-08-25T00:00:00Z", "2025-08-24T18:55:17Z"), ("2025-08-25T23:00:00Z", "2025-08-25T18:53:31Z")],
    ids=["midnight", "late-evening"],
)
def test_all_through_the_replay_day_the_newest_message_sent_by_then_is_the_one_in_force(time, issued):
    alert = replay_verdict(time=time)["alerts"]["airQuality"]

    assert (alert["state"], alert["alert"]["issued"]) == ("active", issued)


def recorded(time: str, place=REPLAY_MONCTON):
    """The check itself, for times the recorded winds do not reach (they cover Aug 25 only)."""
    at = datetime.fromisoformat(time.replace("Z", "+00:00"))
    check = air_quality_alert(ReplayFeeds(), place["lat"], place["lon"], at)
    return check.state, check.alert and f"{check.alert.issued:%Y-%m-%dT%H:%M:%SZ}"


@pytest.mark.parametrize(
    ("time", "expected"),
    [
        ("2025-08-24T12:00:00Z", ("none", None)),  # the statement was first sent at 12:38:42 UTC
        ("2025-08-24T13:00:00Z", ("active", "2025-08-24T12:38:42Z")),
        ("2025-08-26T02:00:00Z", ("active", "2025-08-25T18:53:31Z")),
        # Ended at 02:15:02 UTC, while the message before it had not yet expired.
        ("2025-08-26T02:30:00Z", ("none", None)),
        ("2025-08-26T12:00:00Z", ("none", None)),
    ],
    ids=["before-it", "first-hour", "last-quarter-hour", "just-ended", "the-day-after"],
)
def test_the_recorded_messages_follow_the_statement_from_its_first_message_to_its_end(time, expected):
    assert recorded(time) == expected


@pytest.mark.parametrize("time", ["2025-08-23T12:00:00Z", "2025-08-27T00:00:00Z", "2025-10-27T12:00:00Z"], ids=["too-early", "the-end", "two-months-later"])
def test_outside_the_recorded_days_the_answer_is_not_checked(time):
    assert recorded(time) == ("not_checked", None)


@pytest.mark.parametrize(
    ("place", "expected"),
    [
        # Each zone's own message at 12:00 UTC on Aug 25, 2025.
        (SAINT_JOHN, ("active", "SAS", "Saint John and County")),
        ({"lat": 44.84158, "lon": -65.29121}, ("active", "AQW", "Annapolis County")),
        ({"lat": 45.94528, "lon": -66.66667}, ("none", None, None)),
        ({"lat": 44.6474, "lon": -63.59065}, ("none", None, None)),
    ],
    ids=["saint-john", "bridgetown", "fredericton", "halifax"],
)
def test_each_replay_town_gets_the_alert_of_its_own_forecast_zone(place, expected):
    alert = replay_verdict(**place)["alerts"]["airQuality"]

    details = alert["alert"] or {}
    assert (alert["state"], details.get("code"), details.get("zoneEn")) == expected


def test_a_recorded_day_without_alert_messages_says_not_checked():
    # The validation days hold wind, fires and AQHI only.
    feeds = ReplayFeeds(REPLAY_DIR.parent / "2025-08-26")

    alert = replay_verdict(feeds, lat=44.6474, lon=-63.59065, time="2025-08-26T12:00:00Z")["alerts"]["airQuality"]

    assert alert["state"] == "not_checked"


def test_replayed_winds_say_when_they_were_recorded_and_name_no_model_run():
    wind = replay_verdict()["wind"]

    assert (wind["run"], wind["recordedAt"]) == (None, "2026-09-26T18:51:00Z")
