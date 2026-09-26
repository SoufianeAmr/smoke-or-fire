"""Place names and areas from the bundled data in data/places/ (built by scripts/build_places.py)."""

import json
from dataclasses import dataclass
from functools import cache
from pathlib import Path

from smoke_engine.geo import distance_km

PLACES_DIR = Path(__file__).resolve().parents[2] / "data" / "places"

TOWN_TYPES = {"CITY", "TOWN", "VILG"}
TOWN_WITHIN_KM = 25.0
FIRE_NAME_WITHIN_KM = 10.0
AREA_FALLBACK_KM = 15.0  # coastal points that fall just outside the simplified outlines


@dataclass(frozen=True)
class Community:
    name: str
    lat: float
    lon: float
    type: str
    county: str
    province: str


@cache
def _communities() -> list[Community]:
    document = json.loads((PLACES_DIR / "communities.json").read_text(encoding="utf-8"))
    return [Community(*row) for row in document["places"]]


@cache
def _areas() -> list[tuple[str, list]]:
    document = json.loads((PLACES_DIR / "areas.geojson").read_text(encoding="utf-8"))
    # Land first: where an outline overlaps a water body, the point is on land.
    features = sorted(document["features"], key=lambda f: f["properties"]["kind"] != "land")
    return [(f["properties"]["code"], f["geometry"]["coordinates"]) for f in features]


@cache
def _fire_names() -> list[dict]:
    return json.loads((PLACES_DIR / "fire-names.json").read_text(encoding="utf-8"))["fires"]


def nearest_community(lat: float, lon: float, types: set[str] | None = None) -> tuple[Community, float] | None:
    best = None
    for c in _communities():
        if types and c.type not in types:
            continue
        km = distance_km(lat, lon, c.lat, c.lon)
        if best is None or km < best[1]:
            best = (c, km)
    return best


def town_name(lat: float, lon: float) -> str | None:
    """The nearest city, town or village within 25 km, else the nearest community."""
    town = nearest_community(lat, lon, TOWN_TYPES)
    if town and town[1] <= TOWN_WITHIN_KM:
        return town[0].name
    any_place = nearest_community(lat, lon)
    return any_place[0].name if any_place else None


def _in_ring(lat: float, lon: float, ring: list) -> bool:
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > lat) != (y2 > lat) and lon < x1 + (lat - y1) * (x2 - x1) / (y2 - y1):
            inside = not inside
    return inside


def area_code(lat: float, lon: float) -> str | None:
    """Province, state or water body code at a point (NB, NS, PE, QC, ME, BAY_OF_FUNDY, ...)."""
    for code, polygons in _areas():
        for outer, *holes in polygons:
            if _in_ring(lat, lon, outer) and not any(_in_ring(lat, lon, h) for h in holes):
                return code
    best, best_km = None, AREA_FALLBACK_KM
    for code, polygons in _areas():
        for outer, *_ in polygons:
            for x, y in outer:
                if abs(y - lat) < 0.2 and abs(x - lon) < 0.3:
                    km = distance_km(lat, lon, y, x)
                    if km < best_km:
                        best, best_km = code, km
    return best


def public_fire_name(lat: float, lon: float, year: int) -> dict | None:
    """The public name of a fire at this spot and year, from data/places/fire-names.json."""
    for entry in _fire_names():
        if entry["year"] == year and distance_km(lat, lon, entry["lat"], entry["lon"]) <= FIRE_NAME_WITHIN_KM:
            return entry
    return None
