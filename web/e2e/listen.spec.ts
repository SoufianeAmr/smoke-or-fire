// "Listen", the guided voice on every screen. The browser's speech is replaced by a recorder that ends each sentence
// after 10 ms, so the tests see exactly what is said, in order, with the pause between sentences. Each script comes from
// the strings file (voice.*); its {…} values are read from the screen, and every button it names is on the screen.
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { TEST_ENGINE_URL } from "./engine";

type Lang = "en" | "fr";
type Spoken = { text: string; lang: string; rate: number; pitch: number; volume: number; voice: string | null; at: number; end: number };

const STRINGS: Record<Lang, Record<string, string>> = {
  en: JSON.parse(readFileSync(new URL("../src/i18n/en.json", import.meta.url), "utf8")),
  fr: JSON.parse(readFileSync(new URL("../src/i18n/fr.json", import.meta.url), "utf8")),
};
const LABEL = { en: { play: "Listen", stop: "Stop" }, fr: { play: "Écouter", stop: "Arrêter" } };
// The recorder's voices include a plain and a natural Canadian voice for each language, and a novelty voice.
const VOICE = { en: "Google English (Canada) Natural", fr: "Amélie (Enhanced)" };
const NAVY = "rgb(27, 42, 74)";
const RED = "rgb(217, 45, 32)";
const WHITE = "rgb(255, 255, 255)";
const SPELLED = { en: { "911": "nine-one-one", "811": "eight-one-one", "211": "two-one-one" }, fr: { "911": "neuf-un-un", "811": "huit-un-un", "211": "deux-un-un" } };

/** A script from the strings file, as the app says it: split into sentences, then filled in. */
const script = (lang: Lang, key: string, vars: Record<string, string | number> = {}) =>
  STRINGS[lang][key].split(/(?<=[.?!])\s+(?=\S)/).map((s) => s.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match)));
const spokenKm = (lang: Lang, km: number) => (km < 1 ? STRINGS[lang]["voice.km.under"] : km === 1 ? STRINGS[lang]["voice.km.one"] : STRINGS[lang]["voice.km"].replace("{km}", String(km)));
/** A label as the voice says it: "Call 911" → "Call nine-one-one"; no-break spaces as spaces. */
const asSaid = (lang: Lang, label: string) => label.replace(/\s/g, " ").replace(/\b(911|811|211)\b/g, (n) => SPELLED[lang][n as "911"]);

/**
 * A speechSynthesis that records what is said, and ends each sentence after 10 ms unless __autoEnd is false. Like real
 * browsers, cancel() interrupts the sentence being said: its error event fires ("interrupted").
 */
function fakeSpeech() {
  const w = window as unknown as Record<string, unknown>;
  const spoken: { u: Record<string, unknown>; at: number; end: number }[] = [];
  w.__spoken = spoken;
  w.__cancels = 0;
  w.__autoEnd = true;
  class Utterance {
    text: string; lang = ""; voice: unknown = null; rate = 1; pitch = 1; volume = 1; onend: (() => void) | null = null; onerror: (() => void) | null = null;
    constructor(text: string) { this.text = text; }
  }
  const voices = [
    { lang: "en-US", name: "Albert" }, { lang: "en-US", name: "Google US English" }, { lang: "en-CA", name: "Microsoft Linda - English (Canada)" },
    { lang: "en-CA", name: "Google English (Canada) Natural" }, { lang: "fr-FR", name: "Google français" }, { lang: "fr-CA", name: "Amélie" }, { lang: "fr-CA", name: "Amélie (Enhanced)" },
  ];
  Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true, writable: true });
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      getVoices: () => voices,
      speak: (u: Record<string, unknown>) => {
        const entry = { u, at: performance.now(), end: 0 };
        spoken.push(entry);
        if (w.__autoEnd) setTimeout(() => { if (entry.end) return; entry.end = performance.now(); (u.onend as (() => void) | null)?.(); }, 10);
      },
      cancel: () => {
        w.__cancels = (w.__cancels as number) + 1;
        const saying = spoken.find((entry) => !entry.end);
        if (saying) { saying.end = performance.now(); (saying.u.onerror as ((e: { error: string }) => void) | null)?.({ error: "interrupted" }); }
      },
    },
  });
}

const spoken = (page: Page): Promise<Spoken[]> =>
  page.evaluate(() =>
    (window as unknown as { __spoken: { u: Record<string, unknown>; at: number; end: number }[] }).__spoken.map(({ u, at, end }) => ({
      text: u.text as string, lang: u.lang as string, rate: u.rate as number, pitch: u.pitch as number, volume: u.volume as number, voice: (u.voice as { name: string } | null)?.name ?? null, at, end,
    })),
  );
const cancels = (page: Page) => page.evaluate(() => (window as unknown as { __cancels: number }).__cancels);
const text = async (page: Page, selector: string) => ((await page.locator(selector).first().textContent()) ?? "").trim();
const listenButton = (page: Page, lang: Lang) => page.getByRole("button", { name: LABEL[lang].play, exact: true });

async function start(page: Page, lang: Lang, mode: "replay" | "live" = "replay") {
  await page.goto(`/?mode=${mode}`);
  await page.waitForFunction((m) => sessionStorage.getItem("smoke-or-fire")?.includes(`"mode":"${m}"`), mode);
  if (lang === "fr") await page.getByRole("button", { name: "Français" }).click();
}
async function search(page: Page, town: string, input = "input[type=search]") {
  await page.locator(input).fill(town);
  await page.getByRole("option", { name: new RegExp(`^${town},`) }).first().click();
}
// The URL changes a moment before the verdict replaces the loading screen (which has its own Listen): wait for the verdict.
async function verdictFor(page: Page, town: string) {
  await page.goto("/location");
  await search(page, town);
  await expect(page.locator("#verdict-h")).toBeVisible({ timeout: 10_000 });
}
async function leaveFor(page: Page, town: string) {
  await page.goto("/leave");
  await search(page, town, "#leave-search");
  await expect(page.getByRole("button", { name: new RegExp(town) })).toBeVisible(); // "Not in {town}? Change"
}
/** Live mode answers from a recorded engine answer: Halifax with no fire within 500 km (screen 7d). */
async function noFiresVerdict(page: Page) {
  const halifax = JSON.parse(readFileSync(new URL("../../data/demo/halifax.json", import.meta.url), "utf8"));
  const answer = { ...halifax, mode: "live", noFiresInRange: true, nearestFire: null, closestApproach: null, forward: null };
  await page.route(`${TEST_ENGINE_URL}/verdict**`, (route: Route) => route.fulfill({ json: answer, headers: { "access-control-allow-origin": "*" } }));
  await page.goto("/location");
  await search(page, "Halifax");
  await expect(page.locator("#verdict-h")).toBeVisible({ timeout: 15_000 });
}

/** A button the script names is on the screen, with its label (and colour, when the script says one). */
async function named(locator: Locator, label: string, background?: string) {
  await expect(locator.first()).toBeAttached();
  const shown = ((await locator.first().textContent()) ?? "").replace(/\s+/g, " ").trim();
  expect(shown).toContain(label.replace(/\s/g, " "));
  if (background) expect(await locator.first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(background);
}

/** What a verdict screen shows, as the voice says it. */
async function verdictScript(page: Page, lang: Lang) {
  const s = STRINGS[lang];
  const label = await text(page, "section[aria-labelledby=verdict-h] > div:nth-child(2) > p");
  const headline = await text(page, "#verdict-h");
  const sub = await text(page, "#verdict-h + p");
  const chip = await text(page, "#conf-h");
  const level = (lang === "en" ? chip.replace(/ confidence$/i, "") : chip.replace(/^Confiance /, "")).toLowerCase();
  const confidence = await text(page, "section[aria-labelledby=conf-h] p");
  let answer: string[];
  if (label === s["verdict.label.drifting"]) {
    const fire = headline.replace(lang === "en" ? /^Likely from / : /^Elle vient probablement /, "");
    const [, km, direction] = sub.match(lang === "en" ? /about (\d+)\s+km\s+(.+) of you\.$/ : /à environ (\d+)\s+km\s+(.+) de chez vous\.$/)!;
    answer = script(lang, "voice.verdict.drifting", { fire, distance: spokenKm(lang, Number(km)), direction, level, confidence });
  } else if (label === s["verdict.label.unclear"]) {
    const [, fire] = sub.match(lang === "en" ? /^The air passed (?:near|close to) (.+), but/ : /^L’air est passé près (.+), mais/)!;
    const passed = await text(page, "section[aria-labelledby=poss-h]");
    const km = /less than 1|moins de 1/.test(passed) ? 0 : Number(passed.match(/(\d+)\s+km/)![1]);
    answer = script(lang, /wind|vent/.test(sub) ? "voice.verdict.unclear.wind" : "voice.verdict.unclear", { fire, distance: spokenKm(lang, km) });
  } else {
    answer = script(lang, "voice.verdict.unexplained");
  }
  const noticeLink = page.locator("main > section").first().getByRole("link", { name: s["leave.entry"].replace(/\s/g, " ") });
  const notice = (await noticeLink.count()) > 0 ? script(lang, "voice.verdict.notice", { link: ((await noticeLink.textContent()) ?? "").trim() }) : [];
  const library = page.getByRole("link", { name: s["todo.break.library"] });
  return [
    ...answer,
    ...notice,
    ...script(lang, "voice.verdict.todo", { advice: await text(page, "section[aria-labelledby=todo-h] h2 + p") }),
    ...((await library.count()) > 0 ? script(lang, "voice.verdict.break") : []),
    ...script(lang, "voice.verdict.nurse"),
    ...script(lang, "voice.verdict.call"),
    ...script(lang, "voice.verdict.why"),
  ];
}
/** Every button the verdict's script names. */
async function verdictButtons(page: Page, lang: Lang) {
  const s = STRINGS[lang];
  const notice = page.locator("main > section").first().getByRole("link", { name: s["leave.entry"].replace(/\s/g, " ") });
  if ((await notice.count()) > 0) await named(notice, s["leave.entry"]);
  const library = page.getByRole("link", { name: s["todo.break.library"] });
  if ((await library.count()) > 0) await named(library, s["todo.break.library"]);
  await named(page.locator('a[href="tel:811"]'), "811");
  await named(page.locator('a.press[href="tel:911"]'), s["sticky.call"], RED); // "the red Call 911 button at the bottom of the screen"
  await named(page.getByRole("button", { name: s["why.title"] }), s["why.title"]);
}

/** The on-screen labels of the buttons a verdict's script names (the notice and Health Canada only when shown). */
async function verdictLabels(page: Page, lang: Lang) {
  const s = STRINGS[lang];
  const notice = await page.locator("main > section").first().getByRole("link", { name: s["leave.entry"].replace(/\s/g, " ") }).count();
  const library = await page.getByRole("link", { name: s["todo.break.library"] }).count();
  return [...(notice ? [s["leave.entry"]] : []), ...(library ? [s["todo.break.library"]] : []), s["sticky.call"], s["why.title"]];
}

/**
 * A screen: how to open it, its script as read from the screen, the buttons it names (on screen, with that label and
 * colour), and those buttons' on-screen labels, which the voice must say (numbers spelled out).
 */
type Screen = {
  name: string;
  open: (page: Page, lang: Lang) => Promise<void>;
  script: (page: Page, lang: Lang) => Promise<string[]>;
  buttons?: (page: Page, lang: Lang) => Promise<void>;
  labels?: (page: Page, lang: Lang) => Promise<string[]>;
  seconds?: number;
};
const keys = (...names: string[]) => async (_: Page, lang: Lang) => names.map((name) => STRINGS[lang][name]);

const SCREENS: Screen[] = [
  {
    name: "Check (replay)",
    open: async () => {},
    script: async (page, lang) => [...script(lang, "voice.check.replay"), ...script(lang, "voice.check", { leave: await text(page, 'main a[href="/leave"]') })],
    buttons: async (page, lang) => {
      await named(page.locator('main a[href="/q1"]'), STRINGS[lang]["check.cta"], NAVY); // "the big dark blue button"
      await named(page.locator('main a[href="/leave"]'), STRINGS[lang]["leave.entry"]);
    },
    labels: keys("check.cta", "leave.entry"),
  },
  {
    name: "Q1",
    open: (page) => page.goto("/q1").then(),
    script: async (_, lang) => script(lang, "voice.q1"),
    buttons: async (page, lang) => {
      await named(page.locator('main a[href="/emergency"]'), STRINGS[lang]["q1.yesSub"], RED); // "the red button at the top: Yes, I see flames"
      await named(page.locator('main a[href="/q2"]'), STRINGS[lang]["q1.no"], WHITE); // "the white button just below it: No"
    },
    labels: keys("q1.yes", "q1.yesSub", "q1.no"),
  },
  {
    name: "Q2",
    open: (page) => page.goto("/q2").then(),
    script: async (_, lang) => script(lang, "voice.q2"),
    buttons: async (page, lang) => {
      // The three choices, in the order the voice gives them: the dark column (to Emergency), haze, then the smell.
      const choices = page.locator("main a.opt");
      await expect(choices).toHaveCount(3);
      await named(choices.nth(0), STRINGS[lang]["q2.column"]);
      await expect(choices.nth(0)).toHaveAttribute("href", "/emergency");
      await named(choices.nth(1), STRINGS[lang]["q2.haze"]);
      await named(choices.nth(2), STRINGS[lang]["q2.smell"]);
    },
    labels: keys("q2.haze"), // the other two choices are described in the voice's own words
  },
  {
    name: "Location",
    open: (page) => page.goto("/location").then(),
    script: async (_, lang) => script(lang, "voice.location"),
    buttons: async (page, lang) => {
      await named(page.locator('main a[href="/loading"]'), STRINGS[lang]["location.useMine"], NAVY); // "the dark blue button"
      await expect(page.locator("main input[type=search]")).toBeVisible(); // "the box below"
    },
    labels: keys("location.useMine"),
  },
  {
    name: "Loading",
    open: async (page) => {
      await page.goto("/location");
      await search(page, "Moncton");
      await expect(page).toHaveURL(/\/loading$/);
      await expect(page.locator(".hours")).toBeAttached(); // the loading screen itself, not the location screen
    },
    script: async (_, lang) => script(lang, "voice.loading"),
  },
  { name: "Verdict 7a (Moncton replay)", open: (page) => verdictFor(page, "Moncton"), script: verdictScript, buttons: verdictButtons, labels: verdictLabels, seconds: 20 },
  { name: "Verdict 7a, fire close (Bridgetown replay)", open: (page) => verdictFor(page, "Bridgetown"), script: verdictScript, buttons: verdictButtons, labels: verdictLabels, seconds: 20 },
  { name: "Verdict 7c (Miramichi replay)", open: (page) => verdictFor(page, "Miramichi"), script: verdictScript, buttons: verdictButtons, labels: verdictLabels, seconds: 20 },
  { name: "Verdict 7b (Halifax replay)", open: (page) => verdictFor(page, "Halifax"), script: verdictScript, buttons: verdictButtons, labels: verdictLabels, seconds: 20 },
  { name: "Verdict 7d (live, no fires in range)", open: async (page, lang) => { await start(page, lang, "live"); await noFiresVerdict(page); }, script: verdictScript, buttons: verdictButtons, labels: verdictLabels, seconds: 20 },
  {
    name: "Emergency",
    open: (page) => page.goto("/emergency").then(),
    script: async (_, lang) => script(lang, "voice.emergency"),
    buttons: async (page, lang) => named(page.locator('main a[href="tel:911"]'), STRINGS[lang]["emergency.call"], WHITE), // "the big white Call 911 button"
    labels: keys("emergency.call"),
  },
  {
    name: "Told to leave, no place yet",
    open: (page) => page.goto("/leave").then(),
    script: async (_, lang) => script(lang, "voice.leave.where"),
    buttons: async (page, lang) => {
      await named(page.locator('main a[href="/leave"]'), STRINGS[lang]["location.useMine"]);
      await expect(page.locator("#leave-search")).toBeVisible();
    },
    labels: keys("location.useMine"),
  },
  {
    name: "Told to leave, near the fire (Bridgetown replay)",
    open: (page) => leaveFor(page, "Bridgetown"),
    script: async (page, lang) => {
      const [name, address] = (await page.locator("section[aria-labelledby=reception-h] > p").first().innerText()).split("\n");
      const items = await page.locator("section[aria-labelledby=take-h] li").allTextContents();
      const list = await page.evaluate(([l, all]) => new Intl.ListFormat(l, { style: "long", type: "conjunction" }).format((all as string[]).map((i) => (/^\p{Lu}\p{Ll}/u.test(i) ? i.charAt(0).toLocaleLowerCase(l as string) + i.slice(1) : i))), [lang, items] as const);
      return [...script(lang, "voice.leave.intro"), ...script(lang, "voice.leave.near", { name, address, list })];
    },
    buttons: async (page, lang) => {
      await named(page.locator("section[aria-labelledby=reception-h]").getByRole("link", { name: STRINGS[lang]["leave.directions"] }), STRINGS[lang]["leave.directions"]);
      await named(page.locator('main a[href^="sms:"]'), STRINGS[lang]["leave.family"]);
    },
    labels: keys("leave.directions", "leave.family"),
  },
  {
    name: "Told to leave, far from the fire (Moncton replay)",
    open: (page) => leaveFor(page, "Moncton"),
    script: async (page, lang) => {
      const far = await text(page, "main section p");
      const [, name, km, town] = far.match(lang === "en" ? /near the (.+) fire in .+, (\d+) km from (.+)\. It/ : /près du feu de (.+?), dans .+, à (\d+) km (.+)\. Elle/)!;
      const fire = STRINGS[lang]["fire.the.named"].replace("{name}", name);
      const links = await page.locator('main section a[target="_blank"]').count();
      const call211 = await page.locator('a[href="tel:211"]').count();
      return [
        ...script(lang, "voice.leave.far", { fire, distance: spokenKm(lang, Number(km)), town, ofTown: town }),
        ...(links > 0 ? script(lang, "voice.leave.far.links") : []),
        ...(call211 > 0 ? script(lang, "voice.leave.211") : []),
      ];
    },
    buttons: async (page) => {
      await expect(page.locator('main section a[target="_blank"]').first()).toBeVisible(); // "the links below"
      await named(page.locator('a[href="tel:211"]'), "211");
    },
  },
  {
    name: "Told to leave, no event (live, Moncton)",
    open: async (page, lang) => { await start(page, lang, "live"); await leaveFor(page, "Moncton"); },
    script: async (page, lang) => [
      ...script(lang, "voice.leave.intro"),
      ...((await page.locator('main section a[target="_blank"]').count()) > 0 ? script(lang, "voice.leave.none.links") : []),
      ...((await page.locator('a[href="tel:211"]').count()) > 0 ? script(lang, "voice.leave.211") : []),
    ],
    buttons: async (page) => named(page.locator('a[href="tel:211"]'), "211"),
  },
  { name: "How it works", open: (page) => page.goto("/how-it-works").then(), script: async (_, lang) => script(lang, "voice.how") },
  {
    name: "Location off",
    open: (page) => page.goto("/location-off").then(),
    script: async (_, lang) => script(lang, "voice.locationOff"),
    buttons: async (page, lang) => {
      await named(page.locator('main a[href="/loading"]'), STRINGS[lang]["locationOff.check"]);
      await expect(page.locator("main input[type=search]")).toBeVisible(); // "the box"
    },
    labels: keys("locationOff.check"),
  },
  {
    name: "No data",
    open: (page) => page.goto("/no-data").then(),
    script: async (_, lang) => script(lang, "voice.noData"),
    buttons: async (page, lang) => {
      await named(page.locator("main button"), STRINGS[lang]["noData.retry"]);
      await named(page.locator('a.press[href="tel:911"]'), STRINGS[lang]["sticky.call"], RED); // "the red Call 911 button"
    },
    labels: keys("noData.retry", "sticky.call"),
  },
];

for (const lang of ["en", "fr"] as const) {
  test.describe(`Listen, ${lang.toUpperCase()}`, () => {
    test.beforeEach(async ({ page }) => { await page.addInitScript(fakeSpeech); });

    for (const screen of SCREENS) {
      test(`${screen.name}: says its script, filled from the screen, sentence by sentence`, async ({ page }) => {
        test.setTimeout(60_000);
        await start(page, lang, "replay");
        await screen.open(page, lang);
        const button = listenButton(page, lang);
        await expect(button).toBeVisible();
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(56);
        // Outlined navy on white: never red.
        expect(await button.evaluate((el) => { const s = getComputedStyle(el); return [s.borderTopColor, s.color, s.backgroundColor]; })).toEqual([NAVY, NAVY, WHITE]);
        expect(await spoken(page)).toEqual([]); // never plays by itself

        const expected = await screen.script(page, lang); // read from the screen before the voice starts
        const labels = screen.labels ? await screen.labels(page, lang) : [];
        await button.click();
        await expect.poll(async () => (await spoken(page)).length, { timeout: (screen.seconds ?? 10) * 1000 }).toBeGreaterThanOrEqual(expected.length);
        // The reading has ended when the button says Listen again; only then is the whole reading compared.
        await expect(listenButton(page, lang)).toBeVisible({ timeout: 5_000 });
        const said = await spoken(page);
        expect(said.map((u) => u.text)).toEqual(expected);

        // One sentence per utterance, the natural Canadian voice, rate 0.95, pitch 1, full volume, ~300 ms between sentences.
        expect(said.map(({ lang: l, rate, pitch, volume, voice }) => ({ l, rate, pitch, volume, voice }))).toEqual(said.map(() => ({ l: `${lang}-CA`, rate: 0.95, pitch: 1, volume: 1, voice: VOICE[lang] })));
        for (let i = 1; i < said.length; i++) expect(said[i].at - said[i - 1].end).toBeGreaterThanOrEqual(290);
        // Phone numbers spelled out; never "safe"; nothing against calling 911.
        expect(said.filter((u) => /\b(911|811|211)\b|safe|sécuri|(do not|don’t|never|no need to) call|ne (pas|jamais) appeler|n’appelez (pas|jamais)/i.test(u.text))).toEqual([]);

        if (screen.buttons) await screen.buttons(page, lang);
        // Every button the script names is said with its on-screen label (numbers spelled out; after a colon, a
        // label may start in lower case: "Oui, je vois des flammes").
        const all = said.map((u) => u.text).join(" ").replace(/\s/g, " ").toLocaleLowerCase(lang);
        expect(labels.filter((label) => !all.includes(asSaid(lang, label).toLocaleLowerCase(lang)))).toEqual([]);
      });
    }
  });
}

/**
 * After a stop: the speech was cancelled, the button says Listen, and nothing more is said, even though the interrupted
 * sentence's error event fired (longer than two pauses between sentences).
 */
async function stopped(page: Page, cancelsBefore: number) {
  await expect(listenButton(page, "en")).toBeVisible();
  expect(await cancels(page)).toBeGreaterThan(cancelsBefore);
  const count = (await spoken(page)).length;
  await page.waitForTimeout(800);
  expect((await spoken(page)).length).toBe(count);
}
/** The recorder holds each sentence until cancelled, so a reading is still going when the test stops it. */
const holdSentences = (page: Page) => page.evaluate(() => { (window as unknown as { __autoEnd: boolean }).__autoEnd = false; });

test.describe("Listen: stopping", () => {
  test.beforeEach(async ({ page }) => { await page.addInitScript(fakeSpeech); });

  test("tap again to stop", async ({ page }) => {
    await start(page, "en");
    await page.goto("/q1");
    await holdSentences(page);
    await listenButton(page, "en").click();
    const before = await cancels(page);
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await stopped(page, before);
  });

  test("the leave screen changing place (Not in Bridgetown? Change) stops it: its buttons are no longer there", async ({ page }) => {
    await start(page, "en");
    await leaveFor(page, "Bridgetown");
    await holdSentences(page);
    await listenButton(page, "en").click();
    const before = await cancels(page);
    await page.getByRole("button", { name: "Not in Bridgetown? Change" }).click();
    await expect(page.getByRole("heading", { name: "Where are you?" })).toBeVisible();
    await stopped(page, before);
  });

  test("Check switching Live / Replay stops it: the replay line no longer applies", async ({ page }) => {
    await start(page, "en");
    await holdSentences(page);
    await listenButton(page, "en").click();
    const before = await cancels(page);
    await page.getByRole("button", { name: /Live/ }).click();
    await stopped(page, before);
  });

  test("tapping Call 911 stops it, so it never talks over the call", async ({ page }) => {
    await start(page, "en");
    await page.goto("/emergency");
    await holdSentences(page);
    // The test stays on the page: the tel: link doesn't open a dialer here.
    await page.evaluate(() => document.addEventListener("click", (e) => { if ((e.target as Element).closest('a[href^="tel:"]')) e.preventDefault(); }));
    await listenButton(page, "en").click();
    const before = await cancels(page);
    await page.locator('main a[href="tel:911"]').click();
    await stopped(page, before);
  });

  test("the 811 line stops it too (any phone number)", async ({ page }) => {
    await start(page, "en");
    await verdictFor(page, "Moncton");
    await holdSentences(page);
    await page.evaluate(() => document.addEventListener("click", (e) => { if ((e.target as Element).closest('a[href^="tel:"]')) e.preventDefault(); }));
    await listenButton(page, "en").click();
    const before = await cancels(page);
    await page.locator('a[href="tel:811"]').click();
    await stopped(page, before);
  });

  test("leaving the page (the dialer, another tab) stops it", async ({ page }) => {
    await start(page, "en");
    await page.goto("/q1");
    await holdSentences(page);
    await listenButton(page, "en").click();
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
    const before = await cancels(page);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await stopped(page, before);
  });

  test("going to another screen stops it: nothing more from the old screen is said", async ({ page }) => {
    await start(page, "en");
    await page.goto("/q1");
    await listenButton(page, "en").click();
    await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(0);
    const before = await cancels(page);
    await page.locator('main a[href="/q2"]').click();
    await expect(page).toHaveURL(/\/q2$/);
    const count = (await spoken(page)).length;
    await page.waitForTimeout(800); // longer than two pauses between sentences
    expect((await spoken(page)).length).toBe(count);
    expect(await cancels(page)).toBeGreaterThan(before);
    await expect(listenButton(page, "en")).toBeVisible(); // the new screen's own Listen, not playing
  });

  test("switching language stops it; the next reading is in French, with the Canadian French voice", async ({ page }) => {
    await start(page, "en");
    await page.goto("/q1");
    await page.evaluate(() => { (window as unknown as { __autoEnd: boolean }).__autoEnd = false; });
    await listenButton(page, "en").click();
    const before = await cancels(page);
    await page.getByRole("button", { name: "Français" }).click();
    await expect(listenButton(page, "fr")).toBeVisible();
    expect(await cancels(page)).toBeGreaterThan(before);
    await page.evaluate(() => { (window as unknown as { __autoEnd: boolean }).__autoEnd = true; });
    await listenButton(page, "fr").click();
    await expect.poll(async () => (await spoken(page)).length).toBe(1 + script("fr", "voice.q1").length);
    expect((await spoken(page)).slice(1).map(({ text: t, lang, voice }) => ({ t, lang, voice }))).toEqual(script("fr", "voice.q1").map((t) => ({ t, lang: "fr-CA", voice: VOICE.fr })));
  });
});

test.describe("without speech in the browser", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true });
      Object.defineProperty(window, "SpeechSynthesisUtterance", { value: undefined, configurable: true });
    });
  });

  for (const route of ["/", "/q1", "/q2", "/location", "/emergency", "/leave", "/how-it-works", "/location-off", "/no-data"]) {
    test(`${route}: no Listen button`, async ({ page }) => {
      await start(page, "en");
      await page.goto(route);
      await expect(page.locator("h1").first()).toBeVisible();
      await expect(page.getByRole("button", { name: /^(Listen|Stop)$/ })).toHaveCount(0);
    });
  }
  test("verdict: no Listen button", async ({ page }) => {
    await start(page, "en");
    await verdictFor(page, "Moncton");
    await expect(page.getByRole("button", { name: /^(Listen|Stop)$/ })).toHaveCount(0);
  });
});
