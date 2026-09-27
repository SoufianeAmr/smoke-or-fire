"""Build the static replay demo files in data/demo/ from the recorded replay data.

    uv run python -m scripts.build_demo     (from engine/)

Runs GET /verdict in replay mode (2025-08-25 12:00 UTC) for each demo town at
its official NRCan (CGNDB) coordinates and saves the exact response, so the
frontend can show replay mode without the server.
"""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from smoke_engine.app import create_app
from smoke_engine.feeds.replay import ReplayFeeds
from smoke_engine.places import _communities

OUT = Path(__file__).resolve().parents[2] / "data" / "demo"
REPLAY_TIME = "2025-08-25T12:00:00Z"
TOWNS = [
    ("Moncton", "NB"), ("Dieppe", "NB"), ("Sackville", "NB"), ("Sussex", "NB"), ("Saint John", "NB"),
    ("Fredericton", "NB"), ("Miramichi", "NB"), ("Bathurst", "NB"), ("Edmundston", "NB"),
    ("Charlottetown", "PE"), ("Truro", "NS"), ("Halifax", "NS"),
    # Near the Long Lake fire, for "If you're told to leave".
    ("Bridgetown", "NS"), ("West Dalhousie", "NS"),
]
TYPE_PREFERENCE = ["CITY", "TOWN", "VILG", "MUN1", "UNP"]


def official_point(name: str, province: str):
    matches = [c for c in _communities() if c.name == name and c.province == province]
    if not matches:
        raise SystemExit(f"{name}, {province} is not in data/places/communities.json")
    return min(matches, key=lambda c: TYPE_PREFERENCE.index(c.type) if c.type in TYPE_PREFERENCE else 99)


def slug(name: str) -> str:
    return name.lower().replace(" ", "-")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    client = TestClient(create_app({"replay": ReplayFeeds()}))
    index = []
    for name, province in TOWNS:
        place = official_point(name, province)
        body = client.get(
            "/verdict", params={"lat": place.lat, "lon": place.lon, "time": REPLAY_TIME, "mode": "replay"}
        ).json()
        file = f"{slug(name)}.json"
        (OUT / file).write_text(json.dumps(body, ensure_ascii=False, indent=1), encoding="utf-8")
        approach = body["closestApproach"]
        fire = approach["fire"] if approach else None
        index.append({
            "town": name,
            "province": province,
            "lat": place.lat,
            "lon": place.lon,
            "cgndbType": place.type,
            "file": file,
            "verdict": body["verdict"],
            "confidence": body["confidence"],
            "closestKm": approach["km"] if approach else None,
            "fire": (fire["name"] or f"near {fire['nearCommunity']}") if fire else None,
            "chosenHeight": body["heights"]["chosen"],
            "heightsAgree": body["heights"]["agree"],
        })
    (OUT / "index.json").write_text(
        json.dumps({"time": REPLAY_TIME, "mode": "replay", "towns": index}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    for row in index:
        print(" | ".join(str(row[k]) for k in ("town", "verdict", "confidence", "closestKm", "fire", "chosenHeight", "heightsAgree")))


if __name__ == "__main__":
    main()
