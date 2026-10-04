// Live checks through the deployed site against the real engine (playwright.real.config.ts).
// The browser calls the engine from the site's origin, so these also prove CORS.
import { expect, test, type Page } from "@playwright/test";
import { toLocation } from "./look";

const VERDICT_LABEL = /^(DRIFTING SMOKE|UNCLEAR|UNEXPLAINED SMOKE)$/;

/** Statuses of the engine's GET /verdict answers, as the browser received them. */
function engineAnswers(page: Page) {
  const statuses: number[] = [];
  page.on("response", (r) => {
    if (/\/verdict\?/.test(r.url()) && r.url().includes("mode=live")) statuses.push(r.status());
  });
  return statuses;
}

async function openLive(page: Page) {
  await page.goto("/?mode=live");
  await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes(`"mode":"live"`));
}

test("Live check for Fredericton gets its verdict from the real engine", async ({ page }) => {
  const statuses = engineAnswers(page);
  await openLive(page);
  await page.getByRole("link", { name: "I smell smoke" }).click();
  await expect(page.getByRole("heading", { name: "Do you see flames?" })).toBeVisible();
  await toLocation(page); // no flames, grey haze, nothing burning nearby
  await page.getByLabel("Town or city").fill("Frederict");
  await page.getByRole("option", { name: /^Fredericton, NB/ }).click();

  await expect(page).toHaveURL(/\/verdict$/, { timeout: 120_000 });
  await expect(page.getByText(VERDICT_LABEL)).toBeVisible();
  await expect(page.getByRole("link", { name: "Exit" })).toHaveCount(0); // live: no replay banner
  expect(statuses).toEqual([200]);
});

test.describe("Live: Use my location", () => {
  test.use({ geolocation: { latitude: 46.09, longitude: -64.78 }, permissions: ["geolocation"] });

  test("gets a verdict for the reported spot from the real engine", async ({ page }) => {
    const statuses = engineAnswers(page);
    await openLive(page);
    await page.goto("/location");
    await page.getByRole("link", { name: "Use my location" }).click();

    await expect(page).toHaveURL(/\/verdict$/, { timeout: 120_000 });
    await expect(page.getByText(VERDICT_LABEL)).toBeVisible();
    expect(statuses).toEqual([200]);
  });
});
