// "Best time to air out your home" as the browser tests use it: live answers whose smoke forecast is built here, hour
// by hour, in the engine's shape (engine/smoke_engine/app.py, `smokeForecast`).
import type { Page, Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { TEST_ENGINE_URL } from "./engine";
import { sheetTo } from "./verdict";

export type Lang = "en" | "fr";
// The shared tables, and this feature's own words (src/airout/strings.*.json: they ship with its files).
const strings = (lang: Lang): Record<string, string> => Object.assign({}, ...[`i18n/${lang}.json`, `airout/strings.${lang}.json`].map((file) => JSON.parse(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"))));
export const STRINGS: Record<Lang, Record<string, string>> = { en: strings("en"), fr: strings("fr") };
export const s = (lang: Lang, key: string, vars: Record<string, string | number> = {}) =>
  STRINGS[lang][key].replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));

const demo = (town: string) => JSON.parse(readFileSync(new URL(`../../data/demo/${town}.json`, import.meta.url), "utf8"));
const MONCTON = demo("moncton");
const BREAKS = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const RULES = { hours: 48, minWindowHours: 3, maxLevel: 1, breaks: BREAKS };
/** The check: Sunday, Oct 4, 2026 at 06:24 UTC, 3:24 a.m. in Moncton. The forecast starts with its hour. */
export const FIRST_HOUR = "2026-10-04T06:00:00Z";
const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");

/** A level's smoke, in the middle of its class of ECCC's legend. */
const ugm3 = (level: number) => (level === 0 ? 0 : level === 1 ? 4.9 : level === 11 ? 120.4 : BREAKS[level - 1] + 4.2);

/**
 * The engine's `smokeForecast` for 48 hourly `levels` from FIRST_HOUR. `window`: the best time, as indexes of its
 * first and last hours with its level, as the engine's rule gives it. In Moncton in early October the sun is up from
 * 10:20 to 21:53 UTC: the hours 11:00 to 21:00 UTC are day.
 */
export function forecast(levels: number[], window: [first: number, last: number, level: number] | null) {
  const start = Date.parse(FIRST_HOUR);
  const hours = levels.map((level, i) => {
    const time = new Date(start + i * 3_600_000);
    return { time: iso(time.getTime()), ugm3: ugm3(level), level, day: time.getUTCHours() >= 11 && time.getUTCHours() <= 21 };
  });
  return {
    state: window ? "window" : "none",
    source: "eccc_geomet",
    layer: "RAQDPS.Sfc_PM2.5-WildfireSmokePlume",
    run: "2026-10-04T00:00:00Z",
    checkedAt: "2026-10-04T06:24:36Z",
    window: window && { start: hours[window[0]].time, end: hours[window[1]].time, level: window[2], fromNow: window[0] === 0, toEnd: window[1] === levels.length - 1 },
    hours,
    rules: RULES,
  };
}
export const NOT_AVAILABLE = { state: "not_available", source: "eccc_geomet", layer: "RAQDPS.Sfc_PM2.5-WildfireSmokePlume", run: null, checkedAt: null, window: null, hours: [], rules: RULES };

/** `count` hours at `level`, to build a list of levels. */
export const run = (level: number, count: number) => Array.from({ length: count }, () => level);

export const FORECASTS = {
  // MSC GeoMet's own answer for Moncton on Oct 4, 2026 (data/samples/smoke-forecast-moncton.json): clear for 2 hours,
  // light smoke from 6 to 10 a.m., then clear to the last hour.
  sample: forecast([...run(0, 3), ...run(1, 5), ...run(0, 40)], [8, 47, 0]),
  // Smoke until Monday 5 a.m., four clear hours, then smoke again.
  mondayMorning: forecast([...run(5, 9), ...run(3, 17), ...run(0, 4), ...run(2, 18)], [26, 29, 0]),
  // Never clear: the lowest class from Sunday 10 p.m. to Monday 6 a.m. is the best there is.
  lightOvernight: forecast([...run(4, 19), ...run(1, 9), ...run(6, 20)], [19, 27, 1]),
  clearNow: forecast([...run(0, 6), ...run(3, 42)], [0, 5, 0]),
  noSmoke: forecast(run(0, 48), [0, 47, 0]),
  none: forecast([...run(2, 10), ...run(0, 3), ...run(7, 15), ...run(11, 20)], null),
  // Every class of ECCC's legend, one after the other, four times over.
  everyLevel: forecast(Array.from({ length: 48 }, (_, i) => i % 12), null),
};

/** A live answer: the engine's recorded one for Moncton (drifting smoke) or for `town`, marked live, with
 *  `smokeForecast` (undefined: an older engine, no field). */
export function liveAnswer(smokeForecast: object | undefined, town?: string) {
  const { smokeForecast: _recorded, ...answer } = town ? demo(town) : MONCTON;
  return { ...answer, mode: "live", ...(smokeForecast ? { smokeForecast } : {}) };
}

export async function start(page: Page, lang: Lang, mode: "replay" | "live") {
  await page.goto(`/?mode=${mode}`);
  await page.waitForFunction((m) => sessionStorage.getItem("smoke-or-fire")?.includes(`"mode":"${m}"`), mode);
  if (lang === "fr") {
    await page.getByRole("button", { name: "Français" }).click();
    await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"lang":"fr"'));
  }
}

/**
 * Moncton's verdict (drifting smoke), with the tile under "Why?". Live: the engine answers GET /verdict with
 * `smokeForecast` in its answer. `town`: another replay town's verdict in its place (Halifax: unexplained smoke).
 */
export async function verdict(page: Page, lang: Lang, mode: "replay" | "live", smokeForecast?: object, town = "Moncton") {
  if (mode === "live") {
    await page.route(`${TEST_ENGINE_URL}/verdict**`, (route: Route) => route.fulfill({ json: liveAnswer(smokeForecast, town.toLowerCase()), headers: { "access-control-allow-origin": "*" } }));
  }
  await start(page, lang, mode);
  await page.goto("/location");
  await page.locator("input[type=search]").fill(town);
  await page.getByRole("option", { name: new RegExp(`^${town},`) }).first().click();
  // Loading shows for 4 seconds; a busy machine needs more than the 15 the other specs give it.
  await page.locator("#verdict-h").waitFor({ timeout: 45_000 });
}

/** The chip on the verdict: in the sheet at its half height, one tap up from the card ("Sources and why"). */
export async function chipOnVerdict(page: Page) {
  await sheetTo(page, "half");
  return page.locator("main .airout-chip");
}

/** The tile on the verdict: in the sheet at its full height, under everything "Why?" opens. */
export async function tileOnVerdict(page: Page) {
  await sheetTo(page, "full");
  return page.locator("main .airout-tile");
}

/** The screen itself: the verdict, then a tap on its chip. */
export async function airOut(page: Page, lang: Lang, mode: "replay" | "live", smokeForecast?: object) {
  await verdict(page, lang, mode, smokeForecast);
  await (await chipOnVerdict(page)).click();
  await page.locator("main.airout h1").waitFor();
}
