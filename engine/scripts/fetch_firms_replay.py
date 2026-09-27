"""One-time download of the NASA FIRMS archive detections for a replay day and the day before.

    uv run python -m scripts.fetch_firms_replay 2025-08-25 --name moncton-2025-08-25     (from engine/; needs FIRMS_MAP_KEY)

Checks FIRMS data_availability, then saves each standard-processing (SP) source
that covers both days, unchanged, as data/replay/<name>/firms/<SOURCE>.csv.
Each file goes into manifest.json with its URL (MAP_KEY masked as ***), download
time and row count. A source that does not cover the dates is recorded as missing;
no other date is ever fetched in its place. scripts/fetch_replay.py runs this last.
"""

import argparse
import csv
import io
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx

from smoke_engine.feeds import sources
from smoke_engine.feeds.replay import REPLAY_DIR

DAY_RANGE = 2
NO_ARCHIVE = {"VIIRS_NOAA21_SP": "FIRMS has no NOAA-21 standard-processing archive (not in data_availability)"}


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _get(client: httpx.Client, url: str, key: str) -> bytes:
    try:
        response = client.get(url, timeout=300)
        response.raise_for_status()
    except httpx.HTTPError as error:
        raise SystemExit(sources.mask_key(f"{type(error).__name__}: {error}", key)) from None
    return response.content


def main(directory: Path, day: date) -> None:
    key = sources.firms_key()
    if not key:
        raise SystemExit("FIRMS_MAP_KEY is not set (engine/.env or the environment)")
    first, last = (day - timedelta(days=DAY_RANGE - 1)).isoformat(), day.isoformat()
    out = directory / "firms"
    out.mkdir(parents=True, exist_ok=True)
    manifest_path = directory / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    with httpx.Client(headers={"User-Agent": sources.USER_AGENT}) as client:
        availability_url = sources.firms_availability_url(key)
        checked_at = _now()
        rows = {r["data_id"]: r for r in csv.DictReader(io.StringIO(_get(client, availability_url, key).decode("utf-8")))}
        files, missing = {}, dict(NO_ARCHIVE)
        for source in sources.FIRMS_ARCHIVE_SOURCES:
            row = rows.get(source)
            if row is None:
                missing[source] = "not in data_availability"
                continue
            if not (date.fromisoformat(row["min_date"]) <= date.fromisoformat(first)
                    and date.fromisoformat(last) <= date.fromisoformat(row["max_date"])):
                missing[source] = f"data_availability covers {row['min_date']} to {row['max_date']} only"
                continue
            url = sources.firms_area_url(key, source, DAY_RANGE, first)
            downloaded_at = _now()
            raw = _get(client, url, key)
            text = raw.decode("utf-8")
            if not text.startswith("latitude,"):
                missing[source] = sources.mask_key(f"FIRMS answered without CSV: {text[:120]!r}", key)
                continue
            (out / f"{source}.csv").write_bytes(raw)  # exactly as FIRMS sent it
            count = max(0, len(text.strip().splitlines()) - 1)
            files[f"firms/{source}.csv"] = {
                "source": f"NASA FIRMS area API, {source}, bbox {sources.FIRMS_BBOX}, {DAY_RANGE} days from {first}",
                "url": sources.mask_key(url, key),
                "downloadedAt": downloaded_at,
                "rows": count,
            }
            print(f"{directory.name}/firms/{source}.csv: {count} rows")

    manifest["files"].update(files)
    manifest["firms"] = {
        "availability": {
            "url": sources.mask_key(availability_url, key),
            "checkedAt": checked_at,
            "ranges": {s: f"{r['min_date']} to {r['max_date']}" for s, r in rows.items()},
        },
        "missing": missing,
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for source, why in missing.items():
        print(f"{source}: missing ({why})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download the FIRMS archive files for a replay day.")
    parser.add_argument("date", type=date.fromisoformat, help="the day of the arrival times (UTC), YYYY-MM-DD")
    parser.add_argument("--name", help="directory under data/replay/ (default: the date)")
    args = parser.parse_args()
    main(REPLAY_DIR.parent / (args.name or args.date.isoformat()), args.date)
