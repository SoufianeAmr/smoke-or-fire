// Everything the verdict screens (7a–7d) say, from the engine's answer. Pure: no React, no DOM.
import { translate, type Lang, type StringKey, type Vars } from "../i18n";
import type { AqhiCategory, Confidence, Fire, LastSeen, VerdictJson } from "./types";

const NBSP = String.fromCharCode(0xa0); // no-break space: keeps a fire's name on one line in French
const NBH = String.fromCharCode(0x2011); // no-break hyphen

/** A satellite's name on one line: "NOAA‑20", "Suomi NPP", "Sentinel‑3A" never break at the hyphen or space. */
const unbroken = (satellite: string) => satellite.replace(/-/g, NBH).replace(/ /g, NBSP);

export type Variant = "7a" | "7b" | "7c" | "7d";
export type AreaWide = { lead: string; text: string };

export interface VerdictView {
  variant: Variant;
  band: { label: string; headline: string; sub: string };
  confidence: { level: Confidence; chip: string; text: string };
  /** The fire the map and fire row feature: the closest approach's fire (7a, 7c) or the nearest fire (7b). */
  fire: Fire | null;
  fireRow:
    | { kind: "fire"; title: string; subtitle: string; km: string; side: string }
    | { kind: "nearest"; label: string; title: string; km: string; side: string }
    | { kind: "none"; label: string; title: string; checked: string | null };
  map: {
    aria: string;
    you: string;
    fireLabel: string | null;
    approachLabel: string | null;
    approachKm: string | null;
    /** The satellite that made the fire's newest detection, and when. Null when no satellite is named. */
    badge: string | null;
    edgeLabel: (hoursAgo: number, area: string | null) => string;
    legend: { path: string; hour: string; corridor: string | null; closest: string | null; fire: string | null; you: string; otherHeights: string; forward: string | null };
  };
  twoPossibilities: { title: string; driftingChip: string; driftingLead: string; driftingText: string; unexplainedChip: string; unexplainedLead: string; unexplainedText: string; lookOutside: string } | null;
  todo:
    | { kind: "advice"; title: string; general: string; official: string; areaWide: AreaWide | null; nurse: string; groupsLabel: string; atRisk: string; higherRiskLead: string; higherRisk: string; doctor: string }
    | { kind: "noReading"; title: string; general: string; linkText: string; linkHost: string; linkUrl: string; nurse: string };
  aqhi: { title: string; station: string; display: string; risk: string; scale: string; scaleLow: string; scaleHigh: string; segments: number; category: AqhiCategory | null; needle: string | null; areaWide: AreaWide | null; source: string };
  why: { title: string; items: { title: string; body: string; detail?: string | null }[]; howLink: string };
}

const AREA_KEYS = ["NB", "NS", "PE", "QC", "ME", "BAY_OF_FUNDY", "GULF_OF_ST_LAWRENCE", "GULF_OF_MAINE"] as const;

// Gauge needles from the screen files (AQHI 4, 6 and 7); other levels continue the same scale.
const NEEDLES: Record<number, string> = { 4: "M12 18l-1.5-6.5", 6: "M12 18l2.5-6", 7: "M12 18l4.5-5" };
function needle(level: number): string {
  if (NEEDLES[level]) return NEEDLES[level];
  const angle = Math.max(-80, Math.min(80, -86.3 + 18.26 * level)) * (Math.PI / 180);
  const dx = Math.round(6.6 * Math.sin(angle) * 10) / 10;
  const dy = Math.round(-6.6 * Math.cos(angle) * 10) / 10;
  return `M12 18l${dx} ${dy}`;
}

/** Local time words for when the wind shifted (Atlantic time). */
function whenWord(lang: Lang, shiftIso: string, checkIso: string): string {
  const parts = (iso: string) => {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
    const p = Object.fromEntries(f.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
    return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
  };
  const shift = parts(shiftIso);
  const check = parts(checkIso);
  const t = (key: StringKey) => translate(lang, key);
  if (shift.hour >= 21 || shift.hour < 6) return t("when.overnight");
  const part = shift.hour < 12 ? "morning" : shift.hour < 18 ? "afternoon" : "evening";
  const yesterday = shift.day !== check.day;
  return t(`when.${yesterday ? "yesterday" : "today"}.${part}` as StringKey);
}

export function verdictView(json: VerdictJson, lang: Lang): VerdictView {
  const t = (key: StringKey, vars?: Vars) => translate(lang, key, vars);
  const town = json.location.name ?? "";
  const approach = json.closestApproach;
  const variant: Variant =
    json.verdict === "drifting" ? "7a" : json.verdict === "unclear" ? "7c" : json.noFiresInRange ? "7d" : "7b";
  const fire = variant === "7a" || variant === "7c" ? approach?.fire ?? null : variant === "7b" ? json.nearestFire : null;

  const area = (code: string | null, form: "name" | "from" | "in" | "short") =>
    code && (AREA_KEYS as readonly string[]).includes(code) ? t(`area.${form}.${code}` as StringKey) : null;
  const compassWord = (code: string, form: "word" | "at" | "from" | "abbr") => t(`compass.${form}.${code}` as StringKey);

  // "the Long Lake fire", "a fire near Hannamville", "a fire in New Brunswick". French has two forms:
  // "the" takes the place of de + article ("du feu de Long Lake", "d’un feu près de…"), "plain" is for a
  // subject or after any other word ("le feu de Long Lake", "un feu près de…").
  const fireAs = (form: "the" | "plain") => (f: Fire) =>
    f.name
      ? t(`fire.${form}.named` as StringKey, { name: f.name })
      : f.nearCommunity
        ? t(`fire.${form}.near` as StringKey, { community: f.nearCommunity })
        : t(`fire.${form}.in` as StringKey, { where: area(f.province, "in") ?? "" });
  const fireThe = fireAs("the");
  const firePlain = fireAs("plain");
  const fireTitle = (f: Fire) =>
    f.name ? t("fire.title.named", { name: lang === "fr" ? f.name.replace(/ /g, NBSP) : f.name }) : f.nearCommunity ? t("fire.title.near", { community: f.nearCommunity }) : t("fire.title.in", { where: area(f.province, "in") ?? "" });
  const hours = (h: number, one: StringKey, many: StringKey, under: StringKey) => (h <= 0 ? t(under) : h === 1 ? t(one) : t(many, { h }));
  // How long ago a satellite saw the fire: minutes under an hour, otherwise hours.
  const ago = (s: Pick<LastSeen, "hoursAgo" | "minutesAgo">) => {
    const minutes = Math.max(1, s.minutesAgo);
    return minutes < 60 ? t(minutes === 1 ? "time.minutes.one" : "time.minutes", { n: minutes }) : t(s.hoursAgo === 1 ? "time.hours.one" : "time.hours", { n: s.hoursAgo });
  };
  const newest = fire?.lastSeen?.satellite ? fire.lastSeen : null; // the fire's newest detection, if its satellite is known

  // Band
  const band =
    variant === "7a"
      ? {
          label: t("verdict.label.drifting"),
          headline: t("verdict.headline.drifting", { fire: fireThe(fire!) }),
          sub: t("verdict.sub.drifting", { from: area(fire!.province, "from") ?? "", km: fire!.km, direction: compassWord(fire!.compass, "at") }),
        }
      : variant === "7c"
        ? {
            label: t("verdict.label.unclear"),
            headline: t("verdict.headline.unclear"),
            sub:
              approach && approach.km <= json.rules.driftingKm
                ? t("verdict.sub.unclearWind", { fire: fireThe(fire!) })
                : t("verdict.sub.unclear", { fire: fireThe(fire!) }),
          }
        : { label: t("verdict.label.unexplained"), headline: t("verdict.headline.unexplained"), sub: t("verdict.sub.unexplained") };

  // Confidence
  const when = json.wind.biggestShift ? whenWord(lang, json.wind.biggestShift.time, json.time) : t("when.overnight");
  const confidenceText = !json.heights.agree
    ? t("confidence.text.heights")
    : variant === "7a"
      ? t("confidence.text.drifting", { km: approach!.km })
      : !json.wind.steady
        ? t("confidence.text.unsteady", { when })
        : variant === "7c"
          ? t("confidence.text.unclearSteady", { km: approach!.km })
          : t("confidence.text.unexplained");

  // Fire row. On 7d, a line says when both fire sources were checked (live data only).
  const dataChecked = () => {
    const s = json.sources;
    if (!s || !s.cwfis.ok || !s.firms.ok || s.checkedMinutesAgo === null) return null;
    const checked = t("fire.none.checked", { n: s.checkedMinutesAgo });
    return s.newestDetection ? `${checked} ${t("fire.none.newest", { time: ago(s.newestDetection) })}` : checked;
  };
  const fireRow: VerdictView["fireRow"] =
    variant === "7d"
      ? { kind: "none", label: t("fire.none.label"), title: t("fire.none.title", { km: json.rules.fireRadiusKm }), checked: dataChecked() }
      : variant === "7b"
        ? { kind: "nearest", label: t("fire.nearest.label"), title: t("fire.nearest.title", { fire: fireTitle(fire!), province: area(fire!.province, "short") ?? "" }), km: t("unit.km", { km: fire!.km }), side: t("fire.offPath") }
        : {
            kind: "fire",
            title: fireTitle(fire!),
            subtitle: t("fire.locality", { place: fire!.locality ?? fire!.nearCommunity ?? "", province: area(fire!.province, "short") ?? "" }),
            km: t("unit.km", { km: fire!.km }),
            side: compassWord(fire!.compass, "abbr"),
          };

  // Map
  const travel = fire ? compassWord(opposite(fire.compass), "word") : ""; // from the fire toward the user
  // French elides "vers le" before a vowel: "vers le nord", "vers l’est".
  const toward = (text: string) => (lang === "fr" && /^[eo]/.test(travel) ? text.replace(`le ${travel}`, `l’${travel}`) : text);
  // "about 1 hour", "less than an hour": never "1 hours" or "0 hours".
  const perHours = (key: "map.aria.drifting" | "map.aria.unclear", h: number) => (h <= 0 ? `${key}.under` : h === 1 ? `${key}.one` : key) as StringKey;
  const mapAria =
    variant === "7a"
      ? toward(t(perHours("map.aria.drifting", approach!.hoursAgo), { h: approach!.hoursAgo, fire: firePlain(fire!), province: area(fire!.province, "name") ?? "", direction: travel, town }))
      : variant === "7c"
        ? t(perHours("map.aria.unclear", approach!.hoursAgo), { km: approach!.km, fire: fireThe(fire!), h: approach!.hoursAgo, town })
        : variant === "7b"
          ? t("map.aria.unexplained", { town, km: json.rules.searchKm, fire: firePlain(fire!) })
          : t("map.aria.noFires", { town, km: json.rules.fireRadiusKm });
  const map: VerdictView["map"] = {
    aria: mapAria,
    you: t("map.you"),
    fireLabel: fire ? fireTitle(fire) : null,
    approachLabel: variant === "7a" && approach ? hours(approach.hoursAgo, "map.hoursAgo.one", "map.hoursAgo", "map.hoursAgo.under") : null,
    approachKm: variant === "7c" && approach ? t("unit.km", { km: approach.km }) : null,
    badge: newest ? t(newest.latencyClass === "URT" ? "badge.seenBy.urt" : "badge.seenBy", { satellite: unbroken(newest.satellite!), time: ago(newest) }) : null,
    edgeLabel: (h, code) => {
      const ago = hours(h, "map.hoursAgo.one", "map.hoursAgo", "map.hoursAgo.under");
      const where = area(code, "short");
      return where ? t("map.edge", { ago, area: where }) : ago;
    },
    legend: {
      path: t("legend.path"),
      hour: t("legend.hour"),
      corridor: variant === "7b" || variant === "7d" ? t("legend.corridor", { km: json.rules.searchKm }) : null,
      closest: variant === "7c" ? t("legend.closest") : null,
      fire: fire ? t("legend.fire") : null,
      you: t("legend.you", { town }),
      otherHeights: t("legend.otherHeights"),
      forward: json.forward && fire ? t("legend.forward") : null,
    },
  };

  // Two possibilities (7c). The French lead starts with the fire ("Du feu de…"), and a closing
  // abbreviation's period ends it ("N.S.", not "N.S..").
  const lead = (text: string) => (text.charAt(0).toUpperCase() + text.slice(1)).replace(/\.\.$/, ".");
  const twoPossibilities =
    variant === "7c"
      ? {
          title: t("two.title"),
          driftingChip: t("two.drifting.chip"),
          driftingLead: lead(t("two.drifting.lead", { fire: fireThe(fire!), province: area(fire!.province, "short") ?? "" })),
          driftingText: t(approach!.hoursAgo <= 0 ? "two.drifting.text.under" : approach!.hoursAgo === 1 ? "two.drifting.text.one" : "two.drifting.text", { km: approach!.km, h: approach!.hoursAgo }),
          unexplainedChip: t("two.unexplained.chip"),
          unexplainedLead: t("two.unexplained.lead"),
          unexplainedText: t("two.unexplained.text"),
          lookOutside: t("verdict.sub.unexplained"),
        }
      : null;

  // What to do + Air quality. On unexplained verdicts both cards say the AQHI reading is area-wide.
  const aq = json.aqhi;
  const areaWide = variant === "7b" || variant === "7d" ? { lead: t("aq.areaWide.lead"), text: t("aq.areaWide.text") } : null;
  const level = aq ? (aq.display === "10+" ? 11 : Number(aq.display)) : 0;
  const todo: VerdictView["todo"] = aq
    ? {
        kind: "advice",
        title: t("todo.title"),
        general: t(`advice.general.${aq.category}` as StringKey),
        official: t(`todo.official.${aq.category}` as StringKey, { n: aq.display }),
        areaWide,
        nurse: t("todo.nurse"),
        groupsLabel: t("todo.groups"),
        atRisk: t(`advice.atRisk.${aq.category}` as StringKey),
        higherRiskLead: t("todo.higherRisk.lead"),
        higherRisk: t("todo.higherRisk.list"),
        doctor: t("todo.doctor"),
      }
    : { kind: "noReading", title: t("todo.title"), general: t("todo.noReading"), linkText: t("todo.officialLink"), linkHost: t("todo.officialLink.host"), linkUrl: t("todo.officialLink.url"), nurse: t("todo.nurse") };
  const aqhi: VerdictView["aqhi"] = {
    title: t("aq.title"),
    station: t("aq.station", { station: aq ? (lang === "fr" ? aq.station.nameFr : aq.station.nameEn) : town }),
    display: aq ? aq.display : "–",
    risk: aq ? t(`aq.risk.${aq.category}` as StringKey) : t("aq.noReading"),
    scale: t("aq.scale"),
    scaleLow: t("aq.scaleLow"),
    scaleHigh: t("aq.scaleHigh"),
    segments: aq ? Math.min(level, 11) : 0,
    category: aq ? aq.category : null,
    needle: aq ? needle(level) : null,
    areaWide,
    source: t("aq.source"),
  };

  // Why we think this
  const originFrom = area(json.path.origin.area, "from");
  const reached = originFrom
    ? t("why.reached", { town, from: originFrom, direction: compassWord(json.path.origin.compass, "word") })
    : t("why.reached.noArea", { town, direction: compassWord(json.path.origin.compass, "from") });
  // A path that reached the grid edge says so on every screen; otherwise 7a keeps the design's sentence
  // and the other screens say where the air came from.
  const traced = {
    title: t("why.traced", { n: json.path.hoursTraced }),
    body: json.path.stoppedAtGridEdge ? t("why.traced.body.gridEdge", { town }) : variant === "7a" ? t("why.traced.body", { town }) : reached,
  };
  // The fire's newest satellite observation (the engine never uses a CWFIS report time for it); without
  // one, the official-list sentence only for a fire with a CWFIS record, else nothing.
  const seen = (f: Fire) =>
    f.lastSeen?.satellite
      ? t("why.seenBy", { satellite: unbroken(f.lastSeen.satellite), time: ago(f.lastSeen) })
      : f.lastSeenHoursAgo !== null
        ? t(f.lastSeenHoursAgo <= 1 ? "why.seen.one" : "why.seen", { n: f.lastSeenHoursAgo })
        : f.cwfisIds.length > 0 ? t("why.onList") : "";
  const overFire = () => {
    const h = approach!.hoursAgo;
    return [t(h <= 0 ? "why.over.under" : h === 1 ? "why.over.one" : "why.over", { h, fire: fireThe(fire!) }), seen(fire!)].filter(Boolean).join(" ");
  };
  // When FIRMS saw the fire in the last 24 hours: every satellite that saw it, from either source.
  const satellitesLine = (f: Fire) => {
    const { bySource, satellites } = f.detections;
    if (bySource.FIRMS + bySource.both === 0 || satellites.length === 0) return null;
    const list = new Intl.ListFormat(lang, { style: "long", type: "conjunction" }).format(satellites.map(unbroken));
    return t(satellites.length === 1 ? "why.satellites.one" : "why.satellites", { n: satellites.length, list });
  };
  const passed = { title: t("why.passed", { km: approach?.km ?? 0 }), body: "", detail: variant === "7a" || variant === "7c" ? satellitesLine(fire!) : null };
  const second =
    variant === "7a"
      ? { ...passed, body: overFire() }
      : variant === "7c"
        ? { ...passed, body: approach!.km <= json.rules.driftingKm ? overFire() : t("why.closeButFar", { km: json.rules.driftingKm }) }
        : variant === "7b"
          ? { title: t("why.noneNear"), body: t("why.noneNear.body", { km: json.rules.searchKm, nearest: fire!.name ?? firePlain(fire!), distance: fire!.km }) }
          : { title: t("why.noneInRegion"), body: t("why.noneInRegion.body", { km: json.rules.fireRadiusKm }) };
  // When the three heights disagree on 7a and 7c, the steady-wind item gives way to how close each
  // height came: 100 m is "near the ground", 925 and 850 hPa are "higher up" (pressure levels are never named on screen).
  const km = (height: "100m" | "925hPa" | "850hPa") => json.heights.results[height]?.closestApproachKm ?? null;
  const heightsKm = [km("100m"), km("925hPa"), km("850hPa")];
  const heightsItem =
    (variant === "7a" || variant === "7c") && !json.heights.agree && heightsKm.every((k) => k !== null)
      ? {
          title: t("why.heights"),
          body: t("why.heights.body", { km100: heightsKm[0]!, km925: heightsKm[1]!, km850: heightsKm[2]!, level: t(`why.level.${json.confidence}` as StringKey) }),
        }
      : null;
  const third =
    variant === "7b" || variant === "7d"
      ? { title: t("why.closeBy"), body: t("why.closeBy.body") }
      : json.wind.steady
        ? heightsItem ?? { title: t("why.steady"), body: t("why.steady.body") }
        : { title: t("why.unsteady"), body: when === t("when.overnight") ? t("why.unsteady.overnight") : t("why.unsteady.body", { when }) };
  // The featured fire's smoke traced forward to the check: supporting evidence only, after item 2.
  const forward = json.forward && fire
    ? {
        title: t(json.forward.agrees ? "why.forward.title.agrees" : "why.forward.title.elsewhere"),
        body: t(json.forward.agrees ? "why.forward.passed" : "why.forward.stayed", { fire: firePlain(fire), km: json.forward.closestKm }),
      }
    : null;

  return {
    variant,
    band,
    confidence: { level: json.confidence, chip: t(`confidence.${json.confidence}` as StringKey), text: confidenceText },
    fire,
    fireRow,
    map,
    twoPossibilities,
    todo,
    aqhi,
    why: { title: t("why.title"), items: forward ? [traced, second, forward, third] : [traced, second, third], howLink: t("why.howLink") },
  };
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
function opposite(code: string): string {
  const i = COMPASS.indexOf(code);
  return i < 0 ? code : COMPASS[(i + 8) % 16];
}
