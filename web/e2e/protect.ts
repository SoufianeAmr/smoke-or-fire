// "Protect your home" as the browser tests reach it: a verdict (a replay town's, or a live one at a chosen air
// quality band), then the verdict's button.
import { expect as playwrightExpect, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { TEST_ENGINE_URL } from "./engine";
import { sheetTo } from "./verdict";

/** A slow machine (other test runs at the same time) is not a failure: waits are generous. */
export const expect = playwrightExpect.configure({ timeout: 15_000 });
/** For a whole test, as test.describe.configure({ timeout }) takes it. */
export const TEST_TIMEOUT = 120_000;

export type Lang = "en" | "fr";
export type Band = "low" | "moderate" | "high" | "very_high";
export const LANGS = ["en", "fr"] as const;
export const BANDS = ["low", "moderate", "high", "very_high"] as const;

const demo = (town: string) => JSON.parse(readFileSync(new URL(`../../data/demo/${town}.json`, import.meta.url), "utf8"));

/** Check, in a mode and a language; saved, so the next page.goto() opens the same way. */
export async function start(page: Page, lang: Lang, mode: "replay" | "live" = "replay") {
  await page.goto(`/?mode=${mode}`);
  await page.waitForFunction((m) => sessionStorage.getItem("smoke-or-fire")?.includes(`"mode":"${m}"`), mode);
  if (lang === "fr") {
    await page.getByRole("button", { name: "Français" }).click();
    await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"lang":"fr"'));
  }
}

/**
 * A town's verdict: its glance card in front. Now and then a check stays on the loading screen (about 1 in 100 here; the
 * app's existing tests showed the same before this feature). This screen is not what these tests are about: such a
 * check is made again, once.
 */
export async function verdictFor(page: Page, town: string) {
  for (const last of [false, true]) {
    await page.goto("/location");
    await page.locator("input[type=search]").fill(town);
    await page.getByRole("option", { name: new RegExp(`^${town},`) }).first().click();
    const shown = await page.locator("#verdict-h").waitFor({ timeout: last ? 45_000 : 25_000 }).then(() => true, () => false);
    if (shown) return;
  }
  await expect(page.locator("#verdict-h"), "the verdict, after two checks").toBeVisible({ timeout: 1 });
}

/** The verdict's button: in the sheet with the sources and "Why?", one tap up from the card ("Sources and why"). */
export async function protectButton(page: Page) {
  await sheetTo(page, "half");
  return page.locator("main a.protect-link");
}

/** The verdict's button, tapped: the screen is in front. */
export async function open(page: Page) {
  await (await protectButton(page)).click();
  await expect(page).toHaveURL(/\/protect$/);
  await expect(page.locator("main.protect-main h1")).toBeVisible();
}

/**
 * "New check", from the verdict. Its link is in the top bar, and a raised sheet may stand over that bar (in New
 * Brunswick the sheet at half also holds the burn card): the sheet is lowered first, as a person does ("Show the map").
 */
export async function newCheck(page: Page) {
  await sheetTo(page, "peek");
  await page.getByRole("link", { name: "New check" }).click();
}

/** A replay town's verdict, then the screen. Moncton: AQHI 10+ (very high). Halifax: 2 (low), unexplained smoke. */
export async function replay(page: Page, lang: Lang, town = "Moncton") {
  await start(page, lang, "replay");
  await verdictFor(page, town);
  await open(page);
}

const READING: Record<Band, object> = {
  low: { value: 2, display: "2", segments: 2, category: "low" },
  moderate: { value: 5, display: "5", segments: 5, category: "moderate" },
  high: { value: 8, display: "8", segments: 8, category: "high" },
  very_high: { value: 11, display: "10+", segments: 11, category: "very_high" },
};

/** The engine's recorded answer for Moncton, as a live one, with the AQHI at a band; null: no reading in the last 2 hours. */
export const answerAt = (band: Band | null) => {
  const recorded = demo("moncton");
  return { ...recorded, mode: "live", wind: { ...recorded.wind, run: "2026-10-03T18:00:00Z", recordedAt: null }, aqhi: band && { ...recorded.aqhi, ...READING[band] } };
};

/** The engine answers GET /verdict with `answer`. */
export const engine = (page: Page, answer: object) => page.route(`${TEST_ENGINE_URL}/verdict**`, (route: Route) => route.fulfill({ json: answer, headers: { "access-control-allow-origin": "*" } }));

/** A live verdict at a band, then the screen. */
export async function live(page: Page, lang: Lang, band: Band | null) {
  await engine(page, answerAt(band));
  await start(page, lang, "live");
  await verdictFor(page, "Moncton");
  await open(page);
}
