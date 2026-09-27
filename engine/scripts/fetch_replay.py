"""One-time download of the replay data for one day (arrival times 00:00 to 23:00 UTC).

    uv run python -m scripts.fetch_replay 2025-08-25 --name moncton-2025-08-25 --place "Moncton, NB (46.09, -64.78)"
    uv run python -m scripts.fetch_replay 2025-06-09          (saved in data/replay/2025-06-09/)

Saves each service's answer as JSON in data/replay/<name>/ (the date by default), using
the same queries as live mode (smoke_engine/feeds/sources.py). The files are committed;
replay mode never goes to the network.

Wind and fires cover the day before too, so a check at any hour of the day can be
traced back 24 hours: wind from 00:00 UTC the day before. Ends with the NASA FIRMS
archive download (scripts/fetch_firms_replay.py), which needs FIRMS_MAP_KEY and adds
its files to the manifest.
"""

import argparse
import csv
import io
import json
import time
from datetime import date, datetime, time as clock, timedelta, timezone
from pathlib import Path

import httpx

from scripts import fetch_firms_replay
from smoke_engine.feeds import sources
from smoke_engine.feeds.replay import REPLAY_DIR
from smoke_engine.wind import GRID_POINTS

REPLAY_ROOT = REPLAY_DIR.parent


def window(day: date) -> tuple[datetime, datetime]:
    """From 00:00 UTC the day before to 00:00 UTC the day after."""
    start = datetime.combine(day - timedelta(days=1), clock(0), tzinfo=timezone.utc)
    return start, start + timedelta(days=2)


def _get(client: httpx.Client, url: str, params: dict | None = None) -> httpx.Response:
    # The Datamart sometimes answers 404 for a file its listing shows: try again.
    for attempt in range(5):
        response = client.get(url, params=params, timeout=300)
        if response.status_code not in (404, 429, 500, 502, 503, 504) or attempt == 4:
            break
        time.sleep(2 + 3 * attempt)
    response.raise_for_status()
    return response


def _save(directory: Path, name: str, data) -> None:
    (directory / name).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{directory.name}/{name}: saved")


def fetch_wind(client: httpx.Client, directory: Path, day: date) -> list[str]:
    # An answer can arrive cut short (invalid JSON): fetch the whole grid again, after the per-minute limit resets.
    for attempt in range(3):
        try:
            answer, urls = sources.fetch_open_meteo(
                client, sources.OPEN_METEO_HISTORICAL, GRID_POINTS,
                start_date=(day - timedelta(days=1)).isoformat(), end_date=day.isoformat(),
            )
            break
        except (ValueError, httpx.HTTPError) as error:
            if attempt == 2:
                raise
            print(f"{directory.name}/wind.json: {type(error).__name__}, trying again in a minute")
            time.sleep(61)
    if len(answer) != len(GRID_POINTS):
        raise SystemExit(f"expected {len(GRID_POINTS)} wind locations, got {len(answer)}")
    _save(directory, "wind.json", answer)
    return urls


def fetch_fires(client: httpx.Client, directory: Path, day: date) -> tuple[str, str]:
    start, end = window(day)
    active = _get(client, sources.CWFIS_ACTIVE_FIRES, sources.active_fires_params(start, end))
    _save(directory, "active-fires.json", active.json())
    spots = _get(client, sources.CWFIS_HOTSPOTS, sources.hotspots_params(start, end))
    _save(directory, "hotspots.json", spots.json())
    print(f"  active fire records: {len(active.json()['features'])}, hotspots: {len(spots.json()['features'])}")
    return str(active.url), str(spots.url)


def fetch_aqhi(client: httpx.Client, directory: Path, day: date) -> tuple[str, list[str]]:
    stations = _get(client, sources.ECCC_STATIONS, sources.stations_params())
    _save(directory, "aqhi-stations.json", stations.json())

    # The OGC API only keeps ~3 days, so past months come from the Datamart monthly CSV.
    # Its "Hour (UTC)" column is already UTC; each reading is stored with a Z timestamp.
    start, end = window(day)
    months = sorted({f"{start:%Y%m}", f"{end - timedelta(hours=1):%Y%m}"})
    urls, features = [], []
    for yyyymm in months:
        url = sources.DATAMART_MONTHLY.format(yyyymm=yyyymm)
        rows = csv.reader(io.StringIO(_get(client, url).text))
        header = next(rows)
        station_ids = header[2:]
        for row in rows:
            observed = datetime.fromisoformat(row[0]).replace(hour=int(row[1]), tzinfo=timezone.utc)
            if not (start <= observed < end):
                continue
            for station_id, value in zip(station_ids, row[2:]):
                if value.strip():
                    features.append({
                        "type": "Feature",
                        "geometry": None,
                        "properties": {
                            "location_id": station_id,
                            "observation_datetime": observed.strftime("%Y-%m-%dT%H:%M:%SZ"),
                            "aqhi": float(value),
                        },
                    })
        urls.append(url)
    _save(directory, "aqhi-readings.json", {"type": "FeatureCollection", "features": features})
    return str(stations.url), urls


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Download the replay data for one day.")
    parser.add_argument("date", type=date.fromisoformat, help="the day of the arrival times (UTC), YYYY-MM-DD")
    parser.add_argument("--name", help="directory under data/replay/ (default: the date)")
    parser.add_argument("--place", help="the place the recording was made for, noted in the manifest")
    args = parser.parse_args(argv)
    day, directory = args.date, REPLAY_ROOT / (args.name or args.date.isoformat())

    directory.mkdir(parents=True, exist_ok=True)
    with httpx.Client(headers={"User-Agent": sources.USER_AGENT}) as client:
        wind_urls = fetch_wind(client, directory, day)
        active_url, hotspots_url = fetch_fires(client, directory, day)
        stations_url, readings_urls = fetch_aqhi(client, directory, day)
    _save(directory, "manifest.json", {
        **({"place": args.place} if args.place else {}),
        "arrivalTimes": f"{day}T00:00Z to {day}T23:00Z",
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "files": {
            "wind.json": {"source": "Open-Meteo Historical Forecast API, GFS 0.25°", "urls": wind_urls},
            "active-fires.json": {"source": "CWFIS public:cwfif_national_activefires (versioned rows)", "url": active_url},
            "hotspots.json": {"source": "CWFIS public:hotspots", "url": hotspots_url},
            "aqhi-stations.json": {"source": "ECCC OGC API aqhi-stations", "url": stations_url},
            "aqhi-readings.json": {
                "source": "ECCC MSC Datamart monthly AQHI observations (BACKFILLED), converted to the "
                          "aqhi-observations-realtime shape; blank cells are left out",
                "timeCheck": "The archive's 'Hour (UTC)' column is UTC: for DADHJ on 2026-08-28 the archive "
                             "reads 1.26/1.36/1.70 at 03/12/18, matching ECCC realtime XML with UTCStamp "
                             "03/12/18Z (1.2/1.3/1.7); read as UTC-3 it would not match (12Z vs 1.00).",
                **({"url": readings_urls[0]} if len(readings_urls) == 1 else {"urls": readings_urls}),
            },
        },
    })
    fetch_firms_replay.main(directory, day)


if __name__ == "__main__":
    main()
