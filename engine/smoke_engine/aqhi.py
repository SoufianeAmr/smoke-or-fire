"""Air Quality Health Index at the nearest ECCC station. Never invented: null when missing."""

import math
from dataclasses import dataclass
from datetime import datetime, timedelta

from smoke_engine.feeds import FeedUnavailable
from smoke_engine.geo import distance_km

MAX_AGE = timedelta(hours=2)


@dataclass
class Station:
    id: str
    name_en: str
    name_fr: str
    lat: float
    lon: float
    km: float


@dataclass
class Reading:
    station: Station
    value: float
    observed_at: datetime

    @property
    def level(self) -> int:
        """The whole AQHI number ECCC shows (at least 1)."""
        return max(1, math.floor(self.value + 0.5))

    @property
    def display(self) -> str:
        return "10+" if self.level > 10 else str(self.level)

    @property
    def category(self) -> str:
        if self.level <= 3:
            return "low"
        if self.level <= 6:
            return "moderate"
        if self.level <= 10:
            return "high"
        return "very_high"


def _time(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def nearest_reading(feeds, lat: float, lon: float, at: datetime) -> Reading | None:
    """The nearest station's newest reading at or before `at`, at most MAX_AGE old."""
    try:
        stations = [
            Station(
                id=f["properties"]["location_id"],
                name_en=f["properties"]["location_name_en"],
                name_fr=f["properties"]["location_name_fr"],
                lat=f["geometry"]["coordinates"][1],
                lon=f["geometry"]["coordinates"][0],
                km=distance_km(lat, lon, f["geometry"]["coordinates"][1], f["geometry"]["coordinates"][0]),
            )
            for f in feeds.aqhi_stations()["features"]
        ]
        if not stations:
            return None
        station = min(stations, key=lambda s: s.km)
        readings = feeds.aqhi_readings(station.id, at - MAX_AGE, at)["features"]
    except FeedUnavailable:
        return None

    candidates = [
        (_time(r["properties"]["observation_datetime"]), r["properties"]["aqhi"])
        for r in readings
        if r["properties"].get("location_id") == station.id and r["properties"].get("aqhi") is not None
    ]
    candidates = [(t, v) for t, v in candidates if at - MAX_AGE <= t <= at]
    if not candidates:
        return None
    observed_at, value = max(candidates)
    return Reading(station=station, value=value, observed_at=observed_at)
