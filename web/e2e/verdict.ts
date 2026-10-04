// The verdict screen as the browser tests use it: the glance card is in front as the screen opens; the badges'
// sources and everything screens 7a–7d say (behind "Why?") take a tap.
import { expect, type Page } from "@playwright/test";

/** Tap "Why?": everything the verdict says is shown under it, the band's words first. */
export async function openWhy(page: Page) {
  await page.locator("main .why-toggle").click();
  await expect(page.locator("#why-all")).toBeVisible();
  await expect(page.locator("#answer-h")).toBeVisible();
}

/** Tap a badge and give its panel: the source, its time and its link. */
export async function openBadge(page: Page, id: "fire" | "trace" | "alert") {
  await page.locator(`main .badge[data-badge="${id}"]`).click();
  const panel = page.locator(`#badge-${id}`);
  await expect(panel).toBeVisible();
  return panel;
}
