// Burn status for the dispatch board. One source of truth for today: the engine's `burn` field, read by the view the
// public app's burn badge and card are built from (../burn/view). The replay's day has no status the engine could have
// recorded (the province keeps none): there, and only there, the board shows a ban a province announced, from the
// province's own news release (burn-status.json, hand-curated), said to be from that release, with its date and its
// link. Anything else is "not checked", with the province's own page. Nothing is guessed. Pure: no React, no DOM.
import type { BurnView } from "../burn/view";
import type { Lang } from "../i18n";
import type { VerdictJson } from "../verdict/types";
import data from "./burn-status.json";

interface Local<T> {
  en: T;
  fr: T | null;
}
interface Page {
  label: string;
  url: string;
}
interface ReleaseRecord {
  province: string;
  /** First and last day the sources support, as YYYY-MM-DD (Atlantic time). */
  active: { from: string; to: string };
  authority: Local<string>;
  /** The news release's date, YYYY-MM-DD. */
  published: string;
  source: Local<string>;
}

const RECORDS = data.records as ReleaseRecord[];
const PAGES = data.pages as Record<string, Local<Page> | undefined>;

/** A burn ban a province announced: who said so, when (YYYY-MM-DD), and the release. */
export interface Release {
  authority: string;
  published: string;
  /** In the board's language when the province published one; `english` says it is not. */
  url: string;
  english: boolean;
}

export interface BoardBurn {
  /**
   * Where the status comes from. `engine`: the engine's burn field, today's status. `release`: a province's news
   * release, for the replay's day only. `none`: neither, so not checked.
   */
  source: "engine" | "release" | "none";
  /** Burning is banned where the caller is: a neighbour's fire pit is then Dispatch. */
  ban: boolean;
  province: string | null;
  /** The engine's status, as the public app shows it. With `engine` only. */
  view: BurnView | null;
  /** With `release` only. */
  release: Release | null;
  /** The province's burn-status page for today; `english`: the only one found is in English, and the board is not. */
  page: { label: string; url: string; english: boolean } | null;
}

/** The day at the check, in Atlantic time, as YYYY-MM-DD. */
export function atlanticDate(iso: string): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax", year: "numeric", month: "2-digit", day: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

const local = <T>(value: Local<T>, lang: Lang): { value: T; english: boolean } => (lang === "fr" && value.fr !== null ? { value: value.fr, english: false } : { value: value.en, english: lang !== "en" });

/** The province's own page about burning, if the board has one. */
export function pageFor(province: string | null, lang: Lang): BoardBurn["page"] {
  const pages = province ? PAGES[province] : undefined;
  if (!pages) return null;
  const { value, english } = local(pages, lang);
  return { ...value, english };
}

/** The ban a province's news release supports for the day of a check, if a record covers that day. */
export function releaseFor(province: string | null, time: string, lang: Lang): Release | null {
  const day = atlanticDate(time);
  const record = RECORDS.find((r) => r.province === province && r.active.from <= day && day <= r.active.to);
  if (!record) return null;
  const release = local(record.source, lang);
  return { authority: lang === "fr" ? record.authority.fr ?? record.authority.en : record.authority.en, published: record.published, url: release.value, english: release.english };
}

/**
 * The burn status for the place of an answer. Live: what the engine says (`view`, null where the engine has no status:
 * outside New Brunswick, or an older engine). Replay: a news release's ban for that day, if one is on record; the
 * engine's own field says only that nothing was recorded.
 */
export function boardBurn(json: VerdictJson, province: string | null, lang: Lang, view: BurnView | null): BoardBurn {
  const page = pageFor(province, lang);
  if (json.mode === "replay") {
    const release = releaseFor(province, json.time, lang);
    return release ? { source: "release", ban: true, province, view: null, release, page } : { source: "none", ban: false, province, view: null, release: null, page };
  }
  return view ? { source: "engine", ban: view.state === "no_burn", province, view, release: null, page } : { source: "none", ban: false, province, view: null, release: null, page };
}
