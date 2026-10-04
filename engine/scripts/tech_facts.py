"""Write TECH-FACTS.md at the repo root. Every number in it is read from the code, the data in data/,
the engine's own answer, or an actual run of the test suites; none is typed by hand.

    uv run python -m scripts.tech_facts     (from engine/; runs all three test suites, a few minutes)
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import tomllib
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from scripts import build_counties, build_demo, build_places, validate
from smoke_engine import aqhi, burn, detections, fires, forward, places, trajectory, verdict, wind
from smoke_engine.app import HOURS_BACK, REPLAY_TIME, create_app
from smoke_engine.feeds import live, sources
from smoke_engine.feeds.replay import REPLAY_DIR, ReplayFeeds

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "TECH-FACTS.md"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def load(path: str):
    return json.loads(read(path))


def num(x: float) -> str:
    return f"{x:g}"


def span(t: timedelta) -> str:
    minutes = int(t.total_seconds() // 60)
    if minutes % 60:
        return f"{minutes} minutes" if minutes != 1 else "1 minute"
    return f"{minutes // 60} hours" if minutes != 60 else "1 hour"


def listed(items) -> str:
    items = [str(i) for i in items]
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]


def verdict_words(result: tuple[str, str]) -> str:
    return f"{result[0].capitalize()}, {result[1].capitalize()}"


# --- Architecture ---------------------------------------------------------------------------------

def architecture() -> dict:
    render = read("render.yaml")
    field = lambda name: re.search(rf"^\s*{name}:\s*(\S+)", render, re.M).group(1)  # noqa: E731
    python_version = re.search(r"key: PYTHON_VERSION\s+value: \"([^\"]+)\"", render).group(1)
    engine_url = re.search(r"VITE_ENGINE_URL=(\S+)", read("web/.env.production")).group(1)
    site_url = re.search(r"baseURL: process\.env\.SITE_URL \?\? \"([^\"]+)\"", read("web/playwright.real.config.ts")).group(1)
    pyproject = tomllib.loads(read("engine/pyproject.toml"))
    locked = {p["name"]: p["version"] for p in tomllib.loads(read("engine/uv.lock"))["package"]}
    engine_libs = [re.match(r"[A-Za-z0-9_.-]+", d).group(0) for d in pyproject["project"]["dependencies"]]
    package = load("web/package.json")
    npm_locked = load("web/package-lock.json")["packages"]
    web_libs = list(package["dependencies"]) + ["vite", "typescript"]
    test_libs = ["vitest", "@playwright/test"]
    return {
        "service": field("name"),
        "plan": field("plan"),
        "region": field("region"),
        "python": python_version,
        "requires_python": pyproject["project"]["requires-python"],
        "engine_url": engine_url,
        "site_url": site_url,
        "engine_libs": [f"{name} {locked[name]}" for name in engine_libs],
        "pytest": f"pytest {locked['pytest']}",
        "web_libs": [f"{name} {npm_locked[f'node_modules/{name}']['version']}" for name in web_libs],
        "test_libs": [f"{name} {npm_locked[f'node_modules/{name}']['version']}" for name in test_libs],
    }


# --- Data -------------------------------------------------------------------------------------------

def data_facts() -> dict:
    manifest = load(f"data/replay/{REPLAY_DIR.name}/manifest.json")
    replay_wind = json.loads((REPLAY_DIR / "wind.json").read_text(encoding="utf-8"))
    hours = replay_wind[0]["hourly"]["time"]
    firms_rows = {
        f.stem: len(f.read_text(encoding="utf-8").strip().splitlines()) - 1 for f in sorted((REPLAY_DIR / "firms").glob("*.csv"))
    }
    communities = load("data/places/communities.json")["places"]
    by_province = {code: sum(1 for c in communities if c[5] == code) for code in build_places.PROVINCE_CODES.values()}
    areas = load("data/places/areas.geojson")["features"]
    return {
        "firms_rows": firms_rows,
        "firms_missing": manifest["firms"]["missing"],
        "hotspots": len(json.loads((REPLAY_DIR / "hotspots.json").read_text(encoding="utf-8"))["features"]),
        "active_fires": len(json.loads((REPLAY_DIR / "active-fires.json").read_text(encoding="utf-8"))["features"]),
        "aqhi_stations": len(json.loads((REPLAY_DIR / "aqhi-stations.json").read_text(encoding="utf-8"))["features"]),
        "aqhi_readings": len(json.loads((REPLAY_DIR / "aqhi-readings.json").read_text(encoding="utf-8"))["features"]),
        "aqhi_source": manifest["files"]["aqhi-readings.json"]["source"],
        "alerts": manifest["files"]["alerts.json"],
        "wind_points": len(replay_wind),
        "wind_hours": len(hours),
        "wind_first": hours[0],
        "wind_last": hours[-1],
        "communities": len(communities),
        "communities_by_province": by_province,
        "land": sorted(f["properties"]["code"] for f in areas if f["properties"]["kind"] == "land"),
        "water": sorted(f["properties"]["code"] for f in areas if f["properties"]["kind"] == "water"),
        "fire_names": len(load("data/places/fire-names.json")["fires"]),
        "demo_towns": len(load("data/demo/index.json")["towns"]),
    }


def aqhi_bands() -> list[str]:
    """The AQHI levels of each category, as the engine's Reading sorts levels 1 to 11 and shows them."""
    reading = lambda level: aqhi.Reading(station=None, value=level, observed_at=None)  # noqa: E731
    bands: dict[str, list[str]] = {}
    for level in range(1, 12):
        bands.setdefault(reading(level).category, []).append(reading(level).display)
    return [f"{c.replace('_', ' ')} {v[0]}–{v[-1]}" if len(v) > 1 else f"{c.replace('_', ' ')} {v[0]}" for c, v in bands.items()]


# --- Moncton replay -----------------------------------------------------------------------------------

def moncton() -> tuple:
    """The engine's answer for Moncton at its CGNDB point, as in data/demo/moncton.json."""
    place = build_demo.official_point("Moncton", "NB")
    client = TestClient(create_app({"replay": ReplayFeeds()}))
    body = client.get(
        "/verdict", params={"lat": place.lat, "lon": place.lon, "time": build_demo.REPLAY_TIME, "mode": "replay"}
    ).json()
    if body != load("data/demo/moncton.json"):
        raise SystemExit("data/demo/moncton.json is not the engine's current answer: run scripts.build_demo first")
    return place, body


def merges() -> dict:
    """CWFIS rows merged into FIRMS detections over the 24 hours before the replay check, as the engine fuses them."""
    feeds = ReplayFeeds()
    since = REPLAY_TIME - timedelta(hours=fires.HOTSPOT_HOURS)
    cwfis = [d for d in detections.cwfis_detections(feeds.hotspots(since, REPLAY_TIME)) if d.time <= REPLAY_TIME]
    firms = [d for d in detections.firms_detections(feeds.firms(since, REPLAY_TIME)) if d.time <= REPLAY_TIME]
    matches = detections.match(firms, cwfis)
    in_window = lambda i: since < firms[i].time <= REPLAY_TIME  # noqa: E731
    twins = sum(len(rows) for i, rows in matches.twins.items() if in_window(i))
    same = sum(1 for i in matches.same_satellite if in_window(i))
    return {"twins": twins, "same_satellite": same, "total": twins + same}


# --- Validation on real events ------------------------------------------------------------------------

def validation() -> dict:
    """The validation table in VALIDATION.md, re-run: every saved answer must still be the engine's answer."""
    p = validate.plan()
    for case in validate.cases(p):
        if validate.answer(case, p) != load(f"data/validation/answers/{case['id']}.json"):
            raise SystemExit(f"data/validation/answers/{case['id']}.json is not the engine's current answer: run scripts.validate first")
    return {"plan": p, "rows": load("data/validation/results.json")["rows"], "commit": validate.plan_commit()}


# --- Tests ------------------------------------------------------------------------------------------

def _run(command: list[str], cwd: Path, env: dict | None = None) -> None:
    subprocess.run([shutil.which(command[0]) or command[0], *command[1:]], cwd=cwd, env=env, check=False,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def test_counts(tmp: Path) -> dict:
    report = tmp / "pytest.xml"
    _run([sys.executable, "-m", "pytest", "-q", f"--junitxml={report}"], ROOT / "engine")
    suite = ET.parse(report).getroot()
    suite = suite if suite.tag == "testsuite" else suite.find("testsuite")
    failed = int(suite.get("failures")) + int(suite.get("errors"))
    engine = {"passed": int(suite.get("tests")) - failed - int(suite.get("skipped")), "failed": failed, "skipped": int(suite.get("skipped"))}

    report = tmp / "vitest.json"
    _run(["npx", "vitest", "run", "--reporter=json", f"--outputFile={report}"], ROOT / "web")
    result = json.loads(report.read_text(encoding="utf-8"))
    unit = {"passed": result["numPassedTests"], "failed": result["numFailedTests"], "skipped": result["numPendingTests"] + result["numTodoTests"]}

    report = tmp / "playwright.json"
    projects = ["flow", "small-screens"]  # what `npm run e2e` runs
    _run(["npx", "playwright", "test", *(f"--project={p}" for p in projects), "--reporter=json"], ROOT / "web",
         env={**os.environ, "PLAYWRIGHT_JSON_OUTPUT_NAME": str(report)})
    stats = json.loads(report.read_text(encoding="utf-8"))["stats"]
    browser = {"passed": stats["expected"], "failed": stats["unexpected"] + stats["flaky"], "skipped": stats["skipped"], "projects": projects}
    return {"engine": engine, "unit": unit, "browser": browser}


def outcome(counts: dict) -> str:
    parts = [f"{counts['passed']} passed"]
    if counts["failed"]:
        parts.append(f"{counts['failed']} failed")
    if counts["skipped"]:
        parts.append(f"{counts['skipped']} skipped")
    return ", ".join(parts)


# --- The document ---------------------------------------------------------------------------------

def validation_lines(v: dict) -> list[str]:
    events = [r for r in v["rows"] if r["kind"] == "event"]
    controls = [r for r in v["rows"] if r["kind"] == "control"]
    check = v["plan"]["checkTime"]
    return [
        "## Validation on real events",
        "",
        f"From [VALIDATION.md](VALIDATION.md): the engine, unchanged, on {len(events)} days in 2025 with a public report of "
        f"wildfire smoke in a named Maritimes community, and {len(controls)} control days with no smoke report and nothing "
        f"detected within {num(fires.FIRE_RADIUS_KM)} km. Each check ran at {check['utc']} UTC, {check['local']}, on the "
        f"date of the report, from that date's own recording in `data/replay/`. Rules, events and controls were committed "
        f"in `{v['commit']}`, before any run.",
        "",
        f"- Reported smoke events matched (drifting or unclear): {sum(r['match'] for r in events)} of {len(events)}.",
        f"- Controls matched (unexplained, no fire within {num(verdict.SEARCH_KM)} km of the path): "
        f"{sum(r['match'] for r in controls)} of {len(controls)}.",
        "",
        "| Case | Verdict | Confidence | Closest km | Fire | `forward.agrees` | Match |",
        "|---|---|---|---|---|---|---|",
        *(
            f"| {r['place']}, {r['time'][:10]}{' (control)' if r['kind'] == 'control' else ''} | {r['verdict']} | "
            f"{r['confidence'].capitalize()} | {validate.cell(r['closestKm'])} | {validate.fire_cell(r)} | "
            f"{validate.cell(None if r['forwardAgrees'] is None else str(r['forwardAgrees']).lower())} | "
            f"{'yes' if r['match'] else 'no'} |"
            for r in v["rows"]
        ),
        "",
        *(
            f"† {site['name'][0].upper() + site['name'][1:]} ({site['lat']}, {site['lon']}), not a wildfire: NASA "
            f"labels most of its detections type 2, “static land source”, and the engine does not read FIRMS's `type` field."
            for site in validate.SITES if any(r["fireSite"] == site["name"] for r in v["rows"])
        ),
        "",
    ]


def document(arch: dict, data: dict, place, body: dict, merged: dict, tests: dict, ran_at: str, valid: dict) -> str:
    heights = wind.HEIGHTS
    step_hours = num(trajectory.STEP_S / 3600)
    lat_range = f"{num(wind.GRID_LAT_MIN)}°N to {num(wind.GRID_LAT_MAX)}°N"
    lon_range = f"{num(abs(wind.GRID_LON_MIN))}°W to {num(abs(wind.GRID_LON_MAX))}°W"
    grid = f"{len(wind.GRID_LATS)} × {len(wind.GRID_LONS)} = {len(wind.GRID_POINTS)} points"
    table_rows = [
        (f"≤ {num(verdict.HIGH_CONFIDENCE_KM)} km", verdict.HIGH_CONFIDENCE_KM),
        (f"over {num(verdict.HIGH_CONFIDENCE_KM)}, up to {num(verdict.DRIFTING_KM)} km", verdict.DRIFTING_KM),
        (f"over {num(verdict.DRIFTING_KM)}, up to {num(verdict.SEARCH_KM)} km", verdict.SEARCH_KM),
        (f"over {num(verdict.SEARCH_KM)} km, or no fire", None),
    ]
    lower = ", ".join(f"{a} → {b}" for a, b in verdict.LOWER_CONFIDENCE.items())

    fire = body["closestApproach"]["fire"]
    results = body["heights"]["results"]
    seen = fire["lastSeen"]
    fwd = body["forward"]
    aq = body["aqhi"]
    alert = body["alerts"]["airQuality"]
    by_source = fire["detections"]["bySource"]
    satellites = fire["detections"]["satellites"]

    lines = [
        "# Tech facts",
        "",
        f"Generated by `engine/scripts/tech_facts.py` on {ran_at} from the code, the data in `data/`, the engine's own "
        "answer and actual test runs. No number here is typed by hand. To regenerate: `uv run python -m scripts.tech_facts` "
        "(from `engine/`).",
        "",
        "## Architecture",
        "",
        "| Part | Runs on | Language | Main libraries (locked versions) |",
        "|---|---|---|---|",
        f"| Verdict engine, `engine/` (`GET /verdict`) | Render web service `{arch['service']}`, {arch['plan']} plan, region "
        f"{arch['region']} (`render.yaml`): {arch['engine_url']} | Python {arch['python']} on Render (`requires-python "
        f"{arch['requires_python']}`) | {', '.join(arch['engine_libs'])}; tests: {arch['pytest']} |",
        f"| Web app, `web/` | Vercel (`web/public/vercel.json`): {arch['site_url']} | TypeScript (React) | "
        f"{', '.join(arch['web_libs'])}; tests: {', '.join(arch['test_libs'])} |",
        "",
        "- The traces, fire clustering, verdict, confidence and forward trace are all computed in Python by the engine. "
        "Every verdict, path and distance the web app shows comes from the engine's answer; the app projects the "
        "returned points onto a static map of bundled outlines with d3-geo.",
        f"- Live mode calls `GET /verdict` on the engine. Replay mode never calls it: the web app bundles the engine's "
        f"saved answers for {data['demo_towns']} towns (`data/demo/`, written by `engine/scripts/build_demo.py` from "
        "the recorded data in `data/replay/`).",
        "",
        "## Method",
        "",
        "### The air, traced backward from you",
        "",
        f"- Starts at your point at the time of the check and steps back {step_hours} hour at a time, for up to "
        f"{HOURS_BACK} steps (`smoke_engine/trajectory.py`).",
        "- Integration: Heun predictor-corrector. Each step makes a first guess with the wind at the current point, "
        "then moves from the current point with the average of the wind there and at the guess. Positions move on a "
        f"sphere of radius {trajectory.EARTH_RADIUS_M / 1000:g} km.",
        f"- Heights: {listed(f'`{h}`' for h in heights)}, each traced separately.",
        f"- Wind: Open-Meteo, weather model `{wind.WIND_MODEL}`, hourly speed and direction on a {num(wind.GRID_STEP)}° "
        f"grid from {lat_range} and {lon_range}: {grid}. Between grid points and hours the wind is interpolated "
        "(bilinear in space, linear in time). A trace stops where its next point would leave the grid.",
        f"- Wind steadiness: the circular standard deviation of the hourly wind direction along the path; above "
        f"{num(trajectory.UNSTEADY_ABOVE_DEG)}° is unsteady.",
        "",
        "### Fires near the path",
        "",
        f"- Fires within {num(fires.FIRE_RADIUS_KM)} km of you: CWFIS active fire records at stage "
        f"{listed(f'`{s}`' for s in sorted(fires.BURNING_STAGES))} (being held, out of control; under control is left "
        "out), and satellite detections from the "
        f"{fires.HOTSPOT_HOURS} hours before the check. Detections within {num(fires.CLUSTER_KM)} km of each other chain "
        f"into one fire; a CWFIS record within {num(fires.CLUSTER_KM)} km joins that fire.",
        f"- Detections kept: VIIRS nominal and high confidence (low is dropped); MODIS confidence "
        f"{detections.MODIS_MIN_CONFIDENCE} or more on FIRMS's scale.",
        f"- One observation, counted once: a CWFIS hotspot within {num(detections.TWIN_KM * 1000)} m of a FIRMS detection "
        f"with the same fire radiative power (within {num(detections.TWIN_FRP_MW)} MW) is that detection, republished; "
        f"otherwise a CWFIS hotspot from the same satellite within {num(detections.FUSE_KM)} km and "
        f"{detections.FUSE_MINUTES} minutes of a FIRMS detection merges into it. Detections from different satellites "
        "are separate observations.",
        "- Closest approach: the shortest distance between the path's hourly segments and each fire's points. A fire "
        "counts only if its closest point on the path comes after the start: a fire whose closest point is your own "
        "position is reported as the nearest fire, not as the air's source.",
        "",
        "### Verdict and confidence",
        "",
        "The table in [design/DESIGN-LOCK.md](design/DESIGN-LOCK.md), as `smoke_engine/verdict.py` computes it:",
        "",
        "| Closest approach | Wind steady | Wind unsteady |",
        "|---|---|---|",
        *(f"| {label} | {verdict_words(verdict.classify(km, True))} | {verdict_words(verdict.classify(km, False))} |" for label, km in table_rows),
        "",
        f"- The height whose path came closest to a fire gives the verdict. When the {len(heights)} heights do not all "
        f"give the same verdict, confidence is one level lower ({lower}).",
        "- Confidence is only ever High, Medium or Low.",
        f"- No active fire within {num(fires.FIRE_RADIUS_KM)} km: unexplained smoke, with no fire shown (screen 7d).",
        "",
        "### The fire's smoke, traced forward",
        "",
        "- The fire: the closest approach's fire for drifting smoke and unclear, the nearest fire for unexplained smoke, "
        "none when no fire is in range.",
        f"- Smoke leaves the fire every hour over the {forward.RELEASE_HOURS} hours before the check, at each "
        f"of the {len(heights)} heights: {forward.RELEASE_HOURS * len(heights)} paths, each followed forward with the "
        "same integrator and wind grid until the time of the check or the grid edge (`smoke_engine/forward.py`).",
        f"- `forward.closestKm` is the smallest distance from any path segment to you, with its release time and height. "
        f"`forward.agrees` is true when it is {num(forward.AGREES_KM)} km or less. A path whose closest point to you is "
        "the fire itself (its smoke moved away from you) never makes it agree.",
        "- Informational only: it is computed after the verdict and never changes the verdict or the confidence "
        "(`test_the_forward_trace_never_changes_the_verdict` in `engine/tests/test_verdict_api.py`). The answer carries "
        f"the {forward.RELEASE_HOURS} paths of the closest height.",
        "",
        "## Data sources",
        "",
        "| Source | What the engine takes from it | Limits |",
        "|---|---|---|",
        f"| NASA FIRMS | Satellite fire detections (VIIRS and MODIS): position, acquisition time (UTC), satellite, "
        f"instrument, confidence, fire radiative power, and the processing class from its version (URT, RT, NRT or SP). "
        f"Live: {listed(f'`{s}`' for s in sources.FIRMS_LIVE_SOURCES)} over the wind grid (`{sources.FIRMS_BBOX}`), "
        f"fetched every {span(live.FIRMS_REFRESH_EVERY)}. Replay: the archive files "
        f"{listed(f'`{k}` ({v} rows)' for k, v in data['firms_rows'].items())}. | Needs a MAP_KEY; without one, live "
        f"verdicts use CWFIS alone. When the last good fetch is {span(live.FIRMS_MAX_AGE)} old, FIRMS counts as down. "
        f"{listed(f'`{k}`: {v}' for k, v in data['firms_missing'].items())}. The `type` field (vegetation fire, "
        "static land source, offshore) is not read: an industrial heat source counts as a fire (see VALIDATION.md). |",
        f"| NRCan CWFIS | Active fire records (national ID, stage of control, size, position, validity period) and "
        f"satellite hotspots (fields `{sources.HOTSPOT_FIELDS}`). Replay: {data['active_fires']} active fire rows and "
        f"{data['hotspots']} hotspots. | Hotspots carry only a report time (`rep_date`), never used as when a satellite "
        "saw a fire. CWFIS has no fire names: a name comes from `data/places/fire-names.json` "
        f"({data['fire_names']} {'entry' if data['fire_names'] == 1 else 'entries'}) within {num(places.FIRE_NAME_WITHIN_KM)} km, "
        f"same year. Live answers are cached "
        f"{span(live.CACHE_FOR)}. |",
        f"| ECCC AQHI | Stations (ID, English and French names, position) and AQHI observations (time, value). Replay: "
        f"{data['aqhi_stations']} stations and {data['aqhi_readings']} readings from: {data['aqhi_source']}. | The nearest "
        f"station only, and only a reading at most {span(aqhi.MAX_AGE)} old at the check; otherwise no reading is shown. "
        f"Categories: {', '.join(aqhi_bands())}. |",
        f"| ECCC weather alerts | The air-quality alert in effect at your point: its code, its English and French name, "
        f"its colour, the forecast zone, and when it was issued and expires. Live: `{sources.ECCC_ALERTS}` (MSC GeoMet "
        f"OGC API, collection `weather-alerts`), asked at every check with a box of one point, never cached, with "
        f"{num(live.ALERTS_TIMEOUT)} seconds to answer. Replay: {data['alerts']['features']} zone records from "
        f"{data['alerts']['messages']} messages, covering {data['alerts']['covers'][0]} to {data['alerts']['covers'][1]}: "
        f"{data['alerts']['source']}. | Three answers only: active, none in effect, not checked. Not checked when ECCC "
        "does not answer, answers with anything but a whole list of alerts, lists an air-quality alert with a status "
        "never seen before or past its expiry, the point is outside Canada (ECCC lists nothing there; in the strip "
        "along the border, where the map's outlines cannot tell, only an alert ECCC lists there is taken as an answer), "
        "or the check is for a time ECCC's list does not cover: live, any time but now; replay, any time outside the "
        "recorded messages. ECCC keeps no "
        "past alerts: the replay's are ECCC's own CAP-CP messages, converted from the copies the NAAD System archive "
        f"keeps (`{sources.NAAD_ARCHIVE}`). Informational only: it never changes the verdict or the confidence "
        "(`test_the_alert_never_changes_the_verdict` in `engine/tests/test_alerts.py`). |",
        f"| Government of New Brunswick, burn categories | Each county's burn category of the day (no burn; restricted "
        f"burn, 8 p.m. to 8 a.m.; burn permitted) and the end of its validity, for the card \"Is burning allowed "
        f"today?\". Live: `{sources.GNB_BURN_SERVICE}` (the layers GNB's Fire Watch dashboard draws; no key), the list "
        f"of all {len(burn._counties())} counties, kept for {num(live.CACHE_FOR.total_seconds() / 60)} minutes, with "
        f"{num(live.BURN_TIMEOUT)} seconds in all to answer; the person's point is never sent. The county is the one "
        f"whose outline holds the point: the province's own outlines, bundled in `data/places/nb-counties.geojson` "
        f"({sum(len(ring) for _, polygons in burn._counties() for _, outer, holes in polygons for ring in (outer, *holes))} "
        f"points; {len(build_counties.IN_MAINE)} islets of the layer that are in Maine are left out). Replay: none, the "
        f"province keeps no past categories. | Five answers only: the three categories, fire season closed, not "
        f"checked. A category the province gives is shown whatever the date. Fire season closed: the province lists "
        f"the county with no category, from November to March. Not checked when the province does not answer, its "
        f"answer is not the {len(burn._counties())} counties each once, a category is not named word for word as it "
        f"was, the category is over {num(24 + burn.LATE_UPDATE.total_seconds() / 3600)} hours old or dated more than "
        f"{num(burn.FURTHEST_AHEAD.total_seconds() / 3600)} hours ahead, the county has no category from April to "
        f"October, a town's point is in another county than the names database lists, or a phone's point is within "
        f"{num(burn.NEAR_LINE_KM)} km of a county with another answer. Hidden outside New Brunswick. The service states "
        "no licence. Informational only: it never changes the verdict or the confidence "
        "(`test_the_burn_status_never_changes_the_verdict` in `engine/tests/test_burn.py`). |",
        f"| Open-Meteo | Hourly wind speed and direction at {listed(f'`{h}`' for h in heights)}, weather model "
        f"`{wind.WIND_MODEL}`, at {len(wind.GRID_POINTS)} grid points. Live: refreshed every "
        f"{span(live.WIND_REFRESH_EVERY)}. Replay: {data['wind_points']} points × {data['wind_hours']} hours, "
        f"{data['wind_first']} to {data['wind_last']} UTC. The newest model run in the live winds is read from "
        f"`{sources.OPEN_METEO_MODEL_RUN}`; recorded winds name the day they were downloaded instead. | The free tier allows {sources.OPEN_METEO_POINTS_PER_MINUTE} "
        f"calls a minute and each grid point is one call. Traces stop at the grid edge ({lat_range}, {lon_range}). |",
        f"| NRCan CGNDB | Populated places for town names and \"fire near …\": {data['communities']} places "
        f"({listed(f'{v} in {k}' for k, v in data['communities_by_province'].items())}). | Only places in "
        f"{listed(build_places.PROVINCE_CODES)}. |",
        f"| Natural Earth | Outlines of {listed(f'`{c}`' for c in data['land'])} (land) and "
        f"{listed(f'`{c}`' for c in data['water'])} (water): the map, and the area names in the text. | A point over "
        "open water outside the named water bodies has no area name. |",
        "",
        f"## Moncton replay ({body['time']})",
        "",
        f"The engine's answer for Moncton at its CGNDB point ({place.lat}, {place.lon}), identical to "
        "`data/demo/moncton.json`. Distances are the engine's whole kilometres.",
        "",
        f"- Verdict: {body['verdict']}; confidence: {body['confidence'].capitalize()}.",
        f"- Chosen height: `{body['heights']['chosen']}`; heights agree: {str(body['heights']['agree']).lower()}.",
        "",
        "| Height | Closest approach to a fire | Verdict at that height | Wind steady |",
        "|---|---|---|---|",
        *(
            f"| `{h}` | {r['closestApproachKm']} km | {verdict_words((r['verdict'], r['confidence']))} | {str(r['steady']).lower()} |"
            for h, r in results.items()
        ),
        "",
        f"- The air: traced back {body['path']['hoursTraced']} hours (stopped at the grid edge: "
        f"{str(body['path']['stoppedAtGridEdge']).lower()}); closest to the fire {body['closestApproach']['km']} km, "
        f"about {body['closestApproach']['hoursAgo']} hours before the check.",
        f"- The fire: {fire['name']} ({fire['locality']}, {fire['province']}), {fire['km']} km {fire['compass']} of Moncton.",
        f"- Satellites that saw {fire['name']} in the {fires.HOTSPOT_HOURS} hours: {listed(satellites)} ({len(satellites)}).",
        f"- {fire['name']} detections: {fire['detections']['total']} in all: {by_source['FIRMS']} from FIRMS only, "
        f"{by_source['CWFIS']} from CWFIS only, {by_source['both']} FIRMS detections with a CWFIS row merged in.",
        f"- Merges over the {fires.HOTSPOT_HOURS} hours before the check (all detections in the region): {merged['total']} CWFIS rows, "
        f"{merged['twins']} of them republished FIRMS detections (twins) and {merged['same_satellite']} same-satellite "
        "duplicates.",
        f"- Last seen: {seen['satellite']} ({seen['instrument']}) at {seen['time']}, {seen['minutesAgo']} minutes before "
        f"the check; processing class {seen['latencyClass']}.",
        f"- Forward trace: `closestKm` {fwd['closestKm']}, `agrees` {str(fwd['agrees']).lower()} (released at "
        f"{fwd['closestReleasedAt']}, height `{fwd['closestHeight']}`, {len(fwd['paths'])} paths returned).",
        f"- AQHI: {aq['display']} ({aq['category'].replace('_', ' ')}) at {aq['station']['nameEn']} "
        f"(station {aq['station']['id']}, {aq['station']['km']} km away), observed {aq['observedAt']}.",
        f"- ECCC air-quality alert: {alert['state']}"
        + (f": {alert['alert']['nameEn']} for {alert['alert']['zoneEn']}, issued {alert['alert']['issued']} "
           f"(recorded message: {alert['alert']['url']})." if alert["alert"] else "."),
        f"- Burning allowed today: {body['burn']['state'].replace('_', ' ')} for {body['burn']['county']} County "
        "(no burn category was recorded: the province keeps no past ones).",
        "",
        *validation_lines(valid),
        "## Tests",
        "",
        f"From an actual run on {ran_at}:",
        "",
        f"- Engine (pytest, `engine/tests/`): {outcome(tests['engine'])}.",
        f"- Web unit (Vitest, `web/src/**/*.test.ts`): {outcome(tests['unit'])}.",
        f"- Browser (Playwright, `web/e2e/`, projects {listed(tests['browser']['projects'])}, as `npm run e2e`): "
        f"{outcome(tests['browser'])}.",
        "",
        "## Hurdles",
        "",
        "See [HURDLES.md](HURDLES.md).",
        "",
    ]
    return "\n".join(lines)


SNOWFLAKE = re.compile(r"<!-- snowflake:start -->.*?<!-- snowflake:end -->\n", re.S)


def with_snowflake(text: str, previous: str) -> str:
    """The Snowflake section is written by analytics/scripts/report.py, which needs Snowflake to run: it is carried
    over from the previous TECH-FACTS.md as it is, before "## Tests", where report.py puts it."""
    found = SNOWFLAKE.search(previous.replace("\r\n", "\n"))
    if not found:
        return text
    before, after = text.split("\n## Tests", 1)
    return before.rstrip("\n") + "\n\n" + found.group(0) + "\n## Tests" + after


def main() -> None:
    ran_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    place, body = moncton()
    valid = validation()
    with tempfile.TemporaryDirectory() as tmp:
        tests = test_counts(Path(tmp))
    previous = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
    text = document(architecture(), data_facts(), place, body, merges(), tests, ran_at, valid)
    OUT.write_text(with_snowflake(text, previous), encoding="utf-8")
    print(f"{OUT.name}: engine {outcome(tests['engine'])}; web unit {outcome(tests['unit'])}; browser {outcome(tests['browser'])}")


if __name__ == "__main__":
    main()
