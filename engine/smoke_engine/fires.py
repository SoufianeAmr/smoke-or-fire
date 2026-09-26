"""Known fires near the user, from CWFIS active fires and satellite detections (CWFIS hotspots, NASA FIRMS)."""

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from smoke_engine.detections import Detection
from smoke_engine.geo import closest_point_on_segment, distance_km
from smoke_engine.trajectory import Path

FIRE_RADIUS_KM = 500.0
HOTSPOT_HOURS = 24
CLUSTER_KM = 5.0  # detections (and a CWFIS record) this close together are one fire
BURNING_STAGES = {"OC", "BH"}  # out of control, being held; UC (under control) is skipped


@dataclass
class Fire:
    lat: float
    lon: float
    points: list[tuple[float, float]] = field(default_factory=list)
    cwfis_ids: list[str] = field(default_factory=list)
    stage: str | None = None
    size_ha: float | None = None
    last_seen: datetime | None = None
    detections: list[Detection] = field(default_factory=list)


@dataclass
class Approach:
    """Where the traced air came closest to a fire."""

    km: float
    hours_ago: float
    lat: float
    lon: float
    fire: Fire


def closest_approach(path: Path, fires: list[Fire]) -> Approach | None:
    """Shortest distance between the path (its hourly segments) and a fire.

    A fire counts only if its closest point on the path comes after the start
    (hoursAgo > 0). When that point is the start itself, the fire is near the
    user but not on the air's route, so it is only ever the nearest fire.
    """
    best = None
    for fire in fires:
        approach = _fire_closest_point(path, fire)
        if approach.hours_ago <= 0:
            continue
        if best is None or approach.km < best.km:
            best = approach
    return best


def _fire_closest_point(path: Path, fire: Fire) -> Approach:
    """Where the path comes closest to any point of this fire."""
    best = None
    points = path.points
    segments = list(zip(points, points[1:])) or [(points[0], points[0])]
    for flat, flon in fire.points:
        for a, b in segments:
            km, f = closest_point_on_segment(flat, flon, (a.lat, a.lon), (b.lat, b.lon))
            if best is None or km < best.km:
                best = Approach(
                    km=km,
                    hours_ago=a.hours_ago + f * (b.hours_ago - a.hours_ago),
                    lat=a.lat + f * (b.lat - a.lat),
                    lon=a.lon + f * (b.lon - a.lon),
                    fire=fire,
                )
    return best


def _time(text: str | None) -> datetime | None:
    return datetime.fromisoformat(text.replace("Z", "+00:00")) if text else None


def known_fires(active_fires: dict, detections: list[Detection], at: datetime, lat: float, lon: float) -> list[Fire]:
    """Fires within FIRE_RADIUS_KM of (lat, lon) at time `at`.

    Counts CWFIS active fires that are out of control or being held as of `at`,
    and satellite detections in the HOTSPOT_HOURS before `at`. Detections within
    CLUSTER_KM of each other are one fire, and a CWFIS record within CLUSTER_KM
    of a cluster joins it.
    """
    fires = []
    for feature in active_fires.get("features", []):
        p = feature["properties"]
        start, end = _time(p.get("record_start")), _time(p.get("record_end"))
        if (start and start > at) or (end and end <= at):
            continue
        if p.get("stage_of_control_status") not in BURNING_STAGES:
            continue
        if distance_km(lat, lon, p["latitude"], p["longitude"]) > FIRE_RADIUS_KM:
            continue
        fires.append(
            Fire(
                lat=p["latitude"],
                lon=p["longitude"],
                points=[(p["latitude"], p["longitude"])],
                cwfis_ids=[p.get("national_fire_id")],
                stage=p.get("stage_of_control_status"),
                size_ha=p.get("fire_size"),
            )
        )

    since = at - timedelta(hours=HOTSPOT_HOURS)
    spots = [
        d for d in detections
        if since < d.time <= at and distance_km(lat, lon, d.lat, d.lon) <= FIRE_RADIUS_KM
    ]

    clusters = [_fire_from_hotspots(group) for group in _cluster(spots)]
    for reported in fires:
        cluster = next((c for c in clusters if _near_any(reported.lat, reported.lon, c.points)), None)
        if cluster is None:
            clusters.append(reported)
            continue
        # One fire: the CWFIS record gives the location, ID, stage and size.
        cluster.lat, cluster.lon = reported.lat, reported.lon
        cluster.points += reported.points
        cluster.cwfis_ids += reported.cwfis_ids
        cluster.stage, cluster.size_ha = reported.stage, reported.size_ha
    return clusters


def _flat_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    k = math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot((lon2 - lon1) * 111.32 * k, (lat2 - lat1) * 110.57)


def _near_any(lat: float, lon: float, points: list[tuple[float, float]]) -> bool:
    return any(_flat_km(lat, lon, plat, plon) <= CLUSTER_KM for plat, plon in points)


def _cluster(spots: list[Detection]) -> list[list[Detection]]:
    """Group detections that chain together within CLUSTER_KM of each other."""
    parent = list(range(len(spots)))

    def root(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    order = sorted(range(len(spots)), key=lambda i: spots[i].lat)
    lat_window = CLUSTER_KM / 110.0
    for n, i in enumerate(order):
        for j in order[n + 1:]:
            if spots[j].lat - spots[i].lat > lat_window:
                break
            if _flat_km(spots[i].lat, spots[i].lon, spots[j].lat, spots[j].lon) <= CLUSTER_KM:
                parent[root(i)] = root(j)

    groups: dict[int, list] = {}
    for i, spot in enumerate(spots):
        groups.setdefault(root(i), []).append(spot)
    return list(groups.values())


def _fire_from_hotspots(group: list[Detection]) -> Fire:
    return Fire(
        lat=sum(d.lat for d in group) / len(group),
        lon=sum(d.lon for d in group) / len(group),
        points=[(d.lat, d.lon) for d in group],
        last_seen=max(d.time for d in group),
        detections=group,
    )
