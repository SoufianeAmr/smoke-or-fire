// The dispatch board (/dispatch) in the browser, at a desk: 1366 × 768, by keyboard first.
// Replay: type a place, the answer and its sources, the three questions with the public app's routing, the copy for
// call notes, and surge mode's messages and images. Live: the engine answered by the test, and "not checked".
// Listen: read by a voice on the device only (the browser's voices are stood in for), and off, with its reason, without one.
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { TEST_ENGINE_URL } from "./engine";
import { PATHS } from "./look";

test.use({ viewport: { width: 1366, height: 768 } });

const NBSP = String.fromCharCode(0xa0);
const BANNER = "Decision support only. Your dispatch protocol governs.";
const MONCTON = JSON.parse(readFileSync(new URL("../../data/demo/moncton.json", import.meta.url), "utf8"));
const EN_MESSAGE =
  "The smoke in Moncton today comes from the Long Lake fire in Nova Scotia, 159 km away. If you see flames or smoke from a building or vehicle, call 911. " +
  "Environment Canada: special air quality statement in effect for Moncton and Southeast New Brunswick.";
const FR_MESSAGE =
  "La fumée à Moncton aujourd’hui vient du feu de Long Lake en Nouvelle-Écosse, à 159 km. Si vous voyez des flammes ou de la fumée qui sort d’un bâtiment ou d’un véhicule, appelez le 911. " +
  `Environnement Canada${NBSP}: bulletin spécial sur la qualité de l’air en vigueur pour Moncton et sud-est du Nouveau-Brunswick.`;
// Any wording that tells a call taker not to send anyone.
const NO_RESPONSE = /(do not|don’t|never|no need to) (respond|dispatch|send|go)|no response|stand down|ne (pas|jamais) (répondre|répartir|envoyer|intervenir)|aucune intervention/i;

const placeBox = (page: Page) => page.getByRole("combobox");
const card = (page: Page) => page.locator(".d-known");
const result = (page: Page) => page.locator(".d-result");
const fact = (page: Page, id: string) => page.locator(`.d-facts > li[data-fact="${id}"]`);

// --- The browser's voices, stood in for -------------------------------------------------------------------------------

// Which voices a test browser has depends on the machine. Every test here gets a known list: for each language a voice
// that works on the device and a voice service (the words go to a server to be spoken). A test that needs another list
// installs it after this one, or changes it on the page.
type Voice = { lang: string; name: string; localService?: boolean };
const ON_DEVICE = { en: "Microsoft Linda - English (Canada)", fr: "Amélie" };
const SERVICE = { en: "Google US English", fr: "Google français" };
const VOICES: Voice[] = [
  { lang: "en-CA", name: ON_DEVICE.en, localService: true },
  { lang: "en-US", name: SERVICE.en, localService: false },
  { lang: "fr-CA", name: ON_DEVICE.fr, localService: true },
  { lang: "fr-FR", name: SERVICE.fr, localService: false },
];
/** A browser whose only voices are voice services. */
const SERVICES_ONLY = VOICES.filter((voice) => !voice.localService);

/** `voices`: what the browser lists. `__setVoices(next, quietly)` changes the list, and says so unless `quietly`. */
function fakeSpeech(voices: Voice[]) {
  const w = window as unknown as Record<string, unknown>;
  const spoken: { u: Record<string, unknown>; end: number }[] = [];
  const listeners = new Set<() => void>();
  let list = voices;
  w.__spoken = spoken;
  w.__cancels = 0;
  w.__autoEnd = true; // false: a sentence lasts until it is stopped
  w.__setVoices = (next: Voice[], quietly = false) => {
    list = next;
    if (!quietly) for (const listener of listeners) listener();
  };
  class Utterance {
    text: string; lang = ""; voice: unknown = null; rate = 1; pitch = 1; volume = 1; onend: (() => void) | null = null; onerror: (() => void) | null = null;
    constructor(text: string) { this.text = text; }
  }
  Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true, writable: true });
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      getVoices: () => list,
      addEventListener: (type: string, listener: () => void) => { if (type === "voiceschanged") listeners.add(listener); },
      removeEventListener: (_: string, listener: () => void) => { listeners.delete(listener); },
      speak: (u: Record<string, unknown>) => {
        const entry = { u, end: 0 };
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
type Said = { text: string; lang: string; voice: string | null };
const spoken = (page: Page): Promise<Said[]> =>
  page.evaluate(() => (window as unknown as { __spoken: { u: { text: string; lang: string; voice: { name: string } | null } }[] }).__spoken.map(({ u }) => ({ text: u.text, lang: u.lang, voice: u.voice?.name ?? null })));
const cancels = (page: Page) => page.evaluate(() => (window as unknown as { __cancels: number }).__cancels);
const setVoices = (page: Page, voices: Voice[], quietly = false) => page.evaluate(([list, quiet]) => (window as unknown as { __setVoices: (v: unknown, q: unknown) => void }).__setVoices(list, quiet), [voices, quietly] as const);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(fakeSpeech, VOICES);
});

/** Open the board in replay and type a town: Enter takes the first match. */
async function check(page: Page, typed: string) {
  await placeBox(page).fill(typed);
  await placeBox(page).press("Enter");
  await expect(card(page).or(page.locator(".d-error"))).toBeVisible();
}
async function openReplay(page: Page, typed?: string) {
  await page.goto("/dispatch?mode=replay");
  await expect(page.getByRole("heading", { level: 1, name: "Dispatch board" })).toBeVisible();
  if (typed) await check(page, typed);
}
/** Click the answers of one path through the questions. */
async function answer(page: Page, keys: string[]) {
  for (const key of keys) await page.locator(`.d-answers button[data-answer="${key}"]`).click();
}
/**
 * The browser's clipboard, stood in for: what the page copies is kept on the page, and read back here. The real one
 * belongs to the whole machine, and a test must not write to it.
 */
async function standInClipboard(page: Page) {
  await page.addInitScript(() => {
    const copied: string[] = [];
    Object.assign(window, { __copied: copied });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: (text: string) => (copied.push(text), Promise.resolve()) } });
  });
}
const lastCopied = (page: Page) => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied.at(-1) ?? null);
const pixel = (canvas: Locator, x: number, y: number) =>
  canvas.evaluate((el, [px, py]) => Array.from((el as HTMLCanvasElement).getContext("2d")!.getImageData(px, py, 1, 1).data.slice(0, 3)), [x, y]);

test("replay by keyboard: type a place, Enter, and the answer with its sources is there within two seconds", async ({ page }) => {
  await openReplay(page);
  // The banner, on the page before anything is typed; the replay says it is recorded data.
  await expect(page.locator(".d-banner")).toHaveText(BANNER);
  await expect(page.locator(".d-replay")).toHaveText(`Replay${NBSP}· Aug 25, 2025. Recorded data, not today’s.`);
  await expect(page).toHaveTitle(`Dispatch board${NBSP}· Smoke or Fire?`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");

  // The place box has the keyboard as the page opens. Typing lists the matches; Enter takes the first.
  await expect(placeBox(page)).toBeFocused();
  await expect(placeBox(page)).toHaveAccessibleName("Caller’s town or city");
  await page.keyboard.type("monc");
  await expect(placeBox(page)).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("option")).toHaveText(["Moncton, NBWestmorland County"]);
  const started = Date.now();
  await page.keyboard.press("Enter");
  await expect(card(page)).toBeVisible();
  expect(Date.now() - started).toBeLessThan(2000);

  // The known-smoke card: the public card's line, shape and colour, the place and when it was checked, how sure.
  await expect(card(page)).toHaveAttribute("data-state", "drifting");
  await expect(card(page).getByRole("heading", { level: 3 })).toHaveText(`Drifting smoke${NBSP}· Long Lake fire${NBSP}· 159 km SSW`);
  await expect(card(page).locator(".glance-shape")).toHaveAttribute("data-shape", "circle");
  expect(await card(page).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(232, 89, 12)");
  await expect(card(page).locator(".d-known-for")).toHaveText(`Moncton, NB${NBSP}· checked 2025-08-25, 09:00 (Atlantic time)`);
  await expect(card(page).locator(".d-known-sure")).toHaveText("Low confidence. We traced the air at three heights above the ground, and they don’t agree.");
  await expect(card(page).getByRole("img", { name: "toward the south-southwest" })).toBeVisible();
  // A screen reader is told the answer when it arrives.
  await expect(page.locator("p.d-sr[role=status]")).toHaveText(`Moncton, NB: Drifting smoke${NBSP}· Long Lake fire${NBSP}· 159 km SSW`);

  // The facts, each with what was found, who says so and when, and a link: fire and distance, ECCC's alert, burn
  // status, the wind trace.
  await expect(page.locator(".d-facts > li h4")).toHaveText(["Satellite fire detection", "ECCC air quality alert: active", "Burn status: ban in effect", "Wind trace"]);
  await expect(fact(page, "fire").locator(".d-fact-headline")).toHaveText(`Long Lake fire${NBSP}· 159 km SSW of Moncton`);
  await expect(fact(page, "fire")).toContainText("West Dalhousie, N.S. Terra saw it burning 10 hours ago. Detected: 2025-08-24, 22:43 (Atlantic time). Sources: NASA FIRMS and Natural Resources Canada (CWFIS).");
  await expect(fact(page, "alert")).toContainText("Special air quality statement. Moncton and Southeast New Brunswick. Issued 2025-08-25, 04:50 (Atlantic time). Valid until at least 2025-08-25, 20:50 (Atlantic time).");
  await expect(fact(page, "alert")).toContainText("Air quality reading (AQHI): 10+, very high risk. Station: Moncton. Observed: 2025-08-25, 08:00 (Atlantic time). Data source: Environment and Climate Change Canada.");
  await expect(fact(page, "burn")).toContainText("A burn ban is in effect in New Brunswick. From the province’s news release of 2025-08-25 (Government of New Brunswick).");
  await expect(fact(page, "burn").getByRole("link", { name: /The province’s news release of 2025-08-25/ })).toHaveAttribute("href", "https://www.gnb.ca/en/news/n-b.2025.08.most-restrictions-on-crown-land-to-be-lifted-tonight.html");
  await expect(fact(page, "alert").getByRole("link")).toHaveAttribute("href", MONCTON.alerts.airQuality.alert.url);
  for (const li of await page.locator(".d-facts > li").all()) {
    expect(await li.getByRole("link").count()).toBeGreaterThan(0);
    for (const link of await li.getByRole("link").all()) {
      await expect(link).toHaveAttribute("href", /^https:\/\//);
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  }

  // Enter moved the keyboard on to the first question, and answered nothing. The numbers answer: 2, 2, 5 is
  // "No", "Grey haze", "Nothing".
  await expect(result(page)).toHaveCount(0);
  await expect(page.locator('.d-answers button[data-answer="yes"]')).toBeFocused();
  await expect(page.locator('li[data-question="1"]')).toHaveAttribute("data-state", "current");
  await page.keyboard.press("2");
  await expect(page.locator('li[data-question="2"]')).toHaveAttribute("data-state", "current");
  await expect(page.locator('.d-answers button[data-answer="column"]')).toBeFocused();
  await page.keyboard.press("2");
  await expect(page.locator('.d-answers button[data-answer="firePit"]')).toBeFocused();
  await page.keyboard.press("5");
  await expect(result(page)).toHaveAttribute("data-kind", "noFire");
  await expect(result(page).getByRole("heading")).toBeFocused();
  await expect(result(page).getByRole("heading")).toHaveText("Result: Caller reports no fire nearby");
  await expect(result(page).locator("p")).toHaveText("This fits the known smoke from the Long Lake fire, 159 km away.");
  // The answer for the place is still on the screen beside it.
  await expect(card(page)).toBeInViewport();
  await expect(result(page)).toBeInViewport();
  expect(await page.locator("body").innerText()).not.toMatch(NO_RESPONSE);
});

test("the place box: arrow keys move through the matches, Escape closes them, a place that does not match says so", async ({ page }) => {
  await openReplay(page);
  await page.keyboard.type("s");
  await expect(page.getByRole("option")).toHaveText([/^Sackville, NB/, /^Sussex, NB/, /^Saint John, NB/]);
  await expect(page.getByRole("option").nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(placeBox(page)).toHaveAttribute("aria-activedescendant", "d-place-0");
  await page.keyboard.press("ArrowDown");
  await expect(placeBox(page)).toHaveAttribute("aria-activedescendant", "d-place-1");
  await expect(page.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp"); // from the first, round to the last
  await expect(placeBox(page)).toHaveAttribute("aria-activedescendant", "d-place-2");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(placeBox(page)).toHaveValue("s");
  await page.keyboard.press("Escape"); // closed already: the box is emptied
  await expect(placeBox(page)).toHaveValue("");

  // The pointer picks too.
  await placeBox(page).fill("sus");
  await page.getByRole("option", { name: /Sussex/ }).click();
  await expect(card(page).locator(".d-known-for")).toContainText("Sussex, NB");
  await expect(placeBox(page)).toHaveValue("Sussex");

  // Riverview is not one of the replay's towns: the page says which ones it has, and the answer on screen stays.
  await placeBox(page).fill("Riverview");
  await expect(page.locator(".d-none")).toHaveText(/^No place matches\. The replay has these towns: Moncton, Dieppe, Sackville, .*West Dalhousie\.$/);
  await placeBox(page).press("Enter");
  await expect(card(page).locator(".d-known-for")).toContainText("Sussex, NB");
});

test("the three questions end where the public app's routing ends them: any yes or not sure is Dispatch", async ({ page }) => {
  await openReplay(page, "Monc");
  for (const path of PATHS) {
    await answer(page, path.answers);
    const where = path.answers.join(" → ");
    // New Brunswick had a burn ban on Aug 25, 2025: a neighbour's fire pit is Dispatch too.
    const kind = path.ends === "/location" ? "noFire" : "dispatch";
    await expect(result(page), where).toHaveAttribute("data-kind", kind);
    if (path.ends === "/emergency") {
      await expect(result(page).getByRole("heading"), where).toHaveText("Result: Dispatch");
      await expect(result(page).locator("p"), where).toHaveText("A yes or a not sure: there may be a fire near the caller.");
      expect(await result(page).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(217, 45, 32)");
      await expect(result(page).locator(".glance-shape")).toHaveAttribute("data-shape", "triangle");
    }
    if (path.ends === "/nearby-fire") await expect(result(page).locator("p"), where).toHaveText("A fire pit or bonfire, and a burn ban is in effect in New Brunswick.");
    // A yes or a not sure ends the questions: the ones after it are not asked.
    await expect(page.locator("li[data-question]"), where).toHaveCount(path.answers.length);
    await expect(page.locator(".d-answers"), where).toHaveCount(0);
    expect(await page.locator(".d-script").innerText(), where).not.toMatch(NO_RESPONSE);
    await page.getByRole("button", { name: "New call" }).click();
    await expect(result(page)).toHaveCount(0);
  }
});

test("Change takes an answer back; New call starts the questions again and returns to the place box", async ({ page }) => {
  await openReplay(page, "Monc");
  await answer(page, ["no", "haze"]);
  await expect(page.locator('li[data-question="2"] .d-given')).toContainText("Answer: Grey haze");
  await expect(page.locator('li[data-question="3"]')).toHaveAttribute("data-state", "current");

  // Change on question 1: it is asked again, with the keyboard on its answers, and question 2's answer is gone.
  await page.getByRole("button", { name: "Change the answer to question 1" }).click();
  await expect(page.locator('li[data-question="1"]')).toHaveAttribute("data-state", "current");
  await expect(page.locator('.d-answers button[data-answer="yes"]')).toBeFocused();
  await expect(page.locator('li[data-question="2"]')).toHaveAttribute("data-state", "waiting");
  await expect(page.locator(".d-given")).toHaveCount(0);

  // A yes: Dispatch. Changing it brings the question back, and the result goes.
  await answer(page, ["yes"]);
  await expect(result(page)).toHaveAttribute("data-kind", "dispatch");
  await page.getByRole("button", { name: "Change the answer to question 1" }).click();
  await expect(result(page)).toHaveCount(0);
  await answer(page, ["no", "smell", "nothing"]);
  await expect(result(page)).toHaveAttribute("data-kind", "noFire");

  // New call: no answers, the place box has the keyboard with its text selected, and the answer stays for the next
  // caller from the same town. Enter checks the town again.
  await page.getByRole("button", { name: "New call" }).click();
  await expect(result(page)).toHaveCount(0);
  await expect(page.locator('li[data-question="1"]')).toHaveAttribute("data-state", "current");
  await expect(placeBox(page)).toBeFocused();
  expect(await placeBox(page).evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, 7]);
  await expect(card(page)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(card(page).locator(".d-known-for")).toContainText("Moncton, NB");
  await expect(page.locator('.d-answers button[data-answer="yes"]')).toBeFocused();
  // Typing over the selection checks another town.
  await page.getByRole("button", { name: "New call" }).click();
  await page.keyboard.type("fred");
  await page.keyboard.press("Enter");
  await expect(card(page)).toHaveAttribute("data-state", "unexplained");
  await expect(card(page).getByRole("heading", { level: 3 })).toHaveText(`Unexplained smoke${NBSP}· No known fire upwind`);
});

test("a held key answers one question only, and Enter on the place answers none", async ({ page }) => {
  await openReplay(page, "Monc");
  await expect(page.locator('.d-answers button[data-answer="yes"]')).toBeFocused();
  // Enter held down on "No": question 2 is asked, and its first answer is not pressed by the repeats.
  await page.keyboard.press("Tab");
  await expect(page.locator('.d-answers button[data-answer="no"]')).toBeFocused();
  await page.keyboard.down("Enter");
  await page.keyboard.down("Enter"); // the key repeating
  await page.keyboard.down("Enter");
  await page.keyboard.up("Enter");
  await expect(page.locator('li[data-question="2"]')).toHaveAttribute("data-state", "current");
  await expect(result(page)).toHaveCount(0);
  // A number held down: the same.
  await page.keyboard.down("2");
  await page.keyboard.down("2");
  await page.keyboard.up("2");
  await expect(page.locator('li[data-question="3"]')).toHaveAttribute("data-state", "current");
  await expect(result(page)).toHaveCount(0);
});

test("Copy for call notes: plain text with every source and time, and the caller's answers", async ({ page }) => {
  await standInClipboard(page);
  await openReplay(page, "Monc");
  await answer(page, ["no", "haze", "nothing"]);
  await page.getByRole("button", { name: "Copy for call notes" }).click();
  await expect(page.locator(".d-notes .d-status")).toHaveText("Copied. Paste it into your call notes.");
  const copied = (await lastCopied(page))!;
  const lines = copied.split("\n");
  expect(lines.slice(0, 6)).toEqual([
    "Smoke check · Smoke or Fire?",
    "Place: Moncton, NB",
    "Checked: 2025-08-25, 09:00 (Atlantic time)",
    "Replay of Aug 25, 2025: recorded data, not today’s.",
    "Answer: Drifting smoke · Long Lake fire · 159 km SSW",
    "Low confidence. We traced the air at three heights above the ground, and they don’t agree.",
  ]);
  for (const line of [
    "- Long Lake fire · 159 km SSW of Moncton",
    "- Detected: 2025-08-24, 22:43 (Atlantic time).",
    "- Sources: NASA FIRMS and Natural Resources Canada (CWFIS).",
    "- NASA fire map: https://firms.modaps.eosdis.nasa.gov/map/",
    "- Canada’s fire map: https://cwfis.cfs.nrcan.gc.ca/interactive-map",
    "ECCC air quality alert: active",
    "- Issued 2025-08-25, 04:50 (Atlantic time).",
    `- The archived message: ${MONCTON.alerts.airQuality.alert.url}`,
    "Burn status: ban in effect",
    "- From the province’s news release of 2025-08-25 (Government of New Brunswick).",
    "- The province’s news release of 2025-08-25: https://www.gnb.ca/en/news/n-b.2025.08.most-restrictions-on-crown-land-to-be-lifted-tonight.html",
    "- Recorded winds for the replay, downloaded 2026-09-26.",
    "- Open-Meteo: https://open-meteo.com/en/docs/gfs-api",
    "- Do you see flames? No",
    "- Is anything burning nearby? Nothing",
    "Result: Caller reports no fire nearby. This fits the known smoke from the Long Lake fire, 159 km away.",
  ]) expect(lines).toContain(line);
  expect(lines.at(-1)).toBe(BANNER);
  expect(copied).not.toMatch(/[\u00a0\u202f\u2011]/); // plain spaces and hyphens for a call-taking system

  // "See the notes" shows what was copied, word for word.
  const show = page.getByRole("button", { name: "See the notes" });
  await expect(show).toHaveAttribute("aria-expanded", "false");
  await show.click();
  await expect(show).toHaveAttribute("aria-expanded", "true");
  expect((await page.getByLabel("Call notes").inputValue()).split("\n")).toEqual(lines);
  await expect(page.getByLabel("Call notes")).toHaveAttribute("readonly", "");
  // Another answer changes the notes: "Copied" no longer stands.
  await page.getByRole("button", { name: "Change the answer to question 3" }).click();
  await expect(page.locator(".d-notes .d-status")).toHaveText("");
});

test("Copy for call notes where the browser refuses: the notes open, selected, ready for Ctrl+C", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) } }));
  await openReplay(page, "Monc");
  await page.getByRole("button", { name: "Copy for call notes" }).click();
  await expect(page.locator(".d-notes .d-status")).toHaveText("The browser did not allow the copy. The notes are selected below: press Ctrl+C.");
  const notes = page.getByLabel("Call notes");
  await expect(notes).toBeVisible();
  await expect(notes).toBeFocused();
  expect(await notes.evaluate((el: HTMLTextAreaElement) => el.selectionEnd - el.selectionStart === el.value.length && el.value.length > 500)).toBe(true);
});

test("surge mode: a known smoke event drafts the message in English and French with its image, and posts nothing", async ({ page }) => {
  await standInClipboard(page);
  const requests: { method: string; url: string }[] = [];
  page.on("request", (request) => requests.push({ method: request.method(), url: request.url() }));
  await openReplay(page, "Monc");

  // Not marked: no message, no image.
  const mark = page.getByRole("button", { name: "Mark as a known smoke event" });
  await expect(mark).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".d-draft")).toHaveCount(0);
  await expect(card(page).locator(".d-known-mark")).toHaveCount(0);

  await mark.click();
  await expect(mark).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".d-marked")).toHaveText("Marked for Moncton: Long Lake fire.");
  await expect(card(page).locator(".d-known-mark")).toHaveText("Marked: known smoke event");
  await expect(page.getByText("Nothing is posted for you. Read each message, change what you need, then copy the text and download the image to post them yourself.")).toBeVisible();

  // Both languages, side by side, whatever the board's language: each in a box that can be typed in.
  const en = page.getByLabel("Message in English");
  const fr = page.getByLabel("Message in French");
  await expect(en).toHaveValue(EN_MESSAGE);
  await expect(fr).toHaveValue(FR_MESSAGE);
  await expect(en).toHaveAttribute("lang", "en");
  await expect(fr).toHaveAttribute("lang", "fr");
  await expect(en).toBeEditable();
  await expect(page.locator('.d-draft[data-lang="en"] .d-hint')).toHaveText(`${EN_MESSAGE.length} characters`);

  // The image: 1200 × 675, the card in the drifting-smoke orange on the left, the map on the right, and the 911
  // sentence on navy across the bottom. Described in words for a screen reader, and for the post's alt text.
  for (const [code, canvas] of [["en", page.locator('.d-draft[data-lang="en"] canvas')], ["fr", page.locator('.d-draft[data-lang="fr"] canvas')]] as const) {
    expect(await canvas.evaluate((el: HTMLCanvasElement) => [el.width, el.height])).toEqual([1200, 675]);
    await expect.poll(() => pixel(canvas, 12, 12)).toEqual([232, 89, 12]);
    expect(await pixel(canvas, 12, 660)).toEqual([27, 42, 74]);
    expect(await pixel(canvas, 1190, 660)).toEqual([27, 42, 74]);
    // The map: land, water and ink, none of it the card's orange or the page's cream.
    const mapColours = await canvas.evaluate((el: HTMLCanvasElement) => {
      const data = el.getContext("2d")!.getImageData(540, 20, 640, 500).data;
      const seen = new Set<string>();
      for (let i = 0; i < data.length; i += 4 * 97) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      return [...seen];
    });
    expect(mapColours).toContain("216,227,238"); // water
    expect(mapColours).toContain("239,231,218"); // land
    expect(mapColours).not.toContain("232,89,12");
    await expect(canvas).toHaveAttribute("role", "img");
    await expect(canvas).toHaveAttribute("aria-label", code === "en" ? /^Drifting smoke.*A map shows the smoke’s path from the Long Lake fire to Moncton\. If you see flames or smoke from a building or vehicle, call 911\.$/ : /^Fumée qui dérive.*appelez le 911\.$/);
  }
  await expect(page.locator('.d-draft[data-lang="en"] .d-alt')).toContainText("Image description, for the post’s alt text: Drifting smoke");

  // The message can be changed; the first draft is one button away.
  await expect(page.getByRole("button", { name: "Back to the first draft" })).toHaveCount(0);
  await en.fill("Smoke over Moncton this morning is from the Long Lake fire in Nova Scotia. See flames? Call 911.");
  await page.locator('.d-draft[data-lang="en"]').getByRole("button", { name: "Copy the text" }).click();
  await expect(page.locator('.d-draft[data-lang="en"] .d-status')).toHaveText("Copied.");
  expect(await lastCopied(page)).toBe("Smoke over Moncton this morning is from the Long Lake fire in Nova Scotia. See flames? Call 911.");
  await expect(fr).toHaveValue(FR_MESSAGE);

  // Unmarked, then marked again: the message is as the person left it.
  await mark.click();
  await expect(mark).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".d-draft")).toHaveCount(0);
  await expect(card(page).locator(".d-known-mark")).toHaveCount(0);
  await mark.click();
  await expect(en).toHaveValue("Smoke over Moncton this morning is from the Long Lake fire in Nova Scotia. See flames? Call 911.");
  await page.getByRole("button", { name: "Back to the first draft" }).click();
  await expect(en).toHaveValue(EN_MESSAGE);
  await expect(page.getByRole("button", { name: "Back to the first draft" })).toHaveCount(0);

  // The image is saved by the person's own click, as a PNG named for the town, the day and the language.
  for (const [code, name] of [["en", "smoke-moncton-2025-08-25-en.png"], ["fr", "fumee-moncton-2025-08-25-fr.png"]] as const) {
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator(`.d-draft[data-lang="${code}"]`).getByRole("button", { name: "Download the image" }).click()]);
    expect(download.suggestedFilename()).toBe(name);
    const file = readFileSync(await download.path());
    expect(file.subarray(1, 4).toString()).toBe("PNG");
    expect([file.readUInt32BE(16), file.readUInt32BE(20)]).toEqual([1200, 675]);
  }

  // Nothing was posted, and nothing left for anywhere but this site and its typeface: no request carries the message.
  expect(requests.filter((r) => r.method !== "GET")).toEqual([]);
  const hosts = [...new Set(requests.filter((r) => !r.url.startsWith("blob:") && !r.url.startsWith("data:")).map((r) => new URL(r.url).host))];
  expect(hosts.filter((host) => ![new URL(page.url()).host, "fonts.googleapis.com", "fonts.gstatic.com"].includes(host))).toEqual([]);
  // No form, and no link to a social network: copying and downloading are the only ways out.
  await expect(page.locator("form")).toHaveCount(0);
  const linked = await page.locator("a[href^='http']").evaluateAll((links) => links.map((a) => new URL((a as HTMLAnchorElement).href).hostname));
  expect(linked.filter((host) => /(^|\.)(twitter\.com|x\.com|facebook\.com|instagram\.com|linkedin\.com|threads\.net|bsky\.app)$/.test(host))).toEqual([]);
});

test("surge mode: the mark shows on another town's answer for the same fire, and the message can be drafted again for it", async ({ page }) => {
  await openReplay(page, "Monc");
  await page.getByRole("button", { name: "Mark as a known smoke event" }).click();
  await page.getByLabel("Message in English").fill("My own words.");

  // The next caller is in Dieppe: same fire. The card says the event is marked; the message is still Moncton's, as
  // edited, until the person asks for Dieppe's.
  await check(page, "Diep");
  await expect(card(page).locator(".d-known-for")).toContainText("Dieppe, NB");
  await expect(card(page).locator(".d-known-mark")).toHaveText("Marked: known smoke event");
  await expect(page.locator(".d-marked")).toHaveText("Marked for Moncton: Long Lake fire.");
  await expect(page.getByLabel("Message in English")).toHaveValue("My own words.");
  await page.getByRole("button", { name: "Draft again for Dieppe" }).click();
  await expect(page.locator(".d-marked")).toHaveText("Marked for Dieppe: Long Lake fire.");
  await expect(page.getByLabel("Message in English")).toHaveValue(/^The smoke in Dieppe today comes from the Long Lake fire in Nova Scotia, 158 km away\. If you see flames or smoke from a building or vehicle, call 911\./);
  await expect(page.getByRole("button", { name: /^Draft again/ })).toHaveCount(0);

  // Bathurst's smoke is from another fire: its card carries no mark.
  await check(page, "Bath");
  await expect(card(page).locator(".d-known-for")).toContainText("Bathurst, NB");
  await expect(card(page).locator(".d-known-mark")).toHaveCount(0);
});

test("surge mode drafts nothing when the trace names no known fire, or when the fire is close", async ({ page }) => {
  await openReplay(page);
  const surge = page.locator(".d-surge");
  await expect(surge.locator(".d-why")).toHaveText("A draft needs an answer first: type the caller’s town.");
  await expect(surge.getByRole("button")).toHaveCount(0);

  // Fredericton: unexplained smoke. Saint John: unclear.
  for (const [typed, town] of [["Fred", "Fredericton"], ["Saint", "Saint John"]]) {
    await check(page, typed);
    await expect(surge.locator(".d-why")).toHaveText(`No draft for ${town}: the trace does not link the smoke there to a known fire.`);
    await expect(surge.getByRole("button")).toHaveCount(0);
  }
  // Bridgetown is 17 km from the Long Lake fire: the card says the fire is close, and no message about distant smoke
  // is drafted.
  await check(page, "Bridg");
  await expect(card(page).locator(".d-known-note")).toHaveText("This fire is close to the caller’s town: 17 km.");
  await expect(surge.locator(".d-why")).toHaveText("No draft for Bridgetown: the fire is close (17 km). People there need official instructions, not a message about distant smoke.");
  await expect(surge.getByRole("button")).toHaveCount(0);
  await expect(page.locator(".d-draft")).toHaveCount(0);
});

test("unexplained smoke and unclear: the result never reads as a no", async ({ page }) => {
  await openReplay(page, "Fred");
  await expect(page.locator(".d-facts > li h4")).toHaveText(["Fire detections: none near the air’s path", "ECCC air quality alert: none in effect", "Burn status: ban in effect", "Wind trace"]);
  await expect(fact(page, "fire")).toHaveAttribute("data-tone", "none");
  await answer(page, ["no", "haze", "nothing"]);
  await expect(result(page).getByRole("heading")).toHaveText("Result: Caller reports no fire nearby");
  await expect(result(page).locator("p")).toHaveText("No known fire explains this smoke. A new fire can take hours to show up in satellite data.");
  await page.getByRole("button", { name: "New call" }).click();
  await check(page, "Saint");
  await answer(page, ["no", "smell", "nothing"]);
  await expect(result(page).locator("p")).toHaveText("The trace is unclear: it may be smoke from the Long Lake fire, or something close by.");
  expect(await page.locator("body").innerText()).not.toMatch(NO_RESPONSE);
});

test("French: the board, the script, the result and the notes; the two messages stay in their own languages", async ({ page }) => {
  await standInClipboard(page);
  await openReplay(page, "Monc");
  await page.getByRole("button", { name: "Français" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.locator(".d-banner")).toHaveText("Aide à la décision seulement. Votre protocole de répartition prévaut.");
  await expect(page.locator(".d-replay")).toHaveText(`Reprise${NBSP}· 25 août 2025. Données enregistrées, pas celles d’aujourd’hui.`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tableau de répartition");
  await expect(page).toHaveTitle(`Tableau de répartition${NBSP}· Fumée ou feu${NBSP}?`);
  await expect(placeBox(page)).toHaveAccessibleName("Ville ou village de la personne qui appelle");
  await expect(card(page).getByRole("heading", { level: 3 })).toHaveText(`Fumée qui dérive${NBSP}· Feu de Long${NBSP}Lake${NBSP}· 159 km SSO`);
  await expect(card(page).locator(".d-known-for")).toHaveText(`Moncton, N.-B.${NBSP}· vérifié le 2025-08-25, 9 h 00 (heure de l’Atlantique)`);
  await expect(page.locator(".d-facts > li h4")).toHaveText(["Détection satellite du feu", `Alerte de qualité de l’air d’ECCC${NBSP}: en vigueur`, `Brûlage${NBSP}: interdiction en vigueur`, "Trajet du vent"]);
  await expect(fact(page, "burn").getByRole("link", { name: /Le communiqué de la province du 2025-08-25/ })).toHaveAttribute("href", /^https:\/\/www\.gnb\.ca\/fr\/nouvelles\//);
  await expect(page.locator(".d-question")).toContainText([`Voyez-vous des flammes${NBSP}?`, `À quoi ressemble le ciel${NBSP}:`, `Est-ce que quelque chose brûle près de vous${NBSP}?`]);

  await answer(page, ["notSure"]);
  await expect(result(page).getByRole("heading")).toHaveText(`Résultat${NBSP}: Envoyer une équipe`);
  await expect(result(page).locator("p")).toHaveText(`Un oui ou un «${NBSP}je ne sais pas${NBSP}»${NBSP}: il y a peut-être un feu près de la personne qui appelle.`);

  await page.getByRole("button", { name: "Copier pour les notes d’appel" }).click();
  await expect(page.locator(".d-notes .d-status")).toHaveText("Copié. Collez-le dans vos notes d’appel.");
  const copied = (await lastCopied(page))!;
  expect(copied).toContain("Lieu : Moncton, N.-B.\nVérifié : 2025-08-25, 9 h 00 (heure de l’Atlantique)");
  expect(copied).toContain("- Voyez-vous des flammes ? Je ne sais pas\nRésultat : Envoyer une équipe.");
  expect(copied.split("\n").at(-1)).toBe("Aide à la décision seulement. Votre protocole de répartition prévaut.");

  await page.getByRole("button", { name: "Marquer comme épisode de fumée connu" }).click();
  await expect(page.getByLabel("Message en anglais")).toHaveValue(EN_MESSAGE);
  await expect(page.getByLabel("Message en français")).toHaveValue(FR_MESSAGE);
  await expect(page.locator(".d-marked")).toHaveText(`Marqué pour Moncton${NBSP}: Feu de Long${NBSP}Lake.`);
  expect(await page.locator("body").innerText()).not.toMatch(NO_RESPONSE);
});

test("nothing about a call is stored: no place, answer or draft in the browser's storage, and a reload starts empty", async ({ page, context }) => {
  await openReplay(page, "Monc");
  await answer(page, ["no", "haze", "nothing"]);
  await page.getByRole("button", { name: "Mark as a known smoke event" }).click();
  await page.getByLabel("Message in English").fill("A draft that must not be kept anywhere.");
  await expect(page.getByText("Nothing about a call is stored or sent: the place, the answers and the drafts stay on this screen, and are gone when it closes.")).toBeVisible();

  const stored = await page.evaluate(() => ({ session: { ...sessionStorage }, local: { ...localStorage }, cookie: document.cookie }));
  // The app keeps the language and live-or-replay for the tab, as on every screen, and no place.
  expect(Object.keys(stored.session)).toEqual(["smoke-or-fire"]);
  expect(JSON.parse(stored.session["smoke-or-fire"])).toEqual({ mode: "replay", lang: "en", place: null, shared: null });
  expect(stored.local).toEqual({});
  expect(stored.cookie).toBe("");
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(async () => (indexedDB.databases ? (await indexedDB.databases()).length : 0))).toBe(0);
  expect(JSON.stringify(stored)).not.toMatch(/Moncton|haze|draft|smoke in/i);

  await page.reload();
  await expect(placeBox(page)).toHaveValue("");
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator(".d-given")).toHaveCount(0);
  await expect(page.locator(".d-draft")).toHaveCount(0);
  await expect(page.locator(".d-empty")).toHaveText("Type the caller’s town to see the answer here.");
});

test("live: the engine is asked about the town; burn status is the engine’s own; a failure says not checked, never no fire", async ({ page }) => {
  const live = { ...MONCTON, mode: "live", time: new Date().toISOString().replace(/\.\d+Z$/, "Z"), wind: { ...MONCTON.wind, run: "2026-10-03T18:00:00Z", recordedAt: null } };
  // The engine's burn field: New Brunswick's status for the county, as the public app's burn badge reads it. Null: the
  // engine has none for the place.
  const at = (minutes: number) => new Date(Date.parse(live.time) + minutes * 60_000).toISOString().replace(/\.\d+Z$/, "Z");
  let burn: object | null = { state: "no_burn", county: "Westmorland", validUntil: at(300), checkedAt: at(-8), source: "gnb_burn_categories", reason: null };
  const asked: URLSearchParams[] = [];
  let fail = true;
  await page.route(`${TEST_ENGINE_URL}/verdict**`, (route: Route) => {
    const query = new URL(route.request().url()).searchParams;
    asked.push(query);
    if (fail) return route.fulfill({ status: 503, json: { error: "wind not loaded" }, headers: { "access-control-allow-origin": "*" } });
    return route.fulfill({ json: { ...live, burn, location: { ...live.location, lat: Number(query.get("lat")), lon: Number(query.get("lon")) } }, headers: { "access-control-allow-origin": "*" } });
  });
  await page.goto("/dispatch?mode=live");
  await expect(page.locator(".d-banner")).toHaveText(BANNER);
  await expect(page.locator(".d-replay")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Live", exact: true })).toHaveAttribute("aria-pressed", "true");

  // Live covers every Maritimes community. The engine does not answer: not checked, and that is not "no fire".
  await placeBox(page).fill("Shedi");
  await expect(page.getByRole("option").first()).toHaveText(/^Shediac, NB/);
  await placeBox(page).press("Enter");
  await expect(page.locator(".d-error")).toContainText("Not checked");
  await expect(page.locator(".d-error")).toContainText("That does not mean there is no fire.");
  await expect(card(page)).toHaveCount(0);
  // The questions do not wait for the answer: no flames, haze, nothing burning, with the source not checked.
  await answer(page, ["no", "haze", "nothing"]);
  await expect(result(page).locator("p")).toHaveText("The smoke’s source could not be checked. That does not mean there is no fire.");

  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(card(page).getByRole("heading", { level: 3 })).toHaveText(`Drifting smoke${NBSP}· Long Lake fire${NBSP}· 159 km SSW`);
  expect(asked).toHaveLength(2);
  expect([asked[1].get("mode"), Number(asked[1].get("lat")).toFixed(1), Number(asked[1].get("lon")).toFixed(1)]).toEqual(["live", "46.2", "-64.5"]);
  await expect(card(page).locator(".d-known-for")).toContainText("Shediac, NB");
  await expect(result(page).locator("p")).toHaveText("This fits the known smoke from the Long Lake fire, 159 km away.");

  // Burn status is the engine's, in the words of the public app's burn badge: no news release is shown for today.
  // "No burning" in the caller's county: a neighbour's fire pit is Dispatch.
  await expect(fact(page, "burn")).toHaveAttribute("data-tone", "active");
  await expect(fact(page, "burn").locator("h4")).toHaveText("Burning: No burn");
  await expect(fact(page, "burn")).toContainText("No burning. Westmorland County. The province allows no campfire or other wood fire outdoors in this county today.");
  await expect(fact(page, "burn")).not.toContainText("news release");
  await expect(fact(page, "burn").getByRole("link")).toHaveAttribute("href", "https://www.gnb.ca/en/emergency/fire-watch.html");
  expect(await fact(page, "burn").locator(".d-fact-icon").evaluate((el) => [getComputedStyle(el).borderTopStyle, getComputedStyle(el).backgroundColor])).toEqual(["solid", "rgb(27, 42, 74)"]);
  await page.getByRole("button", { name: "Change the answer to question 3" }).click();
  await answer(page, ["firePit"]);
  await expect(result(page)).toHaveAttribute("data-kind", "dispatch");
  await expect(result(page).getByRole("heading")).toHaveText("Result: Dispatch");
  await expect(result(page).locator("p")).toHaveText("A fire pit or bonfire, and the province allows no burning there today (Westmorland County).");
  // The board has no green: "Burning permitted" is the public app's burn badge's alone.
  expect(await page.locator(".dispatch *").evaluateAll((all) => all.filter((el) => ["rgb(30, 123, 58)"].some((green) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor, getComputedStyle(el).borderTopColor].includes(green))).length)).toBe(0);

  // The engine has no status for the place: not checked, with New Brunswick's own page to look at. A fire pit then
  // keeps the public app's two conditions.
  burn = null;
  await placeBox(page).fill("Shedi");
  await placeBox(page).press("Enter");
  await expect(fact(page, "burn")).toHaveAttribute("data-tone", "notChecked");
  expect(asked).toHaveLength(3);
  await expect(fact(page, "burn").locator("h4")).toHaveText("Burn status: not checked");
  await expect(fact(page, "burn")).toContainText("The board has no burn status for this place and day. That does not mean burning is allowed.");
  await expect(fact(page, "burn").getByRole("link")).toHaveAttribute("href", "https://www.gnb.ca/en/emergency/fire-watch.html");
  expect(await fact(page, "burn").locator(".d-fact-icon").evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe("dashed");
  await expect(result(page)).toHaveAttribute("data-kind", "firePit");
  await expect(result(page).getByRole("heading")).toHaveText("Result: Fire pit or bonfire nearby");
  await expect(result(page).locator("p")).toHaveText("Dispatch if it is out of control, or if burning is banned. Burn status: not checked.");
  // Switching to the replay starts the board again: another day's answer is never left on the screen.
  await page.getByRole("button", { name: /^Replay/ }).click();
  await expect(page.locator(".d-replay")).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  await expect(result(page)).toHaveCount(0);
  await expect(placeBox(page)).toHaveValue("");
});

test("the first public screen has no link to the board; the board links back, with when to call 911", async ({ page }) => {
  // No public screen's code names the board's address either (src/dispatch/board.test.ts).
  await page.goto("/?mode=replay");
  await expect(page.getByRole("link", { name: "I smell smoke" })).toBeVisible();
  await expect(page.locator('a[href*="dispatch"]')).toHaveCount(0);
  await openReplay(page);
  await expect(page.getByText("Not a call taker? If you see flames or thick smoke rising, call 911.")).toBeVisible();
  await page.getByRole("link", { name: "Open the public app" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Smoke or Fire?" })).toBeVisible();
  await expect(page).toHaveTitle(/^Smoke or Fire\?/);
  expect(await page.locator('meta[name="robots"]').count()).toBe(0);
});

test("one h1, headings in order, Listen on the page, and a name on every control", async ({ page }) => {
  await openReplay(page, "Monc");
  await answer(page, ["yes"]);
  await page.getByRole("button", { name: "Mark as a known smoke event" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const levels = await page.locator("h1, h2, h3, h4").evaluateAll((els) => els.map((el) => Number(el.tagName[1])));
  levels.forEach((level, i) => expect(level - (levels[i - 1] ?? 0), `heading ${i}`).toBeLessThanOrEqual(1));
  await expect(page.getByRole("button", { name: "Listen" })).toBeVisible();
  const unnamed = await page.locator("button, a, input, textarea").evaluateAll((els) =>
    els.filter((el) => !(el.getAttribute("aria-label") || el.textContent?.trim() || (el as HTMLInputElement).labels?.length)).map((el) => el.outerHTML.slice(0, 80)),
  );
  expect(unnamed).toEqual([]);
});

// 1366 × 768 at 200% zoom is 683 × 384; 1280 wide at 400% is 320 (WCAG 1.4.10).
for (const [name, width, height] of [["a desk screen", 1366, 768], ["200% zoom", 683, 384], ["a phone", 390, 844], ["400% zoom", 320, 256]] as const) {
  test(`${name} (${width} × ${height}): no sideways scrolling, and every word 18 px or more`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openReplay(page, "Monc");
    for (const lang of ["en", "fr"] as const) {
      if (lang === "fr") await page.getByRole("button", { name: "Français" }).click();
      const states = [
        () => answer(page, ["no", "haze"]),
        () => answer(page, ["firePit"]),
        () => page.locator(".d-mark").click(),
        () => page.locator(".d-notes button[aria-controls]").click(),
      ];
      for (const next of states) {
        await next();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        const small = await page.locator(".dispatch").evaluate((root) => {
          const found: string[] = [];
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const el = node.parentElement!;
            if (!node.textContent?.trim() || el.closest("[hidden]")) continue;
            if (parseFloat(getComputedStyle(el).fontSize) < 18) found.push(`${getComputedStyle(el).fontSize} ${node.textContent.trim().slice(0, 40)}`);
          }
          return found;
        });
        expect(small).toEqual([]);
      }
      // Back to the start for the next language.
      await page.locator(".d-mark").click();
      await page.locator(".d-notes button[aria-controls]").click();
      await page.locator(".d-script-head button").click();
    }
  });
}

// --- Burning restricted to the night: the result gives the hours ------------------------------------------------------

test("live, burning restricted to the night: a fire pit is not Dispatch by itself; the result and the notes give the hours, in English and French", async ({ page }) => {
  await standInClipboard(page);
  const live = { ...MONCTON, mode: "live", time: new Date().toISOString().replace(/\.\d+Z$/, "Z"), wind: { ...MONCTON.wind, run: "2026-10-03T18:00:00Z", recordedAt: null } };
  const at = (minutes: number) => new Date(Date.parse(live.time) + minutes * 60_000).toISOString().replace(/\.\d+Z$/, "Z");
  const burn = { state: "restricted", county: "Westmorland", validUntil: at(300), checkedAt: at(-8), source: "gnb_burn_categories", reason: null };
  await page.route(`${TEST_ENGINE_URL}/verdict**`, (route: Route) => route.fulfill({ json: { ...live, burn }, headers: { "access-control-allow-origin": "*" } }));
  await page.goto("/dispatch?mode=live");
  // Live covers every Maritimes community: its list is fetched, so the match is waited for before Enter.
  await placeBox(page).fill("Shedi");
  await expect(page.getByRole("option").first()).toHaveText(/^Shediac, NB/);
  await placeBox(page).press("Enter");
  await expect(card(page)).toBeVisible();

  // The fact: the status as the public app's burn badge names it, and the hours.
  await expect(fact(page, "burn").locator("h4")).toHaveText("Burning: Restricted");
  await expect(fact(page, "burn")).toContainText("Burning only from 8 p.m. to 8 a.m. Westmorland County.");
  // The result: the public app's two conditions, and the hours, so the call taker can judge.
  await answer(page, ["no", "haze", "firePit"]);
  await expect(result(page)).toHaveAttribute("data-kind", "firePit");
  await expect(result(page).getByRole("heading")).toHaveText("Result: Fire pit or bonfire nearby");
  await expect(result(page).locator("p")).toHaveText("Dispatch if it is out of control, or if burning is banned. Burn status: burning only from 8 p.m. to 8 a.m.");
  await page.getByRole("button", { name: "Copy for call notes" }).click();
  await expect(page.locator(".d-notes .d-status")).toHaveText("Copied. Paste it into your call notes.");
  expect((await lastCopied(page))!.split("\n")).toEqual(expect.arrayContaining([
    "- Burning only from 8 p.m. to 8 a.m.",
    "Result: Fire pit or bonfire nearby. Dispatch if it is out of control, or if burning is banned. Burn status: burning only from 8 p.m. to 8 a.m.",
  ]));

  await page.getByRole("button", { name: "Français" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(fact(page, "burn").locator("h4")).toHaveText(`Brûlage${NBSP}: restreint`);
  await expect(fact(page, "burn")).toContainText("Brûlage seulement de 20 h à 8 h. Comté de Westmorland.");
  await expect(result(page).getByRole("heading")).toHaveText(`Résultat${NBSP}: Foyer ou feu de camp à proximité`);
  await expect(result(page).locator("p")).toHaveText("Envoyez une équipe s’il est hors de contrôle, ou si le brûlage est interdit. Statut : brûlage seulement de 20 h à 8 h.");
  await page.getByRole("button", { name: "Copier pour les notes d’appel" }).click();
  await expect(page.locator(".d-notes .d-status")).toHaveText("Copié. Collez-le dans vos notes d’appel.");
  expect((await lastCopied(page))!.split("\n")).toContain("Résultat : Foyer ou feu de camp à proximité. Envoyez une équipe s’il est hors de contrôle, ou si le brûlage est interdit. Statut : brûlage seulement de 20 h à 8 h.");
  expect(await page.locator("body").innerText()).not.toMatch(NO_RESPONSE);
});

// --- Listen: on the device only ---------------------------------------------------------------------------------------

// The footer says nothing about a call is sent. A voice service would be sent the caller's town to say it. So the
// board's Listen reads only with a voice that works on the device; with none for the language it is off, and says why.
test.describe("Listen reads on the device only; with no voice on the device it is off, and says why", () => {
  const WORDS = {
    en: JSON.parse(readFileSync(new URL("../src/dispatch/en.json", import.meta.url), "utf8")) as Record<string, string>,
    fr: JSON.parse(readFileSync(new URL("../src/dispatch/fr.json", import.meta.url), "utf8")) as Record<string, string>,
  };
  const APP = {
    en: JSON.parse(readFileSync(new URL("../src/i18n/en.json", import.meta.url), "utf8")) as Record<string, string>,
    fr: JSON.parse(readFileSync(new URL("../src/i18n/fr.json", import.meta.url), "utf8")) as Record<string, string>,
  };
  type Lang = "en" | "fr";
  const listen = (page: Page, lang: Lang = "en") => page.getByRole("button", { name: APP[lang]["listen.play"], exact: true });
  const reason = (page: Page) => page.locator(".dispatch .listen-off");
  const french = async (page: Page) => {
    await page.getByRole("button", { name: "Français" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  };

  /** Off: said to be so to a screen reader, still named, and described by the reason shown with it. */
  async function expectOff(page: Page, lang: Lang = "en") {
    const button = listen(page, lang);
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("aria-disabled", "true");
    await expect(reason(page)).toBeVisible();
    await expect(reason(page)).toHaveText(WORDS[lang]["listen.off"]);
    // Tied to the button: what a screen reader reads with it.
    const id = await reason(page).getAttribute("id");
    expect(id).toBeTruthy();
    await expect(button).toHaveAttribute("aria-describedby", id!);
    await expect(button).toHaveAccessibleDescription(WORDS[lang]["listen.off"]);
    expect(parseFloat(await reason(page).evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(18);
  }
  async function expectOn(page: Page, lang: Lang = "en") {
    const button = listen(page, lang);
    await expect(button).toBeEnabled();
    expect([await button.getAttribute("aria-disabled"), await button.getAttribute("aria-describedby")]).toEqual([null, null]);
    await expect(reason(page)).toHaveCount(0);
  }
  /** Every way to press it: a click that takes no account of "off", a click event, then Enter and Space with the focus on it. */
  async function pressEveryWay(page: Page, lang: Lang = "en") {
    const button = listen(page, lang);
    await button.click({ force: true });
    await button.dispatchEvent("click");
    // It can still be reached by keyboard, so its reason is read with it.
    await button.focus();
    await expect(button).toBeFocused();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await page.waitForTimeout(800); // longer than two pauses between sentences
  }
  /** One reading, from the tap to its end: what was said since. */
  async function read(page: Page, lang: Lang = "en") {
    const before = (await spoken(page)).length;
    await listen(page, lang).click();
    await expect.poll(async () => (await spoken(page)).length, { timeout: 15_000 }).toBeGreaterThan(before);
    await expect(listen(page, lang)).toBeVisible({ timeout: 30_000 }); // it says Listen again: the reading has ended
    return (await spoken(page)).slice(before);
  }

  test("a voice on the device: Listen reads with it, and never with a voice service, however natural or Canadian", async ({ page }) => {
    await openReplay(page);
    await expectOn(page);
    expect(await spoken(page)).toEqual([]);
    // Before a place is typed: what the board is, then the banner.
    expect(await read(page)).toEqual([WORDS.en["voice.intro"], BANNER].map((text) => ({ text, lang: "en-CA", voice: ON_DEVICE.en })));
    // With an answer: the caller's town is in what is read. Every sentence by the device's voice.
    await check(page, "Monc");
    const answerRead = await read(page);
    expect(answerRead.map((said) => said.text)).toEqual([
      "Moncton. Drifting smoke, most likely from the Long Lake fire, about 159 kilometres away, to the south-southwest.",
      "Low confidence.",
      "ECCC air quality alert: active.",
      "Burn status: ban in effect.",
      BANNER,
    ]);
    expect(answerRead.filter((said) => said.voice !== ON_DEVICE.en)).toEqual([]);
    // A plainer voice on the device, and a natural Canadian voice service: the device's.
    const [david, clara] = ["Microsoft David - English (United States)", "Microsoft Clara Online (Natural) - English (Canada)"];
    await setVoices(page, [{ lang: "en-US", name: david, localService: true }, { lang: "en-CA", name: clara, localService: false }]);
    await expectOn(page);
    expect((await read(page)).map((said) => said.voice)).toEqual(Array(5).fill(david));
    // Never the sentence a voice service starts with: there is no voice service here.
    expect((await spoken(page)).filter((said) => APP.en["voice.online"].includes(said.text))).toEqual([]);
  });

  test("only voice services: Listen is off and says why; pressed every way, with or without an answer, nothing is said", async ({ page }) => {
    await page.addInitScript(fakeSpeech, SERVICES_ONLY);
    await openReplay(page);
    await expectOff(page);
    // Pressed, it touches the browser's speech in no way: nothing said, and nobody's reading stopped.
    const before = await cancels(page);
    await pressEveryWay(page);
    expect([await spoken(page), await cancels(page)]).toEqual([[], before]);
    await check(page, "Monc");
    await expectOff(page);
    const withAnswer = await cancels(page);
    await pressEveryWay(page);
    expect([await spoken(page), await cancels(page)]).toEqual([[], withAnswer]);
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
    // The reason is on the page for everyone, and tells nobody not to respond.
    const body = await page.locator("body").innerText();
    expect(body).toContain("Listen is off: this browser has no English voice that works on the device, and the board sends nothing to a voice service.");
    expect(body).not.toMatch(NO_RESPONSE);
    // Other browsers with nothing on the device for English: no voice at all, a voice that does not say where it
    // works, only a novelty voice, only a French voice.
    for (const voices of [[], [{ lang: "en-CA", name: ON_DEVICE.en }], [{ lang: "en-US", name: "Albert", localService: true }], [{ lang: "fr-CA", name: ON_DEVICE.fr, localService: true }]] as Voice[][]) {
      await setVoices(page, VOICES);
      await expectOn(page);
      await setVoices(page, voices);
      await expectOff(page);
      await listen(page).click({ force: true });
    }
    await page.waitForTimeout(800);
    expect(await spoken(page)).toEqual([]);
  });

  test("the browser lists its voices late, or loses them: off until a voice on the device is there, and off again without one", async ({ page }) => {
    await page.addInitScript(fakeSpeech, []);
    await openReplay(page, "Monc");
    await expectOff(page); // no voice was listed, and the browser was given the time to
    await setVoices(page, VOICES); // the browser says its voices changed
    await expectOn(page);
    const said = await read(page);
    expect([said.length, said.filter((line) => line.voice !== ON_DEVICE.en)]).toEqual([5, []]);
    await setVoices(page, SERVICES_ONLY);
    await expectOff(page);
    // The device's voice goes without the browser saying so: the tap finds none, says nothing, and Listen turns off.
    await setVoices(page, VOICES);
    await expectOn(page);
    await setVoices(page, SERVICES_ONLY, true);
    const before = (await spoken(page)).length;
    await listen(page).click();
    await expectOff(page);
    await page.waitForTimeout(800);
    expect((await spoken(page)).length).toBe(before);
  });

  test("by language: English has a voice on the device and French has not, or the other way round", async ({ page }) => {
    await page.addInitScript(fakeSpeech, VOICES.filter((voice) => voice.name !== ON_DEVICE.fr));
    await openReplay(page, "Monc");
    await expectOn(page);
    expect((await read(page)).filter((said) => said.voice !== ON_DEVICE.en)).toEqual([]);
    await french(page);
    await expectOff(page, "fr");
    const before = await spoken(page);
    await pressEveryWay(page, "fr");
    expect(await spoken(page)).toEqual(before);
    expect(before.filter((said) => said.lang === "fr-CA" || said.voice === SERVICE.fr)).toEqual([]);
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expectOn(page);

    // The other way round: only a French voice on the device.
    await setVoices(page, [{ lang: "fr-CA", name: ON_DEVICE.fr, localService: true }, { lang: "en-US", name: SERVICE.en, localService: false }]);
    await expectOff(page);
    await french(page);
    await expectOn(page, "fr");
    const inFrench = await read(page, "fr");
    expect([inFrench.length, inFrench.filter((said) => said.voice !== ON_DEVICE.fr || said.lang !== "fr-CA")]).toEqual([5, []]);
    expect(inFrench.filter((said) => APP.fr["voice.online"].includes(said.text))).toEqual([]);
  });

  test("a browser that cannot speak at all: Listen is off there too, with the same reason", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true });
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await openReplay(page, "Monc");
    await expectOff(page);
    await pressEveryWay(page);
    await french(page);
    await expectOff(page, "fr");
    await pressEveryWay(page, "fr");
    // Pressed, it never reaches for the speech the browser does not have.
    expect(errors).toEqual([]);
  });

  test("the device’s voice goes while Listen is reading: Stop still works, and only then is Listen off", async ({ page }) => {
    await openReplay(page, "Monc");
    await page.evaluate(() => { (window as unknown as Record<string, unknown>).__autoEnd = false; });
    await listen(page).click();
    const stop = page.getByRole("button", { name: APP.en["listen.stop"], exact: true });
    await expect(stop).toBeVisible();
    await setVoices(page, SERVICES_ONLY); // the browser says its voices changed: none on the device now
    // What is being read is read by the device's voice: the button stays Stop, in use, with no reason beside it.
    await expect(stop).toBeEnabled();
    expect([await stop.getAttribute("aria-disabled"), await stop.getAttribute("aria-describedby")]).toEqual([null, null]);
    await expect(reason(page)).toHaveCount(0);
    const [said, before] = [await spoken(page), await cancels(page)];
    expect(said.map((line) => line.voice)).toEqual([ON_DEVICE.en]);
    await stop.click();
    await expectOff(page);
    expect(await cancels(page)).toBeGreaterThan(before);
    await page.waitForTimeout(800);
    expect(await spoken(page)).toEqual(said); // nothing more was said
  });

  // A browser may list no voice for its first moments. That is not "none": the reason must not flash on every load.
  /** On the page: when the board began to follow the browser's voices, and when the reason first showed, if ever. */
  function watch(arrive: { after: number; voices: Voice[] } | null) {
    const w = window as unknown as Record<string, unknown>;
    w.__followedAt = null;
    w.__offAt = null;
    new MutationObserver(() => { if (w.__offAt === null && document.querySelector(".listen-off")) w.__offAt = performance.now(); }).observe(document, { childList: true, subtree: true });
    const synth = window.speechSynthesis as unknown as { addEventListener: (type: string, listener: () => void) => void };
    const add = synth.addEventListener;
    synth.addEventListener = (type, listener) => {
      add(type, listener);
      if (type !== "voiceschanged" || w.__followedAt !== null) return;
      w.__followedAt = performance.now();
      // The browser's list arrives a moment after the board began to follow it.
      if (arrive) setTimeout(() => (w.__setVoices as (voices: unknown) => void)(arrive.voices), arrive.after);
    };
  }
  const watched = (page: Page) => page.evaluate(() => { const w = window as unknown as { __followedAt: number | null; __offAt: number | null }; return { followedAt: w.__followedAt, offAt: w.__offAt }; });

  test("the voices are listed a moment after the page opens: Listen is never shown off, not even briefly", async ({ page }) => {
    await page.addInitScript(fakeSpeech, []);
    await page.addInitScript(watch, { after: 300, voices: VOICES });
    await openReplay(page, "Monc");
    await expect.poll(async () => (await watched(page)).followedAt).not.toBeNull();
    await page.waitForTimeout(1500); // past the second the browser is given
    expect((await watched(page)).offAt).toBeNull();
    await expectOn(page);
    expect((await read(page)).filter((said) => said.voice !== ON_DEVICE.en)).toEqual([]);
  });

  test("no voice is ever listed: Listen is shown off only once the browser has had a second to list one", async ({ page }) => {
    await page.addInitScript(fakeSpeech, []);
    await page.addInitScript(watch, null);
    await openReplay(page, "Monc");
    await expectOff(page);
    const { followedAt, offAt } = await watched(page);
    expect([followedAt !== null, offAt !== null]).toEqual([true, true]);
    expect(offAt! - followedAt!).toBeGreaterThanOrEqual(950);
  });

  for (const [name, width, height] of [["a desk screen", 1366, 768], ["200% zoom", 683, 384], ["a phone", 390, 844], ["400% zoom", 320, 256]] as const) {
    test(`off, on ${name} (${width} × ${height}): the reason is whole on the screen, no sideways scrolling, every word 18 px or more, every control named; the footer word for word`, async ({ page }) => {
      await page.addInitScript(fakeSpeech, SERVICES_ONLY);
      await page.setViewportSize({ width, height });
      await openReplay(page, "Monc");
      for (const lang of ["en", "fr"] as const) {
        if (lang === "fr") await french(page);
        await expectOff(page, lang);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        const box = (await reason(page).boundingBox())!;
        expect([box.x >= 0, box.x + box.width <= width + 0.5]).toEqual([true, true]);
        // The reason is under the tools, never between them: the language switch is where it was, and at a desk
        // (where the tools fit one row) it is beside Listen.
        const [button, switcher] = [(await listen(page, lang).boundingBox())!, (await page.getByRole("group", { name: APP[lang]["lang.group"] }).boundingBox())!];
        expect(box.y).toBeGreaterThanOrEqual(Math.max(button.y + button.height, switcher.y + switcher.height) - 0.5);
        if (width >= 1366) expect(Math.abs(button.y + button.height / 2 - (switcher.y + switcher.height / 2))).toBeLessThanOrEqual(1);
        const small = await page.locator(".dispatch").evaluate((root) => {
          const found: string[] = [];
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const el = node.parentElement!;
            if (!node.textContent?.trim() || el.closest("[hidden]")) continue;
            if (parseFloat(getComputedStyle(el).fontSize) < 18) found.push(`${getComputedStyle(el).fontSize} ${node.textContent.trim().slice(0, 40)}`);
          }
          return found;
        });
        expect(small).toEqual([]);
        const unnamed = await page.locator("button, a, input, textarea").evaluateAll((els) =>
          els.filter((el) => !(el.getAttribute("aria-label") || el.textContent?.trim() || (el as HTMLInputElement).labels?.length)).map((el) => el.outerHTML.slice(0, 80)),
        );
        expect(unnamed).toEqual([]);
        // The promise the reason keeps true.
        await expect(page.locator(".d-foot p").first()).toHaveText(WORDS[lang].stored);
      }
    });
  }

  test("the footer is the same sentence whatever voices the browser has, and a whole reading sends nothing", async ({ page }) => {
    const requests: { method: string; url: string }[] = [];
    page.on("request", (request) => requests.push({ method: request.method(), url: request.url() }));
    await openReplay(page, "Monc");
    await expect(page.locator(".d-foot p").first()).toHaveText("Nothing about a call is stored or sent: the place, the answers and the drafts stay on this screen, and are gone when it closes.");
    expect((await read(page)).length).toBe(5);
    for (const voices of [SERVICES_ONLY, [], VOICES]) {
      await setVoices(page, voices);
      await expect(page.locator(".d-foot p").first()).toHaveText(WORDS.en.stored);
    }
    expect(requests.filter((r) => r.method !== "GET")).toEqual([]);
    const hosts = [...new Set(requests.filter((r) => !r.url.startsWith("blob:") && !r.url.startsWith("data:")).map((r) => new URL(r.url).host))];
    expect(hosts.filter((host) => ![new URL(page.url()).host, "fonts.googleapis.com", "fonts.gstatic.com"].includes(host))).toEqual([]);
  });
});
