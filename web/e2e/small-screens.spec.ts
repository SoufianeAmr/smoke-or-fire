// Small phones: on every screen the main action and the 911 bar are visible without scrolling,
// and the main action is not hidden behind the 911 bar.
// The 911 bar: one line of text and the red Call 911 button, about 72 px tall, on every screen but Call 911 now and
// Nearby fire, which have their own Call 911 button, and the verdict that nothing explains, whose bar is the taller
// one: "Look outside. See flames or a smoke column?" above a Call 911 button as wide as the bar.
// The verdict: the glance card (its shape, Listen, its line) is whole as the screen opens; above the slim bar, the
// first source badge is too.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const STRINGS: Record<"en" | "fr", Record<string, string>> = {
  en: JSON.parse(readFileSync(new URL("../src/i18n/en.json", import.meta.url), "utf8")),
  fr: JSON.parse(readFileSync(new URL("../src/i18n/fr.json", import.meta.url), "utf8")),
};

/** The fixed bar at the bottom: the parent of a tel:911 link that stays put when the page scrolls. */
async function bars(page: Page) {
  const found: Locator[] = [];
  for (const link of await page.locator('a[href="tel:911"]').all()) {
    if ((await link.locator("..").evaluate((el) => getComputedStyle(el).position)) === "fixed") found.push(link.locator(".."));
  }
  return found;
}

/** The slim bar: its text, the red Call 911 button (56 px or taller, tel:911), about 72 px in all, and no tiles. */
async function slimBar(page: Page, lang: "en" | "fr") {
  const found = await bars(page);
  expect(found).toHaveLength(1);
  const bar = found[0];
  await expect(bar.locator("p")).toHaveText(STRINGS[lang]["sticky.title"]);
  const call = bar.getByRole("link");
  await expect(call).toHaveCount(1);
  await expect(call).toHaveText(STRINGS[lang]["sticky.call"]);
  await expect(call).toHaveAttribute("href", "tel:911");
  expect(await call.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(217, 45, 32)");
  expect((await call.boundingBox())!.height).toBeGreaterThanOrEqual(56);
  expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(76);
  await expect(bar.locator("button")).toHaveCount(0); // no Flames / Smoke column / Dark smoke tiles
}

/** The room a screen with the call-first bar keeps under its content (CLEAR_OF_CALL in src/components/Sticky911.tsx). */
const CLEAR_OF_CALL = 176;

/**
 * The call-first bar, on a verdict that nothing explains: "Look outside…" above the red Call 911 button (72 px or
 * taller, as wide as the bar, tel:911). Whole on the screen, no taller than the room kept for it, and no tiles.
 */
async function callFirstBar(page: Page, lang: "en" | "fr") {
  const found = await bars(page);
  expect(found).toHaveLength(1);
  const bar = found[0];
  await expect(bar.locator("p")).toHaveText(STRINGS[lang]["sticky.look"]);
  const call = bar.getByRole("link");
  await expect(call).toHaveCount(1);
  await expect(call).toHaveText(STRINGS[lang]["sticky.call"]);
  await expect(call).toHaveAttribute("href", "tel:911");
  await expect(page.locator('a[href="tel:911"]')).toHaveCount(1); // still the screen's one Call 911
  expect(await call.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(217, 45, 32)");
  const [look, button, box] = [(await bar.locator("p").boundingBox())!, (await call.boundingBox())!, (await bar.boundingBox())!];
  expect(button.height).toBeGreaterThanOrEqual(72);
  expect(button.width).toBeGreaterThanOrEqual(0.8 * box.width);
  expect(look.y + look.height).toBeLessThanOrEqual(button.y); // the question, then the button
  const { width, height } = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(height + 0.5);
  expect(box.height).toBeLessThanOrEqual(CLEAR_OF_CALL);
  await expect(bar.locator("button")).toHaveCount(0); // no Flames / Smoke column / Dark smoke tiles
}

const VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
];
// A real iPhone SE in Safari with its toolbars showing: checked on the first screens only.
const SAFARI_SE = { width: 375, height: 550 };
const SAFARI_SE_SCREENS = ["01 Check", "02 Q1", "04 Emergency"];

/**
 * `answers`: on a question, how many answers there are; every one of them is a main action.
 * `callFirst`: the bar is the taller one, whose Call 911 button is the screen's main action.
 */
type Check = { name: string; open: (page: Page) => Promise<void>; main: (page: Page) => Locator[]; bar: boolean; answers?: number; callFirst?: boolean };

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

const LISTEN = new RegExp(`^(${STRINGS.en["listen.play"]}|${STRINGS.fr["listen.play"]})$`);
/** The glance card: its line, the row above the line, and in that row the state's shape and the Listen button. */
const verdictMain = (page: Page) => {
  const card = page.locator("section[aria-labelledby=verdict-h]");
  return [page.locator("#verdict-h"), card.locator("> div").nth(1), card.locator("svg.glance-shape"), card.getByRole("button", { name: LISTEN })];
};
/** Above the slim bar, the first source badge too. */
const verdictAndBadge = (page: Page) => [...verdictMain(page), page.locator("main .badge").first()];
/** A question's answers, all of them: three on Q1, four on Q2, six on Q3. */
const answers = (page: Page) => [page.locator("main a[data-answer]")];

const SCREENS: Check[] = [
  // Check: I smell smoke; and from 667 px tall, the Live/Replay toggle too.
  { name: "01 Check", open: (p) => p.goto("/").then(), main: (p) => [p.locator('a[href="/q1"]'), ...(p.viewportSize()!.height >= 667 ? [p.locator("main [role=group]")] : [])], bar: true },
  { name: "02 Q1", open: (p) => p.goto("/q1").then(), main: answers, bar: true, answers: 3 },
  { name: "03a Q2", open: (p) => p.goto("/q2").then(), main: answers, bar: true, answers: 4 },
  { name: "03b Q3", open: (p) => p.goto("/q3").then(), main: answers, bar: true, answers: 6 },
  // Nearby fire: its own red Call 911 button, and no bar.
  { name: "03c Nearby fire", open: (p) => p.goto("/nearby-fire").then(), main: (p) => [p.locator('main a[href="tel:911"]')], bar: false },
  { name: "04 Emergency", open: (p) => p.goto("/emergency").then(), main: (p) => [p.locator('main a[href="tel:911"]')], bar: false },
  { name: "05 Location", open: (p) => p.goto("/location").then(), main: (p) => [p.locator('main a[href="/loading"]').first(), p.locator("input[type=search]")], bar: true },
  { name: "06 Loading", open: (p) => searchTown(p, "Moncton"), main: (p) => [p.locator("h1")], bar: true },
  { name: "07a Verdict (Moncton)", open: (p) => verdictFor(p, "Moncton"), main: verdictAndBadge, bar: true },
  // The fire is under 25 km away: its notice comes first under the card, so the badges start lower. Only the card here.
  { name: "07a Verdict (Bridgetown)", open: (p) => verdictFor(p, "Bridgetown"), main: verdictMain, bar: true },
  { name: "07c Verdict (Charlottetown)", open: (p) => verdictFor(p, "Charlottetown"), main: verdictAndBadge, bar: true },
  // Nothing explains the smoke: the call-first bar.
  { name: "07b Verdict (Halifax)", open: (p) => verdictFor(p, "Halifax"), main: verdictMain, bar: true, callFirst: true },
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
        const label = ((await el.textContent()) ?? "").trim().slice(0, 40) || (await el.getAttribute("aria-label")) || (await el.getAttribute("class")) || "input";
        problems.push(`"${label}": ${Math.round(box.y)}–${Math.round(box.y + box.height)} (visible to ${Math.round(barTop)})`);
      }
    }
  }
  const { scrollY, overflow } = await page.evaluate(() => ({ scrollY: window.scrollY, overflow: document.documentElement.scrollWidth - window.innerWidth }));
  if (scrollY !== 0) problems.push(`opened scrolled to ${scrollY}`);
  if (overflow > 0) problems.push(`page is ${overflow}px wider than the screen`);
  return problems;
}

/** A question's answers that are under 56 px tall, or whose words are under 16 px, as "which: what". */
const tooSmall = (page: Page) =>
  page.locator("main a[data-answer]").evaluateAll((links) =>
    links.flatMap((link) => {
      const key = link.getAttribute("data-answer");
      const found: string[] = [];
      const { height } = link.getBoundingClientRect();
      if (height < 56) found.push(`${key}: ${Math.round(height)} px tall`);
      for (const el of [link, ...link.querySelectorAll("*")]) {
        if (el.closest("svg")) continue;
        const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
        if (own && parseFloat(getComputedStyle(el).fontSize) < 16) found.push(`${key}: words at ${getComputedStyle(el).fontSize}`);
      }
      return found;
    }),
  );

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
          if (check.answers) await expect(page.locator("main a[data-answer]")).toHaveCount(check.answers); // all of them are checked below
          await page.evaluate(() => document.fonts.ready);
          expect(await hidden(page, check)).toEqual([]);
          // However short the phone, an answer keeps 56 px to tap and words of 16 px or more.
          if (check.answers) expect(await tooSmall(page)).toEqual([]);
          if (check.callFirst) await callFirstBar(page, lang);
          else if (check.bar) await slimBar(page, lang);
          else {
            // Call 911 now and Nearby fire: no bar. Their own Call 911 button is the only one, in the screen itself.
            expect(await bars(page)).toHaveLength(0);
            await expect(page.locator('a[href="tel:911"]')).toHaveCount(1);
            await expect(page.locator('main a[href="tel:911"]')).toHaveCount(1);
          }
        });
      }
    });
  }
}
