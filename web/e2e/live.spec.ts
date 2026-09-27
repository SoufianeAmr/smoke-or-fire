// Live mode in the browser: Check → Q1 → Location → Loading → Verdict from GET /verdict.
// The engine is answered with a real engine answer (data/demo/moncton.json), marked live.
import { expect, test, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { TEST_ENGINE_URL } from "./engine";

const LIVE_ANSWER = { ...JSON.parse(readFileSync(new URL("../../data/demo/moncton.json", import.meta.url), "utf8")), mode: "live" };
const CORS = { "access-control-allow-origin": "*" };

/** Answers GET /verdict with `reply`; returns the query of each request. */
async function engine(page: Page, reply: (route: Route) => Promise<void>) {
  const asked: URLSearchParams[] = [];
  await page.route(`${TEST_ENGINE_URL}/verdict**`, (route) => {
    asked.push(new URL(route.request().url()).searchParams);
    return reply(route);
  });
  return asked;
}
const answer = (route: Route) => route.fulfill({ json: LIVE_ANSWER, headers: CORS });
/** As the engine does, the answer's location is the spot it was asked about. */
const echo = (route: Route) => {
  const query = new URL(route.request().url()).searchParams;
  const location = { ...LIVE_ANSWER.location, lat: Number(query.get("lat")), lon: Number(query.get("lon")) };
  return route.fulfill({ json: { ...LIVE_ANSWER, location }, headers: CORS });
};
const libraryHref = (page: Page) => page.getByRole("link", { name: "Find a library near me" }).getAttribute("href");

/** Open the app in live mode and wait until the mode is saved, so later page.goto() calls stay live. */
async function openLive(page: Page) {
  await page.goto("/?mode=live");
  await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes(`"mode":"live"`));
}

test("Live: Check → Q1 → Location → Loading → Verdict from GET /verdict", async ({ page }) => {
  const asked = await engine(page, answer);
  await openLive(page);
  await page.getByRole("link", { name: "I smell smoke" }).click();
  await page.getByRole("link", { name: /Just smoke or haze/ }).click();

  // Live search covers every Maritimes community, not only the replay towns.
  await page.getByLabel("Town or city").fill("Shedi");
  await page.getByRole("option", { name: /^Shediac, NB/ }).click();

  await expect(page.getByRole("heading", { name: "Tracing the air you’re breathing…" })).toBeVisible();
  await expect(page).toHaveURL(/\/verdict$/, { timeout: 15_000 });
  await expect(page.getByText("DRIFTING SMOKE")).toBeVisible();
  await expect(page.getByRole("link", { name: "Exit" })).toHaveCount(0); // no replay banner
  expect(asked.map((q) => [q.get("lat"), q.get("lon"), q.get("mode")])).toEqual([["46.22127", "-64.53977", "live"]]);
});

test.describe("Live: Use my location", () => {
  test.use({ geolocation: { latitude: 46.2, longitude: -64.55 }, permissions: ["geolocation"] });

  test("checks the spot the phone reports, named after the nearest town", async ({ page }) => {
    const asked = await engine(page, answer);
    await openLive(page);
    await page.goto("/location");
    await page.getByRole("link", { name: "Use my location" }).click();

    await expect(page.getByText("Location found:")).toBeVisible();
    await expect(page.getByText("Location found:").locator("..")).toContainText("Shediac, NB");
    await expect(page).toHaveURL(/\/verdict$/, { timeout: 15_000 });
    expect(asked.map((q) => [q.get("lat"), q.get("lon")])).toEqual([["46.2", "-64.55"]]);
  });

  test("a break from the smoke: the map searches are around the phone's spot", async ({ page }) => {
    await engine(page, echo);
    await openLive(page);
    await page.goto("/location");
    await page.getByRole("link", { name: "Use my location" }).click();
    await expect(page).toHaveURL(/\/verdict$/, { timeout: 15_000 });
    expect(await libraryHref(page)).toBe("https://www.google.com/maps/search/library/@46.2,-64.55,13z");
  });
});

test("Live: a break from the smoke, with the map searches around the town picked (Shediac)", async ({ page }) => {
  await engine(page, echo);
  await openLive(page);
  await page.goto("/location");
  await page.getByLabel("Town or city").fill("Shedi");
  await page.getByRole("option", { name: /^Shediac, NB/ }).click();
  await expect(page).toHaveURL(/\/verdict$/, { timeout: 15_000 });
  expect(await libraryHref(page)).toBe("https://www.google.com/maps/search/library/@46.221,-64.54,13z");
});

const FAILURES: [string, (route: Route) => Promise<void>][] = [
  ["the engine answers 503", (route) => route.fulfill({ status: 503, json: { error: "wind_data_unavailable" }, headers: CORS })],
  ["the engine cannot be reached", (route) => route.abort()],
];
for (const [what, fail] of FAILURES) {
  test(`Live: when ${what}, the check ends on screen 9b`, async ({ page }) => {
    await engine(page, fail);
    await openLive(page);
    await page.goto("/location");
    await page.getByLabel("Town or city").fill("Monc");
    await page.getByRole("option", { name: /Moncton, NB/ }).click();

    await expect(page).toHaveURL(/\/no-data$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("We can’t check the air right now");
  });
}
