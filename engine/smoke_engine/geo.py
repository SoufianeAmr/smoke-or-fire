"""Distances, bearings and compass points on the Earth's surface."""

import math

EARTH_RADIUS_KM = 6371.0
COMPASS_16 = ("N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW")


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Initial bearing from point 1 to point 2, degrees clockwise from north."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return math.degrees(math.atan2(y, x)) % 360


def compass(bearing: float) -> str:
    return COMPASS_16[int((bearing % 360) / 22.5 + 0.5) % 16]


def closest_point_on_segment(
    lat: float, lon: float, a: tuple[float, float], b: tuple[float, float]
) -> tuple[float, float]:
    """Closest point to (lat, lon) on segment a–b.

    Returns (distance_km, fraction along a→b). The fraction comes from a local
    flat projection centred on the point; the distance is great-circle.
    """
    k = math.cos(math.radians(lat))
    ax, ay = (a[1] - lon) * k, a[0] - lat
    bx, by = (b[1] - lon) * k, b[0] - lat
    dx, dy = bx - ax, by - ay
    length2 = dx * dx + dy * dy
    f = 0.0 if length2 == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / length2))
    plat = a[0] + (b[0] - a[0]) * f
    plon = a[1] + (b[1] - a[1]) * f
    return distance_km(lat, lon, plat, plon), f
