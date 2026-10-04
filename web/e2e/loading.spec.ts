// The Loading screen always ends: a check reaches its verdict, the first check in a page and the ones after it.
// Each check is made as a person makes it: the town picked on the Location screen, then "Tracing the air…", then the
// verdict. A check that stays on Loading fails with what the page was doing.
import { expect, test, type Page, type Route } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { TEST_ENGINE_URL } from "./engine";
import { toLocation } from "./look";

const demo = (town: string) => JSON.parse(readFileSync(new URL(`../../data/demo/${town}.json`, import.meta.url), "utf8"));
const CORS = { "access-control-allow-origin": "*" };
/** Loading shows for about 4 seconds; four times that is not slowness. */
const VERDICT_WITHIN_MS = 16_000;

async function start(page: Page, mode: "replay" | "live") {
  await page.goto(`/?mode=${mode}`);
  await page.waitForFunction((m) => sessionStorage.getItem("smoke-or-fire")?.includes(`"mode":"${m}"`), mode);
}

/** What the page says of itself, for a check that did not end. */
async function whatThePageIsDoing(page: Page, seen: string[]): Promise<string> {
  const state = await page.evaluate(() => ({
    address: location.pathname,
    title: document.querySelector("h1")?.textContent ?? null,
    loadingScreen: document.querySelector(".hours") !== null,
    stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => `${(link as HTMLLinkElement).href.split("/").pop()} ${(link as HTMLLinkElement).sheet ? "loaded" : "NOT LOADED"}`),
    files: (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
      .filter((entry) => /\/assets\/|\/vendor\/|\/tiles\//.test(entry.name))
      .map((entry) => `${entry.name.split("/").pop()} ${Math.round(entry.startTime)}+${Math.round(entry.duration)}ms`),
  }));
  return JSON.stringify({ ...state, seen }, null, 1);
}

/** One check from the Location screen: the town picked, then its verdict. */
async function pick(page: Page, town: string, what: string, seen: string[] = []) {
  await page.locator("input[type=search]").fill(town);
  await page.getByRole("option", { name: new RegExp(`^${town},`) }).first().click();
  const shown = await page.locator("#verdict-h").waitFor({ timeout: VERDICT_WITHIN_MS }).then(() => true, () => false);
  if (!shown) throw new Error(`${what} (${town}) did not reach its verdict in ${VERDICT_WITHIN_MS / 1000} s:\n${await whatThePageIsDoing(page, seen)}`);
}

/** What the page logs and what fails, kept for a check that does not end. */
function watch(page: Page): string[] {
  const seen: string[] = [];
  page.on("console", (message) => seen.push(`console.${message.type()}: ${message.text().slice(0, 300)}`));
  page.on("pageerror", (error) => seen.push(`page error: ${String(error).slice(0, 300)}`));
  page.on("requestfailed", (request) => seen.push(`request failed: ${request.url().split("/").pop()} ${request.failure()?.errorText ?? ""}`));
  return seen;
}

/** A phone that asks to save data: the Location screen fetches nothing ahead, so the Loading screen is the first to
 *  ask for the verdict screen's file. */
const saveData = (page: Page) => page.addInitScript(() => Object.defineProperty(navigator, "connection", { value: { saveData: true }, configurable: true }));

test.describe("a check always reaches its verdict", () => {
  test.describe.configure({ timeout: 120_000 }); // three checks, each behind its 4 seconds of Loading

  test("replay: three checks in one page, each opened by the Location screen's address", async ({ page }) => {
    const seen = watch(page);
    await start(page, "replay");
    for (const [n, town] of ["Moncton", "Halifax", "Moncton"].entries()) {
      await page.goto("/location");
      await pick(page, town, `check ${n + 1}`, seen);
    }
  });

  test("replay: a second check made as a person makes it, by New check and the three questions", async ({ page }) => {
    const seen = watch(page);
    await start(page, "replay");
    await page.goto("/location");
    await pick(page, "Moncton", "the first check", seen);
    for (const [n, town] of ["Halifax", "Moncton"].entries()) {
      await page.getByRole("link", { name: "New check" }).click();
      await page.getByRole("link", { name: "I smell smoke" }).click();
      await toLocation(page);
      await pick(page, town, `check ${n + 2}, after New check`, seen);
    }
  });

  test("live: three checks in one page, the engine answering each", async ({ page }) => {
    const seen = watch(page);
    await page.route(`${TEST_ENGINE_URL}/health`, (route: Route) => route.fulfill({ json: { status: "ok" }, headers: CORS }));
    await page.route(`${TEST_ENGINE_URL}/verdict**`, (route: Route) => route.fulfill({ json: { ...demo("moncton"), mode: "live" }, headers: CORS }));
    await start(page, "live");
    for (const n of [1, 2, 3]) {
      await page.goto("/location");
      await pick(page, "Moncton", `live check ${n}`, seen);
    }
  });
});

// Found while looking for a check that "never leaves Tracing the air". The verdict screen is a file of its own. Its
// bundler made the first request for that file wait for a stylesheet's "loaded" event before it even began: when the
// Loading screen was the first to ask (a phone that saves data; a tap in the first half second), one stylesheet that
// did not arrive held the whole check, with the answer already in hand.
test.describe("nothing but the answer and the verdict's own code can hold a check", () => {
  test("a stylesheet asked for after the first screen never arrives: the check still reaches its verdict", async ({ page }) => {
    const seen = watch(page);
    await saveData(page);
    // Every stylesheet of the app asked for once the Location screen is up is held, and never answered.
    let late = false;
    const held: string[] = [];
    await page.route(/\/assets\/[^/]+\.css(\?.*)?$/, (route) => {
      if (!late) return route.continue();
      held.push(route.request().url().split("/").pop()!);
      // never answered
    });
    await start(page, "replay");
    await page.goto("/location");
    await expect(page.getByRole("heading", { name: "Where are you?" })).toBeVisible();
    late = true;
    await pick(page, "Moncton", "the check", seen);
    await expect(page.locator("section.glance")).toHaveAttribute("data-state", "drifting");
    // And no screen asked for a stylesheet of its own: the app's styles came with the first screen.
    expect(held).toEqual([]);
  });

  test("the app has one stylesheet, loaded with the first screen: no later screen waits for one", async () => {
    const assets = readdirSync(new URL("../dist-e2e/assets/", import.meta.url));
    expect(assets.filter((name) => name.endsWith(".css"))).toHaveLength(1);
    // No file of the app names a stylesheet to wait for.
    const main = assets.find((name) => /^index-.*\.js$/.test(name))!;
    expect(readFileSync(new URL(`../dist-e2e/assets/${main}`, import.meta.url), "utf8")).not.toMatch(/assets\/[\w-]+\.css/);
  });

  test("the phone's clock steps back during a check (a time sync): Loading still shows for its 4 seconds, not for hours", async ({ page }) => {
    const seen = watch(page);
    const NOON = new Date("2026-10-04T15:00:00Z");
    await page.clock.setFixedTime(NOON);
    let answer: () => void = () => {};
    const asked = new Promise<void>((arrived) => {
      void page.route(`${TEST_ENGINE_URL}/verdict**`, async (route: Route) => {
        arrived();
        await new Promise<void>((release) => { answer = release; });
        await route.fulfill({ json: { ...demo("moncton"), mode: "live" }, headers: CORS });
      });
    });
    await page.route(`${TEST_ENGINE_URL}/health`, (route: Route) => route.fulfill({ json: { status: "ok" }, headers: CORS }));
    await start(page, "live");
    await page.goto("/location");
    await page.locator("input[type=search]").fill("Moncton");
    await page.getByRole("option", { name: /^Moncton,/ }).first().click();
    await asked;
    // The check is under way. The clock is set back two hours, then the engine answers.
    await page.clock.setFixedTime(new Date(NOON.getTime() - 2 * 3600_000));
    answer();
    const shown = await page.locator("#verdict-h").waitFor({ timeout: VERDICT_WITHIN_MS }).then(() => true, () => false);
    if (!shown) throw new Error(`with the clock set back, the check did not reach its verdict in ${VERDICT_WITHIN_MS / 1000} s:\n${await whatThePageIsDoing(page, seen)}`);
  });
});
