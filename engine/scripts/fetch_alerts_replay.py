"""One-time download of ECCC's air-quality alert messages for a replay day, converted for the engine.

    uv run python -m scripts.fetch_alerts_replay 2025-08-25 --name moncton-2025-08-25     (from engine/)

ECCC's own alerts service (the `weather-alerts` collection the live mode asks) lists only what is in
effect now, and its file servers keep about a month. The messages of a past day are still public in
the NAAD System archive (https://alertsarchive.pelmorex.com), the national alert aggregator's copy of
each CAP-CP message as ECCC sent it (sender cap-pac@canada.ca). This script reads the archive's
lists for the day, the two days before and the day after, keeps ECCC's air-quality messages for
zones on the wind grid, and saves them as data/replay/<name>/alerts.json in the `weather-alerts`
shape, one feature per message and forecast zone. Nothing is added to a message: every value is one
of its own, and the mapping is below. manifest.json records the source and the word "converted".

    alert_code                the code in Parent_URI (SAS: special air quality statement, AQW: air quality warning)
    alert_type                Alert_Type
    alert_name_en / _fr       Alert_Name of the en-CA and fr-CA blocks
    status_en                 "ended" when Alert_Location_Status is ended, else "issued" (msgType Alert) or "continued" (Update)
    publication_datetime      <sent>
    expiration_datetime       <expires>
    feature_id                the zone's CLC code
    feature_name_en / _fr     <areaDesc> of the en-CA and fr-CA blocks
    geometry                  <polygon>, as [longitude, latitude] pairs
    source_url                the archived message
"""

import argparse
import json
import re
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote
from xml.etree import ElementTree

import httpx

from smoke_engine.feeds import sources
from smoke_engine.feeds.replay import REPLAY_DIR
from smoke_engine.wind import inside_grid

CAP = "{urn:oasis:names:tc:emergency:cap:1.2}"
ECCC_MESSAGE = "urn&3oid&32.49.0.1.124."  # ECCC's identifiers (urn:oid:2.49.0.1.124.…), as the archive writes them in file names
ECCC_SENDER = "cap-pac@canada.ca"
DAYS_BEFORE, DAYS_AFTER = 2, 1
PAUSE = 0.15  # seconds between downloads


def _z(text: str) -> str:
    return datetime.fromisoformat(text).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _values(element, tag: str) -> dict[str, str]:
    """The <parameter> or <geocode> pairs of an element, by the last part of their name (…:Alert_Name)."""
    pairs = {}
    for item in element.findall(CAP + tag):
        pairs[item.findtext(CAP + "valueName").rsplit(":", 1)[-1]] = item.findtext(CAP + "value")
    return pairs


def features(xml: bytes, url: str) -> list[dict]:
    """The air-quality zones of one ECCC message on the wind grid, one feature each. [] for any other message."""
    alert = ElementTree.fromstring(xml)
    if alert.findtext(CAP + "sender") != ECCC_SENDER or alert.findtext(CAP + "status") != "Actual":
        return []
    identifier, message_type = alert.findtext(CAP + "identifier"), alert.findtext(CAP + "msgType")
    zones: dict[str, dict] = {}
    for info in alert.findall(CAP + "info"):
        if _values(info, "eventCode").get("0.4") != "airQuality":
            continue
        language = info.findtext(CAP + "language")[:2]
        parameters = _values(info, "parameter")
        # …/WO_24_84_CWHX/SAS/1230264701891616725202508240506_WO_24_84_CWHX/…
        code = re.search(rf"/{re.escape(parameters['Designation_Code'])}/([A-Z]+)/", parameters["Parent_URI"]).group(1)
        ended = parameters["Alert_Location_Status"] == "ended" or message_type == "Cancel"
        for area in info.findall(CAP + "area"):
            ring = [[float(lon), float(lat)] for lat, lon in (pair.split(",") for pair in area.findtext(CAP + "polygon").split())]
            if not any(inside_grid(lat, lon) for lon, lat in ring):
                continue
            zone = _values(area, "geocode")["CLC"]
            feature = zones.setdefault(zone, {
                "type": "Feature",
                "id": f"{identifier}_{zone}",
                "geometry": {"type": "Polygon", "coordinates": [ring]},
                "properties": {
                    "alert_code": code,
                    "alert_type": parameters["Alert_Type"],
                    "status_en": "ended" if ended else "issued" if message_type == "Alert" else "continued",
                    "publication_datetime": _z(alert.findtext(CAP + "sent")),
                    "expiration_datetime": _z(info.findtext(CAP + "expires")),
                    "feature_id": zone,
                    "source_url": url,
                },
            })
            feature["properties"][f"alert_name_{language}"] = parameters["Alert_Name"]
            feature["properties"][f"feature_name_{language}"] = area.findtext(CAP + "areaDesc")
    return list(zones.values())


def _get(client: httpx.Client, method: str, url: str, **kwargs) -> httpx.Response:
    for attempt in range(4):
        try:
            response = client.request(method, url, timeout=60, **kwargs)
            response.raise_for_status()
            return response
        except httpx.HTTPError as error:
            if attempt == 3:
                raise SystemExit(f"{url}: {type(error).__name__}: {error}") from None
            time.sleep(5 * (attempt + 1))


def main(directory: Path, day: date) -> None:
    days = [day + timedelta(days=n) for n in range(-DAYS_BEFORE, DAYS_AFTER + 1)]
    manifest_path = directory / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    downloaded_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    collected, messages = [], 0
    with httpx.Client(headers={"User-Agent": sources.USER_AGENT}) as client:
        for d in days:
            listing = _get(client, "POST", f"{sources.NAAD_ARCHIVE}/en.php", data={"datepicker": d.isoformat()}).text
            paths = sorted(set(re.findall(r'href="(/archive/[^"]+\.xml)"', listing)))
            eccc = [path.replace("&amp;", "&") for path in paths if ECCC_MESSAGE in path.replace("&amp;", "&")]
            if not eccc:
                raise SystemExit(f"the archive lists no ECCC message for {d}: nothing saved")
            print(f"{d}: {len(eccc)} ECCC messages of {len(paths)} archived")
            for path in eccc:
                url = sources.NAAD_ARCHIVE + quote(path, safe="/")
                found = features(_get(client, "GET", url).content, url)
                messages += bool(found)
                collected += found
                time.sleep(PAUSE)

    # Every alert is renewed well inside a day (a bulletin expires 16 hours after it is sent), so the
    # messages of the first day downloaded cover the alerts in effect from the day after it.
    covers = [f"{days[1]}T00:00:00Z", f"{days[-1] + timedelta(days=1)}T00:00:00Z"]
    collected.sort(key=lambda f: (f["properties"]["publication_datetime"], f["id"]))
    document = {
        "type": "FeatureCollection",
        "source": "ECCC CAP-CP air-quality alert messages, from the copies kept by the NAAD System archive; converted to the weather-alerts shape",
        "covers": covers,
        "features": collected,
    }
    (directory / "alerts.json").write_text(json.dumps(document, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    manifest["files"]["alerts.json"] = {
        "source": (
            f"ECCC air-quality alert messages (CAP-CP, sender {ECCC_SENDER}) of {days[0]} to {days[-1]} for zones on the wind grid, "
            "from the copies kept by the NAAD System archive, converted to the weather-alerts shape "
            "(https://api.weather.gc.ca/collections/weather-alerts keeps no past alerts)"
        ),
        "url": f"{sources.NAAD_ARCHIVE}/en.php",
        "downloadedAt": downloaded_at,
        "covers": covers,
        "messages": messages,
        "features": len(collected),
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{directory.name}/alerts.json: {len(collected)} zones in {messages} air-quality messages, covering {covers[0]} to {covers[1]}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download and convert ECCC's air-quality alert messages for a replay day.")
    parser.add_argument("date", type=date.fromisoformat, help="the day of the arrival times (UTC), YYYY-MM-DD")
    parser.add_argument("--name", help="directory under data/replay/ (default: the date)")
    args = parser.parse_args()
    main(REPLAY_DIR.parent / (args.name or args.date.isoformat()), args.date)
