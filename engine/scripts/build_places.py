"""One-time build of the bundled place data in data/places/.

    uv run python -m scripts.build_places     (from engine/)

Sources (both open, downloaded once; the outputs are committed):
- Communities: NRCan Canadian Geographical Names Database (CGNDB), populated
  places in N.B., N.S. and P.E.I. Open Government Licence – Canada.
- Areas: Natural Earth 1:10m admin-1 (N.B., N.S., P.E.I., Quebec, Maine) and
  marine areas (Bay of Fundy, Gulf of St. Lawrence, Gulf of Maine). Public domain.
"""

import csv
import io
import json
import urllib.request
import zipfile
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "data" / "places"

CGNDB_URL = "https://ftp.maps.canada.ca/pub/nrcan_rncan/vector/geobase_cgn_toponyme/prov_csv_eng/cgn_{prov}_csv_eng.zip"
PROVINCE_CODES = {"New Brunswick": "NB", "Nova Scotia": "NS", "Prince Edward Island": "PE"}

NE_BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
NE_ADMIN1 = NE_BASE + "ne_10m_admin_1_states_provinces.geojson"
NE_MARINE = NE_BASE + "ne_10m_geography_marine_polys.geojson"
ADMIN1_CODES = {"CA-NB": "NB", "CA-NS": "NS", "CA-PE": "PE", "CA-QC": "QC", "US-ME": "ME"}
MARINE_CODES = {"Bay of Fundy": "BAY_OF_FUNDY", "Gulf of Saint Lawrence": "GULF_OF_ST_LAWRENCE", "Gulf of Maine": "GULF_OF_MAINE"}

# The wind grid (41–51°N, 72–56°W) plus a margin.
CLIP = (40.0, 52.0, -73.0, -55.0)  # lat min, lat max, lon min, lon max


def _download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "smoke-or-fire-engine/0.1 (build_places)"})
    with urllib.request.urlopen(request, timeout=300) as response:
        return response.read()


def build_communities() -> None:
    places, seen = [], set()
    for prov in ("nb", "ns", "pe"):
        archive = zipfile.ZipFile(io.BytesIO(_download(CGNDB_URL.format(prov=prov))))
        name = next(n for n in archive.namelist() if n.endswith(".csv"))
        rows = csv.DictReader(io.TextIOWrapper(archive.open(name), encoding="utf-8-sig"))
        for row in rows:
            if row["Generic Category"] != "Populated Place":
                continue
            feature = row["Toponymic Feature ID"]
            if feature in seen:  # bilingual features have one row per official name
                continue
            seen.add(feature)
            places.append([
                row["Geographical Name"],
                round(float(row["Latitude"]), 5),
                round(float(row["Longitude"]), 5),
                row["Concise Code"],
                row["Location"],
                PROVINCE_CODES[row["Province - Territory"]],
            ])
    places.sort(key=lambda p: (p[5], p[0]))
    document = {
        "source": "NRCan Canadian Geographical Names Database (CGNDB), populated places",
        "licence": "Open Government Licence – Canada",
        "fields": ["name", "lat", "lon", "type", "county", "province"],
        "places": places,
    }
    (OUT / "communities.json").write_text(json.dumps(document, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"communities.json: {len(places)} places")


def _clip_ring(ring: list[list[float]]) -> list[list[float]]:
    """Sutherland–Hodgman clip of one ring (lon, lat pairs) to the CLIP rectangle."""
    lat_min, lat_max, lon_min, lon_max = CLIP
    edges = [
        (lambda p: p[0] >= lon_min, lambda a, b: _cross_lon(a, b, lon_min)),
        (lambda p: p[0] <= lon_max, lambda a, b: _cross_lon(a, b, lon_max)),
        (lambda p: p[1] >= lat_min, lambda a, b: _cross_lat(a, b, lat_min)),
        (lambda p: p[1] <= lat_max, lambda a, b: _cross_lat(a, b, lat_max)),
    ]
    points = ring[:-1] if ring and ring[0] == ring[-1] else ring
    for inside, cross in edges:
        if not points:
            break
        output = []
        for i, current in enumerate(points):
            previous = points[i - 1]
            if inside(current):
                if not inside(previous):
                    output.append(cross(previous, current))
                output.append(current)
            elif inside(previous):
                output.append(cross(previous, current))
        points = output
    rounded = []
    for lon, lat in points:
        p = [round(lon, 4), round(lat, 4)]
        if not rounded or rounded[-1] != p:
            rounded.append(p)
    if len(rounded) < 3:
        return []
    return rounded + [rounded[0]]


def _cross_lon(a, b, lon):
    t = (lon - a[0]) / (b[0] - a[0])
    return [lon, a[1] + t * (b[1] - a[1])]


def _cross_lat(a, b, lat):
    t = (lat - a[1]) / (b[1] - a[1])
    return [a[0] + t * (b[0] - a[0]), lat]


def _clip_geometry(geometry: dict) -> dict | None:
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    kept = []
    for polygon in polygons:
        outer = _clip_ring(polygon[0])
        if not outer:
            continue
        holes = [h for h in (_clip_ring(r) for r in polygon[1:]) if h]
        kept.append([outer, *holes])
    return {"type": "MultiPolygon", "coordinates": kept} if kept else None


def build_areas() -> None:
    features = []
    admin1 = json.loads(_download(NE_ADMIN1))
    for f in admin1["features"]:
        code = ADMIN1_CODES.get(f["properties"].get("iso_3166_2"))
        if code:
            geometry = _clip_geometry(f["geometry"])
            if geometry:
                features.append({"type": "Feature", "properties": {"code": code, "kind": "land"}, "geometry": geometry})
    marine = json.loads(_download(NE_MARINE))
    for f in marine["features"]:
        code = MARINE_CODES.get(f["properties"].get("name"))
        if code:
            geometry = _clip_geometry(f["geometry"])
            if geometry:
                features.append({"type": "Feature", "properties": {"code": code, "kind": "water"}, "geometry": geometry})
    document = {
        "type": "FeatureCollection",
        "source": "Natural Earth 1:10m admin-1 and marine areas (public domain), clipped to 40–52°N, 73–55°W",
        "features": features,
    }
    (OUT / "areas.geojson").write_text(json.dumps(document, separators=(",", ":")), encoding="utf-8")
    print("areas.geojson:", sorted(f["properties"]["code"] for f in features))


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    build_communities()
    build_areas()
