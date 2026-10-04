"""ECCC's FireWork smoke forecast on GET /verdict, and the best time to air out: a window, none, or not available.

First the rule on its own, then fake feeds that answer in ECCC's shape, then the live feed with HTTP faked at the
transport, then the replay, then the live sample saved from MSC GeoMet on Oct 4, 2026 (no network).
"""

import json
import shutil
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from smoke_engine.app import create_app
from smoke_engine.feeds.live import LiveFeeds
from smoke_engine.feeds.replay import ReplayFeeds
from smoke_engine.smoke_forecast import LABELS, best_window, smoke_forecast, sun_is_up
from tests.fakes import SMOKE_RUN, FakeFeeds, hotspot, smoke_answers, smoke_hour, uniform_wind

MONCTON = {"lat": 46.09, "lon": -64.78}
NOON_UTC = "2025-08-25T12:00:00Z"
WEST_WIND = uniform_wind(from_deg=270, speed_ms=5)
SAMPLE = Path(__file__).resolve().parents[2] / "data" / "samples" / "smoke-forecast-moncton.json"

# Levels, in the classes of ECCC's legend: 0 is under 1 µg/m³ (no smoke drawn), 1 is 1 to 10, 2 is 10 to 20.
CLEAR, LIGHT, SMOKE = 0, 1, 2


def hours(*runs: tuple[int, int]) -> list[int]:
    """48 hourly levels from (level, how many hours) runs; the last run fills what is left."""
    levels = [level for level, count in runs for _ in range(count)]
    return (levels + [runs[-1][0]] * 48)[:48]


# --- the rule ---------------------------------------------------------------------------------------

WINDOWS = {
    "no-smoke-at-all": (hours((CLEAR, 48)), (0, 47, CLEAR)),
    "smoke-then-clear": (hours((SMOKE, 17), (CLEAR, 31)), (17, 47, CLEAR)),
    "clear-then-smoke": (hours((CLEAR, 9), (SMOKE, 39)), (0, 8, CLEAR)),
    "a-clear-morning": (hours((SMOKE, 17), (CLEAR, 5), (SMOKE, 26)), (17, 21, CLEAR)),
    # From the first clear hour to the last: 4 hourly values in a row are 3 hours.
    "exactly-3-hours": (hours((SMOKE, 10), (CLEAR, 4), (SMOKE, 34)), (10, 13, CLEAR)),
    "a-2-hour-break-is-too-short": (hours((SMOKE, 10), (CLEAR, 3), (SMOKE, 35)), None),
    "the-first-of-two-clear-stretches": (hours((SMOKE, 5), (CLEAR, 4), (SMOKE, 5), (CLEAR, 30), (SMOKE, 4)), (5, 8, CLEAR)),
    "a-short-break-then-a-long-one": (hours((SMOKE, 5), (CLEAR, 2), (SMOKE, 5), (CLEAR, 6), (SMOKE, 30)), (12, 17, CLEAR)),
    # Never clear: the hours in ECCC's lowest class are the best there is.
    "light-smoke-at-best": (hours((SMOKE, 12), (LIGHT, 6), (SMOKE, 30)), (12, 17, LIGHT)),
    "clear-later-beats-light-sooner": (hours((LIGHT, 8), (SMOKE, 10), (CLEAR, 6), (SMOKE, 24)), (18, 23, CLEAR)),
    "clear-and-light-hours-make-one-light-window": (hours((SMOKE, 6), (CLEAR, 2), (LIGHT, 1), (CLEAR, 2), (SMOKE, 37)), (6, 10, LIGHT)),
    "smoke-all-the-way": (hours((SMOKE, 20), (5, 10), (11, 18)), None),
    "never-under-10": (hours((SMOKE, 48)), None),
    "clear-only-in-the-last-2-hours": (hours((SMOKE, 45), (CLEAR, 3)), None),
    "clear-for-the-last-3-hours": (hours((SMOKE, 44), (CLEAR, 4)), (44, 47, CLEAR)),
}


@pytest.mark.parametrize(("levels", "window"), WINDOWS.values(), ids=WINDOWS.keys())
def test_the_best_time_is_the_first_3_hours_or_more_at_the_lowest_smoke_the_forecast_reaches(levels, window):
    assert best_window(levels) == window


def test_the_classes_are_named_as_eccc_s_legend_names_them():
    # As GetFeatureInfo answered on Oct 4, 2026, from the clearest air to the smokiest.
    assert LABELS == (
        "< 1 [ug/m3]", "1 - 10 [ug/m3]", "10 - 20 [ug/m3]", "20 - 30 [ug/m3]", "30 - 40 [ug/m3]", "40 - 50 [ug/m3]",
        "50 - 60 [ug/m3]", "60 - 70 [ug/m3]", "70 - 80 [ug/m3]", "80 - 90 [ug/m3]", "90 - 100 [ug/m3]", ">= 100 [ug/m3]",
    )  # fmt: skip


# --- GET /verdict, with a feed that answers in ECCC's shape ------------------------------------------

# µg/m³ for each hour from 12:00 UTC: smoke until 05:00 UTC the next day, a clear morning, then smoke again.
SMOKY_THEN_A_CLEAR_MORNING = [45.2] * 9 + [14.0] * 8 + [0.0] * 5 + [4.9455] * 3 + [25.0] * 23


def forecast(feeds, **params) -> dict:
    client = TestClient(create_app({"live": feeds, "replay": feeds}))
    response = client.get("/verdict", params={**MONCTON, "time": NOON_UTC, "mode": "live", **params})
    return response.json()["smokeForecast"]


def test_the_best_time_to_air_out_is_given_with_its_hours_its_model_run_and_the_rule():
    answer = forecast(FakeFeeds(wind=WEST_WIND, smoke=SMOKY_THEN_A_CLEAR_MORNING))

    assert {key: value for key, value in answer.items() if key != "hours"} == {
        "state": "window",
        "source": "eccc_geomet",
        "layer": "RAQDPS.Sfc_PM2.5-WildfireSmokePlume",
        "run": "2025-08-25T00:00:00Z",
        "checkedAt": "2025-08-25T12:00:03Z",
        "window": {"start": "2025-08-26T05:00:00Z", "end": "2025-08-26T09:00:00Z", "level": 0, "fromNow": False, "toEnd": False},
        "rules": {"hours": 48, "minWindowHours": 3, "maxLevel": 1, "breaks": [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]},
    }


def test_each_of_the_48_hours_has_its_time_its_smoke_and_the_class_of_eccc_s_legend():
    answer = forecast(FakeFeeds(wind=WEST_WIND, smoke=SMOKY_THEN_A_CLEAR_MORNING))

    shown = [(h["time"], h["ugm3"], h["level"]) for h in answer["hours"]]
    assert (len(shown), shown[0], shown[9], shown[17], shown[22], shown[47]) == (
        48,
        ("2025-08-25T12:00:00Z", 45.2, 5),
        ("2025-08-25T21:00:00Z", 14.0, 2),
        ("2025-08-26T05:00:00Z", 0.0, 0),
        ("2025-08-26T10:00:00Z", 4.9, 1),
        ("2025-08-27T11:00:00Z", 25.0, 3),
    )


def test_each_hour_says_whether_the_sun_is_up_there():
    # Moncton, Aug 25, 2025: the sun set at 23:10 UTC and rose at 09:31 UTC (Open-Meteo's sunrise and sunset).
    answer = forecast(FakeFeeds(wind=WEST_WIND, smoke=[0.0] * 48))

    day = "".join("d" if h["day"] else "n" for h in answer["hours"][:24])
    assert day == "d" * 12 + "n" * 10 + "d" * 2


def test_the_forecast_starts_with_the_hour_of_the_check():
    feeds = FakeFeeds(wind=WEST_WIND, smoke=[0.0] * 48)

    answer = forecast(feeds, time="2025-08-25T12:34:56Z")

    assert (answer["hours"][0]["time"], answer["hours"][-1]["time"], feeds.smoke_asked) == (
        "2025-08-25T12:00:00Z",
        "2025-08-27T11:00:00Z",
        [(46.09, -64.78, datetime(2025, 8, 25, 12, tzinfo=timezone.utc))],
    )


@pytest.mark.parametrize(
    ("smoke", "window"),
    [
        ([0.0] * 48, {"start": "2025-08-25T12:00:00Z", "end": "2025-08-27T11:00:00Z", "level": 0, "fromNow": True, "toEnd": True}),
        ([0.0] * 6 + [30.0] * 42, {"start": "2025-08-25T12:00:00Z", "end": "2025-08-25T17:00:00Z", "level": 0, "fromNow": True, "toEnd": False}),
        ([30.0] * 40 + [0.0] * 8, {"start": "2025-08-27T04:00:00Z", "end": "2025-08-27T11:00:00Z", "level": 0, "fromNow": False, "toEnd": True}),
        ([30.0] * 10 + [5.0] * 6 + [30.0] * 32, {"start": "2025-08-25T22:00:00Z", "end": "2025-08-26T03:00:00Z", "level": 1, "fromNow": False, "toEnd": False}),
    ],
    ids=["no-smoke-for-48-hours", "clear-now", "clear-to-the-last-hour", "light-smoke-at-best"],
)
def test_a_window_says_whether_it_starts_now_whether_its_end_is_known_and_how_low_the_smoke_is(smoke, window):
    assert forecast(FakeFeeds(wind=WEST_WIND, smoke=smoke))["window"] == window


def test_no_useful_window_gives_the_hours_and_no_window():
    answer = forecast(FakeFeeds(wind=WEST_WIND, smoke=[30.0] * 20 + [0.0] * 3 + [120.0] * 25))

    assert (answer["state"], answer["window"], len(answer["hours"]), answer["hours"][47]["level"]) == ("none", None, 48, 11)


def at_noon(ugm3: float = 0.0, **properties) -> dict:
    """ECCC's answer for the hour of the check, with `properties` in place of its own."""
    answer = smoke_hour(NOON_UTC, ugm3)
    answer["features"][0]["properties"].update(properties)
    return answer


def with_first_hour(first) -> callable:
    """48 clear hours, the first one replaced."""
    return lambda lat, lon, times: [first, *smoke_answers(times, [0.0] * 48)[1:]]


NOT_A_FORECAST = {
    "service-down": None,
    "too-few-hours": lambda lat, lon, times: smoke_answers(times, [0.0] * 47),
    "no-hours": lambda lat, lon, times: [],
    # GeoMet answers a point outside the model's domain with an empty object.
    "outside-the-model": with_first_hour({}),
    "an-error-text": with_first_hour("<ServiceExceptionReport/>"),
    "no-value": with_first_hour({**at_noon(), "features": []}),
    "two-values": with_first_hour({**at_noon(), "features": at_noon()["features"] * 2}),
    "another-layer": with_first_hour({**at_noon(), "layer": "RAQDPS.SFC_PM2.5"}),
    "not-a-collection": with_first_hour({**at_noon(), "type": "ServiceExceptionReport"}),
    "an-hour-for-another-time": with_first_hour(smoke_hour("2025-08-25T11:00:00Z", 0.0)),
    "a-time-without-a-zone": with_first_hour(at_noon(time="2025-08-25T12:00:00")),
    "no-model-run": with_first_hour(at_noon(dim_reference_time=None)),
    # A run published while the hours were being asked: they must all come from one.
    "hours-from-two-runs": with_first_hour(at_noon(dim_reference_time="2025-08-24T12:00:00Z")),
    "a-run-made-after-its-hours": lambda lat, lon, times: smoke_answers(times, [0.0] * 48, run="2025-08-25T18:00:00Z"),
    # The value is in kg/m³ and ECCC's class in µg/m³: a value that is not in its class means the units changed.
    "a-value-that-is-not-in-its-class": with_first_hour(at_noon(45.2, value=45.2)),
    "a-class-one-step-off": with_first_hour(at_noon(45.2, **{"class": "30 - 40 [ug/m3]"})),
    "a-class-never-seen": with_first_hour(at_noon(45.2, **{"class": "40 - 50 [ppb]"})),
    "no-class": with_first_hour(at_noon(**{"class": None})),
    "a-negative-value": with_first_hour(at_noon(value=-1e-9)),
    "a-value-that-is-text": with_first_hour(at_noon(value="0")),
    "a-value-that-is-true": with_first_hour(at_noon(value=True)),
    "a-value-that-is-not-a-number": with_first_hour(at_noon(value=float("nan"))),
}


@pytest.mark.parametrize("smoke", NOT_A_FORECAST.values(), ids=NOT_A_FORECAST.keys())
def test_a_forecast_that_cannot_be_read_for_certain_is_not_available_and_the_verdict_is_still_given(smoke):
    feeds = FakeFeeds(wind=WEST_WIND, smoke=smoke or [0.0] * 48, down={"smoke"} if smoke is None else ())
    client = TestClient(create_app({"live": feeds}))

    response = client.get("/verdict", params={**MONCTON, "time": NOON_UTC, "mode": "live"})

    body = response.json()
    assert (response.status_code, body["verdict"], body["smokeForecast"]) == (
        200,
        "unexplained",
        {
            "state": "not_available",
            "source": "eccc_geomet",
            "layer": "RAQDPS.Sfc_PM2.5-WildfireSmokePlume",
            "run": None,
            "checkedAt": None,
            "window": None,
            "hours": [],
            "rules": {"hours": 48, "minWindowHours": 3, "maxLevel": 1, "breaks": [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]},
        },
    )


@pytest.mark.parametrize(
    ("ugm3", "label", "level"),
    [(0.0, "< 1 [ug/m3]", 0), (1.0, "1 - 10 [ug/m3]", 1), (10.0, "10 - 20 [ug/m3]", 2), (10.0, "1 - 10 [ug/m3]", 1), (99.9, "90 - 100 [ug/m3]", 10), (200.6, ">= 100 [ug/m3]", 11)],
    ids=["zero", "at-1", "at-10-upper-class", "at-10-lower-class", "under-100", "over-100"],
)
def test_an_hour_takes_the_class_eccc_gives_it_also_on_the_line_between_two_classes(ugm3, label, level):
    feeds = FakeFeeds(wind=WEST_WIND, smoke=with_first_hour(at_noon(ugm3, **{"class": label})))

    assert forecast(feeds)["hours"][0]["level"] == level


# 90 km west of Moncton and 5 km off the path of a 5 m/s west wind: drifting smoke, high confidence.
FIRE_WEST_OF_MONCTON = hotspot(lat=46.09 + 5 / 111.2, lon=-64.78 - 90 / (111.32 * 0.6934), seen="2025-08-25T06:00:00Z")


@pytest.mark.parametrize("fires", [[], [FIRE_WEST_OF_MONCTON]], ids=["unexplained", "drifting"])
def test_the_forecast_never_changes_the_verdict(fires):
    answers = []
    for smoke in ({"smoke": SMOKY_THEN_A_CLEAR_MORNING}, {"smoke": [120.0] * 48}, {"smoke": [0.0] * 48}, {"down": {"smoke"}}, {}):
        feeds = FakeFeeds(wind=WEST_WIND, hotspots=fires, **smoke)
        client = TestClient(create_app({"live": feeds}))
        answers.append(client.get("/verdict", params={**MONCTON, "time": NOON_UTC, "mode": "live"}).json())

    states = [body.pop("smokeForecast")["state"] for body in answers]
    assert (states, all(body == answers[0] for body in answers)) == (["window", "none", "window", "not_available", "not_available"], True)


# --- the sun ----------------------------------------------------------------------------------------

# Sunrise and sunset in UTC, from Open-Meteo's daily sunrise and sunset for the point (asked Oct 4, 2026).
SUN = {
    "moncton-before-sunrise-0931": ((46.09948, -64.7998), "2025-08-25T09:15:00Z", False),
    "moncton-after-sunrise": ((46.09948, -64.7998), "2025-08-25T09:45:00Z", True),
    "moncton-before-sunset-2310": ((46.09948, -64.7998), "2025-08-25T22:55:00Z", True),
    "moncton-after-sunset": ((46.09948, -64.7998), "2025-08-25T23:30:00Z", False),
    "edmundston-winter-before-sunrise-1217": ((47.3737, -68.3251), "2025-12-21T12:00:00Z", False),
    "edmundston-winter-after-sunrise": ((47.3737, -68.3251), "2025-12-21T12:35:00Z", True),
    "edmundston-winter-before-sunset-2045": ((47.3737, -68.3251), "2025-12-21T20:30:00Z", True),
    "edmundston-winter-after-sunset": ((47.3737, -68.3251), "2025-12-21T21:00:00Z", False),
    "halifax-summer-before-sunrise-0829": ((44.6474, -63.59065), "2025-06-21T08:15:00Z", False),
    "halifax-summer-after-sunrise": ((44.6474, -63.59065), "2025-06-21T08:45:00Z", True),
    "halifax-summer-before-sunset-0003": ((44.6474, -63.59065), "2025-06-21T23:50:00Z", True),
    "halifax-summer-after-sunset": ((44.6474, -63.59065), "2025-06-22T00:20:00Z", False),
}


@pytest.mark.parametrize(("place", "time", "up"), SUN.values(), ids=SUN.keys())
def test_the_sun_is_up_between_sunrise_and_sunset(place, time, up):
    assert sun_is_up(*place, datetime.fromisoformat(time.replace("Z", "+00:00"))) is up


# --- the live feed, with MSC GeoMet and Open-Meteo faked at the HTTP transport -----------------------

NOW = datetime(2026, 10, 4, 6, 24, tzinfo=timezone.utc)
RUN = "2026-10-04T00:00:00Z"
GEOMET = "https://geo.weather.gc.ca/geomet"
QUERY = {
    "SERVICE": "WMS",
    "VERSION": "1.3.0",
    "REQUEST": "GetFeatureInfo",
    "LAYERS": "RAQDPS.Sfc_PM2.5-WildfireSmokePlume",
    "QUERY_LAYERS": "RAQDPS.Sfc_PM2.5-WildfireSmokePlume",
    "CRS": "EPSG:4326",
    "BBOX": "46.05,-64.85,46.15,-64.75",
    "WIDTH": "3",
    "HEIGHT": "3",
    "I": "1",
    "J": "1",
    "INFO_FORMAT": "application/json",
}


def clear_from_11(request: httpx.Request) -> httpx.Response:
    """GeoMet, on the morning of Oct 4, 2026: light smoke from 09:00 to 13:00 UTC, none before or after."""
    hour = request.url.params["TIME"]
    return httpx.Response(200, json=smoke_hour(hour, 4.0 if "2026-10-04T09" <= hour < "2026-10-04T14" else 0.0, RUN))


def live_feeds(tmp_path, geomet, requests: list, **options):
    """The real live feed. Open-Meteo answers with a west wind; `geomet` answers each hour of the smoke forecast;
    CWFIS, the AQHI and the alerts answer with nothing."""

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if "open-meteo" in request.url.host:
            if request.url.path.endswith("meta.json"):
                return httpx.Response(200, json={"last_run_initialisation_time": 1790359200})
            lats = [float(v) for v in request.url.params["latitude"].split(",")]
            lons = [float(v) for v in request.url.params["longitude"].split(",")]
            return httpx.Response(200, json=WEST_WIND(list(zip(lats, lons)), NOW - timedelta(days=2), NOW + timedelta(days=2)))
        if request.url.host == "geo.weather.gc.ca":
            return geomet(request)
        return httpx.Response(200, json={"type": "FeatureCollection", "features": []})

    feeds = LiveFeeds(
        client=httpx.Client(transport=httpx.MockTransport(handle)),
        wind_file=tmp_path / "live-wind.json",
        firms_file=tmp_path / "live-firms.json",
        now=lambda: NOW,
        sleep=lambda s: None,
        **options,
    )
    feeds.refresh_wind()
    return feeds


def live_verdict(feeds, **params) -> dict:
    client = TestClient(create_app({"live": feeds}, now=lambda: NOW))
    return client.get("/verdict", params={**MONCTON, "mode": "live", **params}).json()


def asked_geomet(requests: list) -> list[httpx.Request]:
    return [r for r in requests if r.url.host == "geo.weather.gc.ca"]


def test_live_asks_geomet_for_each_of_the_48_hours_the_first_names_the_run_and_the_others_are_asked_for_it(tmp_path):
    feeds = live_feeds(tmp_path, clear_from_11, requests := [])

    live_verdict(feeds)

    asked = sorted((dict(r.url.params) for r in asked_geomet(requests)), key=lambda q: q["TIME"])
    hours_ = [f"{NOW.replace(minute=0) + timedelta(hours=h):%Y-%m-%dT%H:%M:%SZ}" for h in range(48)]
    assert ({str(r.url.copy_with(query=None)) for r in asked_geomet(requests)}, asked) == (
        {GEOMET},
        [{**QUERY, "TIME": hours_[0]}, *({**QUERY, "TIME": hour, "DIM_REFERENCE_TIME": RUN} for hour in hours_[1:])],
    )


def test_live_gives_the_best_time_from_eccc_s_answers_and_when_they_were_asked(tmp_path):
    feeds = live_feeds(tmp_path, clear_from_11, [])

    answer = live_verdict(feeds)["smokeForecast"]

    assert (answer["state"], answer["run"], answer["checkedAt"], answer["window"]) == (
        "window",
        RUN,
        "2026-10-04T06:24:00Z",
        {"start": "2026-10-04T14:00:00Z", "end": "2026-10-06T05:00:00Z", "level": 0, "fromNow": False, "toEnd": True},
    )


def test_live_sends_eccc_the_spot_rounded_to_a_tenth_of_a_degree_never_the_exact_one(tmp_path):
    feeds = live_feeds(tmp_path, clear_from_11, requests := [])

    live_verdict(feeds, lat=46.1387654, lon=-64.7712345)

    sent = {(r.url.params["BBOX"], "46.138" in str(r.url), "64.771" in str(r.url)) for r in asked_geomet(requests)}
    assert sent == {("46.05,-64.85,46.15,-64.75", False, False)}


def test_live_keeps_the_forecast_for_the_cell_so_a_second_check_nearby_asks_eccc_nothing(tmp_path):
    feeds = live_feeds(tmp_path, clear_from_11, requests := [])

    first = live_verdict(feeds)["smokeForecast"]
    second = live_verdict(feeds, lat=46.12, lon=-64.83)["smokeForecast"]

    assert (len(asked_geomet(requests)), second["window"], second["checkedAt"]) == (48, first["window"], first["checkedAt"])


def test_live_gives_each_hour_5_seconds(tmp_path):
    feeds = live_feeds(tmp_path, clear_from_11, requests := [])

    live_verdict(feeds)

    assert {tuple(sorted(set(r.extensions["timeout"].values()))) for r in asked_geomet(requests)} == {(5.0,)}


def _timeout(request):
    raise httpx.ReadTimeout("ECCC did not answer in time")


def _error_after_the_first(answer):
    """The first hour answers; every other hour gets `answer`."""
    return lambda request: clear_from_11(request) if "DIM_REFERENCE_TIME" not in request.url.params else answer(request)


XML_ERROR = (
    "<?xml version='1.0' encoding=\"utf-8\"?><ogc:ServiceExceptionReport version=\"1.3.0\"><ogc:ServiceException "
    'code="NoMatch" locator="time">temps en dehors des heures valides / time outside valid hours</ogc:ServiceException>'
    "</ogc:ServiceExceptionReport>"
)
GEOMET_FAILS = {
    "a-server-error": lambda request: httpx.Response(500, text="Internal Server Error"),
    # GeoMet's own errors come with HTTP 200, as XML: here, an hour the run does not reach.
    "an-xml-error-with-200": lambda request: httpx.Response(200, text=XML_ERROR, headers={"content-type": "text/xml"}),
    "a-web-page": lambda request: httpx.Response(200, text="<html><body>Service unavailable</body></html>"),
    "outside-the-model": lambda request: httpx.Response(200, json={}),
    "no-answer-in-time": _timeout,
    "one-hour-fails": _error_after_the_first(lambda request: httpx.Response(200, text=XML_ERROR) if request.url.params["TIME"] == "2026-10-06T05:00:00Z" else clear_from_11(request)),
    # The run named by the first hour is gone, and GeoMet answers the other hours from a newer one.
    "another-run-answers": _error_after_the_first(lambda request: httpx.Response(200, json=smoke_hour(request.url.params["TIME"], 0.0, "2026-10-04T12:00:00Z"))),
}


@pytest.mark.parametrize("geomet", GEOMET_FAILS.values(), ids=GEOMET_FAILS.keys())
def test_when_geomet_fails_live_says_not_available_and_still_gives_the_verdict(tmp_path, geomet):
    feeds = live_feeds(tmp_path, geomet, [])

    body = live_verdict(feeds)

    assert (body["verdict"], body["smokeForecast"]["state"], body["smokeForecast"]["hours"]) == ("unexplained", "not_available", [])


def test_a_failed_forecast_is_not_kept_the_next_check_asks_again(tmp_path):
    working = threading.Event()
    geomet = lambda request: clear_from_11(request) if working.is_set() else httpx.Response(500)  # noqa: E731
    feeds = live_feeds(tmp_path, geomet, [])

    before = live_verdict(feeds)["smokeForecast"]["state"]
    working.set()
    after = live_verdict(feeds)["smokeForecast"]["state"]

    assert (before, after) == ("not_available", "window")


def test_live_waits_no_longer_than_its_deadline_for_all_the_hours(tmp_path):
    # One hour hangs. The others have answered, but a forecast with an hour missing is not one.
    release = threading.Event()

    def geomet(request: httpx.Request) -> httpx.Response:
        if request.url.params["TIME"] == "2026-10-05T00:00:00Z":
            release.wait(10)
        return clear_from_11(request)

    feeds = live_feeds(tmp_path, geomet, [], forecast_deadline=0.3)
    try:
        body = live_verdict(feeds)
    finally:
        release.set()

    assert (body["verdict"], body["smokeForecast"]["state"]) == ("unexplained", "not_available")


def test_live_cannot_give_the_forecast_of_another_time(tmp_path):
    # GeoMet serves the forecast as it stands now. Asked about last night, it is not an answer.
    feeds = live_feeds(tmp_path, clear_from_11, requests := [])

    state = live_verdict(feeds, time="2026-10-03T22:24:00Z")["smokeForecast"]["state"]

    assert (state, asked_geomet(requests)) == ("not_available", [])


# --- replay -------------------------------------------------------------------------------------------

REPLAY_MONCTON = {"lat": 46.09948, "lon": -64.7998}
SAMPLE_TIME = datetime(2026, 10, 4, 6, 24, 36, tzinfo=timezone.utc)


def test_the_moncton_replay_has_no_recorded_forecast_so_it_says_not_available():
    # ECCC keeps a forecast about two days: none was recorded on Aug 25, 2025, and none can be fetched now.
    client = TestClient(create_app({"replay": ReplayFeeds()}))

    answer = client.get("/verdict", params={**REPLAY_MONCTON, "mode": "replay"}).json()["smokeForecast"]

    assert (answer["state"], answer["source"], answer["hours"], answer["window"]) == ("not_available", "recorded", [], None)


@pytest.fixture
def recorded_day(tmp_path):
    """A replay folder holding a recorded forecast: the live sample of Oct 4, 2026."""
    shutil.copy(SAMPLE, tmp_path / "smoke-forecast.json")
    return ReplayFeeds(tmp_path)


def test_a_replay_day_recorded_with_its_forecast_gives_the_best_time(recorded_day):
    answer = smoke_forecast(recorded_day, **REPLAY_MONCTON, at=SAMPLE_TIME)

    window = answer.window
    assert (answer.state, f"{answer.run:%Y-%m-%dT%H:%MZ}", answer.checked_at, f"{window.start:%Y-%m-%dT%H:%MZ}", window.to_end) == (
        "window",
        "2026-10-04T00:00Z",
        None,
        "2026-10-04T14:00Z",
        True,
    )


@pytest.mark.parametrize(
    ("place", "at"),
    [({"lat": 44.6474, "lon": -63.59065}, SAMPLE_TIME), (REPLAY_MONCTON, SAMPLE_TIME + timedelta(hours=1)), (REPLAY_MONCTON, SAMPLE_TIME - timedelta(days=1))],
    ids=["another-town", "an-hour-later", "the-day-before"],
)
def test_a_recorded_forecast_answers_only_for_its_own_place_and_hours(recorded_day, place, at):
    assert smoke_forecast(recorded_day, **place, at=at).state == "not_available"


# --- the live sample: MSC GeoMet's own answers for Moncton, saved Oct 4, 2026 at 06:24 UTC ---------------


def test_the_live_sample_reads_as_light_smoke_in_the_morning_and_a_best_time_from_11_a_m():
    sample = json.loads(SAMPLE.read_text(encoding="utf-8"))
    feeds = FakeFeeds(wind=WEST_WIND, smoke=lambda lat, lon, times: sample["points"][0]["answers"])

    answer = smoke_forecast(feeds, **REPLAY_MONCTON, at=SAMPLE_TIME)

    levels = "".join(str(h.level) for h in answer.hours)
    # 03:00 to 05:00 Atlantic time is clear but only 2 hours long; 06:00 to 10:00 has light smoke; clear from 11:00.
    assert (levels, answer.state, f"{answer.window.start:%Y-%m-%dT%H:%MZ}", answer.window.level, answer.window.to_end) == (
        "000" + "11111" + "0" * 40,
        "window",
        "2026-10-04T14:00Z",
        0,
        True,
    )


def test_the_live_sample_says_where_it_came_from():
    sample = json.loads(SAMPLE.read_text(encoding="utf-8"))

    assert (sample["layer"], sample["requests"][0].split("?")[0], sample["points"][0]["point"], len(sample["points"][0]["answers"]), SMOKE_RUN != "") == (
        "RAQDPS.Sfc_PM2.5-WildfireSmokePlume",
        GEOMET,
        [46.1, -64.8],
        48,
        True,
    )
