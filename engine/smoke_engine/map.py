"""The "map" key of GET /verdict: what the map draws, and where each layer comes from.

Its shape is schemas/map.v1.schema.json. Informational only: it is built after the verdict, from what the
verdict already used (the three traced paths, the fires and their detections, ECCC's alert), and never
changes the verdict or the confidence. Every layer names its source and its time; what is not known is
null, never a guess. One function builds it for live and replay alike.
"""

import math
from datetime import datetime
from pathlib import Path

from smoke_engine.alerts import ACTIVE, Alert, AlertCheck, _time
from smoke_engine.fires import FIRE_RADIUS_KM, HOTSPOT_HOURS, Fire
from smoke_engine.places import public_fire_name
from smoke_engine.trajectory import Path as Trail
from smoke_engine.wind import WIND_MODEL

MAP_VERSION = 1
SCHEMA_FILE = Path(__file__).resolve().parent / "schemas" / f"map.v{MAP_VERSION}.schema.json"
# More detections than this in 24 hours within 500 km (the 2025 season's busiest day had under 1,000): the
# newest are kept, and layers.detections says how many there are.
MAX_DETECTIONS = 4000
# A zone outline is read on a phone, where a pixel is several hundred metres: about 500 m is finer than it shows.
ZONE_TOLERANCE_DEG = 0.005
ZONE_MAX_POINTS = 600


def _iso(t: datetime | None) -> str | None:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ") if t else None


def _frp(value) -> float | None:
    """Fire radiative power in MW to one decimal; None when the source gives none, or not a number."""
    try:
        power = float(value)
    except (TypeError, ValueError):
        return None
    return round(power, 1) if math.isfinite(power) and power >= 0 else None


def map_json(
    *,
    feeds,
    lat: float,
    lon: float,
    arrival: datetime,
    paths: dict[str, Trail],
    chosen: str,
    fires: list[Fire],
    featured: Fire | None,
    checked: dict[str, datetime | None],
    wind_facts: dict,
    alert_check: AlertCheck,
    alert_source: str,
) -> dict:
    """The map for the check at (lat, lon): `paths` by height, the `fires` in range with their detections, the
    fire the verdict features, when each fire source that answered was fetched (`checked`), the winds' run or
    recording time, and ECCC's alert check with where it was read from."""
    spots = sorted((d for fire in fires for d in fire.detections), key=lambda d: (d.time, d.lat, d.lon))
    shown = spots[-MAX_DETECTIONS:]
    seen = [d.time for d in shown if d.observed]
    official = sorted((_official(fire, arrival) for fire in fires if fire.cwfis_ids), key=lambda f: f["id"])
    zone = _zone(feeds, lat, lon, arrival, alert_check)
    alert = alert_check.alert if alert_check.state == ACTIVE else None
    return {
        "version": MAP_VERSION,
        "you": {"lat": lat, "lon": lon},
        "focus": {"lat": round(featured.lat, 4), "lon": round(featured.lon, 4)} if featured else None,
        "trails": [
            {
                "height": height,
                "chosen": height == chosen,
                "points": [{"lat": round(p.lat, 4), "lon": round(p.lon, 4), "hoursAgo": p.hours_ago} for p in path.points],
            }
            for height, path in paths.items()
        ],
        "detections": [
            {"lat": round(d.lat, 4), "lon": round(d.lon, 4), "time": _iso(d.time), "observed": d.observed, "frp": _frp(d.frp), "by": d.by}
            for d in shown
        ],
        "fires": official,
        "alertZone": zone,
        "layers": {
            "trails": {
                "source": "open_meteo_gfs",
                "model": WIND_MODEL,
                "run": _iso(wind_facts.get("run")),
                "recordedAt": _iso(wind_facts.get("recordedAt")),
            },
            "detections": {
                "hours": HOTSPOT_HOURS,
                "radiusKm": FIRE_RADIUS_KM,
                "count": len(spots),
                "shown": len(shown),
                "newest": _iso(max(seen)) if seen else None,  # an observation time, never a CWFIS report time
                "firms": {"ok": "firms" in checked, "checkedAt": _iso(checked.get("firms"))},
                "cwfis": {"ok": "cwfis" in checked, "checkedAt": _iso(checked.get("cwfis"))},
            },
            "fires": {"source": "nrcan_cwfis", "ok": "cwfis" in checked, "checkedAt": _iso(checked.get("cwfis")), "count": len(official)},
            "alertZone": {
                "source": alert_source,
                "state": alert_check.state,
                "issued": _iso(alert.issued) if alert else None,
                "checkedAt": _iso(alert_check.checked_at),
                "outline": zone is not None,
            },
        },
    }


def _official(fire: Fire, arrival: datetime) -> dict:
    """A fire with a record on Canada's active fire list (CWFIS): where the record puts it."""
    ids = [fire_id for fire_id in fire.cwfis_ids if fire_id]
    public = public_fire_name(fire.lat, fire.lon, arrival.year)
    return {
        "id": str(ids[0]) if ids else f"cwfis:{fire.lat:.3f},{fire.lon:.3f}",
        "lat": round(fire.lat, 4),
        "lon": round(fire.lon, 4),
        "stage": fire.stage,
        "sizeHa": fire.size_ha,
        "name": public["name"] if public else None,
    }


# --- ECCC's alert zone ---------------------------------------------------------------------------------


def _zone(feeds, lat: float, lon: float, at: datetime, check: AlertCheck) -> dict | None:
    """The outline of the forecast zone under the active alert. ECCC is asked for it only when an alert is
    active, in a query of its own: the alert check itself is never slowed or changed by it. Anything that
    cannot be read gives no outline; the alert stays active."""
    if check.state != ACTIVE or check.alert is None:
        return None
    try:
        rings = _outline(feeds.alert_zones(lat, lon, at), check.alert)
    except Exception:  # no answer, or one in a shape never seen: the verdict and the alert are still given
        return None
    return {"rings": rings} if rings else None


def _same_alert(properties: dict, alert: Alert) -> bool:
    try:
        return (
            properties.get("alert_code") == alert.code
            and properties.get("feature_name_en") == alert.zone_en
            and _time(properties["publication_datetime"]) == alert.issued
        )
    except (KeyError, ValueError):
        return False


def _outline(answer, alert: Alert) -> list | None:
    """The rings of the zone of `alert` in ECCC's answer for the point, simplified."""
    features = answer.get("features") if isinstance(answer, dict) else None
    if not isinstance(features, list):
        return None
    for feature in features:
        properties = feature.get("properties") if isinstance(feature, dict) else None
        if isinstance(properties, dict) and _same_alert(properties, alert):
            rings = _rings(feature.get("geometry"))
            return _simplified(rings) if rings else None
    return None


def _rings(geometry) -> list[list[list[float]]]:
    """Every ring of a GeoJSON Polygon or MultiPolygon that is a closed line of [lon, lat] points."""
    if not isinstance(geometry, dict) or not isinstance(geometry.get("coordinates"), list):
        return []
    polygons = {"Polygon": [geometry["coordinates"]], "MultiPolygon": geometry["coordinates"]}.get(geometry.get("type"), [])
    rings = []
    for polygon in polygons:
        for ring in polygon if isinstance(polygon, list) else []:
            points = _points(ring)
            if points:
                rings.append(points)
    return rings


def _points(ring) -> list[list[float]] | None:
    """The ring as [lon, lat] floats, closed; None if it is not a ring of at least three places on Earth."""
    if not isinstance(ring, list):
        return None
    points = []
    for position in ring:
        if not isinstance(position, (list, tuple)) or len(position) < 2:
            return None
        x, y = position[0], position[1]
        if isinstance(x, bool) or isinstance(y, bool) or not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            return None
        if not (math.isfinite(x) and math.isfinite(y) and -180 <= x <= 180 and -90 <= y <= 90):
            return None
        points.append([float(x), float(y)])
    if len(points) >= 3 and points[0] != points[-1]:
        points.append(list(points[0]))
    return points if len(points) >= 4 else None


def _simplified(rings: list[list[list[float]]]) -> list | None:
    """Each ring simplified and rounded; coarser until the outline is small enough to send. Rings that
    shrink to nothing (islets) are left out."""
    tolerance = ZONE_TOLERANCE_DEG
    for _ in range(8):
        kept = [ring for ring in (simplify_ring(ring, tolerance) for ring in rings) if len(ring) >= 4]
        if sum(len(ring) for ring in kept) <= ZONE_MAX_POINTS:
            break
        tolerance *= 2
    return [[[round(x, 4), round(y, 4)] for x, y in ring] for ring in kept] or None


def simplify_ring(ring: list[list[float]], tolerance: float) -> list[list[float]]:
    """Douglas-Peucker on a closed ring of [lon, lat] points: no point left out is farther than `tolerance`
    degrees from the simplified line. The ring is cut at the point farthest from its first, each half is
    simplified, and it is closed again."""
    points = ring[:-1] if ring[0] == ring[-1] else list(ring)
    if len(points) < 3:
        return ring
    k = math.cos(math.radians(sum(y for _, y in points) / len(points)))  # a degree of longitude is shorter than one of latitude
    flat = [(x * k, y) for x, y in points]
    far = max(range(len(flat)), key=lambda i: (flat[i][0] - flat[0][0]) ** 2 + (flat[i][1] - flat[0][1]) ** 2)
    keep = sorted({*_keep(flat, 0, far, tolerance), *_keep(flat + [flat[0]], far, len(flat), tolerance)})
    return [points[i % len(points)] for i in keep]


def _keep(flat: list[tuple[float, float]], first: int, last: int, tolerance: float) -> set[int]:
    """The indexes Douglas-Peucker keeps between `first` and `last`, both included."""
    keep, stack = {first, last}, [(first, last)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = flat[a], flat[b]
        dx, dy = bx - ax, by - ay
        length2 = dx * dx + dy * dy
        worst, at = 0.0, None
        for i in range(a + 1, b):
            px, py = flat[i]
            f = 0.0 if length2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length2))
            distance = math.hypot(px - (ax + f * dx), py - (ay + f * dy))
            if distance > worst:
                worst, at = distance, i
        if at is not None and worst > tolerance:
            keep.add(at)
            stack += [(a, at), (at, b)]
    return keep
