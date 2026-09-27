"""The featured fire's smoke, traced forward to the check: a second, independent check on the verdict.

Informational only: the verdict and confidence never depend on it (design/DESIGN-LOCK.md).
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from smoke_engine.geo import closest_point_on_segment
from smoke_engine.trajectory import Path, trace_forward
from smoke_engine.verdict import DRIFTING_KM
from smoke_engine.wind import WindField

RELEASE_HOURS = 24  # smoke leaves the fire every hour over the 24 hours before the check
AGREES_KM = DRIFTING_KM  # the smoke passed this close to the user: the forward trace agrees


@dataclass
class Release:
    height: str
    released_at: datetime
    path: Path
    km: float  # how close the path came to the user
    toward: bool  # that closest point comes after the release: the smoke moved toward the user


@dataclass
class Fan:
    releases: list[Release]  # every height, oldest release first
    closest: Release
    agrees: bool


def forward_fan(winds: dict[str, WindField], fire_lat: float, fire_lon: float, lat: float, lon: float, at: datetime) -> Fan:
    """Release smoke from the fire every hour over the RELEASE_HOURS before `at`, at every height, and follow
    each release forward until `at` or the grid edge.

    The closest release is the one whose path came closest to the user at (lat, lon). As with the backward
    trace, a path counts only if its closest point comes after its release: when that point is the fire
    itself, the smoke moved away from the user. If no path counts, the closest is the fire itself and the
    forward trace does not agree.
    """
    releases = []
    for height, wind in winds.items():
        for hours in range(RELEASE_HOURS, 0, -1):
            released_at = at - timedelta(hours=hours)
            path = trace_forward(wind, fire_lat, fire_lon, released_at, at)
            releases.append(Release(height, released_at, path, *_closest_to(path, lat, lon)))
    toward = [r for r in releases if r.toward]
    closest = min(toward or releases, key=lambda r: r.km)
    return Fan(releases, closest, bool(toward) and closest.km <= AGREES_KM)


def _closest_to(path: Path, lat: float, lon: float) -> tuple[float, bool]:
    """How close the path (its hourly segments) comes to (lat, lon), and whether that point comes after the release."""
    points = path.points
    segments = list(zip(points, points[1:])) or [(points[0], points[0])]
    best = None
    for n, (a, b) in enumerate(segments):
        km, f = closest_point_on_segment(lat, lon, (a.lat, a.lon), (b.lat, b.lon))
        if best is None or km < best[0]:
            best = (km, n + f > 0)
    return best
