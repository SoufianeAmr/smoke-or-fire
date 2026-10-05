// The verdict screen as the browser tests use it: it opens on the map with the glance card in a sheet at its foot
// (peek); "Sources and why" raises the sheet to the badges, two chips and "Why?" (half); "Why?" opens everything screens 7a–7d
// say (full). The helpers move the sheet with its own buttons, as a person does.
import { expect, type Page } from "@playwright/test";

export type Detent = "peek" | "half" | "full";

export const sheet = (page: Page) => page.locator(".answer-sheet");
export const handle = (page: Page) => page.locator(".sheet-handle");
const at = async (page: Page) => (await sheet(page).getAttribute("data-detent")) as Detent;

/**
 * Bring the sheet to a height, by the handle ("Sources and why", "Show the map") and the "Why?" button. The handle is
 * tapped once at most, and the sheet's own word for its height is waited for after each tap, before anything else is
 * done: on a slow page the height shows a moment after the tap, and a second tap on the handle would send the sheet
 * back. A test that has tapped the handle itself waits for the height the same way (`sheet`), and does not call this.
 */
export async function sheetTo(page: Page, detent: Detent) {
  const from = await at(page);
  if (from === detent) return;
  if (detent === "peek") await handle(page).click();
  else {
    if (from === "peek") {
      await handle(page).click();
      await expect(sheet(page)).toHaveAttribute("data-detent", "half");
    }
    if (detent === "full" || from === "full") await page.locator("main .why-toggle").click();
  }
  await expect(sheet(page)).toHaveAttribute("data-detent", detent);
}

/** Tap "Why?": everything the verdict says is shown under it, the band's words first. */
export async function openWhy(page: Page) {
  await sheetTo(page, "full");
  await expect(page.locator("#why-all")).toBeVisible();
  await expect(page.locator("#answer-h")).toBeVisible();
}

/** Tap a badge and give its panel: the source, its time and its link. The badges are one tap up from the card. */
export async function openBadge(page: Page, id: "fire" | "trace" | "alert" | "burn") {
  if ((await at(page)) === "peek") await sheetTo(page, "half");
  await page.locator(`main .badge[data-badge="${id}"]`).click();
  const panel = page.locator(`#badge-${id}`);
  await expect(panel).toBeVisible();
  return panel;
}
