"""One-time download of the replay data: Moncton, Aug 25, 2025.

    uv run python -m scripts.fetch_replay     (from engine/)

Saves each service's answer as JSON in data/replay/moncton-2025-08-25/, using
the same queries as live mode (smoke_engine/feeds/sources.py). The files are
committed; replay mode never goes to the network.

Covers arrival times on 2025-08-25 (UTC): wind from 2025-08-24 00:00 UTC.
"""

import csv
import io
import json
from datetime import datetime, timezone

import httpx

from smoke_engine.feeds import sources
from smoke_engine.feeds.replay import REPLAY_DIR
from smoke_engine.wind import GRID_POINTS

WINDOW_START = datetime(2025, 8, 24, 0, tzinfo=timezone.utc)
WINDOW_END = datetime(2025, 8, 26, 0, tzinfo=timezone.utc)


def _get(client: httpx.Client, url: str, params: dict | None = None) -> httpx.Response:
    response = client.get(url, params=params, timeout=300)
    response.raise_for_status()
    return response


def _save(name: str, data) -> None:
    (REPLAY_DIR / name).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{name}: saved")


def fetch_wind(client: httpx.Client) -> list[str]:
    answer, urls = sources.fetch_open_meteo(
        client, sources.OPEN_METEO_HISTORICAL, GRID_POINTS, start_date="2025-08-24", end_date="2025-08-25"
    )
    if len(answer) != len(GRID_POINTS):
        raise SystemExit(f"expected {len(GRID_POINTS)} wind locations, got {len(answer)}")
    _save("wind.json", answer)
    return urls


def fetch_fires(client: httpx.Client) -> tuple[str, str]:
    active = _get(client, sources.CWFIS_ACTIVE_FIRES, sources.active_fires_params(WINDOW_START, WINDOW_END))
    _save("active-fires.json", active.json())
    spots = _get(client, sources.CWFIS_HOTSPOTS, sources.hotspots_params(WINDOW_START, WINDOW_END))
    _save("hotspots.json", spots.json())
    print(f"  active fire records: {len(active.json()['features'])}, hotspots: {len(spots.json()['features'])}")
    return str(active.url), str(spots.url)


def fetch_aqhi(client: httpx.Client) -> tuple[str, str]:
    stations = _get(client, sources.ECCC_STATIONS, sources.stations_params())
    _save("aqhi-stations.json", stations.json())

    # The OGC API only keeps ~3 days, so August 2025 comes from the Datamart monthly CSV.
    # Its "Hour (UTC)" column is already UTC; each reading is stored with a Z timestamp.
    url = sources.DATAMART_MONTHLY.format(yyyymm="202508")
    rows = csv.reader(io.StringIO(_get(client, url).text))
    header = next(rows)
    station_ids = header[2:]
    features = []
    for row in rows:
        day, hour = row[0], int(row[1])
        observed = datetime.fromisoformat(day).replace(hour=hour, tzinfo=timezone.utc)
        if not (WINDOW_START <= observed < WINDOW_END):
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
    _save("aqhi-readings.json", {"type": "FeatureCollection", "features": features})
    return str(stations.url), url


def main() -> None:
    REPLAY_DIR.mkdir(parents=True, exist_ok=True)
    with httpx.Client(headers={"User-Agent": sources.USER_AGENT}) as client:
        wind_urls = fetch_wind(client)
        active_url, hotspots_url = fetch_fires(client)
        stations_url, readings_url = fetch_aqhi(client)
    _save("manifest.json", {
        "place": "Moncton, NB (46.09, -64.78)",
        "arrivalTimes": "2025-08-25T00:00Z to 2025-08-25T23:00Z",
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
                "url": readings_url,
            },
        },
    })


if __name__ == "__main__":
    main()
