"""Hourly wind on a 0.5° grid, from Open-Meteo, at the three trace heights."""

import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from smoke_engine.feeds import FeedUnavailable

HEIGHTS = ("100m", "925hPa", "850hPa")
# Pinned: Open-Meteo's default here is HRRR, whose directions look ~19° rotated at Moncton.
WIND_MODEL = "gfs025"

GRID_STEP = 0.5
GRID_LAT_MIN, GRID_LAT_MAX = 41.0, 51.0
GRID_LON_MIN, GRID_LON_MAX = -72.0, -56.0
GRID_LATS = [GRID_LAT_MIN + i * GRID_STEP for i in range(int((GRID_LAT_MAX - GRID_LAT_MIN) / GRID_STEP) + 1)]
GRID_LONS = [GRID_LON_MIN + j * GRID_STEP for j in range(int((GRID_LON_MAX - GRID_LON_MIN) / GRID_STEP) + 1)]
GRID_POINTS = [(lat, lon) for lat in GRID_LATS for lon in GRID_LONS]


class WindUnavailable(FeedUnavailable):
    """Open-Meteo answered, but with missing values for hours or heights we need."""


def inside_grid(lat: float, lon: float) -> bool:
    return GRID_LAT_MIN <= lat <= GRID_LAT_MAX and GRID_LON_MIN <= lon <= GRID_LON_MAX


def uv_from(speed_ms: float, from_deg: float) -> tuple[float, float]:
    """Meteorological direction (where the wind comes FROM) to u (east) and v (north)."""
    rad = math.radians(from_deg)
    return -speed_ms * math.sin(rad), -speed_ms * math.cos(rad)


@dataclass
class WindField:
    """u/v in m/s for one height, indexed [hour][lat index][lon index]."""

    start: datetime
    u: list[list[list[float]]]
    v: list[list[list[float]]]

    def at(self, lat: float, lon: float, t: datetime) -> tuple[float, float]:
        """Wind at a point and time: bilinear in space, linear in time."""
        hours = (t - self.start).total_seconds() / 3600
        h0 = min(max(int(math.floor(hours)), 0), len(self.u) - 2)
        wt = hours - h0
        u0, v0 = self._bilinear(h0, lat, lon)
        u1, v1 = self._bilinear(h0 + 1, lat, lon)
        return u0 + (u1 - u0) * wt, v0 + (v1 - v0) * wt

    def _bilinear(self, h: int, lat: float, lon: float) -> tuple[float, float]:
        y = (lat - GRID_LAT_MIN) / GRID_STEP
        x = (lon - GRID_LON_MIN) / GRID_STEP
        i0 = min(int(math.floor(y)), len(GRID_LATS) - 2)
        j0 = min(int(math.floor(x)), len(GRID_LONS) - 2)
        wy, wx = y - i0, x - j0
        out = []
        for grid in (self.u[h], self.v[h]):
            bottom = grid[i0][j0] * (1 - wx) + grid[i0][j0 + 1] * wx
            top = grid[i0 + 1][j0] * (1 - wx) + grid[i0 + 1][j0 + 1] * wx
            out.append(bottom * (1 - wy) + top * wy)
        return out[0], out[1]


def parse_open_meteo(answer: list[dict], start: datetime, end: datetime) -> dict[str, WindField]:
    """Turn an Open-Meteo multi-location answer into one WindField per height.

    start and end are whole UTC hours; every hour between them must be present
    at every grid point, or WindUnavailable is raised.
    """
    n_hours = int((end - start).total_seconds() // 3600) + 1
    lat_index = {round(lat / GRID_STEP): i for i, lat in enumerate(GRID_LATS)}
    lon_index = {round(lon / GRID_STEP): j for j, lon in enumerate(GRID_LONS)}

    fields = {
        height: WindField(
            start=start,
            u=[[[math.nan] * len(GRID_LONS) for _ in GRID_LATS] for _ in range(n_hours)],
            v=[[[math.nan] * len(GRID_LONS) for _ in GRID_LATS] for _ in range(n_hours)],
        )
        for height in HEIGHTS
    }

    for location in answer:
        i = lat_index.get(round(location["latitude"] / GRID_STEP))
        j = lon_index.get(round(location["longitude"] / GRID_STEP))
        if i is None or j is None:
            continue
        hourly = location["hourly"]
        times = [
            datetime.strptime(s, "%Y-%m-%dT%H:%M").replace(tzinfo=timezone.utc)
            for s in hourly["time"]
        ]
        wanted = {t: k for k, t in enumerate(times) if start <= t <= end}
        for height in HEIGHTS:
            speeds = hourly.get(f"wind_speed_{height}") or []
            directions = hourly.get(f"wind_direction_{height}") or []
            for t, k in wanted.items():
                h = int((t - start).total_seconds() // 3600)
                speed = speeds[k] if k < len(speeds) else None
                direction = directions[k] if k < len(directions) else None
                if speed is None or direction is None:
                    continue
                u, v = uv_from(speed, direction)
                fields[height].u[h][i][j] = u
                fields[height].v[h][i][j] = v

    for height, field in fields.items():
        for grid in (field.u, field.v):
            if any(math.isnan(value) for hour in grid for row in hour for value in row):
                raise WindUnavailable(f"wind at {height} is missing for part of {start:%Y-%m-%dT%H}Z–{end:%Y-%m-%dT%H}Z")
    return fields


def hours_needed(arrival: datetime, hours_back: int) -> tuple[datetime, datetime]:
    """The whole UTC hours of wind a trace arriving at `arrival` needs."""
    start = (arrival - timedelta(hours=hours_back)).replace(minute=0, second=0, microsecond=0)
    end = arrival.replace(minute=0, second=0, microsecond=0)
    if end < arrival:
        end += timedelta(hours=1)
    return start, end
