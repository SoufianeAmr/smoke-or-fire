// Call 911 within reach on every screen: one button that can be tapped, never none and never two, however far the page
// is scrolled and whatever is open over it. On the verdict too: under the taller bar of a verdict that nothing explains,
// with "Why?" open and with a source badge open. And "Call 911 now" (Emergency): one line that fits any answer, the big white
// button, and, on a tap, where the phone is, to read to the dispatcher. The phone's position is shown only while it is
// fresh (10 minutes, by its own time); a replay town is never shown as where the person is. EN and FR.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { answer } from "./look";
import { openBadge, openWhy } from "./verdict";
import { toFrench } from "./language";

type Lang = "en" | "fr";
type Box = { x: number; y: number; width: number; height: number };
type Fix = { lat: number; lon: number; at?: number; accuracy?: number };
type Stored = { mode: string; lang: string; place: Record<string, unknown> | null; shared: Fix | null };

const LANGS = ["en", "fr"] as const;
const STRINGS: Record<Lang, Record<string, string>> = {
  en: JSON.parse(readFileSync(new URL("../src/i18n/en.json", import.meta.url), "utf8")),
  fr: JSON.parse(readFileSync(new URL("../src/i18n/fr.json", import.meta.url), "utf8")),
};
const NBSP = String.fromCharCode(0xa0);
const RED = "rgb(217, 45, 32)";
const WHITE = "rgb(255, 255, 255)";

// The line under the title gives no reason any more: Yes, Not sure, a rising column and something burning all lead here.
const SUB = { en: "When in doubt, call 911.", fr: "En cas de doute, appelez le 911." };
const OLD_SUB = { en: "Flames or a smoke column can mean", fr: "Des flammes ou une colonne de fumée peuvent" };

// The phone, in Moncton: at the city's own point in the community list (NRCan CGNDB), so the nearest community is Moncton.
const MONCTON = { latitude: 46.0995, longitude: -64.7998 };
const MONCTON_LINES = { en: [`46.0995°${NBSP}north`, `64.7998°${NBSP}west`], fr: [`46,0995°${NBSP}nord`, `64,7998°${NBSP}ouest`] };
const NEAR_MONCTON = { en: "Near Moncton, NB", fr: "Près de Moncton, N.-B." };
const MONCTON_TYPED = { en: "Moncton, NB", fr: "Moncton, N.-B." };
// The phone, at sea off Nova Scotia: 165 km from the nearest community in the list.
const AT_SEA = { latitude: 44, longitude: -60 };
const AT_SEA_LINES = { en: [`44.0000°${NBSP}north`, `60.0000°${NBSP}west`], fr: [`44,0000°${NBSP}nord`, `60,0000°${NBSP}ouest`] };

/** A string from the strings file, filled in. Asked for inside a test: a key that isn't there yet fails that test alone. */
function s(lang: Lang, key: string, vars: Record<string, string> = {}) {
  const text = STRINGS[lang][key];
  expect(text, `"${key}" in ${lang}.json`).toBeTruthy();
  return text.replace(/\{(\w+)\}/g, (match, name) => vars[name] ?? match);
}
/** "Near Moncton, NB" / "Près de Moncton, N.-B.", built from the strings file. */
function nearMoncton(lang: Lang) {
  const text = s(lang, "emergency.where.near", { town: "Moncton", ofTown: "de Moncton", province: s(lang, "province.NB") });
  expect(text).toBe(NEAR_MONCTON[lang]);
  return text;
}
/** Text as read, whatever the kind of space: "Appeler le 911" has a no-break space on screen. */
const plain = (text: string) => text.replace(/\s+/g, " ").trim();

/** Open the app in a mode and language, once both are saved (so page.goto keeps them). */
async function start(page: Page, lang: Lang, mode: "replay" | "live" = "replay") {
  await page.goto(`/?mode=${mode}`);
  await page.waitForFunction((m) => sessionStorage.getItem("smoke-or-fire")?.includes(`"mode":"${m}"`), mode);
  if (lang === "fr") {
    await toFrench(page);
    await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"lang":"fr"'));
  }
}
/** A screen opened by its address, once its title is up and its fonts are in. */
async function show(page: Page, route: string) {
  await page.goto(route);
  await expect(page.locator("h1").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
/** Call 911 now, opened by its address, in replay. */
async function emergency(page: Page, lang: Lang) {
  await start(page, lang);
  await show(page, "/emergency");
}
/** Check → I smell smoke → these answers, one question after the other. */
async function tapThrough(page: Page, lang: Lang, answers: string[]) {
  await start(page, lang);
  await page.locator('main a[href="/q1"]').click();
  for (const key of answers) {
    await expect(page.locator(`main a[data-answer="${key}"]`)).toBeVisible(); // the question is up
    await answer(page, key);
  }
}
/** A replay town's verdict, reached through the town search, once its card is up and its fonts are in. */
async function verdictFor(page: Page, lang: Lang, town: string) {
  await start(page, lang);
  await page.goto("/location");
  await page.locator("input[type=search]").fill(town);
  await page.getByRole("option", { name: new RegExp(`^${town},`) }).first().click();
  await expect(page).toHaveURL(/\/verdict$/, { timeout: 10_000 });
  await expect(page.locator("#verdict-h")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** What the app keeps for the session. */
const stored = (page: Page): Promise<Stored> => page.evaluate(() => JSON.parse(sessionStorage.getItem("smoke-or-fire") ?? "{}"));
/** Change what the app keeps for the session (the mode and language stay); the next screen opened starts from it. */
const remember = (page: Page, change: Partial<Stored>) =>
  page.evaluate((change) => {
    const kept = JSON.parse(sessionStorage.getItem("smoke-or-fire") ?? "{}");
    sessionStorage.setItem("smoke-or-fire", JSON.stringify({ ...kept, ...change }));
  }, change);

/** Record what the app asks the phone for; the browser answers as the test set it up. */
function recordGeolocation() {
  const w = window as unknown as { __geo: PositionOptions[] };
  w.__geo = [];
  const real = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
  navigator.geolocation.getCurrentPosition = (ok, fail, options) => {
    w.__geo.push(options ?? {});
    real(ok, fail, options);
  };
}
const geolocationRequests = (page: Page) => page.evaluate(() => (window as unknown as { __geo: PositionOptions[] }).__geo);
/** A phone that takes a moment to answer, then gives this position, with its accuracy and the time it was taken. */
function slowPhone({ latitude, longitude, accuracy, after }: { latitude: number; longitude: number; accuracy: number; after: number }) {
  const geolocation = {
    getCurrentPosition: (ok: PositionCallback) => {
      setTimeout(() => ok({ coords: { latitude, longitude, accuracy }, timestamp: Date.now() } as GeolocationPosition), after);
    },
    watchPosition: () => 0,
    clearWatch: () => {},
  };
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: geolocation });
}
/** A browser with no geolocation at all. It lives on the prototype: deleting it from navigator itself would leave it there. */
function noGeolocation() {
  delete (Navigator.prototype as { geolocation?: Geolocation }).geolocation;
}

// Call 911 now: the big button, and the location block in "Where you are".
const callNow = (page: Page) => page.locator('main a[href="tel:911"]');
const whereBox = (page: Page) => page.locator("main .where-box");
const showButton = (page: Page) => page.locator("main .where-box button.where-show");
/** Tap "Show my location": the button is there, with that label, before the tap. */
async function tapShow(page: Page, lang: Lang) {
  await expect(showButton(page)).toHaveText(s(lang, "emergency.where.show"));
  await showButton(page).click();
}
/** The two coordinate lines, one under the other, as written: every character, the no-break space included. */
async function coordinates(page: Page) {
  const lines = whereBox(page).locator(".where-coords > span");
  await expect(lines).toHaveCount(2);
  const [first, second] = [(await lines.nth(0).boundingBox())!, (await lines.nth(1).boundingBox())!];
  expect(second.y, "the second line is under the first").toBeGreaterThan(first.y + first.height / 2);
  return lines.allTextContents();
}
/** No place name, no coordinates and no "not available" line. */
const nothingShown = (page: Page) => expect(whereBox(page).locator(".where-name, .where-coords, .where-off")).toHaveCount(0);
/** How far a box moved or changed size, in px: the largest of the four differences. */
const moved = (a: Box, b: Box) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height));
const overlap = (a: Box, b: Box) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

/** How many 911 bars the page has: the parent of a tel:911 link that stays put when the page scrolls. */
const fixedBars = (page: Page) =>
  page.locator('a[href="tel:911"]').evaluateAll((links) => links.filter((link) => getComputedStyle(link.parentElement!).position === "fixed").length);

/** Press Tab until the element has the keyboard focus, as a person using a keyboard would: a few presses at most. */
async function tabTo(page: Page, target: Locator, presses = 10) {
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  await expect(target).toBeFocused();
}

/** `inBar`: the slim bar's button. `inTallBar`: the button of the taller bar, on a verdict that nothing explains. */
type Call = { text: string; href: string; background: string; inMain: boolean; inBar: boolean; inTallBar: boolean; inSheet: boolean };
/**
 * Every Call 911 link that can be tapped right now: whole on the screen, 56 px or taller, with nothing over its centre,
 * and not in a part of the page that is switched off (inert). With the address the app is on, read at the same moment.
 */
const reachable = (page: Page): Promise<{ path: string; calls: Call[] }> =>
  page.evaluate(async () => {
    await new Promise((painted) => requestAnimationFrame(painted));
    const calls = [...document.querySelectorAll<HTMLAnchorElement>('a[href="tel:911"]')].filter((link) => {
      const box = link.getBoundingClientRect();
      const onScreen = box.top >= -0.5 && box.left >= -0.5 && box.bottom <= window.innerHeight + 0.5 && box.right <= window.innerWidth + 0.5;
      const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return onScreen && box.height >= 56 && !link.closest("[inert]") && top !== null && link.contains(top);
    });
    return {
      path: location.pathname,
      calls: calls.map((link) => ({
        text: link.innerText.replace(/\s+/g, " ").trim(),
        href: link.getAttribute("href") ?? "",
        background: getComputedStyle(link).backgroundColor,
        inMain: link.closest("main") !== null,
        inBar: link.classList.contains("sticky-call"),
        inTallBar: link.classList.contains("sticky-call-first"),
        inSheet: link.closest("dialog.sheet") !== null,
      })),
    };
  });
/** The one Call 911 link that can be tapped: none, or more than one, fails. */
async function hit(page: Page) {
  const { calls } = await reachable(page);
  expect(calls, "Call 911 buttons that can be tapped").toHaveLength(1);
  return calls[0];
}
const scrollToBottom = (page: Page) => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

for (const lang of LANGS) {
  test.describe(`Call 911 now, what the screen says (${lang.toUpperCase()})`, () => {
    test("the title, one line that fits any answer, one big white Call 911 button, the largest thing to tap; no 911 bar", async ({ page }) => {
      await emergency(page, lang);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(s(lang, "emergency.title"));
      expect(s(lang, "emergency.sub")).toBe(SUB[lang]);
      await expect(page.locator("main p").filter({ hasText: SUB[lang] })).toHaveText(SUB[lang]);
      expect(await page.locator("body").innerText()).not.toContain(OLD_SUB[lang]);

      // One Call 911 on the page, in the screen itself: white on the red page, 104 px or taller.
      await expect(page.locator('a[href="tel:911"]')).toHaveCount(1);
      const call = callNow(page);
      await expect(call).toHaveText(s(lang, "emergency.call"));
      expect(await call.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(WHITE);
      const box = (await call.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(104);
      // Nothing else to tap is as large: Back, Listen, EN and FR, Show my location, Told to leave.
      const others = await page.locator("a, button").evaluateAll((els) =>
        els.filter((el) => el.getAttribute("href") !== "tel:911").map((el) => {
          const r = el.getBoundingClientRect();
          return { name: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30), area: Math.round(r.width * r.height) };
        }),
      );
      expect(others.length).toBeGreaterThanOrEqual(5);
      expect(others.filter((other) => other.area >= box.width * box.height)).toEqual([]);

      // Tell the dispatcher: still four things to say, the first one now with the location block; Told to leave stays.
      const tell = page.locator("section[aria-labelledby=tell-h]");
      await expect(tell.getByRole("heading")).toHaveText(s(lang, "emergency.tell"));
      const items = tell.locator("ol > li");
      await expect(items).toHaveCount(4);
      await expect(items.first()).toContainText(s(lang, "emergency.tell1.lead"));
      await expect(items.first()).toContainText(s(lang, "emergency.tell1"));
      await expect(items.first().locator(".where-box")).toHaveCount(1);
      await expect(page.locator('main a[href="/leave"]')).toHaveText(s(lang, "leave.entry"));

      // No 911 bar: the big button is this screen's Call 911.
      expect(await fixedBars(page)).toBe(0);
      await expect(page.locator("a.sticky-call")).toHaveCount(0);
    });
  });

  // Back goes to the screen the person came from; with none (a link or bookmark), to the first question.
  test.describe(`Call 911 now, Back (${lang.toUpperCase()})`, () => {
    const back = (page: Page) => page.getByRole("link", { name: s(lang, "nav.back"), exact: true });

    test("opened directly (a link or bookmark), Back goes to the first question", async ({ page }) => {
      await emergency(page, lang);
      await expect(back(page)).toHaveAttribute("href", "/q1");
      await back(page).click();
      await expect(page).toHaveURL(/\/q1$/);
      await expect(page.locator('main a[data-answer="yes"]')).toBeVisible(); // the question itself, with its answers
    });

    test("after Not sure on the first question, Back returns to that question", async ({ page }) => {
      await tapThrough(page, lang, ["notSure"]);
      await expect(page).toHaveURL(/\/emergency$/);
      await back(page).click();
      await expect(page).toHaveURL(/\/q1$/);
      await expect(page.locator('main a[data-answer="notSure"]')).toBeVisible();
    });

    test("after the third question (no flames, grey haze, smouldering mulch), Back returns to the third question, not the first", async ({ page }) => {
      await tapThrough(page, lang, ["no", "haze", "mulch"]);
      await expect(page).toHaveURL(/\/emergency$/);
      await back(page).click();
      await expect(page).toHaveURL(/\/q3$/);
      await expect(page.locator('main a[data-answer="mulch"]')).toBeVisible();
    });
  });

  // "Where you are" can show where the phone is: asked for on a tap only, never by itself.
  test.describe(`Call 911 now, where you are (${lang.toUpperCase()})`, () => {
    test("nothing known (I smell smoke → Yes): only Show my location, 56 px or taller; no place, no coordinates, and the phone is not asked", async ({ page }) => {
      await page.addInitScript(recordGeolocation);
      await tapThrough(page, lang, ["yes"]);
      await expect(page).toHaveURL(/\/emergency$/);
      const box = whereBox(page);
      await expect(box).toHaveCount(1);
      await expect(box).toHaveAttribute("role", "status");
      await expect(showButton(page)).toHaveText(s(lang, "emergency.where.show"));
      expect((await showButton(page).boundingBox())!.height).toBeGreaterThanOrEqual(56);
      await page.waitForTimeout(500); // long enough for the community list to load: still nothing
      await nothingShown(page);
      expect(await geolocationRequests(page)).toEqual([]); // only a tap asks
      // The big button, whole on the screen.
      const call = (await callNow(page).boundingBox())!;
      const { width, height } = page.viewportSize()!;
      expect([call.x >= 0, call.y >= 0, call.x + call.width <= width, call.y + call.height <= height], JSON.stringify(call)).toEqual([true, true, true, true]);
    });

    test.describe("the phone allows it, in Moncton, to within 20 m", () => {
      test.use({ geolocation: { ...MONCTON, accuracy: 20 }, permissions: ["geolocation"] });

      test("a tap asks the phone (high accuracy, 8 s), then shows Near Moncton and the coordinates on two lines; Call 911 has not moved; kept for the session", async ({ page }) => {
        await page.addInitScript(recordGeolocation);
        await emergency(page, lang);
        await expect(showButton(page)).toHaveText(s(lang, "emergency.where.show"));
        const before = (await callNow(page).boundingBox())!;
        await tapShow(page, lang);
        await expect(whereBox(page).locator(".where-name")).toHaveText(nearMoncton(lang));
        expect(await coordinates(page)).toEqual(MONCTON_LINES[lang]);
        await expect(showButton(page)).toHaveText(s(lang, "emergency.where.update"));
        await expect(whereBox(page).locator(".where-off")).toHaveCount(0);
        expect(await geolocationRequests(page)).toEqual([{ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }]);
        // The block kept its room: the big button is where it was.
        expect(moved(before, (await callNow(page).boundingBox())!)).toBeLessThanOrEqual(1);
        // Kept for the session, with the time it was taken and how accurate it is.
        await expect.poll(async () => (await stored(page)).shared).toMatchObject({ lat: MONCTON.latitude, lon: MONCTON.longitude, accuracy: 20 });
        const at = (await stored(page)).shared!.at;
        expect([typeof at, Number.isFinite(at)]).toEqual(["number", true]);
      });
    });

    test.describe("the phone allows it, in Moncton, but only to within 2.5 km", () => {
      test.use({ geolocation: { ...MONCTON, accuracy: 2500 }, permissions: ["geolocation"] });

      test("a tap shows Near Moncton, without coordinates", async ({ page }) => {
        await emergency(page, lang);
        await tapShow(page, lang);
        await expect(whereBox(page).locator(".where-name")).toHaveText(nearMoncton(lang));
        await expect(whereBox(page).locator(".where-coords, .where-off")).toHaveCount(0);
        await expect(showButton(page)).toHaveText(s(lang, "emergency.where.update"));
      });
    });

    test.describe("the phone allows it, far from any community (at sea)", () => {
      test.use({ geolocation: { ...AT_SEA, accuracy: 20 }, permissions: ["geolocation"] });

      test("a tap shows the coordinates alone, with no place name", async ({ page }) => {
        await emergency(page, lang);
        await tapShow(page, lang);
        expect(await coordinates(page)).toEqual(AT_SEA_LINES[lang]);
        await page.waitForTimeout(500); // long enough for the community list to load: still no name
        await expect(whereBox(page).locator(".where-name, .where-off")).toHaveCount(0);
      });
    });

    test("location denied: “not available” in the block, the screen stays, and Call 911 has not moved and still calls", async ({ page }) => {
      await emergency(page, lang); // no permission given: the browser says no
      await expect(showButton(page)).toHaveText(s(lang, "emergency.where.show"));
      const before = (await callNow(page).boundingBox())!;
      await tapShow(page, lang);
      await expect(whereBox(page).locator(".where-off")).toHaveText(s(lang, "emergency.where.off"));
      await expect(whereBox(page).locator(".where-name, .where-coords")).toHaveCount(0);
      await expect(showButton(page)).toHaveText(s(lang, "emergency.where.show")); // to try again
      await expect(page).toHaveURL(/\/emergency$/);
      expect(moved(before, (await callNow(page).boundingBox())!)).toBeLessThanOrEqual(1);
      await expect(callNow(page)).toHaveAttribute("href", "tel:911");
      await expect(callNow(page)).toBeEnabled();
      expect((await hit(page)).inMain).toBe(true);
    });

    test("a browser with no geolocation: no Show my location button at all", async ({ page }) => {
      await page.addInitScript(noGeolocation);
      await emergency(page, lang);
      expect(await page.evaluate(() => "geolocation" in navigator)).toBe(false);
      await expect(whereBox(page)).toHaveCount(1); // the block keeps its place in "Where you are"
      await expect(page.locator(".where-show")).toHaveCount(0);
      await nothingShown(page);
      await expect(callNow(page)).toHaveText(s(lang, "emergency.call"));
    });

    test.describe("a position already shared this session", () => {
      test("a moment ago: the place and the coordinates are there without a tap, and the button says Update", async ({ page }) => {
        await page.addInitScript(recordGeolocation);
        await start(page, lang);
        await remember(page, { shared: { lat: MONCTON.latitude, lon: MONCTON.longitude, at: Date.now(), accuracy: 20 } });
        await show(page, "/emergency");
        await expect(whereBox(page).locator(".where-name")).toHaveText(nearMoncton(lang));
        expect(await coordinates(page)).toEqual(MONCTON_LINES[lang]);
        await expect(showButton(page)).toHaveText(s(lang, "emergency.where.update"));
        expect(await geolocationRequests(page)).toEqual([]); // shown from what the session knows: the phone is not asked
      });

      test("30 minutes ago: too old to read to a dispatcher, so nothing is shown and the button says Show", async ({ page }) => {
        await start(page, lang);
        await remember(page, { shared: { lat: MONCTON.latitude, lon: MONCTON.longitude, at: Date.now() - 30 * 60_000, accuracy: 20 } });
        await show(page, "/emergency");
        await expect(showButton(page)).toHaveText(s(lang, "emergency.where.show"));
        await page.waitForTimeout(500); // long enough for the community list to load: still nothing
        await nothingShown(page);
        await expect(showButton(page)).toHaveText(s(lang, "emergency.where.show"));
      });

      test("with no time on it (the text to family keeps only the position): nothing is shown", async ({ page }) => {
        await start(page, lang);
        await remember(page, { shared: { lat: MONCTON.latitude, lon: MONCTON.longitude } });
        await show(page, "/emergency");
        await expect(showButton(page)).toHaveText(s(lang, "emergency.where.show"));
        await page.waitForTimeout(500);
        await nothingShown(page);
        await expect(showButton(page)).toHaveText(s(lang, "emergency.where.show"));
      });
    });

    test.describe("a town chosen in the app is not where the phone is", () => {
      test("replay: Moncton chosen for the replay is never shown as the person's location", async ({ page }) => {
        await start(page, lang);
        await page.goto("/location");
        await page.locator("input[type=search]").fill("Moncton");
        await page.getByRole("option", { name: /^Moncton,/ }).first().click();
        await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"name":"Moncton"')); // saved before leaving the page
        await show(page, "/emergency");
        expect((await stored(page)).place).toMatchObject({ name: "Moncton", replayFile: "moncton.json" }); // still the place being checked
        await expect(showButton(page)).toHaveText(s(lang, "emergency.where.show"));
        await page.waitForTimeout(500);
        await nothingShown(page);
      });

      test("live: a town the person typed is shown by its name alone (“Moncton, NB”), with no “Near” and no coordinates", async ({ page }) => {
        await start(page, lang, "live");
        await remember(page, { place: { name: "Moncton", province: "NB", county: "Westmorland", lat: 46.0878, lon: -64.7782, source: "search" }, shared: null });
        await show(page, "/emergency");
        const typed = s(lang, "emergency.where.town", { town: "Moncton", province: s(lang, "province.NB") });
        expect(typed).toBe(MONCTON_TYPED[lang]);
        await expect(whereBox(page).locator(".where-name")).toHaveText(typed);
        await page.waitForTimeout(500);
        await expect(whereBox(page).locator(".where-name")).toHaveText(typed);
        await expect(whereBox(page).locator(".where-coords")).toHaveCount(0);
        await expect(showButton(page)).toHaveText(s(lang, "emergency.where.show")); // the phone has not been asked
      });
    });
  });

  test.describe(`Call 911 now, with a keyboard (${lang.toUpperCase()})`, () => {
    test("Tab reaches Show my location, Enter asks, the focus is kept and Tab goes on to Call 911; the block is busy only while the phone answers", async ({ page }) => {
      await page.addInitScript(slowPhone, { ...MONCTON, accuracy: 20, after: 300 });
      await emergency(page, lang);
      const [box, button] = [whereBox(page), showButton(page)];
      await expect(button).toHaveText(s(lang, "emergency.where.show"));
      await expect(box).toHaveAttribute("role", "status");
      await expect(box).not.toHaveAttribute("aria-busy", "true");
      await tabTo(page, button);
      // From here on, each change of aria-busy is noted, with the button's label at that moment.
      await page.evaluate(() => {
        const w = window as unknown as { __busy: { busy: boolean; label: string }[] };
        w.__busy = [];
        const block = document.querySelector(".where-box")!;
        const note = () => w.__busy.push({ busy: block.getAttribute("aria-busy") === "true", label: (block.querySelector(".where-show")?.textContent ?? "").trim() });
        new MutationObserver(note).observe(block, { attributes: true, attributeFilter: ["aria-busy"] });
      });
      await page.keyboard.press("Enter");
      await expect(box.locator(".where-name")).toHaveText(nearMoncton(lang));
      expect(await coordinates(page)).toEqual(MONCTON_LINES[lang]);
      await expect(button).toHaveText(s(lang, "emergency.where.update"));
      const seen = await page.evaluate(() => (window as unknown as { __busy: { busy: boolean; label: string }[] }).__busy);
      expect(seen.map((change) => change.busy)).toEqual([true, false]); // busy once, while asking, and not after
      expect(seen[0].label).toBe(s(lang, "leave.family.locating"));
      await expect(box).toHaveAttribute("role", "status");
      await expect(box).not.toHaveAttribute("aria-busy", "true");
      // The focus was not dropped (a keyboard or screen reader would start again from the top), and Call 911 comes next.
      expect(await page.evaluate(() => document.activeElement !== null && document.activeElement !== document.body)).toBe(true);
      await tabTo(page, callNow(page), 3);
    });

    test("the focus ring is white on the red screen: Back, Listen and Show my location", async ({ page }) => {
      await emergency(page, lang);
      // In the order Tab reaches them.
      const targets: [string, Locator][] = [
        ["Back", page.getByRole("link", { name: s(lang, "nav.back"), exact: true })],
        ["Listen", page.getByRole("button", { name: s(lang, "listen.play"), exact: true })],
        ["Show my location", showButton(page)],
      ];
      for (const [name, target] of targets) {
        await expect(target, name).toBeVisible();
        await tabTo(page, target);
        const ring = await target.evaluate((el) => {
          const style = getComputedStyle(el);
          return { color: style.outlineColor, drawn: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0 };
        });
        expect(ring, name).toEqual({ color: WHITE, drawn: true });
      }
    });
  });
}

const PHONES = [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
];
// Every screen that opens by its address. Tracing and the verdict need a place: they are reached through the town search.
const SCREENS = ["/", "/q1", "/q2", "/q3", "/nearby-fire", "/emergency", "/location", "/leave", "/how-it-works", "/location-off", "/no-data"];
// The verdict has two bars. Moncton (drifting smoke) and Miramichi (unclear, with its own card behind "Why?") keep the
// slim bar of every screen. Halifax (smoke that nothing explains) has the taller one, where Call 911 is the main
// action: "Look outside…" above a button as wide as the bar.
const VERDICTS = [
  { town: "Moncton", state: "drifting", bar: "inBar" },
  { town: "Miramichi", state: "unclear", bar: "inBar" },
  { town: "Halifax", state: "unexplained", bar: "inTallBar" },
] as const;
// The source badges under the card: a tap on one opens its panel, one at a time.
const BADGES = ["fire", "trace", "alert"] as const;

for (const viewport of PHONES) {
  for (const lang of LANGS) {
    test.describe(`Call 911 within reach, ${viewport.width}×${viewport.height} ${lang.toUpperCase()}`, () => {
      test.use({ viewport });

      test("every screen, as it opens and scrolled to the bottom: one Call 911 button to tap, never none, never two", async ({ page }) => {
        test.setTimeout(90_000);
        await start(page, lang);
        const problems: string[] = [];
        /** The screen the app is on, as it opened and then scrolled to its end. */
        const check = async (route: string) => {
          for (const state of ["as it opens", "scrolled to the bottom"]) {
            if (state !== "as it opens") await scrollToBottom(page);
            const { path, calls } = await reachable(page);
            if (path !== route) problems.push(`${route}, ${state}: the app is on ${path}`);
            else if (calls.length !== 1) problems.push(`${route}, ${state}: ${calls.length} Call 911 buttons to tap`);
          }
        };
        for (const route of SCREENS) {
          await show(page, route);
          await check(route);
        }
        await page.goto("/location");
        await page.locator("input[type=search]").fill("Moncton");
        await page.getByRole("option", { name: /^Moncton,/ }).first().click();
        await expect(page).toHaveURL(/\/loading$/);
        await expect(page.locator(".hours")).toBeAttached(); // the loading screen itself, not the location screen
        await check("/loading");
        await expect(page).toHaveURL(/\/verdict$/, { timeout: 10_000 });
        await expect(page.locator("#verdict-h")).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await check("/verdict");
        expect(problems).toEqual([]);
      });

      test("the verdict that nothing explains (Halifax): “Look outside…” above one red Call 911 as wide as the bar, 72 px or taller (60 on a phone 740 px tall or less); the one button to tap, also scrolled to the bottom", async ({ page }) => {
        await verdictFor(page, lang, "Halifax");
        await expect(page.locator("section.glance")).toHaveAttribute("data-state", "unexplained");
        // One Call 911 on the page, in the one bar: the taller bar, not the slim one.
        await expect(page.locator('a[href="tel:911"]')).toHaveCount(1);
        expect(await fixedBars(page)).toBe(1);
        await expect(page.locator("a.sticky-call, p.sticky-title")).toHaveCount(0);
        const bar = page.locator("div.sticky-first");
        const [look, button] = [bar.locator("p.sticky-look"), bar.locator("a.sticky-call-first")];
        await expect(look).toHaveText(s(lang, "sticky.look"));
        await expect(button).toHaveAttribute("href", "tel:911");
        await expect(bar.locator("a, button")).toHaveCount(1); // nothing else to tap in the bar
        const [line, box, around] = [(await look.boundingBox())!, (await button.boundingBox())!, (await bar.boundingBox())!];
        // On a phone 740 px tall or less the bar is the tighter one, so the map keeps its room above the sheet.
        expect(box.height).toBeGreaterThanOrEqual(page.viewportSize()!.height <= 740 ? 60 : 72);
        expect(box.width, "the bar's width, less its 16 px margins").toBeGreaterThanOrEqual(around.width - 32.5);
        expect(line.y + line.height, "the line is above the button").toBeLessThanOrEqual(box.y + 0.5);
        for (const state of ["as it opens", "scrolled to the bottom"]) {
          if (state !== "as it opens") await scrollToBottom(page);
          const call = await hit(page);
          expect([call.inTallBar, call.text, call.background], state).toEqual([true, plain(s(lang, "sticky.call")), RED]);
        }
      });

      for (const verdict of VERDICTS) {
        test(`${verdict.town}'s verdict with “Why?” open: 811 is there to call, and Call 911 is still the bar's alone; also with 811 on the screen and scrolled to the bottom`, async ({ page }) => {
          await verdictFor(page, lang, verdict.town);
          await expect(page.locator("section.glance")).toHaveAttribute("data-state", verdict.state);
          const line811 = page.locator('main a[href="tel:811"]');
          await expect(line811).toBeHidden(); // behind “Why?” as the screen opens
          await openWhy(page);
          await expect(line811).toBeVisible();
          await expect(page.locator('a[href="tel:911"]')).toHaveCount(1); // 811 is another number: no second Call 911 came with it
          expect((await hit(page))[verdict.bar], "as “Why?” opens").toBe(true);
          await line811.scrollIntoViewIfNeeded();
          await expect(line811).toBeInViewport();
          expect((await hit(page))[verdict.bar], "with 811 on the screen").toBe(true);
          await scrollToBottom(page);
          expect((await hit(page))[verdict.bar], "scrolled to the bottom").toBe(true);
        });

        test(`${verdict.town}'s verdict with a source badge open, each of the three in turn: Call 911 is still the bar's alone, also scrolled to the bottom`, async ({ page }) => {
          await verdictFor(page, lang, verdict.town);
          await expect(page.locator("section.glance")).toHaveAttribute("data-state", verdict.state);
          for (const id of BADGES) {
            const panel = await openBadge(page, id);
            await expect(page.locator("main .badge-panel:visible")).toHaveCount(1); // the one before it has closed
            // The panel's links go to the sources: no second Call 911 came with it.
            await expect(panel.locator('a[href^="tel:"]')).toHaveCount(0);
            await expect(page.locator('a[href="tel:911"]')).toHaveCount(1);
            expect((await hit(page))[verdict.bar], `${id}, as it opens`).toBe(true);
            await scrollToBottom(page);
            expect((await hit(page))[verdict.bar], `${id}, scrolled to the bottom`).toBe(true);
          }
        });
      }

      test("the first question with “About these questions” open: still the bar's Call 911, also scrolled to the bottom", async ({ page }) => {
        await start(page, lang);
        await show(page, "/q1");
        const about = page.locator("main button.look-about-toggle");
        await expect(about).toHaveAttribute("aria-expanded", "false");
        await about.click();
        await expect(about).toHaveAttribute("aria-expanded", "true");
        await expect(page.locator("#look-about-text")).toBeVisible();
        expect((await hit(page)).inBar).toBe(true);
        await scrollToBottom(page);
        expect((await hit(page)).inBar).toBe(true);
      });

      test("Check with the Add to home screen steps open: the sheet covers the screen's Call 911, so the one Call 911 to tap is the sheet's own, red; Close has the focus", async ({ page }) => {
        await start(page, lang);
        await page.getByRole("button", { name: s(lang, "keep.add"), exact: true }).click();
        const sheet = page.locator("dialog.sheet");
        await expect(sheet).toBeVisible();
        const call = await hit(page);
        expect(call.inSheet).toBe(true);
        expect(call.text).toBe(plain(s(lang, "sticky.call")));
        expect(call.background).toBe(RED);
        await expect(sheet.getByRole("button", { name: s(lang, "tip.close"), exact: true })).toBeFocused();
        await expect(sheet.locator('a[href="tel:911"]')).not.toBeFocused();
      });
    });
  }
}

// On a computer the button is the same tel:911 link (no device detection): its label already shows the number to dial.
test.describe("Call 911 on a computer, 1280 × 800", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  for (const lang of LANGS) {
    test(`${lang.toUpperCase()}: on Check, the first question and Call 911 now, the one button to tap shows 911 and is a tel:911 link`, async ({ page }) => {
      await start(page, lang);
      const routes = ["/", "/q1", "/emergency"];
      const seen: { route: string; calls: { href: string; number: boolean }[] }[] = [];
      for (const route of routes) {
        await show(page, route);
        const { path, calls } = await reachable(page);
        seen.push({ route: path, calls: calls.map((call) => ({ href: call.href, number: call.text.includes("911") })) });
      }
      expect(seen).toEqual(routes.map((route) => ({ route, calls: [{ href: "tel:911", number: true }] })));
    });
  }
});

// Narrow and short screens: 320 × 568 is the narrowest phone; 640 × 512 is a 1280 × 1024 window zoomed to 200%.
const NARROW = [
  { width: 320, height: 568 },
  { width: 640, height: 512 },
];
/** `answers`: on a question, how many answers there are. `bar`: the 911 bar, or else the screen's own big Call 911. */
const REFLOW: { name: string; route: string; bar: boolean; answers: number }[] = [
  { name: "Check", route: "/", bar: false, answers: 0 },
  { name: "Q1, three answers", route: "/q1", bar: true, answers: 3 },
  { name: "Q2, four answers", route: "/q2", bar: true, answers: 4 },
  { name: "Q3, six answers", route: "/q3", bar: true, answers: 6 },
  { name: "Nearby fire", route: "/nearby-fire", bar: false, answers: 0 },
  { name: "Call 911 now, with the place and the coordinates shown", route: "/emergency", bar: false, answers: 0 },
];

for (const viewport of NARROW) {
  for (const lang of LANGS) {
    test.describe(`${viewport.width}×${viewport.height} ${lang.toUpperCase()}: nothing wider than the screen, every answer clear of the bar, Call 911 on the screen`, () => {
      test.use({ viewport });
      for (const screen of REFLOW) {
        test(screen.name, async ({ page }) => {
          const { width } = viewport;
          const inWidth = (box: Box) => box.x >= -0.5 && box.x + box.width <= width + 0.5;
          await start(page, lang);
          // Call 911 now at its fullest: a position shared a moment ago, so the place and both coordinate lines show.
          if (screen.route === "/emergency") await remember(page, { shared: { lat: MONCTON.latitude, lon: MONCTON.longitude, at: Date.now(), accuracy: 20 } });
          await show(page, screen.route);
          await expect(page).toHaveURL(new RegExp(`${screen.route}$`));
          if (screen.route === "/emergency") {
            await expect(whereBox(page).locator(".where-name")).toHaveText(nearMoncton(lang));
            expect(await coordinates(page)).toEqual(MONCTON_LINES[lang]);
            const parts = whereBox(page).locator(".where-name, .where-coords > span, .where-show");
            await expect(parts).toHaveCount(4);
            for (const part of await parts.all()) expect(inWidth((await part.boundingBox())!), await part.innerText()).toBe(true);
          }

          expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
          const call = await hit(page); // whole on the screen
          if (!screen.bar) {
            // Its own big button, in the screen itself, and no bar.
            expect(call.inMain).toBe(true);
            await expect(page.locator("a.sticky-call")).toHaveCount(0);
            return;
          }

          expect(call.inBar).toBe(true);
          const button = page.locator("a.sticky-call");
          const bar = button.locator("..");
          expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(96); // the room every screen keeps for it
          const title = bar.locator("p.sticky-title");
          if (width < 360) {
            // Too narrow for the question beside the button: the button alone, filling the bar.
            await expect(title).toBeHidden();
            expect((await button.boundingBox())!.width).toBeGreaterThanOrEqual(200);
          } else {
            await expect(title).toBeVisible();
            await expect(title).toHaveText(s(lang, "sticky.title"));
          }

          // Every answer can be brought clear of the bar, and none is cut off at the sides.
          const answers = page.locator("main a[data-answer]");
          await expect(answers).toHaveCount(screen.answers);
          for (const one of await answers.all()) {
            await one.scrollIntoViewIfNeeded();
            const [box, under] = [(await one.boundingBox())!, (await bar.boundingBox())!];
            const key = await one.getAttribute("data-answer");
            expect([box.y >= -0.5, inWidth(box), overlap(box, under)], `${key}: ${JSON.stringify(box)}, bar from ${under.y}`).toEqual([true, true, false]);
          }
          expect((await hit(page)).inBar).toBe(true); // and Call 911 is still there to tap
        });
      }
    });
  }
}

/** A phone that answers each request in turn, a moment after it is asked: a position (taken `ago` ms before), or null for a refusal. */
function phoneAnswers(answers: ({ latitude: number; longitude: number; accuracy: number; ago?: number } | null)[]) {
  const w = window as unknown as { __asked: number };
  w.__asked = 0;
  const geolocation = {
    getCurrentPosition: (ok: PositionCallback, fail: PositionErrorCallback) => {
      const given = answers[Math.min(w.__asked, answers.length - 1)];
      w.__asked += 1;
      setTimeout(() => {
        if (given) ok({ coords: given, timestamp: Date.now() - (given.ago ?? 0) } as unknown as GeolocationPosition);
        else fail({ code: 1, message: "" } as GeolocationPositionError);
      }, 50);
    },
    watchPosition: () => 0,
    clearWatch: () => {},
  };
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: geolocation });
}
const asked = (page: Page) => page.evaluate(() => (window as unknown as { __asked: number }).__asked);
/** "Not available", with nothing else to read out, and the button back to Show my location. */
async function notAvailable(page: Page, lang: Lang) {
  await expect(whereBox(page).locator(".where-off")).toHaveText(s(lang, "emergency.where.off"));
  await expect(whereBox(page).locator(".where-name, .where-coords")).toHaveCount(0);
  await expect(showButton(page)).toHaveText(s(lang, "emergency.where.show"));
}

for (const lang of LANGS) {
  // A position is shown only when it can be read to a dispatcher as where the person is now.
  test.describe(`Call 911 now, a position that can't be shown (${lang.toUpperCase()})`, () => {
    test("an update that fails takes the earlier position away: “not available”, and the button says Show again", async ({ page }) => {
      await page.addInitScript(phoneAnswers, [{ ...MONCTON, accuracy: 20 }, null]);
      await emergency(page, lang);
      await tapShow(page, lang);
      expect(await coordinates(page)).toEqual(MONCTON_LINES[lang]);
      await expect(showButton(page)).toHaveText(s(lang, "emergency.where.update"));
      const before = (await callNow(page).boundingBox())!;
      await showButton(page).click(); // the person has moved; this time the phone says no
      await notAvailable(page, lang);
      expect(moved(before, (await callNow(page).boundingBox())!)).toBeLessThanOrEqual(1);
      expect(await asked(page)).toBe(2);
    });

    test("a position whose own time is 11 minutes old (the phone’s clock is off): not shown, and the block says so", async ({ page }) => {
      await page.addInitScript(phoneAnswers, [{ ...MONCTON, accuracy: 20, ago: 11 * 60_000 }]);
      await emergency(page, lang);
      await tapShow(page, lang);
      await notAvailable(page, lang);
    });

    test("a position the phone is unsure of by 30 km names no town", async ({ page }) => {
      await page.addInitScript(phoneAnswers, [{ ...MONCTON, accuracy: 30_000 }]);
      await emergency(page, lang);
      await tapShow(page, lang);
      await notAvailable(page, lang);
    });

    test("too coarse for coordinates (2.5 km) and far from any community: “not available”", async ({ page }) => {
      await page.addInitScript(phoneAnswers, [{ ...AT_SEA, accuracy: 2500 }]);
      await emergency(page, lang);
      await tapShow(page, lang);
      await notAvailable(page, lang);
    });

    test("too coarse for coordinates but in Moncton: the name, and “not available” never shows while the name is on its way", async ({ page }) => {
      await page.addInitScript(phoneAnswers, [{ ...MONCTON, accuracy: 2500 }]);
      await emergency(page, lang);
      await page.evaluate(() => {
        const w = window as unknown as { __off: boolean };
        w.__off = false;
        const box = document.querySelector(".where-box")!;
        new MutationObserver(() => {
          if (box.querySelector(".where-off")) w.__off = true;
        }).observe(box, { childList: true, subtree: true });
      });
      await tapShow(page, lang);
      await expect(whereBox(page).locator(".where-name")).toHaveText(nearMoncton(lang));
      expect(await page.evaluate(() => (window as unknown as { __off: boolean }).__off)).toBe(false);
    });

    test("a long place name wraps inside the card at 375 px: Saint-Jean-Baptiste-de-Restigouche", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.addInitScript(phoneAnswers, [{ latitude: 47.76732, longitude: -67.21188, accuracy: 20 }]);
      await emergency(page, lang);
      await tapShow(page, lang);
      const name = whereBox(page).locator(".where-name");
      await expect(name).toContainText("Saint-Jean-Baptiste-de-Restigouche");
      const [text, card] = [(await name.boundingBox())!, (await page.locator("main .emergency-card").boundingBox())!];
      expect(text.x + text.width).toBeLessThanOrEqual(card.x + card.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });
  });

  // Nothing but a tap on Show my location asks the phone, and nothing takes the person off this screen.
  test.describe(`Call 911 now is not disturbed (${lang.toUpperCase()})`, () => {
    test("a double tap on Not sure opens Call 911 now and does not ask the phone, though its second tap lands on Show my location", async ({ page }) => {
      await page.addInitScript(phoneAnswers, [{ ...MONCTON, accuracy: 20 }]);
      await start(page, lang);
      await page.locator('main a[href="/q1"]').click();
      const notSure = (await page.locator('main .look-answers[data-ready="true"] a[data-answer="notSure"]').boundingBox())!;
      const [x, y] = [notSure.x + notSure.width / 2, notSure.y + notSure.height / 2];
      await page.mouse.click(x, y);
      await page.waitForTimeout(120);
      await page.mouse.click(x, y);
      await expect(page).toHaveURL(/\/emergency$/);
      // The second tap fell on the button: the screens put it where Not sure was.
      const show = (await showButton(page).boundingBox())!;
      expect([x >= show.x, x <= show.x + show.width, y >= show.y, y <= show.y + show.height], JSON.stringify({ x, y, show })).toEqual([true, true, true, true]);
      await page.waitForTimeout(600);
      expect(await asked(page)).toBe(0);
      await nothingShown(page);
      // A tap of its own, once the screen has been up a moment, asks.
      await tapShow(page, lang);
      expect(await coordinates(page)).toEqual(MONCTON_LINES[lang]);
      expect(await asked(page)).toBe(1);
    });

    test("Use my location answering late, after the person went back and on to Call 911 now: remembered, and the screen stays", async ({ page }) => {
      await page.addInitScript(slowPhone, { ...MONCTON, accuracy: 20, after: 2000 });
      await tapThrough(page, lang, ["no", "haze", "nothing"]);
      await expect(page).toHaveURL(/\/location$/);
      await page.locator('main a[href="/loading"]').first().click(); // Use my location: the phone takes its time
      await page.getByRole("link", { name: s(lang, "nav.back"), exact: true }).click();
      await answer(page, "people");
      await expect(page).toHaveURL(/\/emergency$/);
      await expect.poll(async () => (await stored(page)).shared, { timeout: 5_000 }).toMatchObject({ lat: MONCTON.latitude, lon: MONCTON.longitude }); // the answer came
      await page.waitForTimeout(500);
      await expect(page).toHaveURL(/\/emergency$/);
      await expect(page.locator("h1")).toHaveText(s(lang, "emergency.title"));
      expect((await hit(page)).inMain).toBe(true);
    });

    test("the screen an answer ends on takes the focus, so a screen reader says where the tap led: Call 911 now, Nearby fire", async ({ page }) => {
      await tapThrough(page, lang, ["yes"]);
      await expect(page).toHaveURL(/\/emergency$/);
      await expect(page.locator("h1")).toBeFocused();
      await tapThrough(page, lang, ["no", "haze", "firePit"]);
      await expect(page).toHaveURL(/\/nearby-fire$/);
      await expect(page.locator("h1")).toBeFocused();
      // Opened by its address, nothing takes the focus.
      await show(page, "/emergency");
      await expect(page.locator("h1")).not.toBeFocused();
    });
  });
}

/** The Call 911 button, all of it on the screen with the page as it opened, 104 px tall or more, with nothing over it. */
async function wholeOnScreen(page: Page) {
  const { width, height } = page.viewportSize()!;
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const call = callNow(page);
  await expect(call).toBeVisible();
  const box = (await call.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(104);
  expect([box.x >= 0, box.y >= 0, box.x + box.width <= width + 0.5, box.y + box.height <= height + 0.5], JSON.stringify(box)).toEqual([true, true, true, true]);
  // Its middle and its four corners answer to the button itself.
  const covered = await call.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const points = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 12, r.top + 12], [r.right - 12, r.top + 12], [r.left + 12, r.bottom - 12], [r.right - 12, r.bottom - 12]];
    return points.filter(([x, y]) => !el.contains(document.elementFromPoint(x, y))).length;
  });
  expect(covered).toBe(0);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  test.describe(`Call 911 now at ${viewport.width} × ${viewport.height}: the Call 911 button is whole on the screen, without scrolling`, () => {
    test.use({ viewport });
    for (const lang of LANGS) {
      test(`${lang.toUpperCase()}: with no location shown (I smell smoke → Yes)`, async ({ page }) => {
        await tapThrough(page, lang, ["yes"]);
        await expect(page).toHaveURL(/\/emergency$/);
        await page.evaluate(() => document.fonts.ready);
        await nothingShown(page);
        await wholeOnScreen(page);
      });

      test(`${lang.toUpperCase()}: with the phone’s location shown, the place and both coordinate lines`, async ({ page }) => {
        await page.addInitScript(phoneAnswers, [{ ...MONCTON, accuracy: 20 }]);
        await emergency(page, lang);
        await wholeOnScreen(page);
        // Tapped as a finger taps: the page stays where it is. (A click from the test would first scroll the button up.)
        await expect(showButton(page)).toHaveText(s(lang, "emergency.where.show"));
        await showButton(page).dispatchEvent("click");
        await expect(whereBox(page).locator(".where-name")).toHaveText(nearMoncton(lang));
        expect(await coordinates(page)).toEqual(MONCTON_LINES[lang]);
        await wholeOnScreen(page);
      });
    }
  });
}
