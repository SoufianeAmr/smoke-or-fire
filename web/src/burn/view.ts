// Everything the "Is burning allowed today?" card says, from the engine's answer (its `burn` field). Pure: no React, no DOM.
import { translate, type Lang, type StringKey, type Vars } from "../i18n";
import { script } from "../listen/speech";
import type { BurnState, VerdictJson } from "../verdict/types";

export type BurnShape = "octagon" | "triangle" | "circle" | "square" | "ring";
export type BurnTip = "fire" | "drop" | "butt";
type Link = { label: string; host: string; url: string };

const NBSP = String.fromCharCode(0xa0);
const NBH = String.fromCharCode(0x2011); // no-break hyphen: a date stays on one line
const NAVY = "#1B2A4A";
const INK = "#1A1D21";
/** The province's "burn permitted". The only green in the app: it is about burning, never about the smoke. */
const GREEN = "#1E7B3A";

/** The engine shows a category for 2 hours past the end of its validity (a late update), never longer: so does a
 *  screen left open. */
const LATE_UPDATE_MS = 2 * 3600_000;
/** A phone's location worse than this cannot tell a county: the engine allows for 1 km (NEAR_LINE_KM). */
export const PRECISE_M = 1000;

/**
 * The status block's look. Each state has its own shape and its own word, so none is told by colour alone: a red
 * octagon (no burning), an amber triangle (restricted), a green circle (permitted). Clear when burning is banned, quiet
 * when it is permitted: only the two restrictions fill the block. Season closed is outlined and not checked is dashed,
 * as on the source badges. `accent` is the state's own colour; `fill`, `ink` and `border` are the block's.
 */
export const BURN_LOOK: Record<BurnState, { shape: BurnShape; accent: string; fill: string; ink: string; border: string }> = {
  no_burn: { shape: "octagon", accent: "#D92D20", fill: "#D92D20", ink: "#FFFFFF", border: "2px solid #D92D20" },
  restricted: { shape: "triangle", accent: "#F79009", fill: "#F79009", ink: INK, border: "2px solid #F79009" },
  permitted: { shape: "circle", accent: GREEN, fill: "#FFFFFF", ink: INK, border: `2px solid ${GREEN}` },
  season_closed: { shape: "square", accent: NAVY, fill: "#FFFFFF", ink: INK, border: `2px solid ${NAVY}` },
  not_checked: { shape: "ring", accent: NAVY, fill: "#FFFFFF", ink: INK, border: `2px dashed ${NAVY}` },
};

export interface BurnView {
  state: BurnState;
  /** Why it is not checked: the engine's reason, or one found here ("expired", "imprecise"). */
  reason: string | null;
  title: string;
  /** "Westmorland County"; null when the county could not be told. */
  county: string | null;
  /** The status in a few words: with the shape, what the card says at a glance. */
  word: string;
  /** What the province allows, or why there is no status. */
  detail: string;
  /** Until when the category is valid, and when to check again; null without a category. */
  until: string | null;
  /** The province's status is not the whole rule: a town may ban open fires at all times. */
  town: { text: string; link: Link };
  tipsTitle: string;
  tips: { icon: BurnTip; text: string }[];
  fireWatch: Link;
  sources: { label: string; lines: string[]; links: Link[] };
  listen: { play: string; stop: string };
  /** What Listen says, one sentence per item. */
  voice: string[];
}

/** What the card needs besides the engine's answer. */
export interface BurnContext {
  /** The town the person picked; without one, the engine's name for the spot. */
  town?: string;
  /** The device's clock (ms), for a screen left open. Never earlier than the check: a clock that runs behind is not believed. */
  now?: number;
  /** How accurate the phone's location is (metres), when the spot is the phone's own. */
  accuracy?: number | null;
}

/** "2026-10-04" and the hour and minute, in Atlantic time (as the verdict's badges give their times). */
function atlantic(time: string | number): { date: string; hour: string; minute: string } {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(new Date(time)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: p.hour, minute: p.minute };
}

/**
 * The burn card for the engine's answer; null when it has no burn status to show (outside New Brunswick, or an older
 * engine).
 */
export function burnView(json: VerdictJson, lang: Lang, { town: townName, now: clock, accuracy }: BurnContext = {}): BurnView | null {
  const burn = json.burn;
  if (!burn) return null;
  const t = (key: StringKey, vars?: Vars) => translate(lang, key, vars);
  const link = (key: "burn.town.link" | "burn.fireWatch" | "burn.source.link.article" | "burn.source.link.tips" | "burn.source.link.rules" | "burn.source.link.mulch", vars?: Vars): Link => ({
    label: t(key),
    host: t(`${key}.host` as StringKey),
    url: t(`${key}.url` as StringKey, vars),
  });
  const at = (iso: string) => {
    const { date, hour, minute } = atlantic(iso);
    return t("time.atlantic", { date: date.replace(/-/g, NBH), hour: lang === "fr" ? Number(hour) : hour, minute });
  };

  const replay = burn.source === "none_recorded";
  const checked = new Date(json.time).getTime();
  const now = Math.max(clock ?? checked, checked);
  const ends = burn.validUntil ? new Date(burn.validUntil).getTime() : null;
  const category = burn.state === "no_burn" || burn.state === "restricted" || burn.state === "permitted";

  // Two things only the phone knows turn a category into "not checked": the screen was left open until the category
  // was over 26 hours old, or the phone's location is too coarse to tell a county.
  const [state, reason]: [BurnState, string | null] =
    category && ends !== null && now > ends + LATE_UPDATE_MS
      ? ["not_checked", "expired"]
      : burn.state !== "season_closed" && burn.county && typeof accuracy === "number" && accuracy > PRECISE_M
        ? ["not_checked", "imprecise"]
        : [burn.state, burn.reason];
  const hasCategory = state === "no_burn" || state === "restricted" || state === "permitted";
  const countyName = reason === "imprecise" ? null : burn.county;

  // "Westmorland County", "Comté de Westmorland"; French elides before a vowel: "Comté d’Albert".
  const named = (text: string) => (lang === "fr" && countyName && /^[aeiou]/i.test(countyName) ? text.replace(`de ${countyName}`, `d’${countyName}`) : text);
  const county = countyName ? named(t("burn.county", { county: countyName })) : null;
  const town = townName ?? json.location.name ?? "";

  // The end of validity in plain words, in Atlantic time: "2 p.m. today", "14 h demain".
  const hourOf = ({ hour, minute }: { hour: string; minute: string }) =>
    lang === "fr"
      ? `${Number(hour)}${NBSP}h${minute === "00" ? "" : `${NBSP}${minute}`}`
      : `${Number(hour) % 12 || 12}${minute === "00" ? "" : `:${minute}`}${NBSP}${Number(hour) < 12 ? "a.m." : "p.m."}`;
  const daysAhead = (time: number) => Math.round((Date.parse(atlantic(time).date) - Date.parse(atlantic(now).date)) / 86_400_000);
  const dayOf = (time: number) => {
    const days = daysAhead(time);
    return days === 0 ? t("burn.day.today") : days === 1 ? t("burn.day.tomorrow") : days === -1 ? t("burn.day.yesterday") : t("burn.day.on", { date: atlantic(time).date.replace(/-/g, NBH) });
  };
  // A category ends at the province's next update. Before it, tonight's is not known yet: "check again after 2 p.m.".
  // Past it (the engine allows 2 hours for a late update), the card says the update is due.
  const due = hasCategory && ends !== null && now > ends;
  const again = hasCategory && ends !== null && !due && daysAhead(ends) === 0;
  const until =
    hasCategory && ends !== null
      ? due
        ? t("burn.until.due", { time: hourOf(atlantic(ends)), day: dayOf(ends) })
        : // "p.m." already ends the sentence: "after 2 p.m.", not "after 2 p.m..".
          `${t("burn.until", { time: hourOf(atlantic(ends)), day: dayOf(ends) })} ${again ? t("burn.until.again", { time: hourOf(atlantic(ends)) }).replace(/\.\.$/, ".") : t("burn.until.daily")}`
      : null;

  // Not checked says why, in words that are true of the reason: the province not read, a county line, no county.
  const why = replay ? "replay" : reason === "county_line" || reason === "no_county" || reason === "imprecise" || reason === "expired" ? reason : null;
  const notChecked = (prefix: "burn.detail" | "voice.burn") => `${prefix}.not_checked${why ? `.${why}` : ""}` as StringKey;
  const say = (key: StringKey, vars?: Vars) => script(lang, key, vars);
  // In a sentence the county starts in lower case in French: "Dans le comté de Westmorland".
  const spokenCounty = county ? (lang === "fr" ? county.charAt(0).toLowerCase() + county.slice(1) : county) : "";
  const answer = state === "not_checked" ? say(notChecked("voice.burn")) : say(`voice.burn.${state}` as StringKey, { county: spokenCounty });
  const fireWatch = link("burn.fireWatch");

  return {
    state,
    reason,
    title: t("burn.title"),
    county,
    word: t(`burn.word.${state}` as StringKey),
    detail: state === "not_checked" ? t(notChecked("burn.detail")) : t(`burn.detail.${state}` as StringKey),
    until,
    town: { text: t("burn.town"), link: link("burn.town.link", { query: encodeURIComponent(t("burn.town.query", { town }).trim()) }) },
    tipsTitle: t("burn.tips.title"),
    tips: [
      // The first tip is today's rule where there is one: banned all day, or outside the hours.
      { icon: "fire", text: t(state === "no_burn" ? "burn.tip.fire.no_burn" : state === "restricted" ? "burn.tip.fire.restricted" : "burn.tip.fire") },
      { icon: "drop", text: t("burn.tip.mulch") },
      { icon: "butt", text: t("burn.tip.butts") },
    ],
    fireWatch,
    sources: {
      label: t("burn.sources"),
      // When the province was asked is given with what it said: a category, or no category out of season.
      lines: [t(replay ? "burn.source.status.replay" : "burn.source.status"), ...(burn.checkedAt && state !== "not_checked" ? [t("burn.source.checked", { when: at(burn.checkedAt) })] : []), t("burn.source.tips")],
      links: [link("burn.source.link.article"), link("burn.source.link.tips"), link("burn.source.link.rules"), link("burn.source.link.mulch")],
    },
    listen: { play: t("burn.listen.play"), stop: t("burn.listen.stop") },
    voice: [
      ...answer,
      ...(hasCategory && !due ? say(again ? "voice.burn.again" : "voice.burn.updated") : []),
      ...say("voice.burn.town"),
      ...say("voice.burn.tips"),
      ...say("voice.burn.more"),
    ],
  };
}
