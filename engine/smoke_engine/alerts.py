"""ECCC air-quality alert at a point: active, none in effect, or not checked. Never a guess.

The feed answers as ECCC's `weather-alerts` collection does for a point: the alerts whose forecast zone
holds it. An alert is an air-quality one by its code or by its English or French name: the code AQW has
not changed since 2024, the name has, three times; Quebec's is a smog warning. Anything that cannot be
read for certain is "not checked". Informational only: it never changes the verdict, and it never fails it.
"""

import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone

from smoke_engine.feeds import FeedUnavailable
from smoke_engine.places import in_canada

ACTIVE, NONE, NOT_CHECKED = "active", "none", "not_checked"
# Air quality warning; special air quality statement (until the colour-coded alerts of late 2025).
AIR_QUALITY_CODES = {"AQW", "SAS"}
# The statuses ECCC has been seen to use. They are not documented, so any other one is "not checked".
IN_EFFECT = {"issued", "continued", "changed_from"}
ENDED = "ended"


@dataclass(frozen=True)
class Alert:
    """One alert, in ECCC's own words."""

    code: str | None
    name_en: str | None
    name_fr: str | None
    colour_en: str | None
    colour_fr: str | None
    zone_en: str | None
    zone_fr: str | None
    issued: datetime
    expires: datetime  # of this bulletin, renewed by the next one: not the end of the smoke
    url: str | None  # the recorded message (replay)


@dataclass(frozen=True)
class AlertCheck:
    state: str
    alert: Alert | None = None
    checked_at: datetime | None = None  # when ECCC answered; None for recorded messages


def _plain(text) -> str:
    """Lower case, no accents, straight apostrophes: "Qualité de l’air" reads as "qualite de l'air"."""
    text = unicodedata.normalize("NFD", str(text or "").replace("’", "'"))
    return "".join(c for c in text if not unicodedata.combining(c)).casefold()


def _is_air_quality(properties: dict) -> bool:
    english, french = _plain(properties.get("alert_name_en")), _plain(properties.get("alert_name_fr"))
    return (
        properties.get("alert_code") in AIR_QUALITY_CODES
        or "air quality" in english
        or "qualite de l'air" in french
        or "smog" in english  # Quebec's smog warning (Info-Smog), "avertissement de smog"
        or "smog" in french
    )


def _time(text) -> datetime:
    """A time with its zone, in UTC."""
    t = datetime.fromisoformat(str(text).replace("Z", "+00:00"))
    if t.tzinfo is None:
        raise ValueError(f"no time zone in {text!r}")
    return t.astimezone(timezone.utc)


def air_quality_alert(feeds, lat: float, lon: float, at: datetime) -> AlertCheck:
    """The air-quality alert in effect at the point at `at`: the newest one, if ECCC lists several."""
    # ECCC's zones stop at the border and near the shore: for Maine or open water it lists nothing,
    # which is not "none in effect".
    canada = in_canada(lat, lon)
    if canada is False:
        return AlertCheck(NOT_CHECKED)
    try:
        return _read(feeds.alerts(lat, lon, at), at, border=canada is None)
    except FeedUnavailable:
        return AlertCheck(NOT_CHECKED)
    except Exception:  # an answer in a shape never seen: the verdict is still given
        return AlertCheck(NOT_CHECKED)


def _read(answer, at: datetime, border: bool) -> AlertCheck:
    """ECCC's answer for the point, read. `border`: the point is in the strip where the outlines cannot
    tell Canada from Maine, New Hampshire or Vermont."""
    features = answer.get("features") if isinstance(answer, dict) else None
    if (
        not isinstance(features, list)
        or answer.get("type") != "FeatureCollection"
        # A cut-off page, or an answer that is not a list of alerts at all.
        or answer.get("numberMatched") != len(features)
        or answer.get("numberReturned") != len(features)
        or not all(isinstance(f, dict) and isinstance(f.get("properties"), dict) for f in features)
    ):
        return AlertCheck(NOT_CHECKED)
    # In the border strip, an alert of any kind listed for the point shows it lies in one of ECCC's zones.
    # Nothing listed may be ECCC's silence outside Canada: not "none in effect".
    if border and not features:
        return AlertCheck(NOT_CHECKED)

    in_effect = []
    for feature in features:
        p = feature["properties"]
        kind = [p.get(key) for key in ("alert_code", "alert_name_en", "alert_name_fr")]
        if not any(kind) or not all(k is None or isinstance(k, str) for k in kind):
            return AlertCheck(NOT_CHECKED)  # nothing says, in words, what kind of alert this is
        if not _is_air_quality(p) or p.get("status_en") == ENDED:
            continue
        try:
            issued, expires = _time(p["publication_datetime"]), _time(p["expiration_datetime"])
        except (KeyError, ValueError):
            return AlertCheck(NOT_CHECKED)
        # ECCC lists only alerts that have not expired: one past its expiry means a stale list.
        if p.get("status_en") not in IN_EFFECT or expires <= at:
            return AlertCheck(NOT_CHECKED)
        in_effect.append(
            Alert(
                code=p.get("alert_code"),
                name_en=p.get("alert_name_en"),
                name_fr=p.get("alert_name_fr"),
                colour_en=p.get("risk_colour_en"),
                colour_fr=p.get("risk_colour_fr"),
                zone_en=p.get("feature_name_en"),
                zone_fr=p.get("feature_name_fr"),
                issued=issued,
                expires=expires,
                url=p.get("source_url"),
            )
        )

    try:
        checked_at = _time(answer["timeStamp"])
    except (KeyError, ValueError):
        checked_at = None
    if in_effect:
        return AlertCheck(ACTIVE, max(in_effect, key=lambda a: a.issued), checked_at)
    return AlertCheck(NONE, None, checked_at)
