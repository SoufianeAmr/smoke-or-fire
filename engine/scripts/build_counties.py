"""One-time build of New Brunswick's county outlines in data/places/nb-counties.geojson.

    uv run python -m scripts.build_counties     (from engine/)

Source: the Government of New Brunswick's own burn category layers (Department of Natural Resources), the ones its
Fire Watch dashboard draws. The outlines come from the same layers as the daily status, so the county a point falls
in is the county the province colours. Downloaded once; the output is committed.

The province's server generalises the outlines to about 5 m (maxAllowableOffset, in degrees): well under a phone's
own error, and a tenth of the size.
"""

import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from smoke_engine.feeds import sources
from smoke_engine.places import in_ring

OUT = Path(__file__).resolve().parents[2] / "data" / "places" / "nb-counties.geojson"
OFFSET_DEG = 0.00005  # about 5 m
COUNTIES = 15
# The layer's Charlotte County takes in six islets that are in Washington County, Maine (OpenStreetMap, checked
# 2026-10-04): Treat Island and an islet off Eastport, Dudley Island off Lubec, and St. Croix Island and its ledges
# off Calais. Nobody lives on them, but they are not New Brunswick: the polygon holding each point is left out.
IN_MAINE = [
    (44.87895, -66.98994), (44.91645, -67.02754), (44.87211, -66.99128),
    (45.12867, -67.13360), (45.12694, -67.13283), (45.12709, -67.13359),
]


def _layer(layer: int) -> list[dict]:
    query = urllib.parse.urlencode({
        "where": "1=1", "outFields": "NAME", "returnGeometry": "true", "outSR": "4326",
        "maxAllowableOffset": OFFSET_DEG, "geometryPrecision": 5, "f": "geojson",
    })
    request = urllib.request.Request(f"{sources.GNB_BURN_LAYERS[layer]}/query?{query}", headers={"User-Agent": sources.USER_AGENT})
    with urllib.request.urlopen(request, timeout=300) as response:
        answer = json.load(response)
    if answer.get("type") != "FeatureCollection" or answer.get("exceededTransferLimit"):
        raise SystemExit(f"layer {layer}: not a whole list of counties")
    return answer["features"]


def main() -> None:
    # A county with no category today is listed by the second layer instead of the first.
    by_name = {}
    for layer in sources.GNB_BURN_LAYERS:
        for feature in _layer(layer):
            geometry = feature["geometry"]
            polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
            by_name.setdefault(feature["properties"]["NAME"], {"type": "MultiPolygon", "coordinates": polygons})
    if len(by_name) != COUNTIES:
        raise SystemExit(f"{len(by_name)} counties, not {COUNTIES}: {sorted(by_name)}")
    for lat, lon in IN_MAINE:
        polygons = by_name["CHARLOTTE"]["coordinates"]
        holding = [polygon for polygon in polygons if in_ring(lat, lon, polygon[0])]
        if len(holding) != 1:
            raise SystemExit(f"{len(holding)} polygons of Charlotte County hold {lat}, {lon}: the list of Maine's islets needs a look")
        polygons.remove(holding[0])
    document = {
        "type": "FeatureCollection",
        "source": "Government of New Brunswick, Department of Natural Resources: burn category layers (FireWeather/BurnCategories)",
        "url": sources.GNB_BURN_SERVICE,
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "generalisedDeg": OFFSET_DEG,
        "leftOut": f"{len(IN_MAINE)} islets of Charlotte County's outline that are in Maine",
        "features": [
            {"type": "Feature", "properties": {"name": name}, "geometry": geometry} for name, geometry in sorted(by_name.items())
        ],
    }
    OUT.write_text(json.dumps(document, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    points = sum(len(ring) for f in document["features"] for polygon in f["geometry"]["coordinates"] for ring in polygon)
    print(f"{OUT.name}: {len(by_name)} counties, {points} points, {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
