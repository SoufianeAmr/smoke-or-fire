// Everything the verdict screens (7a–7d) say, from the engine's answer. Pure: no React, no DOM.
import { translate, type Lang, type StringKey, type Vars } from "../i18n";
import { lowerFirst, script, spokenKm } from "../listen/speech";
import type { AqhiCategory, Confidence, Fire, LastSeen, VerdictJson } from "./types";

const NBSP = String.fromCharCode(0xa0); // no-break space: keeps a fire's name on one line in French
const NBH = String.fromCharCode(0x2011); // no-break hyphen

/** A satellite's name on one line: "NOAA‑20", "Suomi NPP", "Sentinel‑3A" never break at the hyphen or space. */
const unbroken = (satellite: string) => satellite.replace(/-/g, NBH).replace(/ /g, NBSP);

export type Variant = "7a" | "7b" | "7c" | "7d";
export type AreaWide = { lead: string; text: string };
/** Health Canada's windows advice and "take a break from the smoke", with map searches near the checked spot. */
export type SmokeBreak = { windows: string; text: string; library: { label: string; url: string }; community: { label: string; url: string }; hours: string; source: string; sourceUrl: string };

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
    | { kind: "advice"; title: string; general: string; official: string; areaWide: AreaWide | null; smokeBreak: SmokeBreak | null; nurse: string; groupsLabel: string; atRisk: string; higherRiskLead: string; higherRisk: string; doctor: string }
    | { kind: "noReading"; title: string; general: string; linkText: string; linkHost: string; linkUrl: string; smokeBreak: SmokeBreak | null; nurse: string };
  aqhi: { title: string; station: string; display: string; risk: string; scale: string; scaleLow: string; scaleHigh: string; segments: number; category: AqhiCategory | null; needle: string | null; areaWide: AreaWide | null; source: string };
  why: { title: string; items: { title: string; body: string; detail?: string | null }[]; howLink: string };
  /** When the featured fire is under 25 km from you: a notice under the band, linking to "If you’re told to leave". */
  notice: { text: string; link: string } | null;
  /** What Listen says, one sentence per item: the answer, how sure, then what to do and which button does it. */
  voice: string[];
}

/** A featured fire this close to you gets the notice. */
const NEAR_FIRE_KM = 25;

/**
 * A Google Maps search for `query` around a spot: the replay town, the town picked, or the phone's spot. Rounded to
 * about 100 m, close enough to find what's near without sending the exact spot.
 */
export const nearMeUrl = (query: string, { lat, lon }: { lat: number; lon: number }) =>
  `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${Number(lat.toFixed(3))},${Number(lon.toFixed(3))},13z`;

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

/**
 * Everything the verdict screen says. `townName` is the town the person picked (from the search, or a replay town);
 * without one (a live GPS location) the engine's name for the spot, its nearest city, town or village, is used.
 */
export function verdictView(json: VerdictJson, lang: Lang, townName?: string): VerdictView {
  const t = (key: StringKey, vars?: Vars) => translate(lang, key, vars);
  const town = townName ?? json.location.name ?? "";
  // Distances are whole km: 0 reads "less than 1" ("It passed less than 1 km from…", "à moins de 1 km…").
  const km1 = (km: number) => (km < 1 ? t("unit.lessThanOne") : km);
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
          sub:
            fire!.km < 1 // no compass direction under 1 km
              ? t("verdict.sub.drifting.under", { from: area(fire!.province, "from") ?? "" })
              : t("verdict.sub.drifting", { from: area(fire!.province, "from") ?? "", km: fire!.km, direction: compassWord(fire!.compass, "at") }),
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
      ? t(approach!.km < 1 ? "confidence.text.drifting.under" : "confidence.text.drifting", { km: approach!.km })
      : !json.wind.steady
        ? t("confidence.text.unsteady", { when })
        : variant === "7c"
          ? t("confidence.text.unclearSteady", { km: km1(approach!.km) })
          : t("confidence.text.unexplained");

  const kmUnit = (km: number) => (km < 1 ? t("unit.km.under") : t("unit.km", { km }));

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
        ? { kind: "nearest", label: t("fire.nearest.label"), title: t("fire.nearest.title", { fire: fireTitle(fire!), province: area(fire!.province, "short") ?? "" }), km: kmUnit(fire!.km), side: t("fire.offPath") }
        : {
            kind: "fire",
            title: fireTitle(fire!),
            subtitle: t("fire.locality", { place: fire!.locality ?? fire!.nearCommunity ?? "", province: area(fire!.province, "short") ?? "" }),
            km: kmUnit(fire!.km),
            side: fire!.km < 1 ? "" : compassWord(fire!.compass, "abbr"), // no compass direction under 1 km
          };

  // Map
  const travel = fire ? compassWord(opposite(fire.compass), "word") : ""; // from the fire toward the user
  // French elides "vers le" before a vowel: "vers le nord", "vers l’est".
  const toward = (text: string) => (lang === "fr" && /^[eo]/.test(travel) ? text.replace(`le ${travel}`, `l’${travel}`) : text);
  // "about 1 hour", "less than an hour": never "1 hours" or "0 hours".
  const perHours = (key: "map.aria.drifting" | "map.aria.drifting.near" | "map.aria.unclear", h: number) => (h <= 0 ? `${key}.under` : h === 1 ? `${key}.one` : key) as StringKey;
  const mapAria =
    variant === "7a"
      ? fire!.km < 1 // no compass direction under 1 km
        ? t(perHours("map.aria.drifting.near", approach!.hoursAgo), { h: approach!.hoursAgo, fire: firePlain(fire!), province: area(fire!.province, "name") ?? "", town })
        : toward(t(perHours("map.aria.drifting", approach!.hoursAgo), { h: approach!.hoursAgo, fire: firePlain(fire!), province: area(fire!.province, "name") ?? "", direction: travel, town }))
      : variant === "7c"
        ? t(perHours("map.aria.unclear", approach!.hoursAgo), { km: km1(approach!.km), fire: fireThe(fire!), h: approach!.hoursAgo, town })
        : variant === "7b"
          ? t("map.aria.unexplained", { town, km: json.rules.searchKm, fire: firePlain(fire!) })
          : t("map.aria.noFires", { town, km: json.rules.fireRadiusKm });
  const map: VerdictView["map"] = {
    aria: mapAria,
    you: t("map.you"),
    fireLabel: fire ? fireTitle(fire) : null,
    approachLabel: variant === "7a" && approach ? hours(approach.hoursAgo, "map.hoursAgo.one", "map.hoursAgo", "map.hoursAgo.under") : null,
    approachKm: variant === "7c" && approach ? kmUnit(approach.km) : null,
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
          driftingText: t(approach!.hoursAgo <= 0 ? "two.drifting.text.under" : approach!.hoursAgo === 1 ? "two.drifting.text.one" : "two.drifting.text", { km: km1(approach!.km), h: approach!.hoursAgo }),
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
  // Health Canada's break from the smoke: at a moderate AQHI or worse, or with no reading when the air likely (7a)
  // or possibly (7c) carries a fire's smoke. The engine's location is the spot that was checked.
  const smokeBreak: SmokeBreak | null =
    (aq ? aq.category !== "low" : variant === "7a" || variant === "7c")
      ? {
          windows: t("todo.break.windows"),
          text: t("todo.break"),
          library: { label: t("todo.break.library"), url: nearMeUrl(t("todo.break.library.query"), json.location) },
          community: { label: t("todo.break.community"), url: nearMeUrl(t("todo.break.community.query"), json.location) },
          hours: t("todo.break.hours"),
          source: t("todo.break.source"),
          sourceUrl: t("todo.break.source.url"),
        }
      : null;
  const todo: VerdictView["todo"] = aq
    ? {
        kind: "advice",
        title: t("todo.title"),
        general: t(`advice.general.${aq.category}` as StringKey),
        official: t(`todo.official.${aq.category}` as StringKey, { n: aq.display }),
        areaWide,
        smokeBreak,
        nurse: t("todo.nurse"),
        groupsLabel: t("todo.groups"),
        atRisk: t(`advice.atRisk.${aq.category}` as StringKey),
        higherRiskLead: t("todo.higherRisk.lead"),
        higherRisk: t("todo.higherRisk.list"),
        doctor: t("todo.doctor"),
      }
    : { kind: "noReading", title: t("todo.title"), general: t("todo.noReading"), linkText: t("todo.officialLink"), linkHost: t("todo.officialLink.host"), linkUrl: t("todo.officialLink.url"), smokeBreak, nurse: t("todo.nurse") };
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
  // 7a follows the air backward; the other screens say where it came from. Either way, a path that
  // reached the grid edge says it left the area the wind data covers.
  const edge = json.path.stoppedAtGridEdge;
  const traced = {
    title: t("why.traced", { n: json.path.hoursTraced }),
    body:
      variant === "7a"
        ? t(edge ? "why.traced.body.gridEdge" : "why.traced.body", { town })
        : reached + (edge ? " " + t("why.reached.gridEdge") : ""),
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
  const passed = { title: t("why.passed", { km: km1(approach?.km ?? 0) }), body: "", detail: variant === "7a" || variant === "7c" ? satellitesLine(fire!) : null };
  const second =
    variant === "7a"
      ? { ...passed, body: overFire() }
      : variant === "7c"
        ? { ...passed, body: approach!.km <= json.rules.driftingKm ? overFire() : t("why.closeButFar", { km: json.rules.driftingKm }) }
        : variant === "7b"
          ? { title: t("why.noneNear"), body: t("why.noneNear.body", { km: json.rules.searchKm, nearest: fire!.name ?? firePlain(fire!), distance: km1(fire!.km) }) }
          : { title: t("why.noneInRegion"), body: t("why.noneInRegion.body", { km: json.rules.fireRadiusKm }) };
  // When the three heights disagree on 7a and 7c, the steady-wind item gives way to how close each
  // height came: 100 m is "near the ground", 925 and 850 hPa are "higher up" (pressure levels are never named on screen).
  const km = (height: "100m" | "925hPa" | "850hPa") => json.heights.results[height]?.closestApproachKm ?? null;
  const heightsKm = [km("100m"), km("925hPa"), km("850hPa")];
  const heightsItem =
    (variant === "7a" || variant === "7c") && !json.heights.agree && heightsKm.every((k) => k !== null)
      ? {
          title: t("why.heights"),
          body: t("why.heights.body", { km100: km1(heightsKm[0]!), km925: km1(heightsKm[1]!), km850: km1(heightsKm[2]!), level: t(`why.level.${json.confidence}` as StringKey) }),
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
        body: t(json.forward.agrees ? "why.forward.passed" : "why.forward.stayed", { fire: firePlain(fire), km: km1(json.forward.closestKm) }),
      }
    : null;

  // Listen: the answer in plain words (the fire as on screen, "du feu de…" in French), how sure, then each step and
  // its button, named as on screen.
  const notice = fire && fire.km < NEAR_FIRE_KM ? { text: t("verdict.notice"), link: t("leave.entry") } : null;
  const say = (key: StringKey, vars?: Vars) => script(lang, key, vars);
  const answer =
    variant === "7a"
      ? [
          ...(fire!.km < 1
            ? say("voice.verdict.drifting.under", { fire: fireThe(fire!) })
            : say("voice.verdict.drifting", { fire: fireThe(fire!), distance: spokenKm(fire!.km, lang), direction: compassWord(fire!.compass, "at") })),
          // "From far away" only when it is: a fire under 25 km away gets the notice instead.
          ...(notice ? [] : say("voice.verdict.drifting.far")),
        ]
      : variant === "7c"
        ? say(approach!.km <= json.rules.driftingKm ? "voice.verdict.unclear.wind" : "voice.verdict.unclear", { fire: fireThe(fire!), distance: spokenKm(approach!.km, lang) })
        : say("voice.verdict.unexplained");
  // Confidence is low for two reasons only (engine/smoke_engine/verdict.py): the heights disagree, or the wind shifted.
  const sure =
    json.confidence === "low"
      ? say("voice.verdict.confidence.low", { reason: json.heights.agree ? t("voice.verdict.reason.unsteady", { when }) : t("voice.verdict.reason.heights") })
      : say(`voice.verdict.confidence.${json.confidence}` as StringKey);
  const voice = [
    ...answer,
    ...sure,
    ...(notice ? say("voice.verdict.notice", { link: notice.link }) : []),
    ...(aq ? say("voice.verdict.aq", { risk: lowerFirst(aqhi.risk, lang), advice: todo.general }) : say("voice.verdict.aq.none", { link: t("todo.officialLink") })),
    ...(smokeBreak ? say("voice.verdict.break") : []),
    ...say("voice.verdict.nurse"),
    ...say("voice.verdict.call"),
  ];

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
    notice,
    voice,
  };
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
function opposite(code: string): string {
  const i = COMPASS.indexOf(code);
  return i < 0 ? code : COMPASS[(i + 8) % 16];
}
