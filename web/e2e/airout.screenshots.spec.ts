// Pictures of "Best time to air out your home": its tile on the verdict and each state of its screen, in English and
// French, saved to screenshots/ as airout-<name>-<lang>.png for a person to look at. Nothing is compared. Never part of
// `npm run e2e`: run with `npm run e2e:shots`.
import { test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FORECASTS, NOT_AVAILABLE, airOut, tileOnVerdict, verdict, type Lang } from "./airout";

const OUT = fileURLToPath(new URL("../screenshots", import.meta.url));
mkdirSync(OUT, { recursive: true });

/** The whole page in one picture, with the 911 bar where it sits: at the bottom, not across the middle. */
async function shot(page: Page, name: string) {
  const { width } = page.viewportSize()!;
  await page.setViewportSize({ width, height: await page.evaluate(() => document.documentElement.scrollHeight) });
  await page.screenshot({ path: join(OUT, `airout-${name}.png`) });
}

const STATES: [string, object][] = [
  ["window-from", FORECASTS.sample],
  ["window-monday-morning", FORECASTS.mondayMorning],
  ["window-light-overnight", FORECASTS.lightOvernight],
  ["window-now", FORECASTS.clearNow],
  ["none", FORECASTS.none],
  ["every-level", FORECASTS.everyLevel],
  ["not-available", NOT_AVAILABLE],
];

for (const lang of ["en", "fr"] as Lang[]) {
  test(`${lang}: the tile on the verdict`, async ({ page }) => {
    await verdict(page, lang, "live", FORECASTS.mondayMorning);
    await tileOnVerdict(page);
    await shot(page, `tile-${lang}`);
  });
  for (const [name, forecast] of STATES) {
    test(`${lang}: ${name}`, async ({ page }) => {
      await airOut(page, lang, "live", forecast);
      await shot(page, `${name}-${lang}`);
    });
  }
  test(`${lang}: the replay`, async ({ page }) => {
    await airOut(page, lang, "replay");
    await shot(page, `replay-${lang}`);
  });
  test(`${lang}: a small phone, and the list`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await airOut(page, lang, "live", FORECASTS.mondayMorning);
    await page.locator("main.airout button[aria-controls=strip-list]").click();
    await shot(page, `small-list-${lang}`);
  });
  test(`${lang}: a 390 px phone zoomed to 200%`, async ({ page }) => {
    await page.setViewportSize({ width: 195, height: 422 });
    await airOut(page, lang, "live", FORECASTS.mondayMorning);
    await shot(page, `zoom-200-${lang}`);
  });
}
