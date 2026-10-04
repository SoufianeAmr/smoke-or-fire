// Burn status for the dispatch board: a ban a province announced (burn-status.json, hand-curated from the provinces'
// own news releases), or "not checked". A record shows only on the dates it covers; nothing is looked up at runtime,
// and nothing is guessed: any other day, and any other province, reads "not checked" with the province's own page.
// This is the one place to change when the engine answers with a burn status of its own. Pure: no React, no DOM.
import type { Lang } from "../i18n";
import data from "./burn-status.json";

export type BurnState = "ban" | "not_checked";

interface Local<T> {
  en: T;
  fr: T | null;
}
interface Page {
  label: string;
  url: string;
}
interface BanRecord {
  province: string;
  /** First and last day the sources support, as YYYY-MM-DD (Atlantic time). */
  active: { from: string; to: string };
  authority: Local<string>;
  /** The news release's date, YYYY-MM-DD. */
  published: string;
  source: Local<string>;
}

const RECORDS = data.records as BanRecord[];
const PAGES = data.pages as Record<string, Local<Page> | undefined>;

export interface Burn {
  state: BurnState;
  province: string | null;
  /** Who announced the ban, and when (YYYY-MM-DD). Null when not checked. */
  authority: string | null;
  published: string | null;
  /** The news release, in the board's language when the province published one; `english` says it is not. */
  release: { url: string; english: boolean } | null;
  /** The province's burn-status page for today; `english`: the only one found is in English, and the board is not. */
  page: { label: string; url: string; english: boolean } | null;
}

/** The day at the check, in Atlantic time, as YYYY-MM-DD. */
export function atlanticDate(iso: string): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax", year: "numeric", month: "2-digit", day: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** The burn status for a province at the time of a check. */
export function burnStatus(province: string | null, time: string, lang: Lang): Burn {
  const local = <T>(value: Local<T>): { value: T; english: boolean } => (lang === "fr" && value.fr !== null ? { value: value.fr, english: false } : { value: value.en, english: lang !== "en" });
  const pages = province ? PAGES[province] : undefined;
  const page = pages ? (({ value, english }) => ({ ...value, english }))(local(pages)) : null;
  const day = atlanticDate(time);
  const record = RECORDS.find((r) => r.province === province && r.active.from <= day && day <= r.active.to);
  if (!record) return { state: "not_checked", province, authority: null, published: null, release: null, page };
  const release = local(record.source);
  return {
    state: "ban",
    province,
    authority: lang === "fr" ? record.authority.fr ?? record.authority.en : record.authority.en,
    published: record.published,
    release: { url: release.value, english: release.english },
    page,
  };
}
