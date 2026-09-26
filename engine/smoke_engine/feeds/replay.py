"""Replay mode: the services' recorded answers for Moncton, Aug 25, 2025 (see scripts/fetch_replay.py)."""

import json
from functools import cache
from pathlib import Path

from smoke_engine.feeds import FeedUnavailable

REPLAY_DIR = Path(__file__).resolve().parents[3] / "data" / "replay" / "moncton-2025-08-25"


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

    def active_fires(self, at):
        return self._load("active-fires.json")

    def hotspots(self, start, end):
        return self._load("hotspots.json")

    def aqhi_stations(self):
        return self._load("aqhi-stations.json")

    def aqhi_readings(self, station_id, start, end):
        readings = self._load("aqhi-readings.json")
        return {
            "type": "FeatureCollection",
            "features": [f for f in readings["features"] if f["properties"]["location_id"] == station_id],
        }
