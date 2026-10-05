// Check's language link (src/screens/Check.tsx) names the language the screen is not in: "Français" on the English
// screen, "English" on the French one. The app keeps the language for the session, so a test that opens Check a second
// time finds it in French already, with no "Français" to tap.
import { expect, type Page } from "@playwright/test";

/** Check in French, whichever language it opened in. */
export async function toFrench(page: Page) {
  const french = page.getByRole("button", { name: "Français", exact: true });
  const english = page.getByRole("button", { name: "English", exact: true });
  await expect(french.or(english)).toBeVisible();
  if (await french.isVisible()) await french.click();
  await expect(english).toBeVisible();
}
