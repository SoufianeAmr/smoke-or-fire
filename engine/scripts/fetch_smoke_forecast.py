"""Record ECCC's FireWork smoke forecast as MSC GeoMet answers it now: 48 hourly answers for each town.

    uv run python -m scripts.fetch_smoke_forecast                         (from engine/; Moncton, the live sample)
    uv run python -m scripts.fetch_smoke_forecast --towns all --out ../data/replay/<day>/smoke-forecast.json

The sample (data/samples/smoke-forecast-moncton.json) documents the service and is read by the tests. ECCC keeps a
forecast about two days, so the forecast of a day to be replayed later must be recorded on that day, next to its
other recordings: the replay feed reads smoke-forecast.json in the replay's folder, in this same shape.
"""

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

from scripts.build_demo import TOWNS, official_point
from smoke_engine.feeds import sources
from smoke_engine.feeds.live import LiveFeeds
from smoke_engine.smoke_forecast import HOURS, LAYER

SAMPLE = Path(__file__).resolve().parents[2] / "data" / "samples" / "smoke-forecast-moncton.json"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--towns", default="Moncton,NB", help='"all" for the demo towns, or "Name,NB;Name,NS"')
    parser.add_argument("--out", type=Path, default=SAMPLE)
    args = parser.parse_args()
    towns = TOWNS if args.towns == "all" else [tuple(town.split(",")) for town in args.towns.split(";")]

    now = datetime.now(timezone.utc)
    first = now.replace(minute=0, second=0, microsecond=0)
    times = [first + timedelta(hours=h) for h in range(HOURS)]
    feeds = LiveFeeds(client=httpx.Client(headers={"User-Agent": sources.USER_AGENT}, timeout=30), now=lambda: now)
    points = {}
    for name, province in towns:
        place = official_point(name, province)
        recorded = feeds.smoke_forecast(place.lat, place.lon, times)
        point = tuple(recorded["point"])
        points.setdefault(point, {"towns": [], "point": recorded["point"], "answers": recorded["answers"]})
        points[point]["towns"].append(f"{name}, {province}")
        run = recorded["answers"][0]["features"][0]["properties"]["dim_reference_time"]
        print(f"{name}, {province}: {len(recorded['answers'])} hours from {first:%Y-%m-%dT%H:%MZ}, run {run}")

    example = next(iter(points))
    document = {
        "what": "ECCC's FireWork smoke forecast, as MSC GeoMet answered: one GetFeatureInfo answer per hour",
        "service": f"{sources.ECCC_GEOMET} (WMS 1.3.0, no key)",
        "layer": LAYER,
        "legend": sources.FIREWORK_LEGEND,
        "licence": "Data Source: Environment and Climate Change Canada (ECCC Data Services End-use Licence)",
        "fetchedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        # The first hour is asked without a run; its answer names the newest one, and the others are asked for it.
        "requests": [
            str(httpx.Request("GET", sources.ECCC_GEOMET, params=sources.firework_params(example, times[0])).url),
            str(httpx.Request("GET", sources.ECCC_GEOMET, params=sources.firework_params(
                example, times[1], datetime.fromisoformat(
                    points[example]["answers"][0]["features"][0]["properties"]["dim_reference_time"].replace("Z", "+00:00")
                ),
            )).url),
        ],
        "points": list(points.values()),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(document, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
