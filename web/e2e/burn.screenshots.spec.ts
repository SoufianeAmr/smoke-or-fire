// Pictures of the "Is burning allowed today?" card in each of its states, in English and French, 390 px wide: saved to
// screenshots/burn/ as <nn>-<state>-<lang>.png, for a person to look at. Live answers but for the replay's own (not
// checked). Nothing is compared: a picture's test fails only when its card could not be reached. Never part of
// `npm run e2e`: run with `npm run e2e:shots`.
import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TEST_ENGINE_URL } from "./engine";

// A screen tall enough for the whole card to show above the 911 bar: the picture is of the card, uncovered.
test.use({ viewport: { width: 390, height: 1700 } });

type Lang = "en" | "fr";
const OUT = fileURLToPath(new URL("../screenshots/burn", import.meta.url));
const demo = (town: string) => JSON.parse(readFileSync(new URL(`../../data/demo/${town}.json`, import.meta.url), "utf8"));
const CATEGORY = ["no_burn", "restricted", "permitted"];
/** A live answer for Moncton made of the engine's recorded one, with the province's answer for Westmorland County. */
const liveAnswer = (state: string) => {
  const recorded = demo("moncton");
  return {
    ...recorded,
    mode: "live",
    wind: { ...recorded.wind, run: "2025-08-25T06:00:00Z", recordedAt: null },
    burn: {
      state,
      county: "Westmorland",
      validUntil: CATEGORY.includes(state) ? "2025-08-25T17:00:00Z" : null,
      checkedAt: state === "not_checked" ? null : "2025-08-25T11:52:07Z",
      source: "gnb_burn_categories",
      reason: state === "not_checked" ? "unavailable" : null,
    },
  };
};

async function open(page: Page, lang: Lang, mode: "replay" | "live") {
  // The phone's clock is the time of the engine's recorded answer: 9 a.m. Atlantic on Aug 25, 2025.
  await page.clock.setFixedTime(new Date("2025-08-25T12:00:00Z"));
  await page.goto(`/?mode=${mode}`);
  await page.waitForFunction((m) => sessionStorage.getItem("smoke-or-fire")?.includes(`"mode":"${m}"`), mode);
  if (lang === "fr") {
    await page.getByRole("button", { name: "Français" }).click();
    await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"lang":"fr"'));
  }
  await page.goto("/location");
  await page.locator("input[type=search]").fill("Moncton");
  await page.getByRole("option", { name: /^Moncton,/ }).first().click();
  await expect(page.locator("#verdict-h")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("main section.burn")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

const SHOTS: { file: string; name: string; state?: string; sources?: boolean; screen?: boolean }[] = [
  { file: "01-no-burn", name: "no burning (red octagon)", state: "no_burn" },
  { file: "02-restricted", name: "restricted, 8 p.m. to 8 a.m. (amber triangle)", state: "restricted" },
  { file: "03-permitted", name: "burning permitted (green circle with a flame)", state: "permitted" },
  { file: "04-season-closed", name: "fire season closed (outlined square)", state: "season_closed" },
  { file: "05-not-checked", name: "not checked, live (dashed ring)", state: "not_checked" },
  { file: "06-replay-not-checked", name: "the replay: not checked, no past status kept" },
  { file: "07-sources", name: "the sources, opened", state: "no_burn", sources: true },
  { file: "08-on-the-verdict", name: "the card on the verdict screen, under Why?", state: "no_burn", screen: true },
];

for (const lang of ["en", "fr"] as const) {
  for (const shot of SHOTS) {
    test(`${shot.file} ${lang.toUpperCase()}: ${shot.name}`, async ({ page }) => {
      if (shot.state) await page.route(`${TEST_ENGINE_URL}/verdict**`, (route: Route) => route.fulfill({ json: liveAnswer(shot.state!), headers: { "access-control-allow-origin": "*" } }));
      await open(page, lang, shot.state ? "live" : "replay");
      const card = page.locator("main section.burn");
      if (shot.sources) await card.locator(".burn-sources-toggle").click();
      mkdirSync(OUT, { recursive: true });
      const path = join(OUT, `${shot.file}-${lang}.png`);
      if (shot.screen) {
        // The whole screen: the glance card, the badges, "Why?", then the burn card, and the 911 bar at its foot.
        await page.screenshot({ path });
      } else {
        await card.scrollIntoViewIfNeeded();
        await card.screenshot({ path });
      }
    });
  }
}
