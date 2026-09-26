"""One-time download of the NASA FIRMS archive detections for the replay (Aug 24–25, 2025).

    uv run python -m scripts.fetch_firms_replay     (from engine/; needs FIRMS_MAP_KEY)

Checks FIRMS data_availability, then saves each standard-processing (SP) source
that covers both days, unchanged, as data/replay/moncton-2025-08-25/firms/<SOURCE>.csv.
Each file goes into manifest.json with its URL (MAP_KEY masked as ***), download
time and row count. A source that does not cover the dates is recorded as missing;
no other date is ever fetched in its place.
"""

import csv
import io
import json
from datetime import date, datetime, timezone

import httpx

from smoke_engine.feeds import sources
from smoke_engine.feeds.replay import REPLAY_DIR

DATE = "2025-08-24"
DAY_RANGE = 2
LAST_DAY = "2025-08-25"
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


def main() -> None:
    key = sources.firms_key()
    if not key:
        raise SystemExit("FIRMS_MAP_KEY is not set (engine/.env or the environment)")
    out = REPLAY_DIR / "firms"
    out.mkdir(parents=True, exist_ok=True)
    manifest_path = REPLAY_DIR / "manifest.json"
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
            if not (date.fromisoformat(row["min_date"]) <= date.fromisoformat(DATE)
                    and date.fromisoformat(LAST_DAY) <= date.fromisoformat(row["max_date"])):
                missing[source] = f"data_availability covers {row['min_date']} to {row['max_date']} only"
                continue
            url = sources.firms_area_url(key, source, DAY_RANGE, DATE)
            downloaded_at = _now()
            raw = _get(client, url, key)
            text = raw.decode("utf-8")
            if not text.startswith("latitude,"):
                missing[source] = sources.mask_key(f"FIRMS answered without CSV: {text[:120]!r}", key)
                continue
            (out / f"{source}.csv").write_bytes(raw)  # exactly as FIRMS sent it
            count = max(0, len(text.strip().splitlines()) - 1)
            files[f"firms/{source}.csv"] = {
                "source": f"NASA FIRMS area API, {source}, bbox {sources.FIRMS_BBOX}, {DAY_RANGE} days from {DATE}",
                "url": sources.mask_key(url, key),
                "downloadedAt": downloaded_at,
                "rows": count,
            }
            print(f"firms/{source}.csv: {count} rows")

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
    main()
