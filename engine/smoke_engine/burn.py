"""Is burning allowed today, in the county of a point: the province's own burn category, or not checked. Never a guess.

The Government of New Brunswick gives each of its 15 counties a burn category every day at 2 p.m. during the fire
season: no burn, restricted burn (8 p.m. to 8 a.m.), or burn permitted. The feed answers as the province's burn
category layers do: the counties that have a category now, the counties that have none, and the first layer's own
names for its codes. The county is the one whose outline, the province's own, holds the point; the point itself is
never sent to the province. Anything that cannot be read for certain is "not checked". Informational only: it never
changes the verdict, and it never fails it.
"""

import json
import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from functools import cache

from smoke_engine.feeds import FeedUnavailable
from smoke_engine.geo import closest_point_on_segment
from smoke_engine.places import PLACES_DIR, _communities, _nearest_outline, in_ring

NO_BURN, RESTRICTED, PERMITTED, SEASON_CLOSED, NOT_CHECKED = "no_burn", "restricted", "permitted", "season_closed", "not_checked"
# The layer's codes, and the name its coded values give each one, in both languages. A code is trusted only while
# the province names it so, word for word: what the card says of it (the hours too) is tied to these words.
CATEGORIES = {
    1: (NO_BURN, "No burn - Pas de brûlage"),
    2: (RESTRICTED, "Restricted burn, permitted 8 PM to 8 AM - Brûlage limité, permis de 20h à 8h"),
    3: (PERMITTED, "Burn permitted - Brûlage permis"),
}
# The province dates a category to the end of its validity: the next day's 2 p.m. update. It is a day old by then,
# so it is over 26 hours old once that time is 2 hours past.
LATE_UPDATE = timedelta(hours=2)
# No category was ever seen dated further ahead than the next day's update: one dated beyond this is not a day's status.
FURTHEST_AHEAD = timedelta(hours=36)
# The fire season runs from the third Monday of April to October 31, but the Minister can open it earlier (2026's
# opened on April 1) or extend it. So a category the province gives is shown whatever the date, and a county it lists
# with no category is "season closed" only in the months no season has reached: November to March.
CLOSED_MONTHS = (11, 12, 1, 2, 3)

# The outlines follow the shore: a town's point can sit in its harbour (Bathurst's does, 170 m out). A point in no
# county is given the only county within this distance, away from every other province and from Maine.
OFFSHORE_KM = 0.25
# A phone's location can be off by more than this. A point this close to a county with another answer is not checked.
NEAR_LINE_KM = 1.0
ELSEWHERE = {"ME", "QC", "NS", "PE"}

# Why a status is not checked.
UNAVAILABLE = "unavailable"  # the province did not answer, or keeps nothing for that time (the replay)
UNREADABLE = "unreadable"  # an answer in a shape never seen
STALE = "stale"  # over 26 hours old
NO_CATEGORY = "no_category"  # from April to October, the province lists the county with no category
NO_COUNTY = "no_county"  # a New Brunswick town whose point is in no county, or not in the one it is listed in
COUNTY_LINE = "county_line"  # within 1 km of a county whose answer is another one


@dataclass(frozen=True)
class BurnCheck:
    state: str
    county: str | None = None  # "Westmorland", "Saint John"
    valid_until: datetime | None = None  # the end of the category's validity: the province's next update
    checked_at: datetime | None = None  # when the province was asked
    reason: str | None = None  # why it is not checked


# --- the county ------------------------------------------------------------------------------------------


@cache
def _counties() -> list[tuple[str, list]]:
    """Each county's name as the province writes it ("SAINT JOHN") and its polygons, each with its bounding box."""
    document = json.loads((PLACES_DIR / "nb-counties.geojson").read_text(encoding="utf-8"))
    counties = []
    for feature in document["features"]:
        polygons = []
        for outer, *holes in feature["geometry"]["coordinates"]:
            lons, lats = [x for x, _ in outer], [y for _, y in outer]
            polygons.append(((min(lons), min(lats), max(lons), max(lats)), outer, holes))
        counties.append((feature["properties"]["name"], polygons))
    return counties


def _counties_at(lat: float, lon: float) -> list[str]:
    """The counties whose outline holds the point: one, none, or two within a few metres of a county line."""
    return [
        name
        for name, polygons in _counties()
        if any(
            west <= lon <= east and south <= lat <= north and in_ring(lat, lon, outer) and not any(in_ring(lat, lon, hole) for hole in holes)
            for (west, south, east, north), outer, holes in polygons
        )
    ]


def _counties_within(lat: float, lon: float, km: float) -> set[str]:
    """The counties whose outline comes within `km` of the point."""
    dlat = km / 111.0
    dlon = dlat / math.cos(math.radians(lat))
    near = set()
    for name, polygons in _counties():
        for (west, south, east, north), outer, holes in polygons:
            if name in near or not (west - dlon <= lon <= east + dlon and south - dlat <= lat <= north + dlat):
                continue
            for ring in (outer, *holes):
                for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
                    # Both ends beyond the same side of the box around the point: the segment cannot reach it.
                    if (
                        (y1 < lat - dlat and y2 < lat - dlat) or (y1 > lat + dlat and y2 > lat + dlat)
                        or (x1 < lon - dlon and x2 < lon - dlon) or (x1 > lon + dlon and x2 > lon + dlon)
                    ):
                        continue
                    if closest_point_on_segment(lat, lon, (y1, x1), (y2, x2))[0] <= km:
                        near.add(name)
                        break
                if name in near:
                    break
    return near


def _listed_counties(lat: float, lon: float) -> set[str] | None:
    """When the point is a New Brunswick community's own point (a town picked from the search): the county, or two,
    that the names database (NRCan CGNDB) lists for it. None for any other point."""
    here = [c for c in _communities() if abs(c.lat - lat) < 1e-5 and abs(c.lon - lon) < 1e-5 and c.province == "NB"]
    if not here:
        return None
    return {county.strip().upper() for c in here for county in c.county.split(";") if county.strip()}


def county_at(lat: float, lon: float) -> str | None:
    """The county of the point, as the province names it ("SAINT JOHN"); None when it cannot be told for certain."""
    return _county(lat, lon)[0]


def _county(lat: float, lon: float) -> tuple[str | None, bool, bool]:
    """(the county; whether the names database confirms it; whether the point is known to be in New Brunswick)."""
    inside = _counties_at(lat, lon)
    listed = _listed_counties(lat, lon)
    name = inside[0] if len(inside) == 1 else None
    if not inside and not _nearest_outline(lat, lon, ELSEWHERE):
        offshore = _counties_within(lat, lon, OFFSHORE_KM)
        name = next(iter(offshore)) if len(offshore) == 1 else None
    # A town the names database lists in another county than the one its point falls in: not told for certain.
    if name and listed and name not in listed:
        name = None
    # In no county, a point is taken to be outside New Brunswick, as the province's outlines say, unless it is a New
    # Brunswick town's own point. The map's coarser outline is not asked: it takes Calais, Maine for New Brunswick.
    return name, bool(name and listed), bool(name or inside or listed is not None)


# --- the province's dates ----------------------------------------------------------------------------------


def _sunday(year: int, month: int, nth: int) -> datetime:
    """The nth Sunday of the month, at 2 a.m., when the clocks change."""
    first = date(year, month, 1)
    return datetime(year, month, 1 + (6 - first.weekday()) % 7 + 7 * (nth - 1), 2)


def _daylight(wall: datetime) -> bool:
    """Atlantic daylight time: from the second Sunday of March to the first Sunday of November, at 2 a.m."""
    return _sunday(wall.year, 3, 2) <= wall < _sunday(wall.year, 11, 1)


def atlantic_wall_to_utc(wall: datetime) -> datetime:
    """The province's server stores Atlantic wall-clock times and sends them as if they were UTC: 2 p.m. reads
    "14:00Z". The instant such a time names: 3 hours later in daylight time, 4 in standard time."""
    return (wall + timedelta(hours=3 if _daylight(wall) else 4)).replace(tzinfo=timezone.utc)


def _atlantic_date(at: datetime) -> date:
    wall = at.astimezone(timezone.utc).replace(tzinfo=None) - timedelta(hours=3)
    return (wall if _daylight(wall) else wall - timedelta(hours=1)).date()


def season_surely_closed(at: datetime) -> bool:
    """November to March, by the date in New Brunswick: the months no fire season has reached."""
    return _atlantic_date(at).month in CLOSED_MONTHS


# --- the status ----------------------------------------------------------------------------------------------


def burn_status(feeds, lat: float, lon: float, at: datetime) -> BurnCheck | None:
    """The burn category of the point's county at `at`. None outside New Brunswick: there is nothing to say."""
    try:
        name, confirmed, in_new_brunswick = _county(lat, lon)
    except Exception:  # the outlines cannot be read: the verdict is still given, and nothing is said of burning
        return None
    if name is None:
        return BurnCheck(NOT_CHECKED, reason=NO_COUNTY) if in_new_brunswick else None
    county = name.title()
    try:
        answer = feeds.burn_categories(at)
        checked_at = answer.get("checkedAt") if isinstance(answer, dict) else None
        lists = _lists(answer)
        state, valid_until, reason = _read(answer, lists, name, at)
        # A phone's location near a county line: the neighbour's answer must be the same one.
        if not confirmed:
            for other in _counties_within(lat, lon, NEAR_LINE_KM) - {name}:
                if _read(answer, lists, other, at)[0] != state:
                    state, valid_until, reason = NOT_CHECKED, None, COUNTY_LINE
    except Exception as error:  # the province is down, or its answer has a shape never seen: the verdict is still given
        return BurnCheck(NOT_CHECKED, county, reason=UNAVAILABLE if isinstance(error, FeedUnavailable) else UNREADABLE)
    return BurnCheck(state, county, valid_until, checked_at if isinstance(checked_at, datetime) else None, reason)


def _rows(answer) -> dict[str, dict]:
    """A layer's rows by county name. Raises unless it is a whole list of rows, each county once."""
    if not isinstance(answer, dict) or "error" in answer or answer.get("exceededTransferLimit"):
        raise ValueError("not a whole list of counties")
    rows = {}
    for feature in answer["features"]:
        row = feature["attributes"]
        if not isinstance(row["NAME"], str) or row["NAME"] in rows:
            raise ValueError("a county with no name, or listed twice")
        rows[row["NAME"]] = row
    return rows


def _lists(answer) -> tuple[dict, dict]:
    """The province's two lists: the counties with a category now, and those with none. Together they must be the
    15 counties, each once: anything else is not the layers as they were seen."""
    current, none = _rows(answer["current"]), _rows(answer["none"])
    if sorted([*current, *none]) != sorted(county for county, _ in _counties()):
        raise ValueError("not the 15 counties, each once")
    return current, none


def _words(text) -> str:
    """Lower case, single spaces: "No burn  -  Pas de brûlage" reads as "no burn - pas de brûlage"."""
    return " ".join(str(text).split()).casefold()


def _names(layer) -> dict[int, str]:
    """The name the layer's coded values give each category."""
    field = next(f for f in layer["fields"] if f["name"] == "PUBLICCATEGORY")
    return {value["code"]: _words(value["name"]) for value in field["domain"]["codedValues"]}


def _read(answer, lists: tuple[dict, dict], name: str, at: datetime) -> tuple[str, datetime | None, str | None]:
    """The province's answer, read for one county: (state, end of validity, why it is not checked)."""
    current, none = lists
    if name in none:
        # The province lists the county with no category: from November to March, the season is closed. From April
        # to October a season may be open, and the province does not say: neither does the card.
        return (SEASON_CLOSED, None, None) if season_surely_closed(at) else (NOT_CHECKED, None, NO_CATEGORY)

    row = current[name]
    code, stamp = row.get("PUBLICCATEGORY"), row.get("VALIDDATE")
    if type(code) is not int or code not in CATEGORIES or type(stamp) not in (int, float):
        return NOT_CHECKED, None, UNREADABLE
    if _names(answer["layer"]).get(code) != _words(CATEGORIES[code][1]):
        return NOT_CHECKED, None, UNREADABLE
    try:
        valid_until = atlantic_wall_to_utc(datetime.fromtimestamp(stamp / 1000, timezone.utc).replace(tzinfo=None))
    except (OverflowError, OSError, ValueError):
        return NOT_CHECKED, None, UNREADABLE
    if at > valid_until + LATE_UPDATE:
        return NOT_CHECKED, None, STALE
    if valid_until - at > FURTHEST_AHEAD:
        return NOT_CHECKED, None, UNREADABLE
    return CATEGORIES[code][0], valid_until, None
