"""Replay mode: the services' recorded answers for Moncton, Aug 25, 2025 (see scripts/fetch_replay.py)."""

import json
from datetime import datetime
from functools import cache
from pathlib import Path

from smoke_engine.feeds import FeedUnavailable
from smoke_engine.places import in_ring

REPLAY_DIR = Path(__file__).resolve().parents[3] / "data" / "replay" / "moncton-2025-08-25"


def _time(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


class ReplayFeeds:
    def __init__(self, directory: Path = REPLAY_DIR):
        self._directory = directory

    @cache
    def _load(self, name: str):
        path = self._directory / name
        if not path.exists():
            raise FeedUnavailable(f"replay file missing: {path}")
        return json.loads(path.read_text(encoding="utf-8"))

    def wind(self, points, start, end):
        return self._load("wind.json")

    def wind_facts(self):
        """Recorded winds are stitched from many model runs: no single run, only when they were downloaded."""
        return {"run": None, "recordedAt": _time(self._load("manifest.json")["fetchedAt"])}

    def active_fires(self, at):
        return self._load("active-fires.json")

    def hotspots(self, start, end):
        return self._load("hotspots.json")

    def firms(self, start, end):
        return self._firms()

    def checked_at(self, source, at):
        """Recorded data: nothing was checked at the time of the request."""
        return None

    @cache
    def _firms(self):
        """The saved FIRMS archive answers (firms/<SOURCE>.csv), by source."""
        files = sorted((self._directory / "firms").glob("*.csv"))
        if not files:
            raise FeedUnavailable(f"no FIRMS files in {self._directory / 'firms'}")
        return {f.stem: f.read_text(encoding="utf-8") for f in files}

    def aqhi_stations(self):
        return self._load("aqhi-stations.json")

    def aqhi_readings(self, station_id, start, end):
        readings = self._load("aqhi-readings.json")
        return {
            "type": "FeatureCollection",
            "features": [f for f in readings["features"] if f["properties"]["location_id"] == station_id],
        }

    def alerts(self, lat, lon, at):
        """What ECCC's alerts collection would have listed for the point at `at`, from the recorded messages
        (alerts.json): for each zone and alert, the newest message sent by then, unless it had expired."""
        recorded = self._load("alerts.json")
        first, end = (_time(t) for t in recorded["covers"])
        if not first <= at < end:
            raise FeedUnavailable(f"no alert messages recorded for {at:%Y-%m-%dT%H:%MZ}")
        newest = {}
        for feature in recorded["features"]:
            p = feature["properties"]
            key = (p["feature_id"], p["alert_code"])
            if (
                _time(p["publication_datetime"]) <= at
                and (key not in newest or p["publication_datetime"] > newest[key]["properties"]["publication_datetime"])
                and any(in_ring(lat, lon, ring) for ring in feature["geometry"]["coordinates"])
            ):
                newest[key] = feature
        listed = [
            {**feature, "geometry": None}
            for feature in newest.values()
            if at < _time(feature["properties"]["expiration_datetime"])
        ]
        return {"type": "FeatureCollection", "features": listed, "numberMatched": len(listed), "numberReturned": len(listed)}
