// "Listen" reads the screen aloud with the browser's speech (speechSynthesis). The browser's speech is replaced by a
// recorder, so the tests see exactly what was queued, and compare it with the strings on screen.
import { expect, test, type Page } from "@playwright/test";

type Lang = "en" | "fr";
type Spoken = { text: string; lang: string; rate: number; volume: number; voice: string | null };

const NBSP = String.fromCharCode(0xa0);
const LABEL = { en: { play: "Listen", stop: "Stop" }, fr: { play: "Écouter", stop: "Arrêter" } };
const colon = (lang: Lang) => (lang === "fr" ? `${NBSP}: ` : ": ");
const lowerFirst = (text: string) => (/^\p{Lu}\p{Ll}/u.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);
const sentence = (text: string) => (/[.?!:]$/.test(text) ? text : `${text}.`);
// The rules for anything read: never "safe", and the wording src/i18n/strings.test.ts bans against calling 911.
const SAFE = /safe|sécuri/i;
const DISCOURAGES_911 = /(do not|don’t|never|no need to) call|ne (pas|jamais) appeler|n’appelez (pas|jamais)|9-1-1 for updates/i;
// The 911 bar, as a sentence: "Call 911 if you see:" and its three tiles.
const CALL_911 = { en: "Call 911 if you see: flames, smoke column, or dark smoke.", fr: `Appelez le 911 si${NBSP}: flammes, panache ou fumée noire.` };

/** A speechSynthesis that records what is queued, with a Canadian voice for each language. */
function fakeSpeech() {
  const w = window as unknown as Record<string, unknown>;
  const spoken: Record<string, unknown>[] = [];
  w.__spoken = spoken;
  w.__cancels = 0;
  class Utterance {
    text: string; lang = ""; voice: unknown = null; rate = 1; volume = 1; onend: (() => void) | null = null; onerror: (() => void) | null = null;
    constructor(text: string) { this.text = text; }
  }
  const voices = [{ lang: "en-US", name: "American English" }, { lang: "en-CA", name: "Canadian English" }, { lang: "fr-FR", name: "French" }, { lang: "fr-CA", name: "Canadian French" }];
  Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true, writable: true });
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: { getVoices: () => voices, speak: (u: Record<string, unknown>) => spoken.push(u), cancel: () => { w.__cancels = (w.__cancels as number) + 1; } },
  });
}

const spoken = (page: Page) =>
  page.evaluate(() => ((window as unknown as { __spoken: Spoken[] }).__spoken).map((u) => ({ text: u.text, lang: u.lang, rate: u.rate, volume: u.volume, voice: (u.voice as { name: string } | null)?.name ?? null })));
const texts = async (page: Page) => (await spoken(page)).map((u) => u.text);

async function start(page: Page, lang: Lang) {
  await page.goto("/?mode=replay");
  await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"mode":"replay"'));
  if (lang === "fr") await page.getByRole("button", { name: "Français" }).click();
}
async function replayVerdict(page: Page, town: string) {
  await page.goto("/location");
  await page.locator("input[type=search]").fill(town);
  await page.getByRole("option", { name: new RegExp(`^${town}`) }).first().click();
  await expect(page).toHaveURL(/\/verdict$/, { timeout: 10_000 });
}
async function leaveFor(page: Page, town: string) {
  await page.goto("/leave");
  await page.locator("#leave-search").fill(town);
  await page.getByRole("option", { name: new RegExp(`^${town}`) }).first().click();
  await expect(page.getByRole("button", { name: new RegExp(town) })).toBeVisible(); // "Not in {town}? Change"
}
const text = async (page: Page, selector: string) => ((await page.locator(selector).first().textContent()) ?? "").trim();

// What each screen shows, read from the page, in the order Listen reads it.
const SCREENS: { name: string; open: (page: Page) => Promise<void>; shown: (page: Page, lang: Lang) => Promise<string[]> }[] = [
  {
    name: "Q1",
    open: (page) => page.goto("/q1").then(),
    shown: async (page, lang) => {
      const answer = async (href: string) => {
        const [word, sub] = await page.locator(`main a[href="${href}"] > span:nth-child(2) > span`).allTextContents();
        return sentence(`${word}${colon(lang)}${lowerFirst(sub)}`);
      };
      return [await text(page, "h1"), await answer("/emergency"), await answer("/q2")];
    },
  },
  {
    name: "Verdict (Moncton replay)",
    open: (page) => replayVerdict(page, "Moncton"),
    shown: async (page, lang) => {
      const label = await text(page, "section[aria-labelledby=verdict-h] > div:nth-child(2) > p");
      const bar = [await text(page, "p:has(+ div > button.tile)"), ...(await page.locator("button.tile span").allTextContents())];
      expect(bar).toEqual(lang === "en" ? ["Call 911 if you see:", "Flames", "Smoke column", "Dark smoke"] : [`Appelez le 911 si${NBSP}:`, "Flammes", "Panache", "Fumée noire"]);
      return [
        sentence(label.charAt(0) + label.slice(1).toLocaleLowerCase(lang)),
        sentence(await text(page, "#verdict-h")),
        await text(page, "#verdict-h + p"),
        await text(page, "section[aria-labelledby=conf-h] p"),
        await text(page, "section[aria-labelledby=todo-h] h2 + p"),
        CALL_911[lang],
      ];
    },
  },
  {
    name: "Emergency",
    open: (page) => page.goto("/emergency").then(),
    shown: async (page, lang) => [
      sentence(await text(page, "h1")),
      await text(page, "h1 + p"),
      `${await text(page, "#tell-h")}${colon(lang).trimEnd()}`,
      ...(await page.locator("section[aria-labelledby=tell-h] li > span:nth-child(2)").allTextContents()).map(sentence),
    ],
  },
  {
    name: "Told to leave (Bridgetown replay, near the fire)",
    open: (page) => leaveFor(page, "Bridgetown"),
    shown: async (page, lang) => {
      // The reception centre's card: name and address, services, then the registration line.
      const [name, address] = (await page.locator("section[aria-labelledby=reception-h] > p").first().innerText()).split("\n");
      return [
        sentence(await text(page, "h1")),
        await text(page, "section[aria-labelledby=reception-h] > p:nth-of-type(3)"),
        sentence(`${name}, ${address}`),
        `${await text(page, "#take-h")}${colon(lang).trimEnd()}`,
        ...(await page.locator("section[aria-labelledby=take-h] li").allTextContents()).map(sentence),
        await text(page, "section[aria-labelledby=take-h] > p:last-child"),
        sentence(await text(page, 'main a[href^="sms:"]')),
      ];
    },
  },
];

for (const lang of ["en", "fr"] as const) {
  test.describe(`Listen, ${lang.toUpperCase()}`, () => {
    test.beforeEach(async ({ page }) => { await page.addInitScript(fakeSpeech); });

    for (const screen of SCREENS) {
      test(`${screen.name}: reads the strings on screen, in order, at rate 0.9 and full volume; tap again to stop`, async ({ page }) => {
        await start(page, lang);
        await screen.open(page);
        const button = page.getByRole("button", { name: LABEL[lang].play, exact: true });
        await expect(button).toBeVisible();
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(56);
        expect(await spoken(page)).toEqual([]); // never plays by itself

        await button.click();
        const queued = await spoken(page);
        expect(queued.map((u) => u.text)).toEqual(await screen.shown(page, lang));
        const voice = { lang: lang === "en" ? "en-CA" : "fr-CA", rate: 0.9, volume: 1, voice: lang === "en" ? "Canadian English" : "Canadian French" };
        expect(queued.map(({ text: _, ...rest }) => rest)).toEqual(queued.map(() => voice));
        expect(queued.filter((u) => SAFE.test(u.text) || DISCOURAGES_911.test(u.text))).toEqual([]);

        const stop = page.getByRole("button", { name: LABEL[lang].stop, exact: true });
        const cancels = await page.evaluate(() => (window as unknown as { __cancels: number }).__cancels);
        await stop.click();
        await expect(button).toBeVisible();
        expect(await page.evaluate(() => (window as unknown as { __cancels: number }).__cancels)).toBeGreaterThan(cancels);
        expect((await spoken(page)).length).toBe(queued.length); // stopping queues nothing more
      });
    }
  });
}

test.describe("Listen", () => {
  test.beforeEach(async ({ page }) => { await page.addInitScript(fakeSpeech); });

  test("outlined navy, never red", async ({ page }) => {
    await start(page, "en");
    await page.goto("/q1");
    const look = await page.getByRole("button", { name: "Listen" }).evaluate((el) => { const s = getComputedStyle(el); return [s.borderTopColor, s.borderTopWidth, s.color, s.backgroundColor]; });
    expect(look).toEqual(["rgb(27, 42, 74)", "2px", "rgb(27, 42, 74)", "rgb(255, 255, 255)"]);
  });

  test("goes back to Listen when the last part has been read", async ({ page }) => {
    await start(page, "en");
    await page.goto("/emergency");
    await page.getByRole("button", { name: "Listen" }).click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await page.evaluate(() => { const all = (window as unknown as { __spoken: { onend: () => void }[] }).__spoken; all[all.length - 1].onend(); });
    await expect(page.getByRole("button", { name: "Listen" })).toBeVisible();
  });

  test("switching language stops the reading; the next reading is in French", async ({ page }) => {
    await start(page, "en");
    await page.goto("/q1");
    await page.getByRole("button", { name: "Listen" }).click();
    const cancels = await page.evaluate(() => (window as unknown as { __cancels: number }).__cancels);
    await page.getByRole("button", { name: "Français" }).click();
    await expect(page.getByRole("button", { name: "Écouter" })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __cancels: number }).__cancels)).toBeGreaterThan(cancels);
    await page.getByRole("button", { name: "Écouter" }).click();
    // In French, with the Canadian French voice: the language is read at each tap, not when the screen opened.
    expect((await spoken(page)).slice(3).map(({ text, lang, voice }) => ({ text, lang, voice }))).toEqual(
      [`Voyez-vous des flammes${NBSP}?`, `Oui${NBSP}: je vois des flammes.`, `Non${NBSP}: aucune flamme en vue.`].map((text) => ({ text, lang: "fr-CA", voice: "Canadian French" })),
    );
  });

  test("tapping Call 911 stops the reading, so it never talks over the call", async ({ page }) => {
    await start(page, "en");
    await page.goto("/emergency");
    // The test stays on the page: the tel: link doesn't open a dialer here.
    await page.evaluate(() => document.addEventListener("click", (e) => { if ((e.target as Element).closest('a[href^="tel:"]')) e.preventDefault(); }));
    await page.getByRole("button", { name: "Listen" }).click();
    const cancels = await page.evaluate(() => (window as unknown as { __cancels: number }).__cancels);
    await page.locator('main a[href="tel:911"]').click();
    await expect(page.getByRole("button", { name: "Listen" })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __cancels: number }).__cancels)).toBeGreaterThan(cancels);
  });

  test("leaving the page (the dialer, another tab) stops the reading", async ({ page }) => {
    await start(page, "en");
    await page.goto("/q1");
    await page.getByRole("button", { name: "Listen" }).click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.getByRole("button", { name: "Listen" })).toBeVisible();
  });

  test("farther from the fire (Moncton), the screen says the evacuation doesn't apply, and Listen reads that instead of a centre", async ({ page }) => {
    await start(page, "en");
    await leaveFor(page, "Moncton");
    await page.getByRole("button", { name: "Listen" }).click();
    const read = await texts(page);
    expect(read.slice(0, 2)).toEqual(["If you’re told to leave.", await text(page, "main section p")]);
    expect(read[1]).toMatch(/^This evacuation was for people near the Long Lake fire in Annapolis County, \d+ km from Moncton\. It doesn’t apply to you\.$/);
    expect(read.join(" ")).not.toMatch(/Register|NSCC/);
    expect(read.filter((part) => SAFE.test(part) || DISCOURAGES_911.test(part))).toEqual([]);
  });
});

test.describe("without speech in the browser", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true });
      Object.defineProperty(window, "SpeechSynthesisUtterance", { value: undefined, configurable: true });
    });
  });

  for (const screen of SCREENS) {
    test(`${screen.name}: no Listen button`, async ({ page }) => {
      await start(page, "en");
      await screen.open(page);
      await expect(page.locator("h1").first()).toBeVisible();
      await expect(page.getByRole("button", { name: /^(Listen|Stop)$/ })).toHaveCount(0);
    });
  }
});
