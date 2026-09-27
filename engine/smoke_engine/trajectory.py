"""Air trajectories, backward from the user or forward from a fire: one-hour steps, Heun predictor-corrector (as HYSPLIT)."""

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from smoke_engine.wind import WindField, inside_grid

EARTH_RADIUS_M = 6_371_000.0
STEP_S = 3600.0


UNSTEADY_ABOVE_DEG = 45.0


@dataclass
class PathPoint:
    hours_ago: int
    time: datetime
    lat: float
    lon: float
    wind_from_deg: float = math.nan


@dataclass
class Path:
    points: list[PathPoint] = field(default_factory=list)
    stopped_at_grid_edge: bool = False

    @property
    def hours_traced(self) -> int:
        return len(self.points) - 1

    @property
    def direction_spread_deg(self) -> float:
        """Circular standard deviation of the hourly wind direction along the path."""
        directions = [math.radians(p.wind_from_deg) for p in self.points]
        mean_sin = sum(math.sin(d) for d in directions) / len(directions)
        mean_cos = sum(math.cos(d) for d in directions) / len(directions)
        resultant = math.hypot(mean_sin, mean_cos)
        if resultant <= 0:
            return math.inf
        return math.degrees(math.sqrt(max(0.0, -2 * math.log(min(resultant, 1.0)))))

    @property
    def steady(self) -> bool:
        return self.direction_spread_deg <= UNSTEADY_ABOVE_DEG

    def biggest_shift(self) -> tuple[PathPoint, PathPoint, float] | None:
        """The largest hour-to-hour change in wind direction: (newer point, older point, degrees)."""
        best = None
        for newer, older in zip(self.points, self.points[1:]):
            change = abs(newer.wind_from_deg - older.wind_from_deg) % 360
            change = min(change, 360 - change)
            if change > 0.5 and (best is None or change > best[2]):
                best = (newer, older, change)
        return best


def _from_deg(u: float, v: float) -> float:
    return math.degrees(math.atan2(-u, -v)) % 360


def _move(lat: float, lon: float, u: float, v: float, seconds: float) -> tuple[float, float]:
    dlat = math.degrees(v * seconds / EARTH_RADIUS_M)
    dlon = math.degrees(u * seconds / (EARTH_RADIUS_M * math.cos(math.radians(lat))))
    return lat + dlat, lon + dlon


def _hours_before(until: datetime, t: datetime) -> int:
    return round((until - t).total_seconds() / STEP_S)


def trace_back(wind: WindField, lat: float, lon: float, arrival: datetime, hours: int) -> Path:
    """Follow the air arriving at (lat, lon) at `arrival` backward, one hour per step."""
    return _trace(wind, lat, lon, arrival, hours, -STEP_S, arrival)


def trace_forward(wind: WindField, lat: float, lon: float, release: datetime, until: datetime) -> Path:
    """Follow the air leaving (lat, lon) at `release` forward, one hour per step, until `until`.

    hours_ago counts back from `until`. A release outside the wind grid is a path of one point.
    """
    if not inside_grid(lat, lon):
        return Path(points=[PathPoint(_hours_before(until, release), release, lat, lon)], stopped_at_grid_edge=True)
    return _trace(wind, lat, lon, release, int((until - release).total_seconds() // STEP_S), STEP_S, until)


def _trace(wind: WindField, lat: float, lon: float, start: datetime, steps: int, step_s: float, until: datetime) -> Path:
    """`steps` Heun steps of step_s seconds (negative: back in time) from (lat, lon) at `start`.

    Stops early when the next point would leave the wind grid. hours_ago counts back from `until`.
    """
    path = Path(points=[PathPoint(_hours_before(until, start), start, lat, lon)])
    t = start
    for _ in range(steps):
        u0, v0 = wind.at(lat, lon, t)
        path.points[-1].wind_from_deg = _from_deg(u0, v0)
        guess_lat, guess_lon = _move(lat, lon, u0, v0, step_s)
        if not inside_grid(guess_lat, guess_lon):
            path.stopped_at_grid_edge = True
            break
        next_t = t + timedelta(seconds=step_s)
        u1, v1 = wind.at(guess_lat, guess_lon, next_t)
        new_lat, new_lon = _move(lat, lon, (u0 + u1) / 2, (v0 + v1) / 2, step_s)
        if not inside_grid(new_lat, new_lon):
            path.stopped_at_grid_edge = True
            break
        lat, lon, t = new_lat, new_lon, next_t
        path.points.append(PathPoint(_hours_before(until, t), t, lat, lon))
    if math.isnan(path.points[-1].wind_from_deg):
        path.points[-1].wind_from_deg = _from_deg(*wind.at(lat, lon, t))
    return path
