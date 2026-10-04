// "Listen", the guided voice on every screen. The browser's speech is replaced by a recorder that ends each sentence
// after 10 ms, so the tests see exactly what is said, in order, with the pause between sentences. Each script comes from
// the strings file (voice.*); its {…} values are read from the screen, and every button it names is on the screen. On
// the three questions the values are the answers' labels: each answer is on the screen with that label, in that order.
// A verdict is read twice: as it opens, the card (its line in spoken words, the badges by name, "Why?", then 911); with
// "Why?" open, everything screens 7a–7d say, word for word as before the card.
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { TEST_ENGINE_URL } from "./engine";
import { answer } from "./look";
import { openWhy, sheetTo } from "./verdict";

type Lang = "en" | "fr";
type Spoken = { text: string; lang: string; rate: number; pitch: number; volume: number; voice: string | null; at: number; end: number };

const STRINGS: Record<Lang, Record<string, string>> = {
  en: JSON.parse(readFileSync(new URL("../src/i18n/en.json", import.meta.url), "utf8")),
  fr: JSON.parse(readFileSync(new URL("../src/i18n/fr.json", import.meta.url), "utf8")),
};
const LABEL = { en: { play: "Listen", stop: "Stop" }, fr: { play: "Écouter", stop: "Arrêter" } };
// The recorder's voices. The two Google ones are voice services (what they say goes to a server); the others work on
// the device. A voice on the device reads first, however natural a service sounds: in English the plain Canadian voice
// (not the natural US service, nor the novelty voice), in French the natural Canadian one.
const VOICE = { en: "Microsoft Linda - English (Canada)", fr: "Amélie (Enhanced)" };
const SERVICE = { en: "Google US English", fr: "Google français" };
const SERVICES_ONLY = [{ lang: "en-US", name: SERVICE.en, localService: false }, { lang: "fr-FR", name: SERVICE.fr, localService: false }];
const NAVY = "rgb(27, 42, 74)";
const RED = "rgb(217, 45, 32)";
const WHITE = "rgb(255, 255, 255)";
const SPELLED = { en: { "911": "nine-one-one", "811": "eight-one-one", "211": "two-one-one" }, fr: { "911": "neuf-un-un", "811": "huit-un-un", "211": "deux-un-un" } };

/** A string from the strings file. A key that is not in the file fails the test that asks for it, by name. */
function stringOf(lang: Lang, key: string) {
  expect(STRINGS[lang][key], `"${key}" in ${lang}.json`).toBeDefined();
  return STRINGS[lang][key];
}
/** A script from the strings file, as the app says it: split into sentences, then filled in. */
const script = (lang: Lang, key: string, vars: Record<string, string | number> = {}) =>
  stringOf(lang, key).split(/(?<=[.?!])\s+(?=\S)/).map((s) => s.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match)));
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
  let voices: { lang: string; name: string; localService?: boolean }[] = [
    { lang: "en-US", name: "Albert", localService: true }, { lang: "en-CA", name: "Microsoft Linda - English (Canada)", localService: true }, { lang: "en-US", name: "Google US English", localService: false },
    { lang: "fr-FR", name: "Google français", localService: false }, { lang: "fr-CA", name: "Amélie", localService: true }, { lang: "fr-CA", name: "Amélie (Enhanced)", localService: true },
  ];
  /** Another list of voices, as a browser that lists them late, or a phone with voice services only. */
  w.__setVoices = (list: typeof voices) => { voices = list; };
  // A tap in progress: iOS lets speech start only inside one.
  w.__inTap = false;
  document.addEventListener("click", () => { w.__inTap = true; setTimeout(() => { w.__inTap = false; }, 0); }, true);
  Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true, writable: true });
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      getVoices: () => voices,
      speak: (u: Record<string, unknown>) => {
        const entry = { u, at: performance.now(), end: 0, inTap: w.__inTap as boolean };
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
/** Give the browser another list of voices, from now on in this page. */
const setVoices = (page: Page, list: object[]) => page.evaluate((voices) => (window as unknown as { __setVoices: (v: object[]) => void }).__setVoices(voices), list);
/** What was said, with the voice that said it. */
const heard = async (page: Page) => (await spoken(page)).map(({ text, voice }) => ({ text, voice }));
/** Whether each sentence started inside a tap. */
const inTap = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: { inTap: boolean }[] }).__spoken.map((entry) => entry.inTap));
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

/**
 * The answers on the three questions, in the order shown: the answer's name (its data-answer, and its {…} in the
 * script), the strings key of its label, and where it leads. On the first question, its colour too: the script says
 * "the red Yes button", so Yes is red and the other two are not.
 */
type Answer = { key: string; label: string; to: string; background?: string };
const Q1: Answer[] = [
  { key: "yes", label: "q1.yes", to: "/emergency", background: RED },
  { key: "no", label: "q1.no", to: "/q2", background: WHITE },
  { key: "notSure", label: "look.notSure", to: "/emergency", background: WHITE },
];
const Q2: Answer[] = [
  { key: "column", label: "q2.column", to: "/emergency" },
  { key: "haze", label: "q2.haze", to: "/q3" },
  { key: "smell", label: "q2.smell", to: "/q3" },
  { key: "notSure", label: "look.notSure", to: "/emergency" },
];
const Q3: Answer[] = [
  { key: "firePit", label: "q3.firePit", to: "/nearby-fire" },
  { key: "mulch", label: "q3.mulch", to: "/emergency" },
  { key: "people", label: "q3.people", to: "/emergency" },
  { key: "other", label: "q3.other", to: "/emergency" },
  { key: "nothing", label: "q3.nothing", to: "/location" },
  { key: "notSure", label: "look.notSure", to: "/emergency" },
];
/** What a question's script is filled with: its answers' labels, as { yes: "Yes", no: "No", notSure: "Not sure" }. */
const labelled = (lang: Lang, answers: Answer[]) => Object.fromEntries(answers.map(({ key, label }) => [key, stringOf(lang, label)]));
/** Every answer is on the screen, in the order the voice gives them, with its label, and leads where it should. */
async function answersNamed(page: Page, lang: Lang, answers: Answer[]) {
  const links = page.locator("main a.look-answer");
  await expect(links).toHaveCount(answers.length);
  for (const [i, { key, label, to, background }] of answers.entries()) {
    await expect(links.nth(i)).toHaveAttribute("data-answer", key);
    await expect(links.nth(i)).toHaveAttribute("href", to);
    await named(links.nth(i), STRINGS[lang][label], background);
  }
}

/** A label inside a sentence: "Very high risk" → "very high risk". */
const lowerFirst = (lang: Lang, label: string) => (/^\p{Lu}\p{Ll}/u.test(label) ? label.charAt(0).toLocaleLowerCase(lang) + label.slice(1) : label);
const sameText = (a: string, b: string) => a.replace(/\s/g, " ") === b.replace(/\s/g, " ");

/** The fire-is-close notice's link (a fire under 25 km away). The notice stays in front of "Why?". */
const noticeLink = (page: Page, lang: Lang) => page.locator("main > section").first().getByRole("link", { name: STRINGS[lang]["leave.entry"].replace(/\s/g, " ") });
/** What the voice says of the notice, naming its link as on the screen; nothing when there is no notice. */
async function noticeScript(page: Page, lang: Lang) {
  const link = noticeLink(page, lang);
  return (await link.count()) > 0 ? script(lang, "voice.verdict.notice", { link: ((await link.textContent()) ?? "").trim() }) : [];
}

/**
 * The values a string on the screen was filled with, by its key in the strings file: "159 km SSW" is "{km} km
 * {direction}" with km 159 and direction SSW. Null when the text is another string. No-break spaces count as spaces.
 */
function valuesOf(lang: Lang, key: string, shown: string): Record<string, string> | null {
  const template = stringOf(lang, key);
  const names = [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
  const pattern = template.split(/\{\w+\}/).map((piece) => piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s/g, "\\s")).join("(.+)");
  const found = shown.match(new RegExp(`^${pattern}$`));
  return found && Object.fromEntries(names.map((name, i) => [name, found[i + 1].replace(/\s/g, " ")]));
}
/**
 * A fire as the voice says it ("the Long Lake fire", "du feu de Long Lake"), from how the card names it: as a title
 * ("Long Lake fire", "Feu de Long Lake") or plainly ("a fire near Fontaine", "un feu près de Fontaine").
 */
function fireSaid(lang: Lang, form: "title" | "plain", shown: string) {
  for (const kind of ["named", "near", "in"]) {
    const values = valuesOf(lang, `fire.${form}.${kind}`, shown);
    if (values) return stringOf(lang, `fire.the.${kind}`).replace(/\{(\w+)\}/g, (_, name: string) => values[name]);
  }
  throw new Error(`"${shown}" is none of fire.${form}.* in ${lang}.json`);
}
/** A direction as the voice says it, from its short form on the card: "SSW" → "south-southwest", "SSO" → "au sud-sud-ouest". */
function directionSaid(lang: Lang, short: string) {
  const key = Object.keys(STRINGS[lang]).find((k) => k.startsWith("compass.abbr.") && STRINGS[lang][k] === short);
  expect(key, `"${short}" among compass.abbr.* in ${lang}.json`).toBeDefined();
  return stringOf(lang, key!.replace(".abbr.", ".at."));
}

/** The card's line as shown, part by part, without the dots between them: "Drifting smoke", "Long Lake fire", "159 km SSW". */
const cardParts = async (page: Page) => (await page.locator("#verdict-h .glance-part").allTextContents()).map((part) => part.replace(/\s*·$/, "").trim());
/** A button's name as the voice says it in a sentence: without the question mark it ends with ("Why?" → "Why"). */
const nameSaid = (label: string) => label.replace(/\s*[?!.]+$/, "");
/** The badges' full names, in order: the verdict's three, and in New Brunswick the burn status (on a small phone each
 *  shows on a tap; it is always the button's name). */
const badgeLabels = async (page: Page) => (await page.locator("main .badge .badge-label").allTextContents()).map((label) => label.trim());

/** The card's line as the voice says it. */
async function lineScript(page: Page, lang: Lang) {
  const s = STRINGS[lang];
  const [state, second, third] = await cardParts(page);
  let line: string[];
  if (state === s["card.drifting"]) {
    // "159 km SSW" is said in full: "159 kilometres south-southwest". Under 1 km the card gives no direction.
    const fire = fireSaid(lang, "title", second);
    const far = valuesOf(lang, "card.distance", third);
    line = far
      ? script(lang, "voice.card.drifting", { fire, distance: spokenKm(lang, Number(far.km)), direction: directionSaid(lang, far.direction) })
      : script(lang, "voice.card.drifting.under", { fire });
  } else if (state === s["card.unclear"]) {
    line = script(lang, "voice.card.unclear", { fire: fireSaid(lang, "plain", valuesOf(lang, "card.unclear.fire", second)!.fire) });
  } else {
    const within = valuesOf(lang, "card.noFireWithin", second); // "No known fire within 500 km"; otherwise "No known fire upwind"
    line = within ? script(lang, "voice.card.noFires", within) : script(lang, "voice.card.unexplained");
  }
  return line;
}
/** Where the voice sends for 911. Nothing explains the smoke: Call 911 is the main action, "the big red button". */
const callScript = async (page: Page, lang: Lang) => script(lang, (await cardParts(page))[0] === STRINGS[lang]["card.unexplained"] ? "voice.card.call" : "voice.verdict.call");

/**
 * What the verdict shows as it opens (the map, and the card in the sheet at its foot), as the voice says it: the
 * card's line in spoken words, the notice when it is on the screen, what the map shows (its summary, a sentence at a
 * time, distances in full), where the rest is, then 911.
 */
async function peekScript(page: Page, lang: Lang) {
  const summary = (await text(page, "#map-summary")).replace(/(\d+)\s*km\b/g, (_, km: string) => spokenKm(lang, Number(km))).split(/(?<=[.?!])\s+(?=\S)/);
  return [
    ...(await lineScript(page, lang)),
    ...(await noticeScript(page, lang)),
    ...summary,
    ...script(lang, "voice.card.more", { more: await text(page, ".sheet-handle") }),
    ...(await callScript(page, lang)),
  ];
}
/** Every button that script names: the notice's link when shown, the sheet's handle, and Call 911. */
async function peekButtons(page: Page, lang: Lang) {
  const s = STRINGS[lang];
  if ((await noticeLink(page, lang).count()) > 0) await named(noticeLink(page, lang), s["leave.entry"]);
  await named(page.locator(".sheet-handle"), s["sheet.more"]);
  await expect(page.getByRole("region", { name: s["map.region"], exact: true })).toBeVisible(); // "the map"
  await named(page.locator('a.press[href="tel:911"]'), s["sticky.call"], RED);
  await expect(page.locator('a[href="tel:911"]')).toHaveCount(1);
}
async function peekLabels(page: Page, lang: Lang) {
  const s = STRINGS[lang];
  return [...((await noticeLink(page, lang).count()) ? [s["leave.entry"]] : []), s["sheet.more"], s["sticky.call"]];
}

/**
 * What the verdict shows with the sheet at half ("Why?" closed), as the voice says it: the card's line in spoken
 * words, the notice when it is on the screen, each badge by its label, where the rest is, then 911.
 */
async function cardScript(page: Page, lang: Lang) {
  const s = STRINGS[lang];
  const [state] = await cardParts(page);
  const line = await lineScript(page, lang);
  const [fire, trace, alert, burn] = await badgeLabels(page);
  return [
    ...line,
    ...(await noticeScript(page, lang)),
    ...script(lang, "voice.card.badges", { fire, trace, alert }),
    // In New Brunswick the burn status is the fourth badge of the row: named after the other three.
    ...(burn ? [`${burn}.`] : []),
    ...script(lang, "voice.card.why", { why: nameSaid(await text(page, "main .why-toggle")) }),
    // Nothing explains the smoke: Call 911 is the screen's main action, and the voice sends to "the big red button".
    ...script(lang, state === s["card.unexplained"] ? "voice.card.call" : "voice.verdict.call"),
  ];
}
/** Every button the card's script names: the notice's link when shown, the three badges, "Why?", and Call 911. */
async function cardButtons(page: Page, lang: Lang) {
  const s = STRINGS[lang];
  if ((await noticeLink(page, lang).count()) > 0) await named(noticeLink(page, lang), s["leave.entry"]);
  // The badges, top to bottom as the voice names them: the fire detection, the wind trace, ECCC's alert.
  // In New Brunswick the burn status follows them, the fourth of the row.
  const badges = page.locator("main .badge");
  expect([3, 4]).toContain(await badges.count());
  for (const [i, id] of ["fire", "trace", "alert", "burn"].slice(0, await badges.count()).entries()) {
    await expect(badges.nth(i)).toHaveAttribute("data-badge", id);
    await expect(badges.nth(i)).toBeVisible();
  }
  const why = page.locator("main .why-toggle");
  await named(why, s["card.why"]);
  await expect(why).toHaveAttribute("aria-expanded", "false"); // still closed: the voice read the card, not what is behind it
  const call = page.locator('a.press[href="tel:911"]');
  await named(call, s["sticky.call"], RED); // "the red button at the bottom to call nine-one-one"
  await expect(page.locator('a[href="tel:911"]')).toHaveCount(1); // the only one
  if ((await cardParts(page))[0] === s["card.unexplained"]) {
    // "the big red button": 72 px tall or more, and wider than half the screen (the bar's usual button is 150 px at most).
    const box = (await call.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(72);
    expect(box.width).toBeGreaterThan(page.viewportSize()!.width / 2);
  }
}
/** The on-screen labels the card's script names: the notice's link when shown, the three badges, "Why?", Call 911. */
async function cardLabels(page: Page, lang: Lang) {
  const s = STRINGS[lang];
  const notice = await noticeLink(page, lang).count();
  return [...(notice ? [s["leave.entry"]] : []), ...(await badgeLabels(page)), nameSaid(s["card.why"]), s["sticky.call"]];
}

/** What a verdict screen shows with "Why?" open, as the voice says it: everything screens 7a–7d say. */
async function verdictScript(page: Page, lang: Lang) {
  const s = STRINGS[lang];
  const label = await text(page, "section[aria-labelledby=answer-h] > p:first-child");
  const headline = await text(page, "#answer-h");
  const sub = await text(page, "#answer-h + p");
  const notice = await noticeScript(page, lang);
  let answer: string[];
  if (label === s["verdict.label.drifting"]) {
    const fire = headline.replace(lang === "en" ? /^Likely from / : /^Elle vient probablement /, "");
    const far = sub.match(lang === "en" ? /about (\d+)\s+km\s+(.+) of you\.$/ : /à environ (\d+)\s+km\s+(.+) de chez vous\.$/);
    answer = [
      ...(far ? script(lang, "voice.verdict.drifting", { fire, distance: spokenKm(lang, Number(far[1])), direction: far[2] }) : script(lang, "voice.verdict.drifting.under", { fire })),
      ...(notice.length > 0 ? [] : script(lang, "voice.verdict.drifting.far")), // "from far away" only without the fire-close notice
    ];
  } else if (label === s["verdict.label.unclear"]) {
    const [, fire] = sub.match(lang === "en" ? /^The air passed (?:near|close to) (.+), but/ : /^L’air est passé près (.+), mais/)!;
    const passed = await text(page, "section[aria-labelledby=poss-h]");
    const km = /less than 1|moins de 1/.test(passed) ? 0 : Number(passed.match(/(\d+)\s+km/)![1]);
    answer = script(lang, /wind|vent/.test(sub) ? "voice.verdict.unclear.wind" : "voice.verdict.unclear", { fire, distance: spokenKm(lang, km) });
  } else {
    answer = script(lang, "voice.verdict.unexplained");
  }
  // How sure, as the confidence card says: when low, its reason (the heights disagree, or the wind shifted).
  const chip = await text(page, "#conf-h");
  const level = (["high", "medium", "low"] as const).find((l) => sameText(chip, s[`confidence.${l}`]))!;
  const card = await text(page, "section[aria-labelledby=conf-h] p");
  const reason = () =>
    sameText(card, s["confidence.text.heights"])
      ? s["voice.verdict.reason.heights"]
      : s["voice.verdict.reason.unsteady"].replace("{when}", card.match(lang === "en" ? /^Winds shifted (.+), so/ : /^Les vents ont changé (.+), donc/)![1]);
  const sure = script(lang, `voice.verdict.confidence.${level}`, level === "low" ? { reason: reason() } : {});
  // Air quality: the risk level and the first line of What to do; with no reading, the official link instead.
  const official = page.locator("section[aria-labelledby=todo-h]").getByRole("link", { name: s["todo.officialLink"] });
  const air =
    (await official.count()) > 0
      ? script(lang, "voice.verdict.aq.none", { link: s["todo.officialLink"] })
      : script(lang, "voice.verdict.aq", {
          risk: lowerFirst(lang, await text(page, "section[aria-labelledby=aqhi-h] > div:nth-child(2) > span:nth-child(2) > span:first-child")),
          advice: await text(page, "section[aria-labelledby=todo-h] h2 + p"),
        });
  const library = page.getByRole("link", { name: s["todo.break.library"] });
  return [
    ...answer,
    ...sure,
    ...notice,
    ...air,
    ...((await library.count()) > 0 ? script(lang, "voice.verdict.break") : []),
    ...script(lang, "voice.verdict.nurse"),
    ...script(lang, "voice.verdict.call"),
  ];
}
/** Every button the verdict's script names, with "Why?" open. */
async function verdictButtons(page: Page, lang: Lang) {
  const s = STRINGS[lang];
  if ((await noticeLink(page, lang).count()) > 0) await named(noticeLink(page, lang), s["leave.entry"]);
  const library = page.getByRole("link", { name: s["todo.break.library"] });
  if ((await library.count()) > 0) await named(library, s["todo.break.library"]);
  const official = page.locator("section[aria-labelledby=todo-h]").getByRole("link", { name: s["todo.officialLink"] });
  if ((await official.count()) > 0) await named(official, s["todo.officialLink"]);
  await named(page.locator('a[href="tel:811"]'), "811");
  await named(page.locator('a.press[href="tel:911"]'), s["sticky.call"], RED); // "the red button at the bottom to call nine-one-one"
}

/** The on-screen labels of the buttons a verdict's script names (the notice, Health Canada and the official link only when shown). */
async function verdictLabels(page: Page, lang: Lang) {
  const s = STRINGS[lang];
  const notice = await noticeLink(page, lang).count();
  const library = await page.getByRole("link", { name: s["todo.break.library"] }).count();
  const official = await page.locator("section[aria-labelledby=todo-h]").getByRole("link", { name: s["todo.officialLink"] }).count();
  return [...(notice ? [s["leave.entry"]] : []), ...(library ? [s["todo.break.library"]] : []), ...(official ? [s["todo.officialLink"]] : []), s["sticky.call"]];
}

/**
 * A screen: how to open it, its script as read from the screen, the buttons it names (on screen, with that label and
 * colour), and those buttons' on-screen labels, which the voice must say (numbers spelled out). `heard`: anything more
 * about what was said, given whole, in lower case with plain spaces.
 */
type Screen = {
  name: string;
  open: (page: Page, lang: Lang) => Promise<void>;
  script: (page: Page, lang: Lang) => Promise<string[]>;
  buttons?: (page: Page, lang: Lang) => Promise<void>;
  labels?: (page: Page, lang: Lang) => Promise<string[]>;
  heard?: (page: Page, lang: Lang, all: string) => Promise<void>;
  seconds?: number;
};
const keys = (...names: string[]) => async (_: Page, lang: Lang) => names.map((name) => STRINGS[lang][name]);
/** A verdict's three readings: the card and the map as the screen opens; the card and its badges with the sheet at
 *  half; then, with "Why?" open, everything screens 7a–7d say. */
const twoReadings = (name: string, open: Screen["open"]): Screen[] => [
  { name, open, script: peekScript, buttons: peekButtons, labels: peekLabels, seconds: 20 },
  { name: `${name}, Sources and why open`, open: async (page, lang) => { await open(page, lang); await sheetTo(page, "half"); }, script: cardScript, buttons: cardButtons, labels: cardLabels, seconds: 20 },
  { name: `${name}, Why? open`, open: async (page, lang) => { await open(page, lang); await openWhy(page); }, script: verdictScript, buttons: verdictButtons, labels: verdictLabels, seconds: 20 },
];

const SCREENS: Screen[] = [
  {
    name: "Check (replay)",
    open: async () => {},
    script: async (page, lang) => [
      ...script(lang, "voice.check.replay"),
      ...script(lang, "voice.check"),
      ...script(lang, "voice.check.install", { add: await text(page, "main > div:last-child button") }),
    ],
    buttons: async (page, lang) => {
      await named(page.locator('main a[href="/q1"]'), STRINGS[lang]["check.cta"], NAVY); // "the big blue button"
      await named(page.getByRole("button", { name: STRINGS[lang]["keep.add"], exact: true }), STRINGS[lang]["keep.add"]);
      await expect(page.locator('main a[href="/leave"]')).toHaveCount(0); // no Told to leave button, so the script names none
    },
    labels: keys("check.cta", "keep.add"),
  },
  {
    name: "Q1",
    open: (page) => page.goto("/q1").then(),
    script: async (_, lang) => script(lang, "voice.q1", labelled(lang, Q1)),
    buttons: (page, lang) => answersNamed(page, lang, Q1), // the three answers, top to bottom as the voice gives them
    labels: keys(...Q1.map(({ label }) => label)),
    heard: async (page, lang, all) => {
      // The voice asks the question on the screen, in the same words.
      const title = await text(page, "main h1");
      expect(title).toBe(STRINGS[lang]["q1.title"]);
      expect(all).toContain(title.replace(/\s*\?$/, "").replace(/\s/g, " ").toLocaleLowerCase(lang));
    },
  },
  {
    name: "Q2",
    open: (page) => page.goto("/q2").then(),
    script: async (_, lang) => script(lang, "voice.q2", labelled(lang, Q2)),
    buttons: (page, lang) => answersNamed(page, lang, Q2), // the three pictures as the voice counts them, then Not sure
    labels: keys(...Q2.map(({ label }) => label)),
  },
  {
    name: "Q3",
    open: (page) => page.goto("/q3").then(),
    script: async (_, lang) => script(lang, "voice.q3", labelled(lang, Q3)),
    buttons: (page, lang) => answersNamed(page, lang, Q3), // the six tiles, in the order the voice reads them
    labels: keys(...Q3.map(({ label }) => label)),
  },
  {
    name: "Nearby fire",
    open: (page) => page.goto("/nearby-fire").then(),
    script: async (page, lang) => script(lang, "voice.nearby", { check: await text(page, 'main a[href="/location"]') }),
    buttons: async (page, lang) => {
      await named(page.locator('main a[href="tel:911"]'), STRINGS[lang]["emergency.call"], RED); // "the big red button"
      await expect(page.locator('a[href="tel:911"]')).toHaveCount(1); // the only one: no 911 bar under it
      await named(page.locator('main a[href="/location"]'), STRINGS[lang]["nearby.check"]); // the link under it
    },
    labels: keys("nearby.check"),
  },
  {
    name: "Location",
    open: (page) => page.goto("/location").then(),
    script: async (_, lang) => script(lang, "voice.location"),
    buttons: async (page, lang) => {
      await named(page.locator('main a[href="/loading"]'), STRINGS[lang]["location.useMine"], NAVY); // "the blue button"
      await expect(page.locator("main input[type=search]")).toBeVisible(); // "the box"
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
  ...twoReadings("Verdict 7a (Moncton replay)", (page) => verdictFor(page, "Moncton")),
  ...twoReadings("Verdict 7a, fire close (Bridgetown replay)", (page) => verdictFor(page, "Bridgetown")),
  ...twoReadings("Verdict 7c (Miramichi replay)", (page) => verdictFor(page, "Miramichi")),
  ...twoReadings("Verdict 7b (Halifax replay)", (page) => verdictFor(page, "Halifax")),
  ...twoReadings("Verdict 7d (live, no fires in range)", async (page, lang) => { await start(page, lang, "live"); await noFiresVerdict(page); }),
  {
    name: "Emergency",
    open: (page) => page.goto("/emergency").then(),
    script: async (page, lang) => script(lang, "voice.emergency", { leave: await text(page, 'main a[href="/leave"]') }),
    buttons: async (page, lang) => {
      await named(page.locator('main a[href="tel:911"]'), STRINGS[lang]["emergency.call"], WHITE); // "the big white button at the bottom"
      await named(page.locator('main a[href="/leave"]'), STRINGS[lang]["leave.entry"]);
    },
    labels: keys("leave.entry"),
    heard: async (_, __, all) => {
      // The voice gives no reason: the screen is reached from every question, not only from flames or a smoke column.
      expect(all).not.toContain("smoke column");
      expect(all).not.toContain("colonne de fumée");
    },
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
      return script(lang, "voice.leave.near", { name, address });
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
        ...(call211 > 0 ? script(lang, "voice.leave.far.211") : []),
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

        // One sentence per utterance, the voice picked for the language, rate 0.92, pitch 1.05, full volume, ~300 ms between sentences.
        expect(said.map(({ lang: l, rate, pitch, volume, voice }) => ({ l, rate, pitch, volume, voice }))).toEqual(said.map(() => ({ l: `${lang}-CA`, rate: 0.92, pitch: 1.05, volume: 1, voice: VOICE[lang] })));
        for (let i = 1; i < said.length; i++) expect(said[i].at - said[i - 1].end).toBeGreaterThanOrEqual(290);
        // Phone numbers spelled out; never "safe"; nothing against calling 911.
        expect(said.filter((u) => /\b(911|811|211)\b|safe|sécuri|(do not|don’t|never|no need to) call|ne (pas|jamais) appeler|n’appelez (pas|jamais)/i.test(u.text))).toEqual([]);

        if (screen.buttons) await screen.buttons(page, lang);
        // Every button the script names is said with its on-screen label (numbers spelled out; compared in lower case,
        // since a label may start in lower case after a colon).
        const all = said.map((u) => u.text).join(" ").replace(/\s/g, " ").toLocaleLowerCase(lang);
        expect(labels.filter((label) => !all.includes(asSaid(lang, label).toLocaleLowerCase(lang)))).toEqual([]);
        if (screen.heard) await screen.heard(page, lang, all);
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

test.describe("Listen: Check opened from the home screen", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(fakeSpeech);
    // The manifest's standalone display: Add to home screen is hidden, so the voice doesn't name it.
    await page.addInitScript(() => {
      const matchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query: string) => (/display-mode:\s*standalone/.test(query) ? ({ matches: true, media: query } as MediaQueryList) : matchMedia(query));
    });
  });

  for (const lang of ["en", "fr"] as const) {
    test(`${lang.toUpperCase()}: the script ends with the 911 line, without Add to home screen`, async ({ page }) => {
      await start(page, lang, "live");
      await expect(page.getByRole("button", { name: STRINGS[lang]["keep.add"], exact: true })).toHaveCount(0);
      const expected = script(lang, "voice.check");
      await listenButton(page, lang).click();
      await expect.poll(async () => (await spoken(page)).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(expected.length);
      await expect(listenButton(page, lang)).toBeVisible({ timeout: 5_000 }); // the reading has ended
      expect((await spoken(page)).map((u) => u.text)).toEqual(expected);
    });
  }
});

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

  test("the 911 bar's Call 911 stops it too", async ({ page }) => {
    await start(page, "en");
    await page.goto("/location");
    await holdSentences(page);
    await page.evaluate(() => document.addEventListener("click", (e) => { if ((e.target as Element).closest('a[href^="tel:"]')) e.preventDefault(); }));
    await listenButton(page, "en").click();
    const before = await cancels(page);
    await page.locator('a.press[href="tel:911"]').click(); // the bar's red button
    await stopped(page, before);
  });

  test("the verdict raising the sheet stops it: the reading was of the map, and the badges are now what shows", async ({ page }) => {
    await start(page, "en");
    await verdictFor(page, "Moncton");
    await holdSentences(page);
    await listenButton(page, "en").click();
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
    const before = await cancels(page);
    await sheetTo(page, "half");
    await stopped(page, before);
  });

  test("the verdict opening Why? stops it: the reading was of the card, not of what Why? shows", async ({ page }) => {
    await start(page, "en");
    await verdictFor(page, "Moncton");
    await sheetTo(page, "half");
    await holdSentences(page);
    await listenButton(page, "en").click();
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
    const before = await cancels(page);
    await openWhy(page);
    await stopped(page, before);
  });

  test("the verdict closing Why? stops it: what was being read is no longer shown, and Listen is the card’s again", async ({ page }) => {
    await start(page, "en");
    await verdictFor(page, "Moncton");
    await openWhy(page);
    await holdSentences(page);
    await listenButton(page, "en").click();
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
    const before = await cancels(page);
    await page.locator("main .why-toggle").click();
    await stopped(page, before);
    // One Listen button, the card's (beside the sheet's handle at this height): a tap on it reads the card and
    // nothing of what was closed.
    await expect(listenButton(page, "en")).toHaveCount(1);
    await expect(page.locator(".sheet-top").getByRole("button", { name: "Listen", exact: true })).toBeVisible();
  });

  test("the 811 line stops it too (any phone number)", async ({ page }) => {
    await start(page, "en");
    await verdictFor(page, "Moncton");
    await openWhy(page); // the 811 line is in What to do, behind "Why?"
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
    await expect(page.locator('main a[data-answer="no"]')).toBeVisible();
    await answer(page, "no");
    await expect(page).toHaveURL(/\/q2$/);
    const count = (await spoken(page)).length;
    await page.waitForTimeout(800); // longer than two pauses between sentences
    expect((await spoken(page)).length).toBe(count);
    expect(await cancels(page)).toBeGreaterThan(before);
    await expect(listenButton(page, "en")).toBeVisible(); // the new screen's own Listen, not playing
  });

  test("switching language stops it; the next reading is in French, with the natural Canadian French voice", async ({ page }) => {
    await start(page, "en");
    await page.goto("/q1");
    await page.evaluate(() => { (window as unknown as { __autoEnd: boolean }).__autoEnd = false; });
    await listenButton(page, "en").click();
    const before = await cancels(page);
    await page.getByRole("button", { name: "Français" }).click();
    await expect(listenButton(page, "fr")).toBeVisible();
    expect(await cancels(page)).toBeGreaterThan(before);
    await page.evaluate(() => { (window as unknown as { __autoEnd: boolean }).__autoEnd = true; });
    const french = script("fr", "voice.q1", labelled("fr", Q1)); // the answers named by their French labels
    await listenButton(page, "fr").click();
    await expect.poll(async () => (await spoken(page)).length).toBe(1 + french.length);
    expect((await spoken(page)).slice(1).map(({ text: t, lang, voice }) => ({ t, lang, voice }))).toEqual(french.map((t) => ({ t, lang: "fr-CA", voice: VOICE.fr })));
  });
});

// Some of a browser's voices are voice services: the words go to a server to be spoken. A voice that works on the
// device reads first, on every screen (the tests above hold which voice reads each screen). Where the language has
// only a service, Listen says so before it reads: once, until the page is loaded again.
test.describe("Listen: a voice on the device first; a voice service says so, once", () => {
  const NOTICE = { en: script("en", "voice.online"), fr: script("fr", "voice.online") };
  const q1 = (lang: Lang) => script(lang, "voice.q1", labelled(lang, Q1));
  const q2 = (lang: Lang) => script(lang, "voice.q2", labelled(lang, Q2));
  /** Tap Listen and wait for the reading to end. */
  async function listen(page: Page, lang: Lang, sentences: number) {
    const before = (await spoken(page)).length;
    await listenButton(page, lang).click();
    await expect.poll(async () => (await spoken(page)).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(before + sentences);
    await expect(listenButton(page, lang)).toBeVisible({ timeout: 5_000 });
    return (await heard(page)).slice(before);
  }
  test.beforeEach(async ({ page }) => { await page.addInitScript(fakeSpeech); });

  for (const lang of ["en", "fr"] as const) {
    test(`${lang.toUpperCase()} only voice services for the language: Listen says so first, in one sentence, then reads the screen`, async ({ page }) => {
      await page.addInitScript((list) => (window as unknown as { __setVoices: (v: object[]) => void }).__setVoices(list), SERVICES_ONLY);
      await start(page, lang);
      await page.goto("/q1");
      expect(NOTICE[lang]).toHaveLength(1);
      const said = await listen(page, lang, 1 + q1(lang).length);
      expect(said.map((u) => u.text)).toEqual([...NOTICE[lang], ...q1(lang)]);
      expect(new Set(said.map((u) => u.voice))).toEqual(new Set([SERVICE[lang]]));
      // Nothing in it is against calling 911, and it never says "safe".
      expect(NOTICE[lang].join(" ")).not.toMatch(/safe|sécuri|911|(do not|don’t|never) call|n’appelez/i);
    });
  }

  test("it is said once: not at the second reading, not on the next screen; again after the page is loaded again", async ({ page }) => {
    await page.addInitScript((list) => (window as unknown as { __setVoices: (v: object[]) => void }).__setVoices(list), SERVICES_ONLY);
    await start(page, "en");
    await page.goto("/q1");
    expect((await listen(page, "en", 1 + q1("en").length)).map((u) => u.text)).toEqual([...NOTICE.en, ...q1("en")]);
    expect((await listen(page, "en", q1("en").length)).map((u) => u.text)).toEqual(q1("en"));
    await answer(page, "no"); // on to the next question, inside the app
    await expect(page).toHaveURL(/\/q2$/);
    expect((await listen(page, "en", q2("en").length)).map((u) => u.text)).toEqual(q2("en"));
    await page.reload();
    expect((await listen(page, "en", 1 + q2("en").length)).map((u) => u.text)).toEqual([...NOTICE.en, ...q2("en")]);
  });

  test("cut short before its end, it is said again at the next reading", async ({ page }) => {
    await page.addInitScript((list) => (window as unknown as { __setVoices: (v: object[]) => void }).__setVoices(list), SERVICES_ONLY);
    await start(page, "en");
    await page.goto("/q1");
    await holdSentences(page);
    await listenButton(page, "en").click();
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(listenButton(page, "en")).toBeVisible();
    await page.evaluate(() => { (window as unknown as { __autoEnd: boolean }).__autoEnd = true; });
    const said = await listen(page, "en", 1 + q1("en").length);
    expect((await heard(page)).map((u) => u.text).slice(0, 1)).toEqual(NOTICE.en); // the one that was cut
    expect(said.map((u) => u.text)).toEqual([...NOTICE.en, ...q1("en")]);
  });

  test("the browser lists its voices late: first its own choice and no claim; then a service, announced; then a voice on the device, and nothing more to say", async ({ page }) => {
    await page.addInitScript(() => (window as unknown as { __setVoices: (v: object[]) => void }).__setVoices([]));
    await start(page, "en");
    await page.goto("/q1");
    expect(await listen(page, "en", q1("en").length)).toEqual(q1("en").map((text) => ({ text, voice: null })));
    await setVoices(page, SERVICES_ONLY);
    expect(await listen(page, "en", 1 + q1("en").length)).toEqual([...NOTICE.en, ...q1("en")].map((text) => ({ text, voice: SERVICE.en })));
    await setVoices(page, [...SERVICES_ONLY, { lang: "en-CA", name: VOICE.en, localService: true }]);
    expect(await listen(page, "en", q1("en").length)).toEqual(q1("en").map((text) => ({ text, voice: VOICE.en })));
  });

  test("English has a voice on the device, French only a service: nothing is said in English, and French says so", async ({ page }) => {
    await page.addInitScript((list) => (window as unknown as { __setVoices: (v: object[]) => void }).__setVoices(list), [{ lang: "en-CA", name: VOICE.en, localService: true }, SERVICES_ONLY[1]]);
    await start(page, "en");
    await page.goto("/q1");
    expect(await listen(page, "en", q1("en").length)).toEqual(q1("en").map((text) => ({ text, voice: VOICE.en })));
    await page.getByRole("button", { name: "Français" }).click();
    expect(await listen(page, "fr", 1 + q1("fr").length)).toEqual([...NOTICE.fr, ...q1("fr")].map((text) => ({ text, voice: SERVICE.fr })));
  });

  test("the first words start inside the tap, with and without the notice (a phone lets speech start only there)", async ({ page }) => {
    await start(page, "en");
    await page.goto("/q1");
    await listen(page, "en", q1("en").length);
    await setVoices(page, SERVICES_ONLY);
    await listen(page, "en", 1 + q1("en").length);
    const started = await inTap(page);
    expect([started[0], started[q1("en").length]]).toEqual([true, true]); // the first sentence of each reading
    expect((await heard(page))[q1("en").length].text).toBe(NOTICE.en[0]);
  });
});

test.describe("without speech in the browser", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true });
      Object.defineProperty(window, "SpeechSynthesisUtterance", { value: undefined, configurable: true });
    });
  });

  for (const route of ["/", "/q1", "/q2", "/q3", "/nearby-fire", "/location", "/emergency", "/leave", "/how-it-works", "/location-off", "/no-data"]) {
    test(`${route}: no Listen button`, async ({ page }) => {
      await start(page, "en");
      await page.goto(route);
      await expect(page.locator("h1").first()).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${route}$`)); // the screen itself: an address the app doesn't know opens Check
      await expect(page.getByRole("button", { name: /^(Listen|Stop)$/ })).toHaveCount(0);
    });
  }
  test("verdict: no Listen button", async ({ page }) => {
    await start(page, "en");
    await verdictFor(page, "Moncton");
    await expect(page.getByRole("button", { name: /^(Listen|Stop)$/ })).toHaveCount(0);
  });
});
