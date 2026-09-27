// Small phones: on every screen the main action and the 911 bar are visible without scrolling,
// and the main action is not hidden behind the 911 bar.
// Q2 on short screens (decided): only the first answer, the urgent "dark column", must be visible;
// the other two may scroll. At 390 × 844 all three must be visible.
import { expect, test, type Locator, type Page } from "@playwright/test";

const VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
];
// A real iPhone SE in Safari with its toolbars showing: checked on the first screens only.
const SAFARI_SE = { width: 375, height: 550 };
const SAFARI_SE_SCREENS = ["01 Check", "02 Q1", "04 Emergency"];

type Check = { name: string; open: (page: Page) => Promise<void>; main: (page: Page) => Locator[]; bar: boolean };

/** Wait until the app has saved the mode, so the next page.goto() opens in that mode. */
async function modeStored(page: Page, mode: "live" | "replay") {
  await page.waitForFunction((m) => sessionStorage.getItem("smoke-or-fire")?.includes(`"mode":"${m}"`), mode);
}

async function searchTown(page: Page, town: string) {
  await page.goto("/location");
  await page.locator("input[type=search]").fill(town);
  await page.getByRole("option", { name: new RegExp(`^${town}`) }).first().click();
}

async function verdictFor(page: Page, town: string) {
  await searchTown(page, town);
  await expect(page).toHaveURL(/\/verdict$/, { timeout: 10_000 });
}

const verdictMain = (page: Page) => [page.locator("#verdict-h"), page.locator("section[aria-labelledby=verdict-h] > div").nth(1)];

const SCREENS: Check[] = [
  // Check: I smell smoke; and from 667 px tall, the Live/Replay toggle too.
  { name: "01 Check", open: (p) => p.goto("/").then(), main: (p) => [p.locator('a[href="/q1"]'), ...(p.viewportSize()!.height >= 667 ? [p.locator("main [role=group]")] : [])], bar: false },
  { name: "02 Q1", open: (p) => p.goto("/q1").then(), main: (p) => [p.locator('a[href="/emergency"]'), p.locator('a[href="/q2"]')], bar: true },
  { name: "03 Q2", open: (p) => p.goto("/q2").then(), main: (p) => [p.viewportSize()!.height >= 844 ? p.locator("a.opt") : p.locator("a.opt").first()], bar: true },
  { name: "04 Emergency", open: (p) => p.goto("/emergency").then(), main: (p) => [p.locator('main a[href="tel:911"]')], bar: false },
  { name: "05 Location", open: (p) => p.goto("/location").then(), main: (p) => [p.locator('main a[href="/loading"]').first(), p.locator("input[type=search]")], bar: true },
  { name: "06 Loading", open: (p) => searchTown(p, "Moncton"), main: (p) => [p.locator("h1")], bar: true },
  { name: "07a Verdict (Moncton)", open: (p) => verdictFor(p, "Moncton"), main: verdictMain, bar: true },
  { name: "07c Verdict (Charlottetown)", open: (p) => verdictFor(p, "Charlottetown"), main: verdictMain, bar: true },
  { name: "07b Verdict (Halifax)", open: (p) => verdictFor(p, "Halifax"), main: verdictMain, bar: true },
  { name: "08 How it works", open: (p) => p.goto("/how-it-works").then(), main: (p) => [p.locator("h1")], bar: true },
  { name: "09a Location off", open: (p) => p.goto("/location-off").then(), main: (p) => [p.locator("input[type=search]"), p.locator('main a[href="/loading"]')], bar: true },
  { name: "09b No data", open: (p) => p.goto("/no-data").then(), main: (p) => [p.locator("main button")], bar: true },
  // Opened with no place chosen yet: the screen asks "Where are you?" first.
  { name: "10 Told to leave", open: (p) => p.goto("/leave").then(), main: (p) => [p.locator("h1"), p.locator('main a[href="/leave"]')], bar: true },
];

/** Every box that falls outside the visible area, as "what: top–bottom (limit)". */
async function hidden(page: Page, check: Check) {
  const { height } = page.viewportSize()!;
  const problems: string[] = [];
  let barTop = height;
  if (check.bar) {
    const bar = page.locator('a[href="tel:911"]').locator("..");
    const box = (await bar.boundingBox())!;
    barTop = box.y;
    if (box.y < 0 || box.y + box.height > height + 0.5) problems.push(`911 bar: ${box.y}–${box.y + box.height} (viewport ${height})`);
  }
  for (const group of check.main(page)) {
    for (const el of await group.all()) {
      const box = (await el.boundingBox())!;
      if (box.y < 0 || box.y + box.height > barTop + 0.5) {
        const label = ((await el.textContent()) ?? "").trim().slice(0, 40) || (await el.getAttribute("aria-label")) || "input";
        problems.push(`"${label}": ${Math.round(box.y)}–${Math.round(box.y + box.height)} (visible to ${Math.round(barTop)})`);
      }
    }
  }
  const { scrollY, overflow } = await page.evaluate(() => ({ scrollY: window.scrollY, overflow: document.documentElement.scrollWidth - window.innerWidth }));
  if (scrollY !== 0) problems.push(`opened scrolled to ${scrollY}`);
  if (overflow > 0) problems.push(`page is ${overflow}px wider than the screen`);
  return problems;
}

const RUNS = [...VIEWPORTS.map((viewport) => ({ viewport, screens: SCREENS })), { viewport: SAFARI_SE, screens: SCREENS.filter((s) => SAFARI_SE_SCREENS.includes(s.name)) }];

for (const { viewport, screens } of RUNS) {
  for (const lang of ["en", "fr"] as const) {
    test.describe(`${viewport.width}×${viewport.height} ${lang.toUpperCase()}`, () => {
      test.use({ viewport });
      for (const check of screens) {
        test(check.name, async ({ page }) => {
          await page.goto("/?mode=replay");
          await modeStored(page, "replay");
          if (lang === "fr") await page.getByRole("button", { name: "Français" }).click();
          await check.open(page);
          for (const group of check.main(page)) await expect(group.first()).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          expect(await hidden(page, check)).toEqual([]);
        });
      }
    });
  }
}
