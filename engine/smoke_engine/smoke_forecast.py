"""ECCC's FireWork smoke forecast at a point, and the best time to air out a home. Never a guess.

The feed answers as MSC GeoMet's WMS does for one point and one hour (GetFeatureInfo on the layer
`RAQDPS.Sfc_PM2.5-WildfireSmokePlume`): the fine particles from wildfire smoke in the air near the ground, the
class of ECCC's legend they fall in, the hour they are forecast for and the model run that forecast them. The
engine needs the 48 hours from the hour of the check, each from the same run, each read for certain: anything
else is "not available". Informational only: it never changes the verdict, and it never fails it.

The rule, `best_window`: the first stretch of at least 3 hours at the lowest smoke the forecast reaches, counted
in ECCC's own classes. Hours where ECCC's map shows no smoke at all come first; failing that, hours in its lowest
class. Nothing that low for 3 hours: no useful window, keep windows closed.
"""

import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from smoke_engine.feeds import FeedUnavailable

WINDOW, NONE, NOT_AVAILABLE = "window", "none", "not_available"

LAYER = "RAQDPS.Sfc_PM2.5-WildfireSmokePlume"
HOURS = 48
# The classes of ECCC's legend for the layer (style PM2.5_0to100ugm3_Dis), in µg/m³: nothing is drawn under 1,
# then 1 to 10, 10 to 20, and so on, and one last class for 100 or more. Level 0 is "no smoke shown"; 11 the last.
BREAKS = (1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100)
# ECCC's own name for each class, as GetFeatureInfo gives it with the value.
LABELS = (
    f"< {BREAKS[0]} [ug/m3]",
    *(f"{low} - {high} [ug/m3]" for low, high in zip(BREAKS, BREAKS[1:])),
    f">= {BREAKS[-1]} [ug/m3]",
)
KG_TO_UG = 1e9  # the layer's values are in kg/m³; its legend in µg/m³

# The rule.
MAX_LEVEL = 1  # the highest class still worth airing out in: ECCC's lowest, under 10 µg/m³
MIN_WINDOW_HOURS = 3  # a shorter break is not worth planning around: a plume's forecast hour can be off

RULES = {"hours": HOURS, "minWindowHours": MIN_WINDOW_HOURS, "maxLevel": MAX_LEVEL, "breaks": list(BREAKS)}


@dataclass(frozen=True)
class Hour:
    time: datetime
    ugm3: float
    level: int  # the class of ECCC's legend: 0 (under 1 µg/m³, nothing drawn) to 11 (100 or more)
    day: bool  # the sun is up at the point


@dataclass(frozen=True)
class Window:
    """Low smoke from `start` to `end`, both forecast hours. `level`: the highest class in it."""

    start: datetime
    end: datetime
    level: int
    from_now: bool  # it starts with the hour of the check
    to_end: bool  # it lasts to the forecast's last hour: its end is not known


@dataclass(frozen=True)
class Forecast:
    state: str
    hours: tuple[Hour, ...] = ()
    window: Window | None = None
    run: datetime | None = None
    checked_at: datetime | None = None  # when ECCC answered; None for a recorded forecast


def best_window(levels: list[int]) -> tuple[int, int, int] | None:
    """(first hour, last hour, level) of the best time to air out, as indexes into `levels`, or None.

    Tried at level 0, then at each level up to MAX_LEVEL: the first run of hours at that level or lower that
    lasts MIN_WINDOW_HOURS or more from its first hour to its last.
    """
    for level in range(MAX_LEVEL + 1):
        first = None
        for i, hour_level in enumerate([*levels, None]):
            low = hour_level is not None and hour_level <= level
            if low and first is None:
                first = i
            elif not low and first is not None:
                if i - 1 - first >= MIN_WINDOW_HOURS:
                    return first, i - 1, level
                first = None
    return None


def sun_is_up(lat: float, lon: float, t: datetime) -> bool:
    """Whether the sun is above the horizon, by NOAA's general solar position equations
    (https://gml.noaa.gov/grad/solcalc/solareqns.PDF): good to a few minutes, enough to mark an hour day or night."""
    t = t.astimezone(timezone.utc)
    hour = t.hour + t.minute / 60 + t.second / 3600
    year = 2 * math.pi / 365 * (t.timetuple().tm_yday - 1 + (hour - 12) / 24)
    equation_of_time = 229.18 * (
        0.000075 + 0.001868 * math.cos(year) - 0.032077 * math.sin(year)
        - 0.014615 * math.cos(2 * year) - 0.040849 * math.sin(2 * year)
    )  # fmt: skip
    declination = (
        0.006918 - 0.399912 * math.cos(year) + 0.070257 * math.sin(year)
        - 0.006758 * math.cos(2 * year) + 0.000907 * math.sin(2 * year)
        - 0.002697 * math.cos(3 * year) + 0.00148 * math.sin(3 * year)
    )  # fmt: skip
    solar_minutes = hour * 60 + equation_of_time + 4 * lon
    hour_angle = math.radians(solar_minutes / 4 - 180)
    latitude = math.radians(lat)
    sine_of_elevation = (
        math.sin(latitude) * math.sin(declination) + math.cos(latitude) * math.cos(declination) * math.cos(hour_angle)
    )
    # Sunrise and sunset: the sun's upper edge on the horizon, bent by the air (0.833° below it).
    return math.degrees(math.asin(max(-1.0, min(1.0, sine_of_elevation)))) > -0.833


def _time(text) -> datetime:
    """A time with its zone, in UTC."""
    t = datetime.fromisoformat(str(text).replace("Z", "+00:00"))
    if t.tzinfo is None:
        raise ValueError(f"no time zone in {text!r}")
    return t.astimezone(timezone.utc)


def _read_hour(answer, at: datetime) -> tuple[float, int, datetime]:
    """One GetFeatureInfo answer, read: (µg/m³, the level of ECCC's class, the model run). Raises ValueError,
    KeyError or TypeError unless it is the forecast for `at`, whole, with a value that sits in its own class."""
    if answer["type"] != "FeatureCollection" or answer["layer"] != LAYER or len(answer["features"]) != 1:
        raise ValueError("not one forecast value for the layer")
    p = answer["features"][0]["properties"]
    value = p["value"]
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError(f"not a concentration: {value!r}")
    if _time(p["time"]) != at:
        raise ValueError(f"the forecast is for {p['time']}, not {at:%Y-%m-%dT%H:%MZ}")
    ugm3 = value * KG_TO_UG
    # ECCC's class gives the level. The value must sit in it: a change of units upstream would not.
    level = LABELS.index(" ".join(str(p["class"]).split()))
    low = BREAKS[level - 1] if level else 0
    high = BREAKS[level] if level < len(BREAKS) else math.inf
    if not low * (1 - 1e-6) <= ugm3 <= high * (1 + 1e-6):
        raise ValueError(f"{ugm3} µg/m³ is not in ECCC's class {p['class']!r}")
    return ugm3, level, _time(p["dim_reference_time"])


def smoke_forecast(feeds, lat: float, lon: float, at: datetime) -> Forecast:
    """The forecast for the HOURS hours from the hour of `at`, and the best time in them to air out."""
    first = at.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)
    times = [first + timedelta(hours=h) for h in range(HOURS)]
    try:
        recorded = feeds.smoke_forecast(lat, lon, times)
        answers = recorded["answers"]
        if len(answers) != len(times):
            raise ValueError(f"{len(answers)} answers for {len(times)} hours")
        read = [_read_hour(answer, t) for answer, t in zip(answers, times)]
        runs = {run for _, _, run in read}
        if len(runs) != 1 or (run := runs.pop()) > first:
            raise ValueError("the hours are not all from one model run made before them")
        checked_at = _time(recorded["fetchedAt"]) if recorded.get("fetchedAt") else None
    except FeedUnavailable:
        return Forecast(NOT_AVAILABLE)
    except Exception:  # an answer in a shape never seen: the verdict is still given
        return Forecast(NOT_AVAILABLE)

    hours = tuple(
        Hour(time=t, ugm3=ugm3, level=level, day=sun_is_up(lat, lon, t)) for t, (ugm3, level, _) in zip(times, read)
    )
    found = best_window([h.level for h in hours])
    if found is None:
        return Forecast(NONE, hours, None, run, checked_at)
    start, end, level = found
    window = Window(hours[start].time, hours[end].time, level, from_now=start == 0, to_end=end == HOURS - 1)
    return Forecast(WINDOW, hours, window, run, checked_at)
