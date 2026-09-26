// Everything the verdict screens (7a–7d) say, from the engine's answer. Pure: no React, no DOM.
import { translate, type Lang, type StringKey, type Vars } from "../i18n";
import type { AqhiCategory, Confidence, Fire, VerdictJson } from "./types";

const NBSP = String.fromCharCode(0xa0); // no-break space: keeps a fire's name on one line in French

export type Variant = "7a" | "7b" | "7c" | "7d";

export interface VerdictView {
  variant: Variant;
  band: { label: string; headline: string; sub: string };
  confidence: { level: Confidence; chip: string; text: string };
  /** The fire the map and fire row feature: the closest approach's fire (7a, 7c) or the nearest fire (7b). */
  fire: Fire | null;
  fireRow:
    | { kind: "fire"; title: string; subtitle: string; km: string; side: string }
    | { kind: "nearest"; label: string; title: string; km: string; side: string }
    | { kind: "none"; label: string; title: string };
  map: {
    aria: string;
    you: string;
    fireLabel: string | null;
    approachLabel: string | null;
    approachKm: string | null;
    edgeLabel: (hoursAgo: number, area: string | null) => string;
    legend: { path: string; hour: string; corridor: string | null; closest: string | null; fire: string | null; you: string; otherHeights: string };
  };
  twoPossibilities: { title: string; driftingChip: string; driftingLead: string; driftingText: string; unexplainedChip: string; unexplainedLead: string; unexplainedText: string; lookOutside: string } | null;
  todo:
    | { kind: "advice"; title: string; general: string; official: string; nurse: string; groupsLabel: string; atRisk: string; higherRiskLead: string; higherRisk: string; doctor: string }
    | { kind: "noReading"; title: string; general: string; linkText: string; linkHost: string; linkUrl: string; nurse: string };
  aqhi: { title: string; station: string; display: string; risk: string; scale: string; scaleLow: string; scaleHigh: string; segments: number; category: AqhiCategory | null; needle: string | null; areaWide: { lead: string; text: string } | null; source: string };
  why: { title: string; items: { title: string; body: string }[]; howLink: string };
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

  // "the Long Lake fire" / "du feu de Long Lake", "a fire near Hannamville", "a fire in New Brunswick"
  const fireThe = (f: Fire) =>
    f.name ? t("fire.the.named", { name: f.name }) : f.nearCommunity ? t("fire.the.near", { community: f.nearCommunity }) : t("fire.the.in", { where: area(f.province, "in") ?? "" });
  const fireTitle = (f: Fire) =>
    f.name ? t("fire.title.named", { name: lang === "fr" ? f.name.replace(/ /g, NBSP) : f.name }) : f.nearCommunity ? t("fire.title.near", { community: f.nearCommunity }) : t("fire.title.in", { where: area(f.province, "in") ?? "" });
  const hours = (h: number, one: StringKey, many: StringKey, under: StringKey) => (h <= 0 ? t(under) : h === 1 ? t(one) : t(many, { h }));

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

  // Fire row
  const fireRow: VerdictView["fireRow"] =
    variant === "7d"
      ? { kind: "none", label: t("fire.none.label"), title: t("fire.none.title", { km: json.rules.fireRadiusKm }) }
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
  const mapAria =
    variant === "7a"
      ? t("map.aria.drifting", { h: approach!.hoursAgo, fire: fireThe(fire!), province: area(fire!.province, "name") ?? "", direction: travel, town })
      : variant === "7c"
        ? t("map.aria.unclear", { km: approach!.km, fire: fireThe(fire!), h: approach!.hoursAgo, town })
        : variant === "7b"
          ? t("map.aria.unexplained", { town, km: json.rules.searchKm, fire: fireThe(fire!) })
          : t("map.aria.noFires", { town, km: json.rules.fireRadiusKm });
  const map: VerdictView["map"] = {
    aria: mapAria,
    you: t("map.you"),
    fireLabel: fire ? fireTitle(fire) : null,
    approachLabel: variant === "7a" && approach ? hours(approach.hoursAgo, "map.hoursAgo.one", "map.hoursAgo", "map.hoursAgo.under") : null,
    approachKm: variant === "7c" && approach ? t("unit.km", { km: approach.km }) : null,
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
    },
  };

  // Two possibilities (7c)
  const twoPossibilities =
    variant === "7c"
      ? {
          title: t("two.title"),
          driftingChip: t("two.drifting.chip"),
          driftingLead: t("two.drifting.lead", { fire: fireThe(fire!), province: area(fire!.province, "short") ?? "" }),
          driftingText: t(approach!.hoursAgo <= 0 ? "two.drifting.text.under" : approach!.hoursAgo === 1 ? "two.drifting.text.one" : "two.drifting.text", { km: approach!.km, h: approach!.hoursAgo }),
          unexplainedChip: t("two.unexplained.chip"),
          unexplainedLead: t("two.unexplained.lead"),
          unexplainedText: t("two.unexplained.text"),
          lookOutside: t("verdict.sub.unexplained"),
        }
      : null;

  // What to do + Air quality
  const aq = json.aqhi;
  const level = aq ? (aq.display === "10+" ? 11 : Number(aq.display)) : 0;
  const todo: VerdictView["todo"] = aq
    ? {
        kind: "advice",
        title: t("todo.title"),
        general: t(`advice.general.${aq.category}` as StringKey),
        official: t(`todo.official.${aq.category}` as StringKey, { n: aq.display }),
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
    areaWide: variant === "7b" || variant === "7d" ? { lead: t("aq.areaWide.lead"), text: t("aq.areaWide.text") } : null,
    source: t("aq.source"),
  };

  // Why we think this
  const originFrom = area(json.path.origin.area, "from");
  const reached = originFrom
    ? t("why.reached", { town, from: originFrom, direction: compassWord(json.path.origin.compass, "word") })
    : t("why.reached.noArea", { town, direction: compassWord(json.path.origin.compass, "from") });
  const edge = json.path.stoppedAtGridEdge ? " " + t("why.gridEdge") : "";
  const traced = { title: t("why.traced", { n: json.path.hoursTraced }), body: (variant === "7a" ? t("why.traced.body", { town }) : reached) + edge };
  const seen = (f: Fire) =>
    f.lastSeenHoursAgo === null ? t("why.onList") : f.lastSeenHoursAgo <= 1 ? t("why.seen.one") : t("why.seen", { n: f.lastSeenHoursAgo });
  const overFire = () => {
    const h = approach!.hoursAgo;
    return t(h <= 0 ? "why.over.under" : h === 1 ? "why.over.one" : "why.over", { h, fire: fireThe(fire!) }) + " " + seen(fire!);
  };
  const passed = { title: t("why.passed", { km: approach?.km ?? 0 }), body: "" };
  const second =
    variant === "7a"
      ? { ...passed, body: overFire() }
      : variant === "7c"
        ? { ...passed, body: approach!.km <= json.rules.driftingKm ? overFire() : t("why.closeButFar", { km: json.rules.driftingKm }) }
        : variant === "7b"
          ? { title: t("why.noneNear"), body: t("why.noneNear.body", { km: json.rules.searchKm, nearest: fire!.name ?? fireThe(fire!), distance: fire!.km }) }
          : { title: t("why.noneInRegion"), body: t("why.noneInRegion.body", { km: json.rules.fireRadiusKm }) };
  const third =
    variant === "7b" || variant === "7d"
      ? { title: t("why.closeBy"), body: t("why.closeBy.body") }
      : json.wind.steady
        ? { title: t("why.steady"), body: t("why.steady.body") }
        : { title: t("why.unsteady"), body: when === t("when.overnight") ? t("why.unsteady.overnight") : t("why.unsteady.body", { when }) };

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
    why: { title: t("why.title"), items: [traced, second, third], howLink: t("why.howLink") },
  };
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
function opposite(code: string): string {
  const i = COMPASS.indexOf(code);
  return i < 0 ? code : COMPASS[(i + 8) % 16];
}
