"""In-memory stand-ins for the outside data sources (Open-Meteo, CWFIS, NASA FIRMS, ECCC).

Each fake answers in the same shape as the real service, so the engine's own
parsing runs in every test.
"""

from datetime import datetime, timedelta

from smoke_engine.feeds import FeedUnavailable

HEIGHT_VARIABLES = ("100m", "925hPa", "850hPa")


def _hours(start: datetime, end: datetime) -> list[datetime]:
    first = start.replace(minute=0, second=0, microsecond=0)
    last = end if end == end.replace(minute=0, second=0, microsecond=0) else (
        end.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    )
    hours, t = [], first
    while t <= last:
        hours.append(t)
        t += timedelta(hours=1)
    return hours


def uniform_wind(from_deg: float, speed_ms: float):
    """Open-Meteo answer with the same wind everywhere, at every height and hour."""
    return wind_by_height({height: (from_deg, speed_ms) for height in HEIGHT_VARIABLES})


def wind_by_height(winds: dict[str, tuple[float, float]]):
    """Open-Meteo answer with one (from_deg, speed_ms) per height, the same everywhere and every hour."""
    return wind_over_time(lambda height, t: winds[height])


def wind_shift(before: float, after: float, at: str, speed_ms: float):
    """Open-Meteo answer whose wind turns from `before` to `after` degrees at UTC hour `at`, at every height."""
    turn = datetime.fromisoformat(at.replace("Z", "+00:00"))
    return wind_over_time(lambda height, t: (after if t >= turn else before, speed_ms))


def wind_over_time(wind_at):
    """Open-Meteo answer from wind_at(height, utc_hour) -> (from_deg, speed_ms), the same everywhere."""

    def answer(points, start, end):
        times = _hours(start, end)
        hourly = {"time": [t.strftime("%Y-%m-%dT%H:%M") for t in times]}
        for height in HEIGHT_VARIABLES:
            winds = [wind_at(height, t) for t in times]
            hourly[f"wind_speed_{height}"] = [speed for _, speed in winds]
            hourly[f"wind_direction_{height}"] = [direction for direction, _ in winds]
        return [
            {
                "latitude": lat,
                "longitude": lon,
                "utc_offset_seconds": 0,
                "timezone": "GMT",
                "hourly": hourly,
            }
            for lat, lon in points
        ]

    return answer


def hotspot(
    lat: float, lon: float, seen: str, satellite: str | None = None, sensor: str = "VIIRS-I", frp: float | None = None
) -> dict:
    """Properties of one CWFIS `public:hotspots` feature; `seen` is its rep_date (a report time)."""
    return {
        "lat": lat, "lon": lon, "rep_date": seen, "source": "NASA", "sensor": sensor, "satellite": satellite, "agency": "NB",
        "frp": frp,
    }


FIRMS_HEADER = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight"


def firms_detection(
    lat: float,
    lon: float,
    seen: str,
    satellite: str = "N20",
    confidence: str = "n",
    version: str = "2.0NRT",
    instrument: str = "VIIRS",
    frp: float = 4.2,
) -> str:
    """One row of a FIRMS area API CSV, acquired at `seen` (UTC)."""
    t = datetime.fromisoformat(seen.replace("Z", "+00:00"))
    daynight = "D" if 10 <= t.hour < 22 else "N"
    return f"{lat},{lon},330.5,0.4,0.4,{t:%Y-%m-%d},{t:%H%M},{satellite},{instrument},{confidence},{version},290.1,{frp},{daynight}"


def active_fire(lat: float, lon: float, stage: str, fire_id: str = "2025_NB_00001", size_ha: float = 12.0) -> dict:
    """Properties of one CWFIS `public:cwfif_national_activefires` record, valid all of Aug 2025."""
    return {
        "national_fire_id": fire_id,
        "agency_code": fire_id.split("_")[1],
        "stage_of_control_status": stage,
        "fire_size": size_ha,
        "latitude": lat,
        "longitude": lon,
        "record_start": "2025-08-01T00:45:00Z",
        "record_end": "2025-09-01T00:45:00Z",
    }


def aqhi_station(station_id: str, name_en: str, name_fr: str, lat: float, lon: float) -> dict:
    """One ECCC `aqhi-stations` feature."""
    return {
        "type": "Feature",
        "id": station_id,
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {"location_id": station_id, "location_name_en": name_en, "location_name_fr": name_fr},
    }


def aqhi_reading(station_id: str, time: str, aqhi: float) -> dict:
    """One ECCC `aqhi-observations-realtime` feature."""
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [0.0, 0.0]},
        "properties": {"location_id": station_id, "observation_datetime": time, "aqhi": aqhi},
    }


MONCTON_STATION = aqhi_station("DADHJ", "Moncton", "Moncton", 46.115833, -64.803056)
SUMMERSIDE_STATION = aqhi_station("BADSZ", "Summerside", "Summerside", 46.4, -63.79)


def _feature_collection(properties: list[dict]) -> dict:
    # CWFIS geometry is projected (EPSG:3978); the engine reads lat/lon from properties.
    return {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "geometry": {"type": "Point", "coordinates": [0.0, 0.0]}, "properties": p}
            for p in properties
        ],
    }


class FakeFeeds:
    """`down` names feeds that fail, the way a live feed fails when its service is down."""

    def __init__(
        self, *, wind, active_fires=(), hotspots=(), firms=(), aqhi_stations=(), aqhi_readings=(), down=(), checked_at=None
    ):
        self._wind = wind
        self._active_fires = list(active_fires)
        self._hotspots = list(hotspots)
        self._firms = list(firms)
        self._checked_at = dict(checked_at or {})
        self._aqhi_stations = list(aqhi_stations)
        self._aqhi_readings = list(aqhi_readings)
        self._down = set(down)

    def _check(self, name):
        if name in self._down:
            raise FeedUnavailable(f"{name} is down")

    def wind(self, points, start, end):
        self._check("wind")
        return self._wind(points, start, end)

    def active_fires(self, at):
        self._check("active_fires")
        return _feature_collection(self._active_fires)

    def hotspots(self, start, end):
        self._check("hotspots")
        return _feature_collection(self._hotspots)

    def firms(self, start, end):
        """FIRMS answers by source, as CSV text."""
        self._check("firms")
        return {"VIIRS_NOAA20_NRT": "\n".join([FIRMS_HEADER, *self._firms]) + "\n"}

    def checked_at(self, source, at):
        """When the "cwfis" or "firms" answer was fetched (None: never said)."""
        return self._checked_at.get(source)

    def aqhi_stations(self):
        self._check("aqhi")
        return {"type": "FeatureCollection", "features": self._aqhi_stations}

    def aqhi_readings(self, station_id, start, end):
        self._check("aqhi")
        return {
            "type": "FeatureCollection",
            "features": [r for r in self._aqhi_readings if r["properties"]["location_id"] == station_id],
        }
