"""GET /verdict: is the smoke at this spot from a known fire?"""

import math
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from smoke_engine.alerts import AlertCheck, air_quality_alert
from smoke_engine.aqhi import Reading, nearest_reading
from smoke_engine.detections import LATENCY_CLASSES, Detection, cwfis_detections, firms_detections, fuse, within
from smoke_engine.feeds import FeedUnavailable
from smoke_engine.fires import FIRE_RADIUS_KM, HOTSPOT_HOURS, Approach, Fire, closest_approach, known_fires
from smoke_engine.forward import Fan, forward_fan
from smoke_engine.geo import bearing_deg, compass, distance_km
from smoke_engine.places import area_code, nearest_community, public_fire_name, town_name
from smoke_engine.trajectory import UNSTEADY_ABOVE_DEG, Path, trace_back
from smoke_engine.verdict import (
    DRIFTING_KM,
    HIGH_CONFIDENCE_KM,
    SEARCH_KM,
    across_heights,
    choose_height,
    classify,
    display_km,
)
from smoke_engine.wind import GRID_POINTS, HEIGHTS, WIND_MODEL, hours_needed, inside_grid, parse_open_meteo

HOURS_BACK = 24
REPLAY_TIME = datetime(2025, 8, 25, 12, tzinfo=timezone.utc)  # Moncton replay: Aug 25, 2025, 12:00 UTC

RULES = {
    "hoursBack": HOURS_BACK,
    "highConfidenceKm": HIGH_CONFIDENCE_KM,
    "driftingKm": DRIFTING_KM,
    "searchKm": SEARCH_KM,
    "fireRadiusKm": FIRE_RADIUS_KM,
    "unsteadyDeg": UNSTEADY_ABOVE_DEG,
    "hotspotHours": HOTSPOT_HOURS,
    "heights": list(HEIGHTS),
}


def _utc(text: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(422, "time must be ISO 8601, e.g. 2025-08-25T12:00:00Z")
    if parsed.tzinfo is None:
        raise HTTPException(422, "time must include Z or a UTC offset")
    return parsed.astimezone(timezone.utc)


def _iso(t: datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


RETRY_AFTER_S = 15  # while the engine is warming up: when to ask again


def _unavailable(error: str, warming: bool = False) -> JSONResponse:
    """503 with the engine's own error. `warming`: the first wind grid since the start is still loading, so the
    answer says so and names when to ask again; the app then keeps trying instead of showing "no data"."""
    if warming:
        return JSONResponse(status_code=503, content={"error": error, "status": "warming"}, headers={"Retry-After": str(RETRY_AFTER_S)})
    return JSONResponse(status_code=503, content={"error": error})


def _warming(feeds) -> bool:
    """Whether the feed says its first wind grid is still loading (live feeds only)."""
    check = getattr(feeds, "warming", None)
    return bool(check()) if callable(check) else False


def _path_json(path: Path, lat: float, lon: float) -> dict:
    origin = path.points[-1]
    return {
        "hoursTraced": path.hours_traced,
        "stoppedAtGridEdge": path.stopped_at_grid_edge,
        "points": [
            {
                "hoursAgo": p.hours_ago,
                "time": _iso(p.time),
                "lat": round(p.lat, 4),
                "lon": round(p.lon, 4),
                "area": area_code(p.lat, p.lon),
                "windFromDeg": round(p.wind_from_deg),
            }
            for p in path.points
        ],
        "origin": {
            "hoursAgo": origin.hours_ago,
            "area": area_code(origin.lat, origin.lon),
            "km": int(distance_km(lat, lon, origin.lat, origin.lon) + 0.5),
            "compass": compass(bearing_deg(lat, lon, origin.lat, origin.lon)),
        },
    }


def _wind_json(path: Path, height: str, facts: dict) -> dict:
    """`facts`: the newest model run in the winds (live), or when they were recorded (replay)."""
    shift = path.biggest_shift()
    return {
        "level": height,
        "model": WIND_MODEL,
        "run": _iso_or_none(facts["run"]),
        "recordedAt": _iso_or_none(facts["recordedAt"]),
        "steady": path.steady,
        "spreadDeg": round(path.direction_spread_deg, 1),
        "biggestShift": {
            "time": _iso(shift[0].time),
            "hoursAgo": shift[0].hours_ago,
            "fromDeg": round(shift[1].wind_from_deg) % 360,
            "toDeg": round(shift[0].wind_from_deg) % 360,
        } if shift else None,
    }


def _detections_json(detections: list[Detection]) -> dict:
    by_source = {"FIRMS": 0, "CWFIS": 0, "both": 0}
    for d in detections:
        by_source[d.by] += 1
    # The named satellites that saw the fire in the last 24 hours (a record may name none).
    satellites = sorted({name for d in detections for name in d.satellites})
    return {"total": len(detections), "bySource": by_source, "satellites": satellites}


def _sources_json(
    checked: dict[str, datetime | None],
    fused: list[Detection],
    firms: list[Detection],
    arrival: datetime,
    now: datetime,
) -> dict:
    """Each fire source: did it answer, when, and its newest detection at or before the check.

    `checked` has the fetch time of each source that answered (None when not known: replay);
    `fused` has every detection both sources returned up to the check, merged, not only the last 24 hours;
    `firms` has the FIRMS detections of the last 24 hours.
    Newest detections are observation times only: a CWFIS row counts once merged with its FIRMS record.
    checkedMinutesAgo is the age of the older answer, rounded up, and null unless every answering
    source says when it was fetched.
    """

    def newest(detections) -> str | None:
        times = [d.time for d in detections if d.observed]
        return _iso(max(times)) if times else None

    counts = {latency: 0 for latency in LATENCY_CLASSES}
    for d in firms:
        counts[d.latency_class] += 1
    times = list(checked.values())
    checked_minutes = (
        max(1, math.ceil((now - min(times)).total_seconds() / 60)) if times and all(times) else None
    )
    observed = [d for d in fused if d.observed]
    newest_anywhere = max(observed, key=lambda d: d.time) if observed else None
    seconds = (arrival - newest_anywhere.time).total_seconds() if newest_anywhere else 0
    return {
        "cwfis": {
            "ok": "cwfis" in checked,
            "checkedAt": _iso_or_none(checked.get("cwfis")),
            "newestDetection": newest(d for d in fused if "CWFIS" in d.sources),
        },
        "firms": {
            "ok": "firms" in checked,
            "checkedAt": _iso_or_none(checked.get("firms")),
            "newestDetection": newest(d for d in fused if "FIRMS" in d.sources),
            "satellitesUsed": sorted({d.satellite for d in firms if d.satellite}),
            "countsByLatencyClass": counts,
        },
        "checkedMinutesAgo": checked_minutes,
        "newestDetection": {
            "time": _iso(newest_anywhere.time),
            "hoursAgo": int(seconds / 3600 + 0.5),
            "minutesAgo": int(seconds / 60 + 0.5),
        } if newest_anywhere else None,
    }


def _iso_or_none(t: datetime | None) -> str | None:
    return _iso(t) if t else None


def _last_seen_json(detections: list[Detection], arrival: datetime) -> dict | None:
    """The fire's newest observation: when, and which satellite and instrument saw it (never a CWFIS report time)."""
    observed = [d for d in detections if d.observed]
    if not observed:
        return None
    newest = max(observed, key=lambda d: d.time)
    seconds = (arrival - newest.time).total_seconds()
    return {
        "time": _iso(newest.time),
        "hoursAgo": int(seconds / 3600 + 0.5),
        "minutesAgo": int(seconds / 60 + 0.5),
        "satellite": newest.satellite,
        "instrument": newest.instrument,
        "latencyClass": newest.latency_class,
    }


def _fire_json(fire: Fire | None, lat: float, lon: float, arrival: datetime) -> dict | None:
    if fire is None:
        return None
    public = public_fire_name(fire.lat, fire.lon, arrival.year)
    community = nearest_community(fire.lat, fire.lon)
    return {
        "id": fire.cwfis_ids[0] if fire.cwfis_ids else f"hotspots:{fire.lat:.3f},{fire.lon:.3f}",
        "cwfisIds": fire.cwfis_ids,
        "name": public["name"] if public else None,
        "locality": public["locality"] if public else None,
        "nearCommunity": community[0].name if community else None,
        "province": area_code(fire.lat, fire.lon),
        "lat": round(fire.lat, 4),
        "lon": round(fire.lon, 4),
        "km": int(distance_km(lat, lon, fire.lat, fire.lon) + 0.5),
        "compass": compass(bearing_deg(lat, lon, fire.lat, fire.lon)),
        "lastSeen": _last_seen_json(fire.detections, arrival),
        "lastSeenHoursAgo": int((arrival - fire.last_seen).total_seconds() / 3600 + 0.5) if fire.last_seen else None,
        "sizeHa": fire.size_ha,
        "stage": fire.stage,
        "detections": _detections_json(fire.detections),
    }


def _aqhi_json(reading: Reading | None) -> dict | None:
    if reading is None:
        return None
    return {
        "value": reading.value,
        "display": reading.display,
        "segments": min(reading.level, 11),
        "category": reading.category,
        "observedAt": _iso(reading.observed_at),
        "station": {
            "id": reading.station.id,
            "nameEn": reading.station.name_en,
            "nameFr": reading.station.name_fr,
            "km": int(reading.station.km + 0.5),
        },
    }


def _alerts_json(check: AlertCheck, mode: str) -> dict:
    """ECCC's air-quality alert for the spot, in ECCC's own words. Replay reads the recorded messages."""
    alert = check.alert
    return {
        "airQuality": {
            "state": check.state,
            "source": "naad_archive" if mode == "replay" else "eccc_geomet",
            "checkedAt": _iso_or_none(check.checked_at),
            "alert": {
                "code": alert.code,
                "nameEn": alert.name_en,
                "nameFr": alert.name_fr,
                "colourEn": alert.colour_en,
                "colourFr": alert.colour_fr,
                "zoneEn": alert.zone_en,
                "zoneFr": alert.zone_fr,
                "issued": _iso(alert.issued),
                "expires": _iso(alert.expires),
                "url": alert.url,
            } if alert else None,
        }
    }


def _approach_json(approach: Approach | None, lat: float, lon: float, arrival: datetime) -> dict | None:
    if approach is None:
        return None
    return {
        "km": display_km(approach.km),
        "hoursAgo": int(approach.hours_ago + 0.5),
        "time": _iso(arrival - timedelta(hours=approach.hours_ago)),
        "lat": round(approach.lat, 4),
        "lon": round(approach.lon, 4),
        "fire": _fire_json(approach.fire, lat, lon, arrival),
    }


def _forward_json(fan: Fan | None) -> dict | None:
    """The forward trace: how close the fire's smoke came to the user, and the closest height's paths."""
    if fan is None:
        return None
    closest = fan.closest
    return {
        "closestKm": display_km(closest.km),
        "closestReleasedAt": _iso(closest.released_at),
        "closestHeight": closest.height,
        "agrees": fan.agrees,
        "paths": [
            {
                "height": r.height,
                "releasedAt": _iso(r.released_at),
                "points": [{"lat": round(p.lat, 4), "lon": round(p.lon, 4), "time": _iso(p.time)} for p in r.path.points],
            }
            for r in fan.releases
            if r.height == closest.height
        ],
    }


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def create_app(feeds_by_mode: dict, now=_utc_now, lifespan=None) -> FastAPI:
    """The API. feeds_by_mode maps "live" and/or "replay" to a feed; `now` is the UTC clock."""
    app = FastAPI(title="Smoke or Fire? engine", lifespan=lifespan)
    # The web app is served from another origin; the API is public and read-only.
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"])

    @app.get("/")
    def index():
        """What anyone opening the bare address sees, instead of "Not Found"."""
        return {"service": "Smoke or Fire? engine", "endpoints": ["/health", "/verdict"]}

    @app.get("/health")
    def health():
        feeds = {mode: f.status() for mode, f in feeds_by_mode.items() if hasattr(f, "status")}
        return {"status": "ok", "modes": sorted(feeds_by_mode), "time": _iso(now()), "feeds": feeds}

    @app.get("/verdict")
    def verdict(
        lat: float = Query(...),
        lon: float = Query(...),
        mode: Literal["live", "replay"] = Query("live"),
        time: str | None = Query(None),
    ):
        if mode not in feeds_by_mode:
            raise HTTPException(422, f"{mode} mode is not available")
        if not inside_grid(lat, lon):
            raise HTTPException(422, "lat/lon is outside the area the engine covers")
        arrival = _utc(time) if time else (REPLAY_TIME if mode == "replay" else now())
        feeds = feeds_by_mode[mode]

        start, end = hours_needed(arrival, HOURS_BACK)
        try:
            winds = parse_open_meteo(feeds.wind(GRID_POINTS, start, end), start, end)
        except FeedUnavailable:
            return _unavailable("wind_data_unavailable", warming=_warming(feeds))
        wind_facts = feeds.wind_facts()  # with the grid they describe: a refresh may swap both a moment later
        paths = {height: trace_back(winds[height], lat, lon, arrival, HOURS_BACK) for height in HEIGHTS}

        # Two fire sources: CWFIS (active fires and hotspots) and NASA FIRMS. Each may be down alone.
        since = arrival - timedelta(hours=HOTSPOT_HOURS)
        checked, reported = {}, {"cwfis": [], "firms": []}
        active = {"features": []}
        try:
            active = feeds.active_fires(arrival)
            reported["cwfis"] = [d for d in cwfis_detections(feeds.hotspots(since, arrival)) if d.time <= arrival]
            checked["cwfis"] = feeds.checked_at("cwfis", arrival)
        except FeedUnavailable:
            active = {"features": []}
        try:
            reported["firms"] = [d for d in firms_detections(feeds.firms(since, arrival)) if d.time <= arrival]
            checked["firms"] = feeds.checked_at("firms", arrival)
        except (FeedUnavailable, KeyError, ValueError):
            reported["firms"] = []
        # Merge first, over everything reported up to the check: a CWFIS row reported in the last 24 hours
        # can be a FIRMS detection acquired before them.
        fused = fuse(reported["firms"], reported["cwfis"])
        firms = within(reported["firms"], since, arrival)
        if not checked:
            # "No fires" must mean the fire feeds answered with none (screen 7d),
            # never that they failed to answer (screen 9b).
            return _unavailable("fire_data_unavailable")
        fires = known_fires(active, within(fused, since, arrival), arrival, lat, lon)
        approaches = {height: closest_approach(path, fires) for height, path in paths.items()}
        km_by_height = {height: a.km if a else None for height, a in approaches.items()}
        results = {height: classify(km_by_height[height], paths[height].steady) for height in HEIGHTS}
        chosen = choose_height(km_by_height)
        verdict_, confidence, agree = across_heights(results, chosen)
        nearest = min(fires, key=lambda f: distance_km(lat, lon, f.lat, f.lon), default=None)
        # Informational only, after the verdict: the fire the verdict names (drifting, unclear), else the
        # nearest fire, has its smoke traced forward to the check.
        featured = approaches[chosen].fire if verdict_ in ("drifting", "unclear") else nearest
        fan = forward_fan(winds, featured.lat, featured.lon, lat, lon, arrival) if featured else None

        path_json = {height: _path_json(path, lat, lon) for height, path in paths.items()}
        return {
            "mode": mode,
            "time": _iso(arrival),
            "location": {"lat": lat, "lon": lon, "name": town_name(lat, lon), "province": area_code(lat, lon)},
            "verdict": verdict_,
            "confidence": confidence,
            "noFiresInRange": not fires,
            "rules": RULES,
            "path": path_json[chosen],
            "wind": _wind_json(paths[chosen], chosen, wind_facts),
            "closestApproach": _approach_json(approaches[chosen], lat, lon, arrival),
            "nearestFire": _fire_json(nearest, lat, lon, arrival),
            "heights": {
                "chosen": chosen,
                "agree": agree,
                "results": {
                    height: {
                        "verdict": results[height][0],
                        "confidence": results[height][1],
                        "closestApproachKm": display_km(km_by_height[height]) if km_by_height[height] is not None else None,
                        "steady": paths[height].steady,
                    }
                    for height in HEIGHTS
                },
                "paths": path_json,
            },
            "forward": _forward_json(fan),
            "aqhi": _aqhi_json(nearest_reading(feeds, lat, lon, arrival)),
            # Informational only, like the forward trace and the AQHI: after the verdict, never part of it.
            "alerts": _alerts_json(air_quality_alert(feeds, lat, lon, arrival), mode),
            "sources": _sources_json(checked, fused, firms, arrival, now()),
        }

    return app
