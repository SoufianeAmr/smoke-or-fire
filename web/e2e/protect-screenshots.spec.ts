// Pictures of "Protect your home", in English and French: the verdict's button, then the screen at each air quality
// band with the switch off and on, a tile open, the band's source, no reading, and a small phone. Saved to screenshots/
// as <nn>-protect-<name>-<lang>.png, for a person to look at; nothing is compared. Each band is a live answer (the
// engine's recorded one for Moncton with the AQHI at that band); the first and last pictures are the replay.
// Never part of `npm run e2e`: run with `npm run e2e:shots`.
import { test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BANDS, LANGS, TEST_TIMEOUT, expect, live, replay, start, verdictFor, type Lang } from "./protect";

test.describe.configure({ timeout: TEST_TIMEOUT });

const OUT = fileURLToPath(new URL("../screenshots", import.meta.url));
const SMALL = { width: 375, height: 667 };

const atRisk = (page: Page) => page.locator("main.protect-main").getByRole("switch");
const tile = (page: Page, id: string) => page.locator(`main li.protect-tile[data-tile="${id}"] button.protect-tile-toggle`);
/** The switch on: ECCC's message for the at-risk population is on the screen. */
async function switchOn(page: Page) {
  await atRisk(page).click();
  await expect(page.locator("main .protect-message")).toBeVisible();
}

/** `whole`: the picture shows the whole page, however tall, with the 911 bar at its foot. `phone`: a smaller screen. */
type Shot = { name: string; file: string; whole?: boolean; phone?: { width: number; height: number }; open: (page: Page, lang: Lang) => Promise<void> };

const SHOTS: Shot[] = [
  {
    name: "30 The verdict’s button at very high risk (Moncton replay): filled",
    file: "30-protect-verdict-button-very-high",
    whole: true,
    open: async (page, lang) => {
      await start(page, lang);
      await verdictFor(page, "Moncton");
      await expect(page.locator("main a.protect-link")).toHaveAttribute("data-tone", "raised");
    },
  },
  {
    name: "31 The verdict’s button at low risk (Halifax replay): quiet, under Call 911 as the main action",
    file: "31-protect-verdict-button-low",
    whole: true,
    open: async (page, lang) => {
      await start(page, lang);
      await verdictFor(page, "Halifax");
      await expect(page.locator("main a.protect-link")).toHaveAttribute("data-tone", "calm");
    },
  },
  // Each band, with the switch off (as the screen opens) and on.
  ...BANDS.flatMap((band, i): Shot[] => [
    { name: `${32 + 2 * i} ${band}, switch off`, file: `${32 + 2 * i}-protect-${band.replace("_", "-")}-off`, whole: true, open: (page, lang) => live(page, lang, band) },
    {
      name: `${33 + 2 * i} ${band}, switch on: ECCC’s message for the at-risk population`,
      file: `${33 + 2 * i}-protect-${band.replace("_", "-")}-on`,
      whole: true,
      open: async (page, lang) => {
        await live(page, lang, band);
        await switchOn(page);
      },
    },
  ]),
  {
    name: "40 A tile open: the portable air cleaner, Health Canada’s sentences and their two sources",
    file: "40-protect-tile-open",
    whole: true,
    open: async (page, lang) => {
      await live(page, lang, "high");
      await tile(page, "cleaner").click();
      await expect(page.locator("#protect-cleaner")).toBeVisible();
    },
  },
  {
    name: "41 The band open: the reading, who measured it and when, and ECCC’s page (Moncton replay)",
    file: "41-protect-band-open",
    whole: true,
    open: async (page, lang) => {
      await replay(page, lang);
      await page.locator("main button.protect-band-toggle").click();
      await expect(page.locator("#protect-band")).toBeVisible();
    },
  },
  {
    name: "42 No reading in the last 2 hours, switch on: no message is picked",
    file: "42-protect-no-reading-on",
    whole: true,
    open: async (page, lang) => {
      await live(page, lang, null);
      await switchOn(page);
    },
  },
  { name: "43 On a small phone (375 × 667), as the screen opens (Moncton replay)", file: "43-protect-small", phone: SMALL, open: (page, lang) => replay(page, lang) },
  {
    name: "44 Nothing explains the smoke (Halifax replay, low risk): quiet, with the area-wide note, switch on",
    file: "44-protect-unexplained-low-on",
    whole: true,
    open: async (page, lang) => {
      await replay(page, lang, "Halifax");
      await switchOn(page);
    },
  },
  {
    name: "46 A fire close by (Bridgetown replay): the verdict’s notice comes before the advice",
    file: "46-protect-fire-close",
    whole: true,
    open: (page, lang) => replay(page, lang, "Bridgetown"),
  },
  {
    name: "45 After “Forget my answer”: the switch off, and the screen says the answer is no longer on the device",
    file: "45-protect-forgotten",
    whole: true,
    open: async (page, lang) => {
      await live(page, lang, "moderate");
      await switchOn(page);
      await page.locator("main button.protect-forget").click();
      await expect(page.locator("main").getByRole("status")).not.toHaveText("");
    },
  },
];

/** Wait as screenshots.spec.ts does (the network quiet, the fonts in), switch animations off, and save the picture. */
async function save(page: Page, file: string, whole = false) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
  if (whole) {
    await page.setViewportSize({ width: page.viewportSize()!.width, height: await page.evaluate(() => document.documentElement.scrollHeight) });
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, file) });
}

for (const lang of LANGS) {
  test.describe(`Pictures of Protect your home, ${lang.toUpperCase()}`, () => {
    for (const shot of SHOTS) {
      test(shot.name, async ({ page }) => {
        if (shot.phone) await page.setViewportSize(shot.phone);
        await shot.open(page, lang);
        await save(page, `${shot.file}-${lang}.png`, shot.whole);
      });
    }
  });
}
