"""Satellite fire detections from NASA FIRMS (CSV) and CWFIS hotspots (GeoJSON), in one shape."""

import csv
import io
from bisect import bisect_left, bisect_right
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone

from smoke_engine.geo import distance_km

# FIRMS attribute tables: VIIRS N = Suomi NPP, N20 = NOAA-20, N21 = NOAA-21; MODIS A = Aqua, T = Terra.
# CWFIS names most satellites in full; S3A and S3B are Sentinel-3A and -3B (SLSTR).
SATELLITE_NAMES = {
    "N": "Suomi NPP", "N20": "NOAA-20", "N21": "NOAA-21", "A": "Aqua", "T": "Terra",
    "S3A": "Sentinel-3A", "S3B": "Sentinel-3B",
}
MODIS_MIN_CONFIDENCE = 30
LATENCY_CLASSES = ("URT", "RT", "NRT", "SP")  # FIRMS: ultra real-time, real-time, near real-time, standard
FUSE_KM = 1.0  # a FIRMS detection and a CWFIS hotspot this close in space
FUSE_MINUTES = 30  # and in time are one observation


@dataclass(frozen=True)
class Detection:
    lat: float
    lon: float
    time: datetime  # UTC
    satellite: str | None
    instrument: str | None
    confidence: str | None
    frp: float | None
    daynight: str | None
    latency_class: str | None  # URT | RT | NRT | SP, FIRMS only
    source: str  # "FIRMS" or "CWFIS": where this record comes from
    sources: tuple[str, ...]  # every source that saw it: ("FIRMS", "CWFIS") after fuse()
    satellites: tuple[str, ...]  # every named satellite of the records merged into it

    @property
    def by(self) -> str:
        """FIRMS, CWFIS, or both."""
        return "both" if len(self.sources) > 1 else self.source


def _latency_class(version: str) -> str:
    """FIRMS "version": the collection, then URT, RT or NRT; no suffix is standard processing (SP)."""
    for suffix in ("URT", "NRT", "RT"):
        if version.endswith(suffix):
            return suffix
    return "SP"


def _acquired(acq_date: str, acq_time: str) -> datetime:
    """acq_date YYYY-MM-DD and acq_time HHMM in UTC (FIRMS drops leading zeros: "6" is 00:06)."""
    hhmm = int(acq_time)
    day = datetime.fromisoformat(acq_date).replace(tzinfo=timezone.utc)
    return day + timedelta(hours=hhmm // 100, minutes=hhmm % 100)


def _confident(instrument: str, confidence: str) -> bool:
    """VIIRS: low ("l") is dropped, nominal and high kept. MODIS (0–100 %): below 30 is dropped."""
    if instrument == "MODIS":
        return float(confidence) >= MODIS_MIN_CONFIDENCE
    return confidence.strip().lower()[:1] != "l"


def parse_firms_csv(text: str) -> list[Detection]:
    """Confident detections from one FIRMS area API answer (VIIRS or MODIS, any latency), day and night."""
    detections = []
    for row in csv.DictReader(io.StringIO(text)):
        if not _confident(row["instrument"], row["confidence"]):
            continue
        satellite = SATELLITE_NAMES.get(row["satellite"], row["satellite"])
        detections.append(
            Detection(
                lat=float(row["latitude"]),
                lon=float(row["longitude"]),
                time=_acquired(row["acq_date"], row["acq_time"]),
                satellite=satellite,
                instrument=row["instrument"],
                confidence=row["confidence"],
                frp=float(row["frp"]) if row.get("frp") else None,
                daynight=row["daynight"],
                latency_class=_latency_class(row["version"]),
                source="FIRMS",
                sources=("FIRMS",),
                satellites=(satellite,),
            )
        )
    return detections


def firms_detections(answers: dict[str, str]) -> list[Detection]:
    """Detections from every FIRMS source's answer (source name -> CSV text)."""
    return [d for text in answers.values() for d in parse_firms_csv(text)]


def cwfis_detections(hotspots: dict) -> list[Detection]:
    """Detections from a CWFIS `public:hotspots` GeoJSON answer."""
    detections = []
    for feature in hotspots.get("features", []):
        p = feature["properties"]
        if not p.get("rep_date"):
            continue
        satellite = SATELLITE_NAMES.get(p.get("satellite"), p.get("satellite"))
        detections.append(
            Detection(
                lat=p["lat"],
                lon=p["lon"],
                time=datetime.fromisoformat(p["rep_date"].replace("Z", "+00:00")),
                satellite=satellite,
                instrument=p.get("sensor"),
                confidence=None,
                frp=p.get("frp"),
                daynight=None,
                latency_class=None,
                source="CWFIS",
                sources=("CWFIS",),
                satellites=(satellite,) if satellite else (),
            )
        )
    return detections


def within(detections: list[Detection], since: datetime, at: datetime) -> list[Detection]:
    """Detections acquired in (since, at]."""
    return [d for d in detections if since < d.time <= at]


def fuse(firms: list[Detection], cwfis: list[Detection]) -> list[Detection]:
    """One list, with each CWFIS hotspot that matches a FIRMS detection within FUSE_KM
    and FUSE_MINUTES merged into it: the FIRMS record is kept, and both sources and
    both satellites are recorded (the two can name different satellites).

    Each detection matches at most one other; a hotspot takes the nearest free match.
    """
    order = sorted(range(len(firms)), key=lambda i: firms[i].lat)
    lats = [firms[i].lat for i in order]
    lat_window = FUSE_KM / 110.0
    fused, taken, unmatched = list(firms), set(), []
    for hotspot in cwfis:
        best = None
        for n in range(bisect_left(lats, hotspot.lat - lat_window), bisect_right(lats, hotspot.lat + lat_window)):
            i = order[n]
            if i in taken or abs(firms[i].time - hotspot.time) > timedelta(minutes=FUSE_MINUTES):
                continue
            km = distance_km(hotspot.lat, hotspot.lon, firms[i].lat, firms[i].lon)
            if km <= FUSE_KM and (best is None or km < best[0]):
                best = (km, i)
        if best is None:
            unmatched.append(hotspot)
            continue
        taken.add(best[1])
        kept = firms[best[1]]
        fused[best[1]] = replace(
            kept, sources=("FIRMS", "CWFIS"), satellites=tuple(sorted({*kept.satellites, *hotspot.satellites}))
        )
    return fused + unmatched
