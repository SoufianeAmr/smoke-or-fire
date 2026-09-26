"""GET /verdict: is the smoke at this spot from a known fire?"""

from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse

from smoke_engine.aqhi import Reading, nearest_reading
from smoke_engine.feeds import FeedUnavailable
from smoke_engine.fires import FIRE_RADIUS_KM, HOTSPOT_HOURS, Approach, Fire, closest_approach, known_fires
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


def _unavailable(error: str) -> JSONResponse:
    return JSONResponse(status_code=503, content={"error": error})


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


def _wind_json(path: Path, height: str) -> dict:
    shift = path.biggest_shift()
    return {
        "level": height,
        "model": WIND_MODEL,
        "steady": path.steady,
        "spreadDeg": round(path.direction_spread_deg, 1),
        "biggestShift": {
            "time": _iso(shift[0].time),
            "hoursAgo": shift[0].hours_ago,
            "fromDeg": round(shift[1].wind_from_deg) % 360,
            "toDeg": round(shift[0].wind_from_deg) % 360,
        } if shift else None,
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
        "lastSeen": _iso(fire.last_seen) if fire.last_seen else None,
        "lastSeenHoursAgo": int((arrival - fire.last_seen).total_seconds() / 3600 + 0.5) if fire.last_seen else None,
        "sizeHa": fire.size_ha,
        "stage": fire.stage,
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


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def create_app(feeds_by_mode: dict, now=_utc_now, lifespan=None) -> FastAPI:
    """The API. feeds_by_mode maps "live" and/or "replay" to a feed; `now` is the UTC clock."""
    app = FastAPI(title="Smoke or Fire? engine", lifespan=lifespan)

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
            return _unavailable("wind_data_unavailable")
        paths = {height: trace_back(winds[height], lat, lon, arrival, HOURS_BACK) for height in HEIGHTS}

        try:
            active = feeds.active_fires(arrival)
            hotspots = feeds.hotspots(arrival - timedelta(hours=HOTSPOT_HOURS), arrival)
        except FeedUnavailable:
            # "No fires" must mean the fire feeds answered with none (screen 7d),
            # never that they failed to answer (screen 9b).
            return _unavailable("fire_data_unavailable")
        fires = known_fires(active, hotspots, arrival, lat, lon)
        approaches = {height: closest_approach(path, fires) for height, path in paths.items()}
        km_by_height = {height: a.km if a else None for height, a in approaches.items()}
        results = {height: classify(km_by_height[height], paths[height].steady) for height in HEIGHTS}
        chosen = choose_height(km_by_height)
        verdict_, confidence, agree = across_heights(results, chosen)

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
            "wind": _wind_json(paths[chosen], chosen),
            "closestApproach": _approach_json(approaches[chosen], lat, lon, arrival),
            "nearestFire": _fire_json(
                min(fires, key=lambda f: distance_km(lat, lon, f.lat, f.lon), default=None), lat, lon, arrival
            ),
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
            "aqhi": _aqhi_json(nearest_reading(feeds, lat, lon, arrival)),
        }

    return app
