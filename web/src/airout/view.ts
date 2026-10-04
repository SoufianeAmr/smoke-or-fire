// "Best time to air out your home": everything its tile and its screen say, from the engine's answer
// (smokeForecast: ECCC's FireWork forecast and the engine's rule). Pure: no React, no DOM.
import { translate, type Lang, type StringKey, type Vars } from "../i18n";
import { script } from "../listen/speech";
import type { SmokeForecast, SmokeHour, VerdictJson } from "../verdict/types";

const NBSP = String.fromCharCode(0xa0);
/** Times are Atlantic time, as everywhere in the app. */
const ZONE = "America/Halifax";

/**
 * The colours of ECCC's legend for the layer (MSC GeoMet, style PM2.5_0to100ugm3_Dis), one per class from 1–10 µg/m³
 * to 100 or more, read from the legend image on Oct 4, 2026. Under 1, ECCC draws nothing.
 */
export const ECCC_COLOURS = ["#21C5F4", "#1899C9", "#0D6796", "#FEFC37", "#FECB2E", "#FD993F", "#FC6769", "#FE3B3B", "#FE0101", "#CA0713", "#650205"];

/** A bar's pattern, so its level is never told by colour alone: by the families of ECCC's colours (blues, yellows and
 *  orange, reds, the darkest red), with its height. */
export type Pattern = "none" | "dots" | "lines" | "cross" | "solid";
export const pattern = (level: number): Pattern => (level <= 0 ? "none" : level <= 3 ? "dots" : level <= 6 ? "lines" : level <= 10 ? "cross" : "solid");

export interface Bar {
  level: number;
  /** Inside the best time to air out. */
  best: boolean;
}

/** One Atlantic calendar day of the strip: 24 clock hours across, with what the forecast has for each. */
export interface StripRow {
  /** "Today", "Tomorrow", then the weekday. */
  name: string;
  /** By clock hour, 0 to 23. Empty: no forecast for it (before the check, after the last hour). Two bars: the hour the
   *  clocks go back. */
  cells: Bar[][];
  /** Day and night, as stretches of clock hours the forecast covers: `from` to `to`, both included. */
  sky: { from: number; to: number; day: boolean }[];
  /** The best time's hours in this row, both included. */
  best: { from: number; to: number } | null;
}

export interface AirOutView {
  state: "window" | "none" | "notAvailable";
  /** "Best time to air out your home". */
  label: string;
  /** "Tue 5 to 8 a.m.", "From Sun 11 a.m.", "Now, if the smell is gone", "Keep windows closed for now",
   *  "Forecast not available". */
  answer: string;
  /** Label and answer in one line: the screen's title and the tile's name. */
  title: string;
  /** Under the answer: what the forecast shows, then the caution. */
  lines: string[];
  /** Null when there is no forecast to draw. */
  strip: {
    title: string;
    /** For a screen reader, in place of the bars. */
    aria: string;
    /** Who made the forecast, its model run, and when it was read. */
    by: string[];
    rows: StripRow[];
    ticks: { hour: number; label: string }[];
    /** The highest level a bar can have. */
    maxLevel: number;
    legend: { none: string; more: string; best: string | null; day: string; night: string };
    /** The same forecast in words: stretches of hours at one level. */
    list: { show: string; hide: string; items: string[]; numbers: string };
  } | null;
  /** How the best time is chosen, in one sentence with the engine's number: the app's rule, not ECCC's advice. Null with
   *  no forecast to choose from. */
  rule: string | null;
  /** Health Canada's advice on airing out, and what the forecast leaves out. */
  advice: string;
  limits: string;
  links: { label: string; host: string; url: string }[];
  /** "Protect your home", for the screen that holds it. */
  protect: string;
  /** What Listen says, one sentence per item. */
  voice: string[];
}

// One formatter for every time: making one is slow, and the strip asks for the Atlantic hour of 48 of them.
const ATLANTIC = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
type Local = { date: string; hour: number; minute: string; weekday: number };
const seen = new Map<string, Local>();

/** The Atlantic date ("2026-10-04"), clock hour, minute and weekday (0 is Sunday) of a time. */
function local(iso: string): Local {
  let at = seen.get(iso);
  if (!at) {
    const p = Object.fromEntries(ATLANTIC.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
    at = { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: p.minute, weekday: new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day))).getUTCDay() };
    if (seen.size > 500) seen.clear();
    seen.set(iso, at);
  }
  return at;
}

/** Everything the tile and the screen say. `json.smokeForecast` missing (an older engine) reads as not available. */
export function airOutView(json: VerdictJson, lang: Lang): AirOutView {
  // A sentence that ends on "a.m." or "p.m." takes no second period.
  const t = (key: StringKey, vars?: Vars) => translate(lang, key, vars).replace(/\.\.$/, ".");
  const say = (key: StringKey, vars?: Vars) => script(lang, key, vars).map((sentence) => sentence.replace(/\.\.$/, "."));
  const forecast: SmokeForecast | undefined = json.smokeForecast;
  const label = t("airout.label");
  const replay = json.mode === "replay";

  // A clock hour: "5 a.m.", "noon", "5 h", "midi". Midnight is "12 a.m." or "0 h" at the start of a stretch and
  // "midnight" or "minuit" at its end, so its day is never in doubt.
  const clock = (hour: number, end = false) =>
    hour === 0 ? t(end ? "airout.time.midnight" : "airout.time.zero") : hour === 12 ? t("airout.time.noon") : t(hour < 12 ? "airout.time.am" : "airout.time.pm", { h: lang === "fr" ? hour : hour % 12 });
  const day = (weekday: number, form: "short" | "long") => t(`airout.day.${form}.${weekday}` as StringKey);
  const upperFirst = (text: string) => text.charAt(0).toLocaleUpperCase(lang) + text.slice(1);
  // "Sun 11 a.m.", and for the voice "Sunday at 11 a.m.".
  const moment = (iso: string, form: "short" | "long", end = false) => {
    const at = local(iso);
    // A stretch that ends at midnight ends on the day before: "Mon 8 p.m. to midnight".
    const weekday = end && at.hour === 0 ? (at.weekday + 6) % 7 : at.weekday;
    return t(form === "short" ? "airout.moment" : "voice.airout.moment", { day: day(weekday, form), time: clock(at.hour, end) });
  };
  // "Tue 5 to 8 a.m.", "Tue 10 a.m. to 2 p.m.", "Tue 10 p.m. to Wed 6 a.m."; one hour alone: "Tue 5 a.m.".
  const range = (startIso: string, endIso: string, form: "short" | "long") => {
    const [start, end] = [local(startIso), local(endIso)];
    if (startIso === endIso) return moment(startIso, form);
    // The midnight that ends the day it started on counts as that day.
    const hoursLong = (Date.parse(endIso) - Date.parse(startIso)) / 3_600_000;
    const sameDay = start.date === end.date || (end.hour === 0 && hoursLong <= 25 - start.hour);
    if (!sameDay) return t(form === "short" ? "airout.range.days" : "voice.airout.range.days", { from: moment(startIso, form), to: moment(endIso, form, true) });
    // "5 to 8 a.m.": the half of the day is said once when both hours are in it.
    const sameHalf = lang === "en" && start.hour % 12 !== 0 && end.hour % 12 !== 0 && start.hour < 12 === end.hour < 12;
    const from = sameHalf ? String(start.hour % 12) : clock(start.hour);
    return t(form === "short" ? "airout.range" : "voice.airout.range", { day: day(start.weekday, form), from, to: clock(end.hour, true) });
  };

  const links = {
    maps: { label: t("airout.link.maps"), host: t("airout.link.maps.host"), url: t("airout.link.maps.url") },
    legend: { label: t("airout.link.legend"), host: t("airout.link.legend.host"), url: t("airout.link.legend.url") },
    health: { label: t("airout.link.health"), host: t("airout.link.health.host"), url: t("airout.link.health.url") },
  };
  const common = { label, advice: t("airout.advice"), limits: t("airout.limits"), protect: t("airout.protect") };
  const call = say("voice.verdict.call");

  if (!forecast || forecast.state === "not_available" || forecast.hours.length === 0) {
    const answer = t("airout.notAvailable");
    return {
      ...common,
      state: "notAvailable",
      answer,
      title: t("airout.title", { label, answer }),
      lines: [t(replay ? "airout.notAvailable.replay" : "airout.notAvailable.body")],
      strip: null,
      rule: null,
      links: [links.maps, links.health],
      voice: [...say(replay ? "voice.airout.notAvailable.replay" : "voice.airout.notAvailable"), ...call],
    };
  }

  const { window, hours, rules } = forecast;
  const maxLevel = rules.breaks.length;
  const light = window !== null && window.level > 0;
  let answer: string;
  let lines: string[];
  let voice: string[];
  if (!window) {
    answer = t("airout.none");
    lines = [t("airout.none.body", { n: rules.hours, min: rules.minWindowHours }), t("airout.none.again")];
    voice = say("voice.airout.none", { n: rules.hours });
  } else if (window.fromNow) {
    answer = t("airout.now");
    const shows = window.toEnd
      ? t(light ? "airout.shows.now.all.light" : "airout.shows.now.all", { n: rules.hours })
      : t(light ? "airout.shows.now.until.light" : "airout.shows.now.until", { when: moment(window.end, "short", true) });
    lines = [shows, t("airout.caution.now")];
    voice = say("voice.airout.now");
  } else {
    answer = window.toEnd ? t("airout.from", { when: moment(window.start, "short") }) : range(window.start, window.end, "short");
    lines = [t(light ? "airout.shows.light" : "airout.shows.clear"), t("airout.caution")];
    const when = window.toEnd ? t("voice.airout.from", { when: moment(window.start, "long") }) : range(window.start, window.end, "long");
    voice = say("voice.airout.window", { when });
  }
  const title = t("airout.title", { label, answer });

  // The strip: one row for each Atlantic day the forecast touches, 24 clock hours across.
  const inWindow = (h: SmokeHour) => window !== null && h.time >= window.start && h.time <= window.end;
  const today = local(hours[0].time).date;
  const dates = [...new Set(hours.map((h) => local(h.time).date))];
  const rows: StripRow[] = dates.map((date, i) => {
    const mine = hours.filter((h) => local(h.time).date === date);
    const cells: Bar[][] = Array.from({ length: 24 }, () => []);
    const sunUp: (boolean | null)[] = Array.from({ length: 24 }, () => null);
    for (const h of mine) {
      const { hour } = local(h.time);
      cells[hour].push({ level: h.level, best: inWindow(h) });
      sunUp[hour] ??= h.day;
    }
    const sky: StripRow["sky"] = [];
    sunUp.forEach((up, hour) => {
      if (up === null) return;
      const before = sky[sky.length - 1];
      if (before && before.day === up && before.to === hour - 1) before.to = hour;
      else sky.push({ from: hour, to: hour, day: up });
    });
    const best = cells.map((bars, hour) => (bars.some((b) => b.best) ? hour : -1)).filter((hour) => hour >= 0);
    return {
      name: date === today ? t("airout.day.today") : i === 1 ? t("airout.day.tomorrow") : upperFirst(day(local(mine[0].time).weekday, "long")),
      cells,
      sky,
      best: best.length ? { from: best[0], to: best[best.length - 1] } : null,
    };
  });

  // In words: each stretch of hours at one level, from its first hour to its last.
  const levelWords = (level: number) =>
    level === 0
      ? t("airout.level.none")
      : level === maxLevel
        ? t("airout.level.top", { level, max: maxLevel, low: rules.breaks[level - 1] })
        : t("airout.level", { level, max: maxLevel, low: rules.breaks[level - 1], high: rules.breaks[level] });
  const items: string[] = [];
  for (let i = 0; i < hours.length; ) {
    let j = i;
    while (j + 1 < hours.length && hours[j + 1].level === hours[i].level) j++;
    items.push(t("airout.list.item", { when: range(hours[i].time, hours[j].time, "short"), level: levelWords(hours[i].level) }));
    i = j + 1;
  }

  // "2026-10-04, 09:00 (Atlantic time)", as the badges give a time.
  const at = (iso: string) => {
    const { date, hour, minute } = local(iso);
    // "21 h 00" stays on one line.
    return t("time.atlantic", { date, hour: lang === "fr" ? hour : String(hour).padStart(2, "0"), minute }).replace(/(\d) h (\d)/, `$1${NBSP}h${NBSP}$2`);
  };
  const by = [
    t("airout.strip.by"),
    ...(forecast.run ? [t("airout.strip.run", { when: at(forecast.run) })] : []),
    ...(forecast.checkedAt ? [t("airout.strip.checked", { when: at(forecast.checkedAt) })] : forecast.source === "recorded" ? [t("airout.strip.recorded")] : []),
    t("airout.strip.zone"),
  ];

  return {
    ...common,
    state: window ? "window" : "none",
    answer,
    title,
    lines,
    strip: {
      title: t("airout.strip.title", { n: rules.hours }),
      aria: t("airout.strip.aria", { n: rules.hours, title: title.replace(new RegExp(NBSP, "g"), " ") }),
      by,
      rows,
      // A plain space, so "6 a.m." can go on two lines under its mark when the text is made larger.
      ticks: [6, 12, 18].map((hour) => ({ hour, label: clock(hour).replace(NBSP, " ") })),
      maxLevel,
      legend: { none: t("airout.legend.none"), more: t("airout.legend.more"), best: window ? t("airout.legend.best") : null, day: t("airout.legend.day"), night: t("airout.legend.night") },
      list: { show: t("airout.list.show"), hide: t("airout.list.hide"), items, numbers: t("airout.list.numbers") },
    },
    rule: t("airout.rule", { min: rules.minWindowHours }),
    links: [links.maps, links.legend, links.health],
    voice: [...voice, ...say("voice.airout.strip"), ...say("voice.airout.source"), ...call],
  };
}
