// Pictures of the three questions and the screens around them, in English and French, at 390 × 844 in replay mode:
// saved to screenshots/ as <nn>-<name>-<lang>.png, for a person to look at. Nothing is compared: a picture's test fails
// only when its screen could not be reached. Never part of `npm run e2e`: run with `npm run e2e:shots`.
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { answer } from "./look";

type Lang = "en" | "fr";
const STRINGS: Record<Lang, Record<string, string>> = {
  en: JSON.parse(readFileSync(new URL("../src/i18n/en.json", import.meta.url), "utf8")),
  fr: JSON.parse(readFileSync(new URL("../src/i18n/fr.json", import.meta.url), "utf8")),
};
const OUT = fileURLToPath(new URL("../screenshots", import.meta.url));
// What the phone answers on "Show my location": Moncton's own point in the community list (NRCan CGNDB), good to 20 m,
// so the nearest community is Moncton and the picture reads "Near Moncton, NB".
const MONCTON = { latitude: 46.0995, longitude: -64.7998, accuracy: 20 };

/** Check in replay mode, in the language; saved, so the next page.goto() opens the same way. */
async function start(page: Page, lang: Lang) {
  await page.goto("/?mode=replay");
  await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"mode":"replay"'));
  if (lang === "fr") {
    await page.getByRole("button", { name: "Français" }).click();
    await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"lang":"fr"'));
  }
}

/** A question, opened by its address: in front once its answers take taps. */
async function question(page: Page, route: "/q1" | "/q2" | "/q3") {
  await page.goto(route);
  await expect(page).toHaveURL(new RegExp(`${route}$`));
  await expect(page.locator('main .look-answers[data-ready="true"]')).toBeVisible();
}

type Shot = { name: string; file: string; open: (page: Page, lang: Lang) => Promise<void> };

const SHOTS: Shot[] = [
  {
    name: "01 Check",
    file: "01-check",
    // Already open after the start: I smell smoke, and the 911 bar under it.
    open: async (page) => {
      await expect(page.locator('main a[href="/q1"]')).toBeVisible();
      await expect(page.locator('a[href="tel:911"]')).toBeVisible();
    },
  },
  { name: "02 Q1", file: "02-q1", open: (page) => question(page, "/q1") },
  { name: "03 Q2", file: "03-q2", open: (page) => question(page, "/q2") },
  { name: "04 Q3", file: "04-q3", open: (page) => question(page, "/q3") },
  {
    name: "05 Q3, About these questions open",
    file: "05-q3-about",
    open: async (page) => {
      await question(page, "/q3");
      await page.locator("main .look-about-toggle").click();
      await expect(page.locator("#look-about-text")).toBeVisible();
    },
  },
  {
    name: "06 Nearby fire",
    file: "06-nearby-fire",
    open: async (page) => {
      await page.goto("/nearby-fire");
      await expect(page).toHaveURL(/\/nearby-fire$/);
      await expect(page.locator('main.nearby-main a[href="tel:911"]')).toBeVisible();
    },
  },
  {
    name: "07 Call 911 now, no location",
    file: "07-call-911-now",
    // Reached as a person does, by answering Yes: only "Show my location" under Where you are.
    open: async (page) => {
      await question(page, "/q1");
      await answer(page, "yes");
      await expect(page).toHaveURL(/\/emergency$/);
      await expect(page.locator("main .where-show")).toBeVisible();
      await expect(page.locator("main .where-name, main .where-coords")).toHaveCount(0);
    },
  },
  {
    name: "08 Call 911 now, with the phone's location",
    file: "08-call-911-now-location",
    // The phone allows its location and answers on the tap: the coordinates at once, the town's name when the list of
    // communities has loaded. The picture is taken with or without the name.
    open: async (page) => {
      await page.context().grantPermissions(["geolocation"]);
      await page.context().setGeolocation(MONCTON);
      await page.goto("/emergency");
      await page.locator("main .where-show").click();
      await expect(page.locator("main .where-coords")).toBeVisible();
      await page.locator("main .where-name").waitFor({ timeout: 5_000 }).catch(() => {});
    },
  },
  {
    name: "09 Check, Add to home screen open",
    file: "09-check-add-to-home-screen",
    // On a computer: both phones' steps, and the sheet's own Call 911 button.
    open: async (page, lang) => {
      await page.getByRole("button", { name: STRINGS[lang]["keep.add"], exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("dialog").locator('a[href="tel:911"]')).toBeVisible();
    },
  },
];

/** Wait as pixels.spec.ts does (the network quiet, the fonts in), switch animations off, and save the picture. */
async function save(page: Page, file: string) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, file) });
}

for (const lang of ["en", "fr"] as const) {
  test.describe(`Pictures, ${lang.toUpperCase()}`, () => {
    // One test per picture: a screen that can't be reached doesn't hide the others.
    for (const shot of SHOTS) {
      test(shot.name, async ({ page }) => {
        await start(page, lang);
        await shot.open(page, lang);
        await save(page, `${shot.file}-${lang}.png`);
      });
    }
  });
}
