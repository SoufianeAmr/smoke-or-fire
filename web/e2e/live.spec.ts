// Live mode in the browser: Check → the three questions → Location → Loading → Verdict from GET /verdict.
// The engine is answered with a real engine answer (data/demo/moncton.json), marked live.
import { expect, test, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { TEST_ENGINE_URL } from "./engine";
import { toLocation } from "./look";
import { openWhy } from "./verdict";

const NBSP = String.fromCharCode(0xa0);
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
/** The library search of the What to do card, which is behind "Why?". */
const libraryHref = async (page: Page) => {
  await openWhy(page);
  return page.getByRole("link", { name: "Find a library near me" }).getAttribute("href");
};

/** Open the app in live mode and wait until the mode is saved, so later page.goto() calls stay live. */
async function openLive(page: Page) {
  await page.goto("/?mode=live");
  await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes(`"mode":"live"`));
}

test("Live: Check → the three questions → Location → Loading → Verdict from GET /verdict", async ({ page }) => {
  const asked = await engine(page, answer);
  await openLive(page);
  await page.getByRole("link", { name: "I smell smoke" }).click();
  await expect(page.getByRole("heading", { name: "Do you see flames?" })).toBeVisible();
  await toLocation(page); // no flames, grey haze, nothing burning nearby

  // Live search covers every Maritimes community, not only the replay towns.
  await page.getByLabel("Town or city").fill("Shedi");
  await page.getByRole("option", { name: /^Shediac, NB/ }).click();

  await expect(page.getByRole("heading", { name: "Tracing the air you’re breathing…" })).toBeVisible();
  await expect(page).toHaveURL(/\/verdict$/, { timeout: 15_000 });
  // The glance card as the verdict opens; the band's words are behind "Why?".
  await expect(page.locator("section.glance")).toHaveAttribute("data-state", "drifting");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Drifting smoke${NBSP}· Long Lake fire${NBSP}· 159 km SSW`);
  const label = page.getByText("DRIFTING SMOKE", { exact: true });
  await expect(label).toHaveCount(1);
  await expect(label).toBeHidden();
  await openWhy(page);
  await expect(label).toBeVisible();
  await expect(page.getByRole("link", { name: "Exit" })).toHaveCount(0); // no replay banner
  expect(asked.map((q) => [q.get("lat"), q.get("lon"), q.get("mode")])).toEqual([["46.22127", "-64.53977", "live"]]);
  // The three answers stay on the phone: the engine is asked about the spot and nothing else.
  expect(asked.map((q) => [...q.keys()].sort())).toEqual([["lat", "lon", "mode"]]);
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

/** Check Moncton in live mode: the loading screen, then whatever the engine's answers lead to. */
async function checkMoncton(page: Page) {
  await openLive(page);
  await page.goto("/location");
  await page.getByLabel("Town or city").fill("Monc");
  await page.getByRole("option", { name: /Moncton, NB/ }).click();
  await expect(page).toHaveURL(/\/loading$/);
}

const WAKING = { en: "Waking up the smoke engine… this can take a few minutes.", fr: "Réveil du moteur de fumée… cela peut prendre quelques minutes." };

test("Live: the engine's own no-data answer (a 503 with its error) ends the check on screen 9b at once, asked once", async ({ page }) => {
  const asked = await engine(page, (route) => route.fulfill({ status: 503, json: { error: "wind_data_unavailable" }, headers: CORS }));
  await checkMoncton(page);

  await expect(page).toHaveURL(/\/no-data$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We can’t check the air right now");
  await expect(page.getByText("Fire or wind data isn’t loading, so we can’t tell you where this smoke is from.")).toBeVisible();
  expect(asked).toHaveLength(1);
});

// A free Render service sleeps when idle. It takes about a minute to come back, and its disk is wiped, so the engine's
// first wind grid takes about two more minutes: until then the engine is "not answering yet". Loading keeps asking,
// with backoff, for up to three minutes, and says so, with the 911 bar as always.
test.describe("Live: while the engine wakes up", () => {
  test("Render's gateway answers twice, then the engine: Loading says the engine is waking, keeps asking, and the verdict comes", async ({ page }) => {
    let answers = 0;
    const asked = await engine(page, (route) => (++answers <= 2 ? route.fulfill({ status: 502, contentType: "text/html", body: "<html><body>Bad Gateway</body></html>" }) : answer(route)));
    await checkMoncton(page);

    const status = page.getByRole("status");
    await expect(status).toHaveText(WAKING.en);
    await expect(page.locator('a[href="tel:911"]')).toBeVisible();
    await expect(page).toHaveURL(/\/verdict$/, { timeout: 20_000 });
    await expect(page.locator("section.glance")).toHaveAttribute("data-state", "drifting");
    expect(asked).toHaveLength(3);
  });

  test("the engine says it is warming up (a 503 with status warming), then answers: the verdict", async ({ page }) => {
    let answers = 0;
    const asked = await engine(page, (route) =>
      ++answers === 1 ? route.fulfill({ status: 503, json: { error: "wind_data_unavailable", status: "warming" }, headers: { ...CORS, "retry-after": "2" } }) : answer(route),
    );
    await checkMoncton(page);

    await expect(page.getByRole("status")).toHaveText(WAKING.en);
    await expect(page).toHaveURL(/\/verdict$/, { timeout: 20_000 });
    expect(asked).toHaveLength(2);
  });

  test("no answer at all: Loading keeps asking with backoff and stays, saying so in French too", async ({ page }) => {
    const asked = await engine(page, (route) => route.abort());
    await openLive(page);
    await page.getByRole("button", { name: "Français" }).click();
    await page.goto("/location");
    await page.getByLabel("Ville ou village").fill("Monc");
    await page.getByRole("option", { name: /Moncton, N\.-B\./ }).click();
    await expect(page).toHaveURL(/\/loading$/);

    await expect(page.getByRole("status")).toHaveText(WAKING.fr);
    // Attempts at 0, 1, 3 and 7 s: four within 12 s, and still on Loading, with the 911 bar.
    await expect.poll(() => asked.length, { timeout: 12_000 }).toBeGreaterThanOrEqual(4);
    await expect(page).toHaveURL(/\/loading$/);
    await expect(page.locator('a[href="tel:911"]')).toBeVisible();
  });

  test("still no answer after three minutes: screen 9b, saying the engine did not answer in time", async ({ page }) => {
    test.setTimeout(240_000);
    await engine(page, (route) => route.abort());
    await checkMoncton(page);

    // Still Loading well past the old 90 s, then screen 9b once the three minutes are up.
    await page.waitForTimeout(100_000);
    await expect(page).toHaveURL(/\/loading$/);
    await expect(page).toHaveURL(/\/no-data$/, { timeout: 110_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("We can’t check the air right now");
    await expect(page.getByText("The smoke engine didn’t answer in time. It may still be waking up: try again in a minute.")).toBeVisible();
  });
});

/** Answers GET /health and counts the pings. */
async function healthPings(page: Page) {
  const pings: string[] = [];
  await page.route(`${TEST_ENGINE_URL}/health`, (route) => {
    pings.push(route.request().method());
    return route.fulfill({ json: { status: "ok" }, headers: CORS });
  });
  return pings;
}

test.describe("Waking the engine early", () => {
  test("Check in live mode sends one quiet GET /health as the app opens, and no more on the next screens", async ({ page }) => {
    const pings = await healthPings(page);
    await openLive(page);
    await expect.poll(() => pings.length).toBe(1);
    await page.getByRole("link", { name: "I smell smoke" }).click();
    await expect(page.getByRole("heading", { name: "Do you see flames?" })).toBeVisible();
    await page.goBack(); // back to Check inside the app (a reload would be a new app open, and one more ping)
    await expect(page.getByRole("link", { name: "I smell smoke" })).toBeVisible();
    expect(pings).toEqual(["GET"]);
  });

  test("replay never calls the engine, not even to wake it", async ({ page }) => {
    const pings = await healthPings(page);
    await page.goto("/?mode=replay");
    await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"mode":"replay"'));
    await page.getByRole("link", { name: "I smell smoke" }).click();
    await expect(page.getByRole("heading", { name: "Do you see flames?" })).toBeVisible();
    expect(pings).toEqual([]);
  });

  test("switching to live on Check wakes it", async ({ page }) => {
    const pings = await healthPings(page);
    await page.goto("/?mode=replay");
    await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"mode":"replay"'));
    await page.getByRole("button", { name: "Live" }).click();
    await expect.poll(() => pings.length).toBe(1);
  });
});
