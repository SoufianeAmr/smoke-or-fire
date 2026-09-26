// The first milestone: the full replay flow for Moncton, in the browser.
import { expect, test } from "@playwright/test";

const NBSP = String.fromCharCode(0xa0);

test("Moncton replay: Check → Q1 → Q2 → Location → Loading → Verdict", async ({ page }) => {
  await page.goto("/?mode=replay");
  await page.getByRole("link", { name: "I smell smoke" }).click();

  await expect(page.getByRole("heading", { name: "Do you see flames?" })).toBeVisible();
  await page.getByRole("link", { name: /No flames in sight/ }).click();

  await expect(page.getByRole("heading", { name: "What best describes it?" })).toBeVisible();
  await page.getByRole("link", { name: /Haze everywhere/ }).click();

  await expect(page.getByRole("heading", { name: "Where are you?" })).toBeVisible();
  await page.getByLabel("Town or city").fill("Monc");
  await page.getByRole("option", { name: /Moncton, NB/ }).click();

  await expect(page.getByRole("heading", { name: "Tracing the air you’re breathing…" })).toBeVisible();
  await expect(page).toHaveURL(/\/verdict$/, { timeout: 10_000 });

  await expect(page.getByText(`Replay${NBSP}· Moncton${NBSP}· Aug 25, 2025${NBSP}·`)).toBeVisible();
  await expect(page.getByText("DRIFTING SMOKE")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Likely from the Long Lake fire");
  await expect(page.getByText("Low confidence")).toBeVisible();
});
