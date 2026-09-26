"""The queries the engine sends to each outside service, shared by live mode and the replay download."""

import time
from datetime import datetime

from smoke_engine.wind import GRID_LAT_MAX, GRID_LAT_MIN, GRID_LON_MAX, GRID_LON_MIN, HEIGHTS, WIND_MODEL

USER_AGENT = "smoke-or-fire-engine/0.1 (+https://github.com/; wildfire smoke verdicts for the Maritimes)"

# --- Open-Meteo: hourly wind at the three trace heights ---------------------------------------
OPEN_METEO_LIVE = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_HISTORICAL = "https://historical-forecast-api.open-meteo.com/v1/forecast"
WIND_VARIABLES = [f"wind_{kind}_{height}" for height in HEIGHTS for kind in ("speed", "direction")]
OPEN_METEO_CHUNK = 300  # grid points per request, to keep URLs short
# Free tier: 600 calls a minute, and each grid point is one call. 693 points need two minutes.
OPEN_METEO_POINTS_PER_MINUTE = 600


def fetch_open_meteo(
    client, url: str, points: list[tuple[float, float]], sleep=time.sleep, **time_window: str
) -> tuple[list, list[str]]:
    """Fetch the wind grid in chunks, pausing to stay under the per-minute limit.

    Returns (the combined multi-location answer, the URLs requested).
    """
    answer, urls, used, minute_started = [], [], 0, time.monotonic()
    for i in range(0, len(points), OPEN_METEO_CHUNK):
        chunk = points[i : i + OPEN_METEO_CHUNK]
        if used + len(chunk) > OPEN_METEO_POINTS_PER_MINUTE:
            sleep(max(0.0, 61 - (time.monotonic() - minute_started)))
            used, minute_started = 0, time.monotonic()
        for attempt in range(3):
            response = client.get(url, params=open_meteo_params(chunk, **time_window), timeout=300)
            if response.status_code != 429 or attempt == 2:
                break
            sleep(61)  # "Minutely API request limit exceeded. Please try again in one minute."
            minute_started = time.monotonic()
        response.raise_for_status()
        part = response.json()
        answer += part if isinstance(part, list) else [part]
        urls.append(str(response.url))
        used += len(chunk)
    return answer, urls


def open_meteo_params(points: list[tuple[float, float]], **time_window: str) -> dict:
    return {
        "latitude": ",".join(f"{lat:g}" for lat, _ in points),
        "longitude": ",".join(f"{lon:g}" for _, lon in points),
        "hourly": ",".join(WIND_VARIABLES),
        "models": WIND_MODEL,
        "wind_speed_unit": "ms",
        "cell_selection": "nearest",
        "timezone": "GMT",
        **time_window,
    }


# --- CWFIS: active fires and satellite hotspots -------------------------------------------------
# Fires within 500 km of anywhere on the wind grid.
FIRE_LAT_MIN, FIRE_LAT_MAX = GRID_LAT_MIN - 4.5, GRID_LAT_MAX + 4.5
FIRE_LON_MIN, FIRE_LON_MAX = GRID_LON_MIN - 7.0, GRID_LON_MAX + 7.0

CWFIS_ACTIVE_FIRES = "https://geoserver.cwfif.nrcan.gc.ca/geoserver/wfs"
CWFIS_HOTSPOTS = "https://cwfis.cfs.nrcan.gc.ca/geoserver/public/wfs"
HOTSPOT_FIELDS = "lat,lon,rep_date,source,sensor,satellite,agency,frp"


def _z(t: datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def active_fires_params(start: datetime, end: datetime) -> dict:
    """CWFIS active-fire records valid at any time in [start, end] (versioned rows)."""
    return {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeName": "public:cwfif_national_activefires",
        "outputFormat": "application/json",
        "CQL_FILTER": (
            f"record_start<='{_z(end)}' AND record_end>'{_z(start)}'"
            f" AND latitude>{FIRE_LAT_MIN} AND latitude<{FIRE_LAT_MAX}"
            f" AND longitude>{FIRE_LON_MIN} AND longitude<{FIRE_LON_MAX}"
        ),
    }


def hotspots_params(start: datetime, end: datetime) -> dict:
    """CWFIS hotspots detected in (start, end]."""
    return {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeName": "public:hotspots",
        "outputFormat": "application/json",
        "propertyName": HOTSPOT_FIELDS,
        "CQL_FILTER": (
            f"rep_date>'{_z(start)}' AND rep_date<='{_z(end)}'"
            f" AND lat>{FIRE_LAT_MIN} AND lat<{FIRE_LAT_MAX} AND lon>{FIRE_LON_MIN} AND lon<{FIRE_LON_MAX}"
        ),
    }


# --- ECCC: AQHI stations and readings ----------------------------------------------------------
ECCC_STATIONS = "https://api.weather.gc.ca/collections/aqhi-stations/items"
ECCC_READINGS = "https://api.weather.gc.ca/collections/aqhi-observations-realtime/items"
# The API keeps ~3 days; older readings come from the Datamart's monthly archive (CSV, hours in UTC).
DATAMART_MONTHLY = (
    "https://dd.weather.gc.ca/today/air_quality/aqhi/atl/observation/monthly/csv/"
    "{yyyymm}_MONTHLY_AQHI_ATL_SiteObs_BACKFILLED.csv"
)


def stations_params() -> dict:
    return {"f": "json", "limit": 1000}


def readings_params(station_id: str, start: datetime, end: datetime) -> dict:
    return {
        "f": "json",
        "location_id": station_id,
        "datetime": f"{_z(start)}/{_z(end)}",
        "sortby": "-observation_datetime",
        "limit": 100,
    }
