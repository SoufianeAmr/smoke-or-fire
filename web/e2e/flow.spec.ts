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

test("Q2 lists the dark column first, in English and French", async ({ page }) => {
  await page.goto("/?mode=replay");
  await page.goto("/q2");
  await expect(page.locator("a.opt").first()).toContainText("Dark column rising from one spot");
  await page.getByRole("button", { name: "Français" }).click();
  await expect(page.locator("a.opt").first()).toContainText("Colonne sombre qui monte d’un seul endroit");
});

test("the loading counter reads Heure {n} sur 24 in French", async ({ page }) => {
  await page.goto("/?mode=replay");
  await page.getByRole("button", { name: "Français" }).click();
  await page.goto("/location");
  await page.locator("input[type=search]").fill("Monc");
  await page.getByRole("option", { name: /Moncton/ }).click();
  const chip = page.locator(".hours");
  await expect(chip).toBeAttached();
  const label = await chip.evaluate((el) => getComputedStyle(el, "::before").content);
  expect(label).toContain("Heure ");
  expect(label).toContain(" sur 24");
});
