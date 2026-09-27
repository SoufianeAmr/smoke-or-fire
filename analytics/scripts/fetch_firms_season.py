"""Download the NASA FIRMS standard-processing (SP) archive for the 2025 Maritimes season, raw.

    uv run python scripts/fetch_firms_season.py     (from analytics/; needs FIRMS_MAP_KEY, from the environment or engine/.env)

Checks FIRMS data_availability first. For each of VIIRS_NOAA20_SP, VIIRS_SNPP_SP and MODIS_SP that covers
2025-06-01 to 2025-09-30, fetches the bbox -72,41,-56,51 in 5-day windows from 2025-06-01 (the last one,
2025-09-29, is 2 days) and saves each answer unchanged as data/firms_season/<SOURCE>/<first day>_<N>d.csv.
A source that does not cover the season is recorded as missing; no other date is fetched in its place.
data/firms_season/manifest.json lists every file (URL with the MAP_KEY masked as ***, row count, sha256).
A re-run skips files already saved and listed, so it resumes where it stopped.
"""

import csv
import hashlib
import io
import json
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone

import httpx

from snow import ANALYTICS_DIR, DATA_DIR

FIRMS_API = "https://firms.modaps.eosdis.nasa.gov/api"
BBOX = "-72,41,-56,51"  # west,south,east,north: the engine's wind grid
SEASON_FIRST, SEASON_LAST = date(2025, 6, 1), date(2025, 9, 30)
WINDOW_DAYS = 5
SOURCES = {
    "VIIRS_NOAA20_SP": "VIIRS 375 m active fire, NOAA-20, standard processing",
    "VIIRS_SNPP_SP": "VIIRS 375 m active fire, Suomi NPP, standard processing",
    "MODIS_SP": "MODIS 1 km active fire, Terra and Aqua, standard processing",
}
ATTEMPTS = 4
BACKOFF_SECONDS = (15, 60, 180)  # waits after the 1st, 2nd and 3rd failure
PAUSE_SECONDS = 2  # between requests; FIRMS allows 5000 transactions per 10 minutes
USER_AGENT = "smoke-or-fire-analytics/0.1 (2025 Maritimes fire season data room)"
OUT_DIR = DATA_DIR / "firms_season"
MANIFEST = OUT_DIR / "manifest.json"
ENGINE_ENV = ANALYTICS_DIR.parent / "engine" / ".env"


def firms_key() -> str | None:
    if os.environ.get("FIRMS_MAP_KEY"):
        return os.environ["FIRMS_MAP_KEY"]
    if not ENGINE_ENV.exists():
        return None
    for line in ENGINE_ENV.read_text(encoding="utf-8").splitlines():
        name, _, value = line.partition("=")
        if name.strip() == "FIRMS_MAP_KEY" and value.strip():
            return value.strip()
    return None


def windows() -> list[tuple[date, int]]:
    """(first day, day range) pairs that tile the season with no overlap."""
    out, first = [], SEASON_FIRST
    while first <= SEASON_LAST:
        days = min(WINDOW_DAYS, (SEASON_LAST - first).days + 1)
        out.append((first, days))
        first += timedelta(days=days)
    return out


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def mask(text: str, key: str) -> str:
    return text.replace(key, "***")


def fetch(client: httpx.Client, url: str, key: str, starts_with: str) -> tuple[bytes | None, list[str]]:
    """The response bytes once the text starts as expected, else None and the masked reason for each failure."""
    failures = []
    for attempt in range(ATTEMPTS):
        try:
            response = client.get(url)
            text = response.content.decode("utf-8", errors="replace")
            if response.status_code == 200 and text.startswith(starts_with):
                return response.content, failures
            failures.append(mask(f"HTTP {response.status_code}: {text[:160]!r}", key))
        except httpx.HTTPError as error:
            failures.append(mask(f"{type(error).__name__}: {error}", key))
        print(f"  attempt {attempt + 1} failed: {failures[-1]}", flush=True)
        if attempt < ATTEMPTS - 1:
            time.sleep(BACKOFF_SECONDS[attempt])
    return None, failures


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def load_manifest() -> dict:
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text(encoding="utf-8"))
    return {}


def save_manifest(manifest: dict) -> None:
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def main() -> None:
    key = firms_key()
    if not key:
        raise SystemExit("FIRMS_MAP_KEY is not set (the environment or engine/.env)")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = load_manifest()
    manifest.update({
        "what": "NASA FIRMS standard-processing (SP) active fire detections for the 2025 season, raw area-API CSVs",
        "fetchedBy": "analytics/scripts/fetch_firms_season.py",
        "credit": "NASA FIRMS (Fire Information for Resource Management System)",
        "bbox": BBOX,
        "bboxOrder": "west,south,east,north",
        "season": {"firstDay": SEASON_FIRST.isoformat(), "lastDay": SEASON_LAST.isoformat()},
        "windowRule": (f"windows start {SEASON_FIRST.isoformat()}, every {WINDOW_DAYS} days, day range {WINDOW_DAYS}; "
                       "the last window is cut to end on the season's last day, so the windows tile the season "
                       "with no overlap. A window covers firstDay to firstDay + dayRange - 1 (acq_date, UTC)."),
        "fileNaming": "<SOURCE>/<firstDay>_<dayRange>d.csv, the response bytes exactly as FIRMS sent them",
    })
    files = manifest.setdefault("files", {})
    manifest["missing"], manifest["errors"] = {}, {}

    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=300) as client:
        availability_url = f"{FIRMS_API}/data_availability/csv/{key}/ALL"
        checked_at = now()
        raw, failures = fetch(client, availability_url, key, "data_id,")
        if raw is None:
            manifest["errors"]["data_availability"] = failures
            save_manifest(manifest)
            raise SystemExit("FIRMS data_availability failed: " + failures[-1])
        ranges = {r["data_id"]: r for r in csv.DictReader(io.StringIO(raw.decode("utf-8")))}
        manifest["data_availability"] = {
            "url": mask(availability_url, key),
            "checkedAt": checked_at,
            "ranges": {s: {"minDate": r["min_date"], "maxDate": r["max_date"]} for s, r in ranges.items()},
        }

        for source, dataset in SOURCES.items():
            row = ranges.get(source)
            if row is None:
                manifest["missing"][source] = "not in data_availability"
            elif not (date.fromisoformat(row["min_date"]) <= SEASON_FIRST
                      and SEASON_LAST <= date.fromisoformat(row["max_date"])):
                manifest["missing"][source] = f"data_availability covers {row['min_date']} to {row['max_date']} only"
            if source in manifest["missing"]:
                print(f"{source}: missing ({manifest['missing'][source]})", flush=True)
                save_manifest(manifest)
                continue

            (OUT_DIR / source).mkdir(exist_ok=True)
            for first, days in windows():
                name = f"{source}/{first.isoformat()}_{days}d.csv"
                path = OUT_DIR / name
                entry = files.get(name)
                if entry and path.exists() and sha256(path.read_bytes()) == entry["sha256"]:
                    continue
                url = f"{FIRMS_API}/area/csv/{key}/{source}/{BBOX}/{days}/{first.isoformat()}"
                downloaded_at = now()
                raw, failures = fetch(client, url, key, "latitude,")
                if raw is None:
                    manifest["errors"][name] = {"url": mask(url, key), "failures": failures}
                    save_manifest(manifest)
                    raise SystemExit(f"{name}: no CSV after {ATTEMPTS} attempts; see manifest.json errors")
                path.write_bytes(raw)
                text = raw.decode("utf-8")
                lines = text.strip().splitlines()
                files[name] = {
                    "source": source,
                    "dataset": dataset,
                    "url": mask(url, key),
                    "bbox": BBOX,
                    "firstDay": first.isoformat(),
                    "dayRange": days,
                    "downloadedAt": downloaded_at,
                    "rows": len(lines) - 1,
                    "bytes": len(raw),
                    "sha256": sha256(raw),
                    "header": lines[0],
                }
                save_manifest(manifest)
                print(f"{name}: {len(lines) - 1} rows", flush=True)
                time.sleep(PAUSE_SECONDS)

    manifest["files"] = dict(sorted(files.items()))
    save_manifest(manifest)
    total = sum(e["rows"] for e in files.values())
    print(f"{len(files)} files, {total} rows", flush=True)
    if manifest["missing"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
