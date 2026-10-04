"""Is burning allowed today? The province's burn category for the county of the point, or not checked. Never a guess.

First with fake feeds that answer in the shape of New Brunswick's burn category layers, then the live feed with HTTP
faked at the transport, then the replay (no network). The county outlines are the province's own, bundled in
data/places/nb-counties.geojson.
"""

import json
import threading
import time
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from smoke_engine.app import _burn_json, create_app
from smoke_engine.burn import _counties_at, atlantic_wall_to_utc, burn_status, county_at, season_surely_closed
from smoke_engine.feeds import FeedUnavailable, sources
from smoke_engine.feeds.live import LiveFeeds
from smoke_engine.feeds.replay import ReplayFeeds
from smoke_engine.places import PLACES_DIR, _communities
from tests.fakes import FakeFeeds, hotspot, uniform_wind

WEST_WIND = uniform_wind(from_deg=270, speed_ms=5)
MONCTON = {"lat": 46.09948, "lon": -64.7998}  # its CGNDB point: Westmorland County
NOON = "2026-08-25T15:00:00Z"  # a Tuesday in the fire season, noon in New Brunswick
COUNTIES = [
    "ALBERT", "CARLETON", "CHARLOTTE", "GLOUCESTER", "KENT", "KINGS", "MADAWASKA", "NORTHUMBERLAND", "QUEENS",
    "RESTIGOUCHE", "SAINT JOHN", "SUNBURY", "VICTORIA", "WESTMORLAND", "YORK",
]
# The coded values of the layer's PUBLICCATEGORY field, as the province's server gave them on 2026-10-04.
LABELS = {
    1: "No burn - Pas de brûlage",
    2: "Restricted burn, permitted 8 PM to 8 AM - Brûlage limité, permis de 20h à 8h",
    3: "Burn permitted - Brûlage permis",
}
ASKED_AT = datetime(2026, 8, 25, 14, 52, 7, tzinfo=timezone.utc)


def wall(text: str) -> int:
    """A VALIDDATE as the province's server gives it: Atlantic wall-clock time, in milliseconds as if it were UTC."""
    return int(datetime.fromisoformat(text).replace(tzinfo=timezone.utc).timestamp() * 1000)


def rows(categories: dict, valid: str = "2026-08-25T14:00") -> dict:
    """A layer's answer to the query for every county: {county: category}, each valid until `valid`."""
    return {
        "displayFieldName": "NAME",
        "fields": [{"name": "NAME"}, {"name": "PUBLICCATEGORY"}, {"name": "VALIDDATE"}],
        "features": [{"attributes": {"NAME": name, "PUBLICCATEGORY": category, "VALIDDATE": wall(valid)}} for name, category in categories.items()],
    }


def layer(labels: dict = LABELS) -> dict:
    """The first layer's description, with the coded values that name each category."""
    domain = {"type": "codedValue", "name": "FireCategory", "codedValues": [{"name": name, "code": code} for code, name in labels.items()]}
    return {"id": 0, "name": "County", "fields": [{"name": "NAME", "domain": None}, {"name": "PUBLICCATEGORY", "domain": domain}]}


def province(category: int = 3, valid: str = "2026-08-25T14:00", without=(), **changes) -> dict:
    """The province's whole answer: every county in `category` until `valid`, but the ones in `without`, which the
    second layer lists as having no category now. `changes` replace a part of it."""
    return {
        "current": rows({name: category for name in COUNTIES if name not in without}, valid),
        "none": rows({name: None for name in without}, valid),
        "layer": layer(),
        "checkedAt": ASKED_AT,
        **changes,
    }


class BurnFeeds(FakeFeeds):
    """The fake feeds, with the province's burn categories: an answer, or an error to raise."""

    def __init__(self, burn, **feeds):
        super().__init__(wind=WEST_WIND, **feeds)
        self._burn = burn
        self.burn_asked = []

    def burn_categories(self, at):
        self.burn_asked.append(at)
        if isinstance(self._burn, Exception):
            raise self._burn
        return self._burn


def verdict(feeds, place=MONCTON, time=NOON, mode="live") -> dict:
    client = TestClient(create_app({"live": feeds, "replay": feeds}))
    response = client.get("/verdict", params={**place, "time": time, "mode": mode})
    assert response.status_code == 200
    return response.json()


def burn(answer, place=MONCTON, time=NOON) -> dict | None:
    """The answer's burn field, without the rest of the verdict (a test below holds that GET /verdict gives the same)."""
    at = datetime.fromisoformat(time.replace("Z", "+00:00"))
    return _burn_json(burn_status(BurnFeeds(answer), place["lat"], place["lon"], at), "live")


def place(name: str, province_code: str = "NB") -> dict:
    """A community's CGNDB point: a city, town or village first."""
    order = ["CITY", "TOWN", "VILG"]
    found = [c for c in _communities() if c.name == name and c.province == province_code]
    best = min(found, key=lambda c: order.index(c.type) if c.type in order else len(order))
    return {"lat": best.lat, "lon": best.lon}


# --- the category -----------------------------------------------------------------------------------


@pytest.mark.parametrize(("category", "state"), [(1, "no_burn"), (2, "restricted"), (3, "permitted")])
def test_the_county_s_category_is_the_one_the_province_gives_it(category, state):
    assert burn(province(category))["state"] == state


def test_the_answer_names_the_county_the_end_of_validity_and_when_the_province_was_asked():
    assert burn(province(1)) == {
        "state": "no_burn",
        "county": "Westmorland",
        "validUntil": "2026-08-25T17:00:00Z",  # 2 p.m. in New Brunswick
        "checkedAt": "2026-08-25T14:52:07Z",
        "source": "gnb_burn_categories",
        "reason": None,
    }


def test_get_verdict_carries_the_burn_status_as_its_burn_field():
    assert verdict(BurnFeeds(province(2)))["burn"] == burn(province(2))


def test_each_county_gets_its_own_category():
    answer = province(3)
    for feature in answer["current"]["features"]:
        if feature["attributes"]["NAME"] in ("ALBERT", "YORK"):
            feature["attributes"]["PUBLICCATEGORY"] = 1 if feature["attributes"]["NAME"] == "ALBERT" else 2

    found = {name: burn(answer, place(name)) for name in ("Moncton", "Riverview", "Fredericton")}

    assert {name: (b["county"], b["state"]) for name, b in found.items()} == {
        "Moncton": ("Westmorland", "permitted"),
        "Riverview": ("Albert", "no_burn"),
        "Fredericton": ("York", "restricted"),
    }


# --- the county, from the province's own outlines ---------------------------------------------------


@pytest.mark.parametrize(
    ("town", "county"),
    [
        ("Moncton", "WESTMORLAND"), ("Dieppe", "WESTMORLAND"), ("Sackville", "WESTMORLAND"), ("Riverview", "ALBERT"),
        ("Fredericton", "YORK"), ("Saint John", "SAINT JOHN"), ("Sussex", "KINGS"), ("Miramichi", "NORTHUMBERLAND"),
        ("Bathurst", "GLOUCESTER"), ("Edmundston", "MADAWASKA"), ("Campbellton", "RESTIGOUCHE"), ("Woodstock", "CARLETON"),
        ("Grand Falls", "VICTORIA"), ("Oromocto", "SUNBURY"), ("Richibucto", "KENT"), ("St. Stephen", "CHARLOTTE"),
        ("Grand Manan", "CHARLOTTE"), ("Gagetown", "QUEENS"),
    ],
)
def test_the_county_is_the_one_whose_outline_holds_the_point(town, county):
    assert county_at(**place(town)) == county


def test_the_outlines_are_the_province_s_own_fifteen_counties():
    document = json.loads((PLACES_DIR / "nb-counties.geojson").read_text(encoding="utf-8"))

    assert (sorted(f["properties"]["name"] for f in document["features"]), document["url"]) == (COUNTIES, sources.GNB_BURN_SERVICE)


# NRCan's names database (CGNDB) gives each community a county too: an independent check of the outlines. Of the
# 2,277 New Brunswick communities, 2,256 fall in the county it lists. These do not: their point is in another county's
# outline (most within a few hundred metres of a county line, where a point rounded to a minute of arc lands on the
# other side; Belledune and Carleton North are listed in a county their point is kilometres from), or in none.
IN_ANOTHER_COUNTY = {
    "Annidale": "KINGS", "Bayard": "QUEENS", "Belledune": "RESTIGOUCHE", "Carleton North": "CARLETON", "Culligan": "RESTIGOUCHE",
    "Hodgin": "RESTIGOUCHE", "Little Lepreau": "SAINT JOHN", "Meductic": "CARLETON", "Torryburn": "KINGS",
    "Upper Golden Grove": "SAINT JOHN", "Westend": "ALBERT",
}
IN_NO_COUNTY = {
    "Bathurst", "Bellefleur Station", "Bourgeois", "Cooks Crossing", "Four Roads", "Maltampec", "Oak Point", "Point Park", "Red Head",
    "Riverview Heights",
}


def _new_brunswick_communities():
    return [c for c in _communities() if c.province == "NB" and c.county and ";" not in c.county]


def test_the_outlines_put_new_brunswick_s_communities_in_the_county_the_names_database_lists():
    differences = {}
    for c in _new_brunswick_communities():
        found = _counties_at(c.lat, c.lon)
        if found != [c.county.upper()]:
            differences[c.name] = found

    assert differences == {**{name: [county] for name, county in IN_ANOTHER_COUNTY.items()}, **{name: [] for name in IN_NO_COUNTY}}


def test_no_community_of_another_province_falls_in_a_new_brunswick_county():
    assert [c.name for c in _communities() if c.province != "NB" and _counties_at(c.lat, c.lon)] == []


def test_a_town_the_names_database_lists_in_another_county_is_not_checked():
    """Picked from the town search, a community is checked at its listed point: where the outline there is another
    county's, the county cannot be told for certain."""
    found = {c.name: burn(province(3), {"lat": c.lat, "lon": c.lon}) for c in _new_brunswick_communities() if c.name in IN_ANOTHER_COUNTY}

    assert (sorted(found), {(b["state"], b["county"], b["reason"]) for b in found.values()}) == (sorted(IN_ANOTHER_COUNTY), {("not_checked", None, "no_county")})


def test_a_town_whose_point_sits_just_off_its_shore_gets_the_only_county_within_250_m():
    """The outlines follow the shore, and Bathurst's point is 170 m out in its harbour."""
    counties = {c.name: county_at(c.lat, c.lon) for c in _new_brunswick_communities() if c.name in IN_NO_COUNTY and not _counties_at(c.lat, c.lon)}

    assert counties == {
        "Bathurst": "GLOUCESTER", "Bourgeois": "KENT", "Maltampec": "GLOUCESTER", "Oak Point": "NORTHUMBERLAND", "Point Park": "ALBERT",
        "Red Head": "SAINT JOHN", "Riverview Heights": "ALBERT",
        # Too far out (Four Roads, 470 m), or beside Maine or Quebec, where a point off the outline may be abroad.
        "Four Roads": None, "Bellefleur Station": None, "Cooks Crossing": None,
    }


def test_a_new_brunswick_town_in_no_county_is_not_checked_rather_than_hidden():
    four_roads = next(c for c in _communities() if c.name == "Four Roads" and c.province == "NB")

    assert burn(province(3), {"lat": four_roads.lat, "lon": four_roads.lon}) == {
        "state": "not_checked", "county": None, "validUntil": None, "checkedAt": None, "source": "gnb_burn_categories", "reason": "no_county",
    }


# A spot in Moncton by the Petitcodiac, under a kilometre from Albert County across the river: not a town's own point.
RIVERFRONT = {"lat": 46.0875, "lon": -64.775}


def _with(answer: dict, **categories) -> dict:
    for feature in answer["current"]["features"]:
        row = feature["attributes"]
        row["PUBLICCATEGORY"] = categories.get(row["NAME"].lower(), row["PUBLICCATEGORY"])
    return answer


def test_near_a_county_line_the_status_is_given_only_when_both_counties_have_the_same():
    """A phone's location can be off by a kilometre: by the river in Moncton it could be Albert County's."""
    same, differ = burn(province(3), RIVERFRONT), burn(_with(province(3), albert=1), RIVERFRONT)

    assert [(b["state"], b["county"], b["reason"]) for b in (same, differ)] == [("permitted", "Westmorland", None), ("not_checked", "Westmorland", "county_line")]


def test_a_town_picked_from_the_search_is_in_its_county_however_near_the_line():
    """Riverview's own point is under a kilometre from Westmorland County; the names database confirms Albert."""
    found = burn(_with(province(3), albert=1), place("Riverview"))

    assert (found["state"], found["county"]) == ("no_burn", "Albert")


@pytest.mark.parametrize(
    "spot",
    [
        place("Halifax", "NS"), place("Charlottetown", "PE"), place("Amherst", "NS"),
        {"lat": 44.8, "lon": -68.77},  # Bangor, Maine
        # Along the border, where the map's coarse outline takes some of these for New Brunswick.
        {"lat": 45.1888, "lon": -67.2796},  # Calais, Maine, across the St. Croix from St. Stephen
        {"lat": 46.1390, "lon": -67.7830},  # Houlton, Maine, at the border
        {"lat": 46.7650, "lon": -67.7910},  # Fort Fairfield, Maine, at the border
        {"lat": 47.3050, "lon": -68.1520},  # Grand Isle, Maine, across the Saint John
        {"lat": 47.3553, "lon": -68.3283},  # Madawaska, Maine, across the Saint John from Edmundston
        {"lat": 48.014, "lon": -66.68},  # Pointe-à-la-Croix, Quebec, across the river from Campbellton
        # Islets the province's own Charlotte County outline takes in, and Maine owns: left out of the bundled outlines.
        {"lat": 44.8790, "lon": -66.9905},  # Treat Island, Eastport
        {"lat": 44.8721, "lon": -66.9913},  # Dudley Island, Lubec
        {"lat": 44.9165, "lon": -67.0272},  # an islet off Eastport
        {"lat": 45.1283, "lon": -67.1336},  # St. Croix Island, Calais
        {"lat": 45.0, "lon": -65.75},  # the middle of the Bay of Fundy
    ],
    ids=[
        "halifax", "charlottetown", "amherst", "bangor", "calais", "houlton", "fort-fairfield", "grand-isle", "madawaska-maine",
        "pointe-a-la-croix", "treat-island", "dudley-island", "eastport-islet", "st-croix-island", "bay-of-fundy",
    ],
)
def test_outside_new_brunswick_the_card_is_hidden_and_the_province_is_not_asked(spot):
    feeds = BurnFeeds(province(1))

    found = burn_status(feeds, spot["lat"], spot["lon"], datetime.fromisoformat(NOON.replace("Z", "+00:00")))

    assert (found, feeds.burn_asked) == (None, [])


def test_new_brunswick_s_own_islands_are_in_charlotte_county():
    spots = {"Campobello": (44.887, -66.94), "Grand Manan": (44.70, -66.80), "Deer Island": (44.98, -66.96)}

    assert {name: county_at(*spot) for name, spot in spots.items()} == {name: "CHARLOTTE" for name in spots}


# --- how old the status is ----------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("valid", "state", "reason"),
    [
        ("2026-08-25T14:00", "permitted", None),  # until 2 p.m. today
        ("2026-08-26T14:00", "permitted", None),  # today's update came early
        ("2026-08-25T10:00:01", "permitted", None),  # ended 1 h 59 min 59 s ago: the status is under 26 hours old
        ("2026-08-25T09:59:59", "not_checked", "stale"),  # ended over 2 hours ago: over 26 hours old
        ("2026-08-24T14:00", "not_checked", "stale"),
        ("2025-08-25T14:00", "not_checked", "stale"),
        ("2026-08-27T00:00:00", "permitted", None),  # 36 hours ahead
        ("2026-08-27T00:00:01", "not_checked", "unreadable"),  # further ahead than a day's status was ever seen
        ("2099-01-01T14:00", "not_checked", "unreadable"),
    ],
)
def test_a_status_over_26_hours_old_or_dated_too_far_ahead_is_not_checked(valid, state, reason):
    found = burn(province(3, valid))

    assert (found["state"], found["reason"], found["county"]) == (state, reason, "Westmorland")


def test_a_status_that_is_not_checked_gives_no_end_of_validity():
    assert burn(province(3, "2026-08-24T14:00"))["validUntil"] is None


@pytest.mark.parametrize(
    ("wall_clock", "utc"),
    [
        ("2026-08-25T14:00", "2026-08-25T17:00"),  # daylight time: 3 hours behind UTC
        ("2026-12-01T14:00", "2026-12-01T18:00"),  # standard time: 4 hours
        ("2026-03-08T01:59", "2026-03-08T05:59"),  # the clocks go forward on the second Sunday of March, at 2 a.m.
        ("2026-03-08T03:00", "2026-03-08T06:00"),
        ("2026-11-01T00:30", "2026-11-01T03:30"),  # and back on the first Sunday of November, at 2 a.m.
        ("2026-11-01T02:00", "2026-11-01T06:00"),
        ("2026-11-01T14:00", "2026-11-01T18:00"),
        ("2027-03-14T14:00", "2027-03-14T17:00"),
    ],
)
def test_the_province_s_dates_are_atlantic_wall_clock_time(wall_clock, utc):
    assert atlantic_wall_to_utc(datetime.fromisoformat(wall_clock)) == datetime.fromisoformat(utc).replace(tzinfo=timezone.utc)


# --- the fire season: opened and closed by the province, not by the calendar ---------------------------


@pytest.mark.parametrize(
    ("time", "closed"),
    [
        ("2026-10-31T15:00:00Z", False), ("2026-11-01T02:59:00Z", False),  # October 31, 11:59 p.m. in New Brunswick
        ("2026-11-01T03:00:00Z", True), ("2026-12-25T15:00:00Z", True), ("2027-01-15T15:00:00Z", True),
        ("2027-03-31T15:00:00Z", True), ("2027-04-01T02:59:00Z", True),  # March 31, 11:59 p.m.
        ("2027-04-01T03:00:00Z", False), ("2026-04-05T15:00:00Z", False), ("2026-08-25T15:00:00Z", False),
    ],
)
def test_only_november_to_march_are_months_no_fire_season_has_reached(time, closed):
    assert season_surely_closed(datetime.fromisoformat(time.replace("Z", "+00:00"))) is closed


@pytest.mark.parametrize(
    ("time", "answer", "state", "reason"),
    [
        # A category the province gives is shown, whatever the date: it opens the season early (April 1 in 2026)
        # and can extend it past October 31.
        ("2026-04-05T15:00:00Z", province(1, "2026-04-05T14:00"), "no_burn", None),
        ("2026-11-03T15:00:00Z", province(1, "2026-11-03T14:00"), "no_burn", None),
        ("2026-11-01T03:00:00Z", province(3, "2026-11-01T14:00"), "permitted", None),
        ("2026-10-31T15:00:00Z", province(2, "2026-10-31T14:00"), "restricted", None),
        # No category for the county, from November to March: the season is closed.
        ("2026-11-15T15:00:00Z", province(without=COUNTIES), "season_closed", None),
        ("2027-03-31T15:00:00Z", province(without=["WESTMORLAND"], valid="2027-03-31T14:00"), "season_closed", None),
        # No category from April to October: a season may be open, the province does not say, and neither does the card.
        ("2026-04-05T15:00:00Z", province(without=COUNTIES, valid="2026-04-05T14:00"), "not_checked", "no_category"),
        ("2027-04-18T15:00:00Z", province(without=["WESTMORLAND"], valid="2027-04-18T14:00"), "not_checked", "no_category"),
        ("2026-08-25T15:00:00Z", province(without=["WESTMORLAND"]), "not_checked", "no_category"),
        ("2026-10-31T15:00:00Z", province(without=COUNTIES, valid="2026-10-31T14:00"), "not_checked", "no_category"),
        # An old category left in place after the season: over 26 hours old, so not checked. Never "closed".
        ("2026-11-15T15:00:00Z", province(3, "2026-10-31T14:00"), "not_checked", "stale"),
    ],
    ids=[
        "early-april-category", "november-category", "november-1-category", "october-31-category",
        "november-no-category", "march-no-category",
        "early-april-no-category", "april-no-category", "august-no-category", "october-31-no-category",
        "november-old-category",
    ],
)
def test_the_province_s_category_wins_over_the_calendar_and_the_season_is_closed_only_when_it_lists_none(time, answer, state, reason):
    found = burn(answer, time=time)

    assert (found["state"], found["reason"], found["county"], found["validUntil"] is None) == (state, reason, "Westmorland", state in ("season_closed", "not_checked"))


# --- anything else: not checked ------------------------------------------------------------------------


def _edit(row_changes: dict, county: str = "WESTMORLAND") -> dict:
    answer = province(3)
    for feature in answer["current"]["features"]:
        if feature["attributes"]["NAME"] == county:
            for key, value in row_changes.items():
                if value is KeyError:
                    del feature["attributes"][key]
                else:
                    feature["attributes"][key] = value
    return answer


@pytest.mark.parametrize(
    "answer",
    [
        None,
        [],
        {},
        province(current={"error": {"code": 500, "message": "Error performing query operation"}}),  # sent with HTTP 200
        province(current={"displayFieldName": "NAME"}),
        province(current={**rows({name: 3 for name in COUNTIES}), "exceededTransferLimit": True}),
        province(none={"error": {"code": 500}}),
        province(none=None),
        province(current=rows({name: 3 for name in COUNTIES if name != "KENT"})),  # a county in neither list
        province(none={**rows({"KENT": None})}),  # a county in both lists
        province(current=rows({**{name: 3 for name in COUNTIES}, "ACADIE": 3})),  # a county never heard of
        province(current={"features": [*rows({name: 3 for name in COUNTIES})["features"], {"attributes": {"NAME": "WESTMORLAND", "PUBLICCATEGORY": 1, "VALIDDATE": wall("2026-08-25T14:00")}}]}),
        province(current={"features": [{"attributes": None}]}),
        province(current={"features": ["WESTMORLAND"]}),
        _edit({"PUBLICCATEGORY": None}),
        _edit({"PUBLICCATEGORY": 0}),
        _edit({"PUBLICCATEGORY": 4}),
        _edit({"PUBLICCATEGORY": "3"}),
        _edit({"PUBLICCATEGORY": 3.0}),
        _edit({"PUBLICCATEGORY": True}),
        _edit({"PUBLICCATEGORY": KeyError}),
        _edit({"VALIDDATE": None}),
        _edit({"VALIDDATE": "2026-08-25T14:00:00"}),
        _edit({"VALIDDATE": True}),
        _edit({"VALIDDATE": KeyError}),
        _edit({"VALIDDATE": 1e300}),
        province(layer=None),
        province(layer={"error": {"code": 500}}),
        province(layer={"fields": [{"name": "PUBLICCATEGORY", "domain": None}]}),
        province(layer=layer({1: "No burn - Pas de brûlage", 2: LABELS[2]})),  # category 3 is no longer named
        FeedUnavailable("the province does not answer"),
        KeyError("features"),
    ],
    ids=[
        "nothing", "a-list", "empty", "error-in-a-200", "no-features", "cut-off", "second-list-error", "second-list-missing",
        "county-in-neither-list", "county-in-both-lists", "unknown-county", "county-twice", "row-without-attributes", "row-not-an-object",
        "category-null", "category-0", "category-4", "category-as-text", "category-as-decimal", "category-true", "no-category-field",
        "date-null", "date-as-text", "date-true", "no-date-field", "date-out-of-range",
        "no-layer-description", "layer-error", "no-coded-values", "category-not-named",
        "feed-down", "feed-breaks",
    ],
)
def test_an_answer_that_cannot_be_read_for_certain_is_not_checked(answer):
    found = burn(answer)

    assert (found["state"], found["county"], found["validUntil"]) == ("not_checked", "Westmorland", None)


@pytest.mark.parametrize(
    "labels",
    [
        {1: "Burn permitted - Brûlage permis", 2: LABELS[2], 3: "No burn - Pas de brûlage"},  # the codes swapped
        {**LABELS, 2: "Restricted burn, permitted 7 PM to 7 AM - Brûlage limité, permis de 19h à 7h"},  # other hours
        {**LABELS, 2: "Restricted burn, permitted 8 PM to 8 AM - Brûlage limité, permis de 19h à 7h"},  # in French only
        {**LABELS, 3: "Burn permitted with a permit - Brûlage permis avec permis"},
        {**LABELS, 3: "Burn permitted - with a written permit only - Brûlage permis"},
        {**LABELS, 1: "NO BURN  -  Pas de brûlage"},  # the same words: capitals and spacing do not matter
    ],
    ids=["swapped", "other-hours", "other-hours-in-french", "reworded", "words-added", "same-words"],
)
def test_a_category_is_trusted_only_while_the_province_names_it_word_for_word_in_both_languages(labels):
    """The card's words are tied to the layer's own names for 1, 2 and 3: a code whose name changed is not shown."""
    same = lambda a, b: " ".join(a.split()).casefold() == " ".join(b.split()).casefold()  # noqa: E731

    states = {category: burn(province(category, layer=layer(labels)))["state"] for category in (1, 2, 3)}

    assert states == {category: state if same(labels[category], LABELS[category]) else "not_checked" for category, state in {1: "no_burn", 2: "restricted", 3: "permitted"}.items()}


def test_a_county_s_unreadable_row_does_not_spoil_the_other_counties():
    answer = _edit({"PUBLICCATEGORY": 9}, county="KENT")

    assert [burn(answer, place(town))["state"] for town in ("Moncton", "Richibucto")] == ["permitted", "not_checked"]


def test_outlines_that_cannot_be_read_never_fail_the_verdict(monkeypatch):
    def broken():
        raise OSError("nb-counties.geojson is missing")

    monkeypatch.setattr("smoke_engine.burn._counties", broken)
    feeds = BurnFeeds(province(1))

    bodies = [verdict(feeds, spot) for spot in (MONCTON, place("Halifax", "NS"))]

    assert [(body["verdict"], body["burn"]) for body in bodies] == [("unexplained", None), ("unexplained", None)]
    assert feeds.burn_asked == []


@pytest.mark.parametrize("fires", [[], [hotspot(46.10, -65.9, "2026-08-25T09:00:00Z")]], ids=["no-fire", "a-fire-upwind"])
def test_the_burn_status_never_changes_the_verdict(fires):
    answers = [verdict(BurnFeeds(answer, hotspots=fires)) for answer in (province(1), province(3), FeedUnavailable("down"), KeyError("features"))]

    states = [body.pop("burn")["state"] for body in answers]
    assert (states, all(body == answers[0] for body in answers)) == (["no_burn", "permitted", "not_checked", "not_checked"], True)


# --- the live feed, with the province's server faked at the HTTP transport -----------------------------

NOW = datetime(2026, 8, 25, 15, 0, tzinfo=timezone.utc)


def live_feeds(tmp_path, gnb, requests: list, clock=lambda: NOW):
    """The real live feed. Open-Meteo answers with a west wind; `gnb(request)` answers the province's server; CWFIS,
    the AQHI and ECCC answer with nothing."""

    def handle(request: httpx.Request) -> httpx.Response:
        if "open-meteo" in request.url.host:
            if request.url.path.endswith("meta.json"):
                return httpx.Response(200, json={"last_run_initialisation_time": 1787500800})
            lats = [float(v) for v in request.url.params["latitude"].split(",")]
            lons = [float(v) for v in request.url.params["longitude"].split(",")]
            return httpx.Response(200, json=WEST_WIND(list(zip(lats, lons)), NOW - timedelta(days=2), NOW + timedelta(days=2)))
        if request.url.host == "gis-erd-der.gnb.ca":
            requests.append(request)
            return gnb(request)
        return httpx.Response(200, json={"type": "FeatureCollection", "features": [], "numberMatched": 0, "numberReturned": 0})

    feeds = LiveFeeds(
        client=httpx.Client(transport=httpx.MockTransport(handle)),
        wind_file=tmp_path / "live-wind.json",
        firms_file=tmp_path / "live-firms.json",
        now=clock,
        sleep=lambda s: None,
    )
    feeds.refresh_wind()
    return feeds


def gnb_answers(category: int = 3, valid: str = "2026-08-25T14:00"):
    """The province's server, answering each of the three requests."""
    answer = province(category, valid)

    def respond(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        return httpx.Response(200, json=answer["layer"] if path.endswith("/MapServer/0") else answer["current" if "/0/" in path else "none"])

    return respond


def live_burn(feeds, clock=lambda: NOW, **params) -> dict | None:
    response = TestClient(create_app({"live": feeds}, now=clock)).get("/verdict", params={**MONCTON, "mode": "live", **params})
    assert response.status_code == 200
    return response.json()["burn"]


def test_live_asks_the_province_for_every_county_and_never_sends_the_person_s_point(tmp_path):
    requests = []
    feeds = live_feeds(tmp_path, gnb_answers(), requests)

    live_burn(feeds)

    service = "https://gis-erd-der.gnb.ca/gisserver/rest/services/FireWeather/BurnCategories/MapServer"
    whole = {"where": "1=1", "outFields": "NAME,PUBLICCATEGORY,VALIDDATE", "returnGeometry": "false", "f": "json"}
    assert sorted((str(r.url.copy_with(query=None)), dict(r.url.params)) for r in requests) == sorted([
        (f"{service}/0/query", whole),
        (f"{service}/1/query", whole),
        (f"{service}/0", {"f": "json"}),
    ])
    assert not any(part in str(r.url) for r in requests for part in ("46.09", "64.79", "geometry="))


def test_live_gives_the_category_and_when_the_province_was_asked(tmp_path):
    feeds = live_feeds(tmp_path, gnb_answers(2), [])

    assert live_burn(feeds) == {
        "state": "restricted",
        "county": "Westmorland",
        "validUntil": "2026-08-25T17:00:00Z",
        "checkedAt": "2026-08-25T15:00:00Z",
        "source": "gnb_burn_categories",
        "reason": None,
    }


def test_live_asks_the_province_once_in_15_minutes_however_many_people_check(tmp_path):
    requests, clock = [], [NOW]
    feeds = live_feeds(tmp_path, gnb_answers(), requests, clock=lambda: clock[0])

    for minutes in (0, 5, 14):
        clock[0] = NOW + timedelta(minutes=minutes)
        live_burn(feeds, clock=lambda: clock[0])
    asked_in_the_first_quarter = len(requests)
    clock[0] = NOW + timedelta(minutes=15)
    live_burn(feeds, clock=lambda: clock[0])

    assert (asked_in_the_first_quarter, len(requests)) == (3, 6)


@pytest.mark.parametrize(
    "gnb",
    [
        lambda request: httpx.Response(503),
        lambda request: httpx.Response(200, text="<html>Service unavailable</html>"),
        lambda request: httpx.Response(200, json={"error": {"code": 499, "message": "Token Required"}}),
        lambda request: (_ for _ in ()).throw(httpx.ConnectTimeout("timed out")),
    ],
    ids=["http-503", "not-json", "arcgis-error", "timeout"],
)
def test_when_the_province_fails_live_says_not_checked_and_still_gives_the_verdict(tmp_path, gnb):
    feeds = live_feeds(tmp_path, gnb, [])

    response = TestClient(create_app({"live": feeds}, now=lambda: NOW)).get("/verdict", params={**MONCTON, "mode": "live"})

    assert (response.status_code, response.json()["verdict"], response.json()["burn"]["state"]) == (200, "unexplained", "not_checked")


def test_live_gives_the_province_5_seconds_in_all_for_its_three_answers(tmp_path):
    requests = []
    feeds = live_feeds(tmp_path, gnb_answers(), requests)

    live_burn(feeds)

    waits = [r.extensions["timeout"]["read"] for r in requests]
    assert (len(waits), waits[0] <= 5.0, waits == sorted(waits, reverse=True), all(set(r.extensions["timeout"].values()) == {w} for r, w in zip(requests, waits))) == (3, True, True, True)


def test_a_slow_province_is_not_waited_for_beyond_its_5_seconds(tmp_path):
    requests = []
    answers = gnb_answers()

    def slow(request):
        time.sleep(2.6)
        return answers(request)

    feeds = live_feeds(tmp_path, slow, requests)
    started = time.monotonic()

    found = live_burn(feeds)

    # Two answers took over 5 seconds: the third request is never sent, and nothing is said.
    assert (found["state"], len(requests), requests[1].extensions["timeout"]["read"] < 2.5) == ("not_checked", 2, True)
    assert time.monotonic() - started < 12  # the verdict itself was not held up further


def test_an_error_the_province_sends_with_http_200_is_never_kept_as_its_answer(tmp_path):
    requests, clock, broken = [], [NOW], [True]
    answers = gnb_answers(1)
    feeds = live_feeds(
        tmp_path,
        lambda request: httpx.Response(200, json={"error": {"code": 500, "message": "Error performing query operation"}}) if broken[0] else answers(request),
        requests,
        clock=lambda: clock[0],
    )

    first = live_burn(feeds, clock=lambda: clock[0])["state"]
    broken[0] = False
    clock[0] = NOW + timedelta(seconds=121)  # the same 15 minutes: the error was not kept for them
    second = live_burn(feeds, clock=lambda: clock[0])["state"]

    assert (first, second, len(requests)) == ("not_checked", "no_burn", 4)


def test_checks_that_arrive_together_share_one_fetch(tmp_path):
    requests = []
    answers = gnb_answers()

    def unhurried(request):
        time.sleep(0.2)
        return answers(request)

    feeds = live_feeds(tmp_path, unhurried, requests)
    got = []
    threads = [threading.Thread(target=lambda: got.append(feeds.burn_categories(NOW))) for _ in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert (len(requests), len(got), all(answer is got[0] for answer in got), got[0]["checkedAt"]) == (3, 4, True, NOW)


def test_a_province_that_does_not_answer_is_not_asked_again_for_2_minutes(tmp_path):
    requests, clock = [], [NOW]
    feeds = live_feeds(tmp_path, lambda request: httpx.Response(503), requests, clock=lambda: clock[0])

    states = []
    for seconds in (0, 30, 119):
        clock[0] = NOW + timedelta(seconds=seconds)
        states.append(live_burn(feeds, clock=lambda: clock[0])["state"])
    asked_while_down = len(requests)
    clock[0] = NOW + timedelta(seconds=121)
    live_burn(feeds, clock=lambda: clock[0])

    assert (states, asked_while_down, len(requests)) == (["not_checked"] * 3, 1, 2)


def test_live_cannot_say_what_the_category_was_at_another_time(tmp_path):
    requests = []
    feeds = live_feeds(tmp_path, gnb_answers(), requests)

    found = live_burn(feeds, time="2026-08-24T15:00:00Z")

    assert (found["state"], found["county"], requests) == ("not_checked", "Westmorland", [])


# --- the replay: the province keeps no past categories ---------------------------------------------------


@pytest.mark.parametrize(
    ("town", "county"),
    [("Moncton", "Westmorland"), ("Saint John", "Saint John"), ("Edmundston", "Madawaska"), ("Bathurst", "Gloucester")],
)
def test_in_the_replay_a_new_brunswick_town_is_not_checked_and_names_its_county(town, county):
    body = verdict(ReplayFeeds(), place(town), "2025-08-25T12:00:00Z", mode="replay")

    assert body["burn"] == {"state": "not_checked", "county": county, "validUntil": None, "checkedAt": None, "source": "none_recorded", "reason": "unavailable"}


@pytest.mark.parametrize(("town", "province_code"), [("Halifax", "NS"), ("Charlottetown", "PE"), ("Bridgetown", "NS")])
def test_in_the_replay_a_town_outside_new_brunswick_has_no_burn_status(town, province_code):
    assert verdict(ReplayFeeds(), place(town, province_code), "2025-08-25T12:00:00Z", mode="replay")["burn"] is None


def test_the_saved_replay_answers_carry_the_burn_field():
    demo = PLACES_DIR.parent / "demo"
    saved = {file.stem: json.loads(file.read_text(encoding="utf-8")).get("burn", "absent") for file in demo.glob("*.json") if file.stem != "index"}

    assert {town: (b["state"], b["county"]) if isinstance(b, dict) else (b, b) for town, b in saved.items()} == {
        "moncton": ("not_checked", "Westmorland"), "dieppe": ("not_checked", "Westmorland"), "sackville": ("not_checked", "Westmorland"),
        "sussex": ("not_checked", "Kings"), "saint-john": ("not_checked", "Saint John"), "fredericton": ("not_checked", "York"),
        "miramichi": ("not_checked", "Northumberland"), "bathurst": ("not_checked", "Gloucester"), "edmundston": ("not_checked", "Madawaska"),
        "charlottetown": (None, None), "truro": (None, None), "halifax": (None, None), "bridgetown": (None, None), "west-dalhousie": (None, None),
    }
