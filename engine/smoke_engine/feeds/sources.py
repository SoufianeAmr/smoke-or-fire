"""The queries the engine sends to each outside service, shared by live mode and the replay download."""

import os
import time
from datetime import datetime
from pathlib import Path

from smoke_engine.smoke_forecast import LAYER as FIREWORK_LAYER
from smoke_engine.wind import GRID_LAT_MAX, GRID_LAT_MIN, GRID_LON_MAX, GRID_LON_MIN, HEIGHTS, WIND_MODEL

USER_AGENT = "smoke-or-fire-engine/0.1 (+https://github.com/; wildfire smoke verdicts for the Maritimes)"

# --- Open-Meteo: hourly wind at the three trace heights ---------------------------------------
OPEN_METEO_LIVE = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_HISTORICAL = "https://historical-forecast-api.open-meteo.com/v1/forecast"
# The newest run of WIND_MODEL that Open-Meteo holds: "last_run_initialisation_time", seconds since 1970.
OPEN_METEO_MODEL_RUN = "https://api.open-meteo.com/data/ncep_gfs025/static/meta.json"
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


# --- ECCC: weather alerts in effect at a point (MSC GeoMet OGC API) ------------------------------
ECCC_ALERTS = "https://api.weather.gc.ca/collections/weather-alerts/items"
# ECCC keeps no past alerts. The replay's come from the copies of ECCC's CAP-CP messages kept by the
# NAAD System archive (scripts/fetch_alerts_replay.py converts them to the shape above).
NAAD_ARCHIVE = "https://alertsarchive.pelmorex.com"


def alerts_params(lat: float, lon: float) -> dict:
    """The alerts whose forecast zone holds the point: a box of one point, longitude first.

    Nothing else may narrow the answer. A filter on the alert type that matches nothing, like latitude
    first, gets a 200 with no alerts: it would read as "none in effect".
    """
    return {"f": "json", "bbox": f"{lon},{lat},{lon},{lat}", "skipGeometry": "true", "limit": 50}


# --- ECCC: the FireWork smoke forecast at a point (MSC GeoMet WMS) --------------------------------
# FIREWORK_LAYER: fine particles (PM2.5) from wildfire smoke in the air near the ground, hour by hour, from ECCC's
# air-quality model with wildfire emissions (FireWork): a run at 00 and 12 UTC, 72 hours ahead, on a 10 km grid.
# No key. One hour and one point per request: a list or a range of times is refused. An error comes back as XML
# with HTTP 200; a point outside the model's domain as an empty JSON object.
ECCC_GEOMET = "https://geo.weather.gc.ca/geomet"
# ECCC's legend for the layer, the classes its answers name: the image, in English or French (lang=fr).
FIREWORK_LEGEND = (
    f"{ECCC_GEOMET}?version=1.3.0&service=WMS&request=GetLegendGraphic&sld_version=1.1.0"
    f"&layer={FIREWORK_LAYER}&format=image/png&STYLE=PM2.5_0to100ugm3_Dis"
)
FIREWORK_CELL_DEG = 0.1


def firework_point(lat: float, lon: float) -> tuple[float, float]:
    """The point ECCC is asked about: the spot rounded to 0.1°, about one cell of the model's 10 km grid. The
    forecast is the same anywhere in a cell, so ECCC never needs the exact spot, and neighbours share one answer."""
    return round(lat, 1), round(lon, 1)


def firework_params(point: tuple[float, float], time: datetime, run: datetime | None = None) -> dict:
    """One hour of the forecast at one point: the middle pixel of a 3 × 3 map, 0.1° wide, centred on the point
    (WMS 1.3.0 puts latitude first in EPSG:4326). `run`: the model run to read; without it, the newest."""
    lat, lon = point
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.3.0",
        "REQUEST": "GetFeatureInfo",
        "LAYERS": FIREWORK_LAYER,
        "QUERY_LAYERS": FIREWORK_LAYER,
        "CRS": "EPSG:4326",
        "BBOX": f"{lat - 0.05:.2f},{lon - 0.05:.2f},{lat + 0.05:.2f},{lon + 0.05:.2f}",
        "WIDTH": "3",
        "HEIGHT": "3",
        "I": "1",
        "J": "1",
        "INFO_FORMAT": "application/json",
        "TIME": _z(time),
    }
    return {**params, "DIM_REFERENCE_TIME": _z(run)} if run else params


# --- NASA FIRMS: satellite fire detections (VIIRS and MODIS) -------------------------------------
# The MAP_KEY sits inside every URL: never print, log or save a URL or error without mask_key().
FIRMS_API = "https://firms.modaps.eosdis.nasa.gov/api"
FIRMS_BBOX = "-72,41,-56,51"  # west,south,east,north: the wind grid
FIRMS_LIVE_SOURCES = ("VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "VIIRS_SNPP_NRT", "MODIS_NRT")  # URT + RT + NRT
FIRMS_ARCHIVE_SOURCES = ("VIIRS_NOAA20_SP", "VIIRS_SNPP_SP", "MODIS_SP")  # FIRMS has no NOAA-21 archive
FIRMS_KEY_FILE = Path(__file__).resolve().parents[2] / ".env"


def firms_key() -> str | None:
    """FIRMS_MAP_KEY from the environment (Render), or from engine/.env (local, gitignored)."""
    if os.environ.get("FIRMS_MAP_KEY"):
        return os.environ["FIRMS_MAP_KEY"]
    try:
        lines = FIRMS_KEY_FILE.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    for line in lines:
        name, _, value = line.partition("=")
        if name.strip() == "FIRMS_MAP_KEY" and value.strip():
            return value.strip()
    return None


def mask_key(text: str, key: str | None) -> str:
    return text.replace(key, "***") if key else text


def firms_area_url(key: str, source: str, day_range: int, date: str | None = None) -> str:
    """Detections in FIRMS_BBOX: [date, date + day_range - 1], or the last day_range days up to today."""
    return f"{FIRMS_API}/area/csv/{key}/{source}/{FIRMS_BBOX}/{day_range}" + (f"/{date}" if date else "")


def firms_availability_url(key: str) -> str:
    return f"{FIRMS_API}/data_availability/csv/{key}/ALL"
