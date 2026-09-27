"""Validation on real events: the unchanged engine against 2025 reports of wildfire smoke, and quiet control days.

    uv run python -m scripts.validate controls    (from engine/; before any run: checks the control days in the raw data)
    uv run python -m scripts.validate             (runs the engine on every case and writes VALIDATION.md)

The events, controls and rules are in data/validation/plan.json, committed before the engine was run on
any of them. Each case replays the data recorded for its date (data/replay/<name>/, scripts/fetch_replay.py).
The engine's answers are saved in data/validation/answers/.
"""

import csv
import io
import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from scripts import build_demo
from smoke_engine.app import create_app
from smoke_engine.feeds import sources
from smoke_engine.feeds.replay import REPLAY_DIR, ReplayFeeds
from smoke_engine.fires import BURNING_STAGES, FIRE_RADIUS_KM
from smoke_engine.geo import distance_km
from smoke_engine.verdict import SEARCH_KM

ROOT = Path(__file__).resolve().parents[2]
PLAN = ROOT / "data" / "validation" / "plan.json"
CONTROLS_CHECK = ROOT / "data" / "validation" / "controls-check.json"
ANSWERS = ROOT / "data" / "validation" / "answers"
RESULTS = ROOT / "data" / "validation" / "results.json"
OUT = ROOT / "VALIDATION.md"


def _iso(t: datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def _time(text: str | None) -> datetime | None:
    return datetime.fromisoformat(text.replace("Z", "+00:00")) if text else None


def plan() -> dict:
    return json.loads(PLAN.read_text(encoding="utf-8"))


def cases(p: dict) -> list[dict]:
    return [{**e, "kind": "event"} for e in p["events"]] + [{**c, "kind": "control"} for c in p["controls"]]


def check_time(case: dict, p: dict) -> str:
    return f"{case['date']}T{p['checkTime']['utc']}:00Z"


def point(case: dict):
    return build_demo.official_point(case["place"], case["province"])


def replay_dir(case: dict) -> Path:
    return REPLAY_DIR.parent / case["replay"]


# --- Controls: checked in the raw recorded data, before the engine runs ---------------------------

def check_control(case: dict) -> dict:
    """Everything recorded within 500 km of the control point, over the whole recording (two UTC days).

    Counts every FIRMS row whatever its confidence, every CWFIS hotspot, and every CWFIS fire record
    at stage BH or OC valid at any time in the recording; lists fire records at other stages; and finds
    the highest AQHI at the nearest station.
    """
    place, directory = point(case), replay_dir(case)
    start = datetime.fromisoformat(f"{case['date']}T00:00:00+00:00") - timedelta(days=1)
    end = start + timedelta(days=2)
    near = lambda lat, lon: distance_km(place.lat, place.lon, lat, lon) <= FIRE_RADIUS_KM  # noqa: E731

    firms = {}
    for f in sorted((directory / "firms").glob("*.csv")):
        rows = list(csv.DictReader(io.StringIO(f.read_text(encoding="utf-8"))))
        firms[f.stem] = {
            "rows": len(rows),
            "within500Km": sum(1 for r in rows if near(float(r["latitude"]), float(r["longitude"]))),
        }
    spots = json.loads((directory / "hotspots.json").read_text(encoding="utf-8"))["features"]
    records = json.loads((directory / "active-fires.json").read_text(encoding="utf-8"))["features"]
    in_recording = [
        r["properties"] for r in records
        if not ((_time(r["properties"].get("record_start")) or start) >= end)
        and not ((_time(r["properties"].get("record_end")) or end) <= start)
    ]
    burning = [r for r in in_recording if r.get("stage_of_control_status") in BURNING_STAGES]
    # Records at any other stage (under control) are not counted by the engine; listed so they are seen.
    other = sorted(
        (round(distance_km(place.lat, place.lon, r["latitude"], r["longitude"]), 1), r.get("stage_of_control_status"))
        for r in in_recording if r not in burning and near(r["latitude"], r["longitude"])
    )
    stations = json.loads((directory / "aqhi-stations.json").read_text(encoding="utf-8"))["features"]
    station = min(
        stations, key=lambda s: distance_km(place.lat, place.lon, s["geometry"]["coordinates"][1], s["geometry"]["coordinates"][0])
    )
    readings = [
        r["properties"]["aqhi"]
        for r in json.loads((directory / "aqhi-readings.json").read_text(encoding="utf-8"))["features"]
        if r["properties"]["location_id"] == station["properties"]["location_id"]
    ]
    return {
        "id": case["id"],
        "place": f"{case['place']}, {case['province']}",
        "point": [place.lat, place.lon],
        "recording": {"from": _iso(start), "to": _iso(end), "directory": f"data/replay/{directory.name}"},
        "firmsBbox": sources.FIRMS_BBOX,
        "firms": firms,
        "firmsWithin500Km": sum(f["within500Km"] for f in firms.values()),
        "cwfisHotspots": len(spots),
        "cwfisHotspotsWithin500Km": sum(1 for s in spots if near(s["properties"]["lat"], s["properties"]["lon"])),
        "burningFireRecords": len(burning),
        "burningFireRecordsWithin500Km": sum(1 for r in burning if near(r["latitude"], r["longitude"])),
        "otherFireRecordsWithin500Km": [{"km": km, "stage": stage} for km, stage in other],
        "aqhi": {
            "station": station["properties"]["location_id"],
            "stationName": station["properties"]["location_name_en"],
            "stationKm": round(distance_km(
                place.lat, place.lon, station["geometry"]["coordinates"][1], station["geometry"]["coordinates"][0]), 1),
            "readings": len(readings),
            "max": max(readings) if readings else None,
        },
    }


def controls() -> None:
    p = plan()
    checks = [check_control(c) for c in cases(p) if c["kind"] == "control"]
    CONTROLS_CHECK.write_text(json.dumps({
        "checkedAt": _iso(datetime.now(timezone.utc)),
        "rule": p["rules"]["controlDay"],
        "controls": checks,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    for c in checks:
        print(f"{c['place']} {c['recording']['from'][:10]}..: FIRMS {c['firmsWithin500Km']}, CWFIS hotspots "
              f"{c['cwfisHotspotsWithin500Km']}, burning fire records {c['burningFireRecordsWithin500Km']} within 500 km; "
              f"AQHI max {c['aqhi']['max']} at {c['aqhi']['stationName']}")


# --- The run ----------------------------------------------------------------------------------------

def answer(case: dict, p: dict) -> dict:
    """The engine's answer, unchanged, for the case's place and check time, from its date's recording."""
    place = point(case)
    client = TestClient(create_app({"replay": ReplayFeeds(replay_dir(case))}))
    response = client.get(
        "/verdict", params={"lat": place.lat, "lon": place.lon, "time": check_time(case, p), "mode": "replay"}
    )
    response.raise_for_status()
    return response.json()


def fire_label(fire: dict | None) -> str | None:
    if fire is None:
        return None
    return f"{fire['name'] or 'near ' + fire['nearCommunity']} ({fire['province']})"


def row(case: dict, body: dict) -> dict:
    approach = body["closestApproach"]
    nearest = body["nearestFire"]
    # The air's path includes its start, your own spot: a fire there is near the path too.
    to_path = ([approach["km"]] if approach else []) + ([nearest["km"]] if nearest else [])
    closest_to_path = min(to_path) if to_path else None
    if case["kind"] == "event":
        match = body["verdict"] in ("drifting", "unclear")
    else:
        match = body["verdict"] == "unexplained" and (closest_to_path is None or closest_to_path > SEARCH_KM)
    return {
        "id": case["id"],
        "kind": case["kind"],
        "place": f"{case['place']}, {case['province']}",
        "time": body["time"],
        "verdict": body["verdict"],
        "confidence": body["confidence"],
        "closestKm": approach["km"] if approach else None,
        "fire": fire_label(approach["fire"]) if approach else None,
        "nearestFire": fire_label(nearest),
        "nearestFireKm": nearest["km"] if nearest else None,
        "noFiresInRange": body["noFiresInRange"],
        "forwardAgrees": body["forward"]["agrees"] if body["forward"] else None,
        "forwardClosestKm": body["forward"]["closestKm"] if body["forward"] else None,
        "chosenHeight": body["heights"]["chosen"],
        "heights": {h: r["closestApproachKm"] for h, r in body["heights"]["results"].items()},
        "aqhi": body["aqhi"]["display"] if body["aqhi"] else None,
        "match": match,
    }


def run() -> list[dict]:
    p = plan()
    ANSWERS.mkdir(parents=True, exist_ok=True)
    rows = []
    for case in cases(p):
        body = answer(case, p)
        (ANSWERS / f"{case['id']}.json").write_text(json.dumps(body, ensure_ascii=False, indent=1), encoding="utf-8")
        rows.append(row(case, body))
    RESULTS.write_text(json.dumps({"rows": rows}, ensure_ascii=False, indent=1), encoding="utf-8")
    return rows


# --- VALIDATION.md ------------------------------------------------------------------------------------

VERDICT_WORDS = {"drifting": "Drifting smoke", "unclear": "Unclear", "unexplained": "Unexplained smoke"}


def plan_commit() -> str:
    """The commit that first added plan.json: the rules as they stood before any run."""
    out = subprocess.run(
        ["git", "log", "--diff-filter=A", "--format=%h", "--", str(PLAN.relative_to(ROOT))],
        cwd=ROOT, capture_output=True, text=True, check=True,
    ).stdout.split()
    return out[-1] if out else "(not committed)"


def cell(value) -> str:
    return "—" if value is None else str(value)


def yes_no(value: bool | None) -> str:
    return "—" if value is None else ("yes" if value else "no")


def miss_sentence(case: dict, r: dict) -> str:
    said = f"{VERDICT_WORDS[r['verdict']].lower()}, {r['confidence']} confidence"
    if case["kind"] == "event":
        blamed = f" The report says the smoke came from {case['source']['fire']}." if case["source"].get("fire") else ""
        if r["noFiresInRange"]:
            why = f"no fire was burning within {FIRE_RADIUS_KM:g} km of {case['place']} in the recorded data"
        elif r["closestKm"] is None:
            why = f"the traced air passed no fire; the nearest fire, {r['nearestFire']}, was {r['nearestFireKm']} km away"
        else:
            why = f"the traced air came no closer than {r['closestKm']} km to a fire ({r['fire']})"
        return f"{case['place']} on {case['date']}: the engine said {said}, because {why}.{blamed}"
    return f"{case['place']} on {case['date']} (control): the engine said {said}; the closest fire to the air's path was {r['closestKm'] or r['nearestFireKm']} km away."


def under_control(records: list[dict]) -> str:
    if not records:
        return "No other fire records."
    stages = {r["stage"] for r in records}
    kind = "under control" if stages == {"UC"} else f"at stage {', '.join(sorted(map(str, stages)))}"
    return (f"{len(records)} fire {'record' if len(records) == 1 else 'records'} {kind}, which the engine does not "
            f"count, the closest {records[0]['km']:g} km away.")


def cite(s: dict) -> str:
    note = f" {s['dateNote']}" if s.get("dateNote") else ""
    return f"{s['publisher']}, {s['published']}, [{s['title']}]({s['url']}): “{s['quote']}”{note}"


def document(p: dict, rows: list[dict], checks: dict) -> str:
    by_id = {c["id"]: c for c in cases(p)}
    events = [r for r in rows if r["kind"] == "event"]
    ctrls = [r for r in rows if r["kind"] == "control"]
    misses = [r for r in rows if not r["match"]]
    rules, ct = p["rules"], p["checkTime"]

    lines = [
        "# Validation on real events",
        "",
        f"We ran the engine, unchanged, on {len(events)} days in 2025 when wildfire smoke was publicly reported in a "
        f"Maritimes community, and on {len(ctrls)} quiet control days. Nothing was tuned for this test: the rules, the "
        f"events and the controls were committed (commit `{plan_commit()}`) before the engine was run on any of them.",
        "",
        "## Rules",
        "",
        f"- {rules['event']}",
        f"- {rules['control']}",
        f"- The check runs at {ct['local']} on the date of the report, which is {ct['utc']} UTC. {ct['why']}",
        "- The place is the community's point in the Canadian Geographical Names Database.",
        "- Each date has its own recording of the sources the live app uses (hourly wind, Canada's active fire "
        "records and satellite hotspots, NASA's archived satellite fire detections, air quality readings), kept raw "
        "with a manifest in `data/replay/`. The engine's full answers are in `data/validation/answers/`.",
        "",
        "## Results",
        "",
        f"{sum(r['match'] for r in events)} of {len(events)} reported smoke events matched. "
        f"{sum(r['match'] for r in ctrls)} of {len(ctrls)} controls matched.",
        "",
        "| Event | Source | Place | Time (UTC) | Verdict | Confidence | Closest km | Fire | Forward trace agrees | Match |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        case = by_id[r["id"]]
        if case["kind"] == "event":
            s = case["source"]
            event, source = case["event"], f"[{s['publisher']}, {s['published']}]({s['url']})"
        else:
            event, source = f"Control: {case['event'].lower()}", "[control check](#controls)"
        lines.append(
            f"| {event} | {source} | {r['place']} | {r['time'][:16].replace('T', ' ')} | "
            f"{VERDICT_WORDS[r['verdict']]} | {r['confidence'].capitalize()} | {cell(r['closestKm'])} | "
            f"{r['fire'] or ('none within 500 km' if r['noFiresInRange'] else '—')} | {yes_no(r['forwardAgrees'])} | "
            f"{'yes' if r['match'] else 'no'} |"
        )
    lines += [
        "",
        "Closest km is how close the air's path, traced back 24 hours, came to that fire. The forward trace follows "
        "the fire's smoke forward to the time of the check; it agrees when the smoke came within 25 km of the place. "
        "It never changes the verdict.",
        "",
        "## Misses",
        "",
        " ".join(miss_sentence(by_id[r["id"]], r) for r in misses) if misses else "None.",
        "",
        "## Events",
        "",
        rules["selection"],
        "",
    ]
    for case in (c for c in cases(p) if c["kind"] == "event"):
        lines.append(f"- **{case['place']}, {case['province']}, {case['date']}.** {cite(case['source'])}")
        lines += [f"  Also: {cite(s)}" for s in case.get("more", [])]
    lines += ["", "Found but not run:", ""]
    lines += [f"- {n['report']}. {n['why']}" for n in p["notRun"]]
    lines += ["", "## Controls", "", rules["controlDay"], ""]
    for c in checks["controls"]:
        case = by_id[c["id"]]
        firms = sum(v["rows"] for v in c["firms"].values())
        lines.append(
            f"- **{c['place']}, {case['date']}.** Over the recording ({c['recording']['from']} to "
            f"{c['recording']['to']}), within 500 km: {c['firmsWithin500Km']} of the {firms} NASA satellite detections "
            f"in the region, {c['cwfisHotspotsWithin500Km']} of the {c['cwfisHotspots']} Canadian hotspots, and "
            f"{c['burningFireRecordsWithin500Km']} of the {c['burningFireRecords']} fire records out of control or being "
            f"held. {under_control(c['otherFireRecordsWithin500Km'])} Highest AQHI at {c['aqhi']['stationName']} "
            f"({c['aqhi']['stationKm']:g} km away): {c['aqhi']['max']:g}. {case['why']}"
        )
    lines += ["", f"Checked on {checks['checkedAt']}, before the engine ran.", ""]
    return "\n".join(lines)


def main() -> None:
    if sys.argv[1:] == ["controls"]:
        controls()
        return
    rows = run()
    OUT.write_text(document(plan(), rows, json.loads(CONTROLS_CHECK.read_text(encoding="utf-8"))), encoding="utf-8")
    for r in rows:
        print(" | ".join(cell(r[k]) for k in ("id", "verdict", "confidence", "closestKm", "fire", "forwardAgrees", "match")))


if __name__ == "__main__":
    main()
