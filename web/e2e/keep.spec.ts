// "Keep it on your phone" (Check): the home-screen icon from the manifest; "Add to home screen", which opens the browser's
// install prompt when it offered one, or else shows the steps for the phone, and is hidden when the app is open from the
// home screen; "Send to someone", with the phone's share sheet or else a text message. Nothing is installed or cached:
// there is no service worker.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { navigations } from "./navigations";
import { toFrench } from "./language";

type Lang = "en" | "fr";
const STRINGS: Record<Lang, Record<string, string>> = {
  en: JSON.parse(readFileSync(new URL("../src/i18n/en.json", import.meta.url), "utf8")),
  fr: JSON.parse(readFileSync(new URL("../src/i18n/fr.json", import.meta.url), "utf8")),
};
const NBSP = String.fromCharCode(0xa0);
// The home screen is in the app's colours (src/styles.css, "01 Check"): navy, red (Call 911 and nothing else), ink on
// the beige page, a white card, and the beige field (the ground of its drawing).
const NAVY = "rgb(27, 42, 74)";
const RED = "rgb(217, 45, 32)";
const INK = "rgb(26, 29, 33)";
const PAGE = "rgb(250, 246, 240)";
const WHITE = "rgb(255, 255, 255)";
const FIELD = "rgb(237, 230, 218)";
const URL_SENT = "https://smoke-or-fire.vercel.app";
const TEXT = {
  en: "Smoke or Fire? tells you where the smoke is coming from. Nothing to install:",
  fr: `Fumée ou feu${NBSP}? vous dit d’où vient la fumée. Rien à installer${NBSP}:`,
};
const SMS = (lang: Lang) => `sms:?&body=${encodeURIComponent(`${TEXT[lang]} ${URL_SENT}`)}`;
const LINE = {
  en: { add: "Add to home screen", send: "Send to someone" },
  fr: { add: "Ajouter à l’écran d’accueil", send: "Envoyer à quelqu’un" },
};
/** The line's former label, gone: the two links alone. */
const NO_LABEL = { en: "Keep it on your phone", fr: "Gardez-la sur votre téléphone" };
const STEPS = {
  iphone: {
    en: "In Safari, tap the Share button (the square with an arrow; on newer iPhones, tap ••• first), then “Add to Home Screen”.",
    fr: `Dans Safari, touchez le bouton Partager (le carré avec une flèche${NBSP}; sur les iPhone récents, touchez d’abord •••), puis «${NBSP}Sur l’écran d’accueil${NBSP}».`,
  },
  android: {
    en: "In Chrome, tap the menu (three dots), then “Add to Home screen” or “Install app”.",
    fr: `Dans Chrome, touchez le menu (trois points), puis «${NBSP}Ajouter à l’écran d’accueil${NBSP}» ou «${NBSP}Installer l’application${NBSP}».`,
  },
};
const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36",
};

async function start(page: Page, lang: Lang, mode: "replay" | "live" = "replay") {
  await page.goto(`/?mode=${mode}`);
  await page.waitForFunction((m) => sessionStorage.getItem("smoke-or-fire")?.includes(`"mode":"${m}"`), mode);
  if (lang === "fr") await toFrench(page);
}
const addLink = (page: Page, lang: Lang) => page.getByRole("button", { name: LINE[lang].add, exact: true });
const sendLink = (page: Page, lang: Lang) => page.getByRole("link", { name: LINE[lang].send, exact: true });
/** The dot between the two links, in their own line (the last thing on the screen). */
const dotBetween = (page: Page) => page.locator("main > div").last().getByText("·", { exact: true });
const sheet = (page: Page) => page.getByRole("dialog");

/** The browser offers its install prompt, as Chrome does once the page is installable; the test sees what the app does with it. */
const offerPrompt = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __prompts: number; __prevented: boolean };
    w.__prompts = 0;
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: () => { w.__prompts++; return Promise.resolve({ outcome: "accepted" }); },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);
    w.__prevented = event.defaultPrevented;
  });
const prompts = (page: Page) => page.evaluate(() => (window as unknown as { __prompts: number }).__prompts);

/** Opened from the home screen: Android's standalone display, or an iPhone's home-screen web app. */
function standalone(how: "display-mode" | "iphone") {
  if (how === "iphone") {
    Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
    return;
  }
  const matchMedia = window.matchMedia.bind(window);
  window.matchMedia = (query: string) => (/display-mode:\s*standalone/.test(query) ? ({ matches: true, media: query } as MediaQueryList) : matchMedia(query));
}

/** A share sheet that records what it was given, and settles as told: shared, closed (AbortError) or refused. */
function shareSheet(outcome: "shared" | "AbortError" | "NotAllowedError") {
  const w = window as unknown as { __shared: ShareData[] };
  w.__shared = [];
  Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: (data: ShareData) => {
      w.__shared.push(data);
      return outcome === "shared" ? Promise.resolve() : Promise.reject(new DOMException("", outcome));
    },
  });
}
const shared = (page: Page) => page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared);


test.describe("the home-screen icon", () => {
  test("the built site serves the manifest and its icons, and the page links them", async ({ page, request }) => {
    await page.goto("/");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    const response = await request.get(href!);
    expect(response.headers()["content-type"]).toContain("application/manifest+json");
    const manifest = await response.json(); // a missing file would come back as the app's page, not JSON
    expect(manifest).toMatchObject({ name: `Smoke or Fire? / Fumée ou feu${NBSP}?`, short_name: "Smoke or Fire", start_url: "/", display: "standalone", background_color: "#FAF6F0", theme_color: "#1B2A4A" });

    const pngs = [...manifest.icons.map((i: { src: string }) => i.src), await page.locator('link[rel="apple-touch-icon"]').getAttribute("href"), await page.locator('link[rel="icon"]').getAttribute("href")];
    expect(pngs).toEqual(["/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-192.png", "/icons/maskable-512.png", "/icons/apple-touch-icon.png", "/icons/icon-192.png"]);
    for (const src of pngs) {
      const icon = await request.get(src);
      expect(icon.headers()["content-type"], src).toBe("image/png");
      expect([...(await icon.body()).subarray(0, 8)], src).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // the PNG signature
    }
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "Smoke or Fire");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#FAF6F0");
  });

  // In full Chromium: the headless shell the other tests run in answers "no installability errors" for any page.
  test.describe("in full Chromium", () => {
    test.describe.configure({ timeout: 90_000 }); // a second browser: slow to start on a busy machine
    let browser: Browser;
    test.beforeAll(async ({ playwright }) => { browser = await playwright.chromium.launch({ channel: "chromium" }); });
    test.afterAll(async () => { await browser?.close(); });

    /** The page, and Chrome's installability errors less "in-incognito" (a test browser is always a private window). */
    async function open(baseURL: string, broken = false) {
      const page = await browser.newPage();
      if (broken) {
        await page.route("**/manifest.webmanifest", async (route) => {
          const manifest = await (await route.fetch()).json();
          await route.fulfill({ contentType: "application/manifest+json", body: JSON.stringify({ ...manifest, icons: [] }) });
        });
      }
      await page.goto(baseURL);
      const cdp = await page.context().newCDPSession(page);
      await page.waitForTimeout(500);
      const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
      return { page, cdp, errors: installabilityErrors.map((e) => e.errorId).filter((id) => id !== "in-incognito") };
    }

    test("Chrome reads the manifest with no errors and finds the site installable, with no service worker", async ({ baseURL }) => {
      const { page, cdp, errors } = await open(baseURL!);
      const manifest = await cdp.send("Page.getAppManifest");
      expect([manifest.url.endsWith("/manifest.webmanifest"), manifest.errors]).toEqual([true, []]);
      expect(errors).toEqual([]);
      expect(await page.evaluate(async () => (await navigator.serviceWorker?.getRegistrations())?.length ?? 0)).toBe(0);
    });

    test("the check can fail: the same manifest without its icons is not installable", async ({ baseURL }) => {
      expect((await open(baseURL!, true)).errors).toContain("no-acceptable-icon");
    });
  });
});

for (const lang of ["en", "fr"] as const) {
  test.describe(`Keep it on your phone, ${lang.toUpperCase()}`, () => {
    test("one small line under How it works: Add to home screen · Send to someone, with no label", async ({ page }) => {
      await start(page, lang);
      const how = (await page.getByRole("link", { name: STRINGS[lang]["check.howItWorks"] }).boundingBox())!;
      await expect(addLink(page, lang)).toBeVisible();
      await expect(sendLink(page, lang)).toBeVisible();
      await expect(page.getByText(NO_LABEL[lang], { exact: false })).toHaveCount(0);
      const add = (await addLink(page, lang).boundingBox())!;
      const send = (await sendLink(page, lang).boundingBox())!;
      expect(add.y).toBeGreaterThanOrEqual(how.y + how.height);
      // English: one line, with the dot between; French: one under the other when they don't fit side by side.
      if (lang === "en") {
        expect(send.y).toBe(add.y);
        await expect(dotBetween(page)).toBeVisible();
      }
      // Text links: navy, underlined, no fill; 56 px to tap, text at least 16 px.
      for (const link of [addLink(page, lang), sendLink(page, lang)]) {
        expect(await link.evaluate((el) => { const s = getComputedStyle(el); return [s.color, s.textDecorationLine, s.backgroundColor]; })).toEqual([NAVY, "underline", "rgba(0, 0, 0, 0)"]);
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(56);
      }
      const sizes = await page.locator("main > div").last().evaluate((line) => [...line.querySelectorAll("*")].map((el) => parseFloat(getComputedStyle(el).fontSize)));
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);
    });

    test.describe("Android, the browser offers its install prompt", () => {
      test.use({ userAgent: UA.android });

      test("Add to home screen opens it", async ({ page }) => {
        await start(page, lang);
        await offerPrompt(page);
        expect(await page.evaluate(() => (window as unknown as { __prevented: boolean }).__prevented)).toBe(true); // not shown by itself over I smell smoke
        await addLink(page, lang).click();
        expect(await prompts(page)).toBe(1);
        await expect(sheet(page)).toHaveCount(0);
        // A prompt opens once: after it, the link shows the Android steps.
        await addLink(page, lang).click();
        expect(await prompts(page)).toBe(1);
        await expect(sheet(page).locator("p")).toHaveText([STEPS.android[lang]]);
      });

      test("a prompt offered on another screen is kept until Check", async ({ page }) => {
        await start(page, lang);
        await page.getByRole("link", { name: STRINGS[lang]["check.howItWorks"] }).click();
        await offerPrompt(page);
        await page.getByRole("link", { name: STRINGS[lang]["nav.back"] }).click();
        await addLink(page, lang).click();
        expect(await prompts(page)).toBe(1);
        await expect(sheet(page)).toHaveCount(0);
      });

      test("if the prompt fails, the Android steps instead", async ({ page }) => {
        await start(page, lang);
        await page.evaluate(() => {
          const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt: () => Promise.reject(new DOMException("", "InvalidStateError")) });
          window.dispatchEvent(event);
        });
        await addLink(page, lang).click();
        await expect(sheet(page).locator("p")).toHaveText([STEPS.android[lang]]);
      });

      test("once installed from the browser, Add to home screen goes; Send to someone stays", async ({ page }) => {
        await start(page, lang);
        await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
        await expect(addLink(page, lang)).toHaveCount(0);
        await expect(dotBetween(page)).toHaveCount(0);
        await expect(sendLink(page, lang)).toBeVisible();
      });
    });

    test("on a computer, Chrome's own prompt would install the app there: both phones' steps instead; installing there keeps the link", async ({ page }) => {
      await start(page, lang);
      await offerPrompt(page);
      await addLink(page, lang).click();
      expect(await prompts(page)).toBe(0);
      await expect(sheet(page).locator("p")).toHaveText([`iPhone${STEPS.iphone[lang]}`, `Android${STEPS.android[lang]}`]);
      await page.keyboard.press("Escape");
      await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
      await expect(addLink(page, lang)).toBeVisible();
      await expect(sendLink(page, lang)).toBeVisible();
    });

    for (const how of ["display-mode", "iphone"] as const) {
      test(`opened from the home screen (${how === "iphone" ? "iPhone" : "standalone display"}): no Add to home screen; Send to someone stays`, async ({ page }) => {
        await page.addInitScript(standalone, how);
        await start(page, lang);
        await expect(sendLink(page, lang)).toBeVisible();
        await expect(addLink(page, lang)).toHaveCount(0);
        await expect(dotBetween(page)).toHaveCount(0);
      });
    }

    test("Send to someone: the share sheet gets the sentence and the address; nothing else opens", async ({ page }) => {
      await page.addInitScript(shareSheet, "shared");
      await start(page, lang);
      const asked = await navigations(page);
      await sendLink(page, lang).click();
      expect(await shared(page)).toEqual([{ text: TEXT[lang], url: URL_SENT }]);
      await page.waitForTimeout(300);
      expect(asked.filter((url) => url.startsWith("sms:"))).toEqual([]);
    });

    test("Send to someone, share sheet closed without sending: nothing else opens", async ({ page }) => {
      await page.addInitScript(shareSheet, "AbortError");
      await start(page, lang);
      const asked = await navigations(page);
      await sendLink(page, lang).click();
      expect(await shared(page)).toHaveLength(1);
      await page.waitForTimeout(300);
      expect(asked.filter((url) => url.startsWith("sms:"))).toEqual([]);
    });

    test("Send to someone, sharing refused: a text message with the sentence and the address", async ({ page }) => {
      await page.addInitScript(shareSheet, "NotAllowedError");
      await start(page, lang);
      const asked = await navigations(page);
      await sendLink(page, lang).click();
      await expect.poll(() => asked.filter((url) => url.startsWith("sms:"))).toEqual([SMS(lang)]);
    });

    test("Send to someone with no share sheet: a text message with the sentence and the address", async ({ page }) => {
      await page.addInitScript(() => Object.defineProperty(navigator, "share", { configurable: true, value: undefined }));
      await start(page, lang);
      await expect(sendLink(page, lang)).toHaveAttribute("href", SMS(lang));
      const asked = await navigations(page);
      await sendLink(page, lang).click();
      await expect.poll(() => asked.filter((url) => url.startsWith("sms:"))).toEqual([SMS(lang)]);
    });

    for (const phone of ["iphone", "android"] as const) {
      test.describe(`${phone === "iphone" ? "iPhone" : "Android"}, no install prompt`, () => {
        test.use({ userAgent: UA[phone] });
        test("Add to home screen shows the steps for this phone in a sheet; Close, Escape or a tap outside closes it", async ({ page }) => {
          await start(page, lang);
          const add = addLink(page, lang);
          await add.click();
          await expect(sheet(page)).toBeVisible();
          await expect(sheet(page).getByRole("heading", { name: LINE[lang].add })).toBeVisible();
          await expect(sheet(page).locator("p")).toHaveText([STEPS[phone][lang]]);
          const close = sheet(page).getByRole("button", { name: STRINGS[lang]["tip.close"] });
          expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(56);
          await close.click();
          await expect(sheet(page)).toHaveCount(0);
          await expect(add).toBeFocused(); // back where the person was

          await add.click();
          await expect(sheet(page)).toBeVisible(); // it opens again
          await page.keyboard.press("Escape");
          await expect(sheet(page)).toHaveCount(0);

          await add.click();
          await expect(sheet(page)).toBeVisible();
          await page.mouse.click(20, 20); // the dimmed screen above the sheet
          await expect(sheet(page)).toHaveCount(0);
        });
      });
    }

    test("on a computer (no install prompt): both phones' steps, each under its name", async ({ page }) => {
      await start(page, lang);
      await addLink(page, lang).click();
      await expect(sheet(page).locator("p")).toHaveText([`iPhone${STEPS.iphone[lang]}`, `Android${STEPS.android[lang]}`]);
    });

    // The sheet covers the screen's Call 911, so it carries its own Call 911 button.
    test("on a computer, the sheet ends with its own Call 911 button: one, red, 56 px or taller, after the steps; Close has the focus", async ({ page }) => {
      await start(page, lang);
      await addLink(page, lang).click();
      await expect(sheet(page)).toBeVisible();
      const call = sheet(page).locator('a[href="tel:911"]');
      await expect(call).toHaveCount(1);
      await expect(call).toBeVisible();
      await expect(call).toHaveText(STRINGS[lang]["sticky.call"]);
      await expect(call.locator("svg")).toHaveCount(1); // the phone
      await expect(call).toHaveClass(/(^|\s)press(\s|$)/);
      // Red with white text, 56 px to tap, in the flow of the sheet (not fixed over the steps).
      const look = await call.evaluate((el) => { const s = getComputedStyle(el); return [s.backgroundColor, s.color, s.position]; });
      expect(look.slice(0, 2)).toEqual([RED, WHITE]);
      expect(["static", "relative"]).toContain(look[2]);
      const box = (await call.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(56);
      expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
      // The last thing in the sheet's card, straight after the steps, and under them on the screen.
      const place = await call.evaluate((el) => {
        const card = el.closest("dialog")!.firstElementChild!;
        return [el.parentElement === card, card.lastElementChild === el, el.previousElementSibling?.tagName];
      });
      expect(place).toEqual([true, true, "P"]);
      const steps = sheet(page).locator("p");
      await expect(steps).toHaveText([`iPhone${STEPS.iphone[lang]}`, `Android${STEPS.android[lang]}`]); // still the steps alone: the button is no paragraph
      const last = (await steps.last().boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(last.y + last.height);
      await expect(sheet(page).getByRole("button", { name: STRINGS[lang]["tip.close"] })).toBeFocused(); // as before: Close, not Call 911
    });
  });
}

test.describe("the two links: one row with the dot when they fit, else one under the other with no dot", () => {
  const row = async (page: Page, lang: Lang) => {
    await page.evaluate(() => document.fonts.ready);
    const [add, send] = [(await addLink(page, lang).boundingBox())!, (await sendLink(page, lang).boundingBox())!];
    const dot = dotBetween(page);
    return { add, send, dots: await dot.count(), dotVisible: (await dot.count()) > 0 && (await dot.isVisible()) };
  };

  for (const width of [390, 375]) {
    test(`English at ${width} px: one row, with the dot between the links`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await start(page, "en");
      const { add, send, dotVisible } = await row(page, "en");
      expect(dotVisible).toBe(true);
      expect(send.y).toBe(add.y);
      expect(send.x).toBeGreaterThan(add.x + add.width);
    });
  }

  test("French at 375 px: Add to home screen above Send to someone, both centred, no dot", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await start(page, "fr");
    const { add, send, dots } = await row(page, "fr");
    expect(dots).toBe(0);
    expect(send.y).toBeGreaterThanOrEqual(add.y + add.height);
    expect(Math.abs(add.x + add.width / 2 - (send.x + send.width / 2))).toBeLessThan(1);
  });

  test("switching language rearranges them: English one row, French stacked, English one row again", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await start(page, "en");
    expect((await row(page, "en")).dotVisible).toBe(true);
    await page.getByRole("button", { name: "Français" }).click();
    await expect(dotBetween(page)).toHaveCount(0);
    await page.getByRole("button", { name: "English", exact: true }).click();
    await expect(dotBetween(page)).toBeVisible();
  });

  test("at 320 px (the narrowest phones), English stacks too, and nothing is wider than the screen", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await start(page, "en");
    const { add, send, dots } = await row(page, "en");
    expect(dots).toBe(0);
    expect(send.y).toBeGreaterThanOrEqual(add.y + add.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    expect(Math.max(add.x + add.width, send.x + send.width)).toBeLessThanOrEqual(320);
  });
});

// Check, the home screen. Top to bottom: the app's mark and name (the screen's title), Listen and the other language;
// one card (the drawing, what the app is for, the Live / Replay switch and, in the replay, a line about it) that is no
// taller than what it holds; I smell smoke; the line about location; the screen's own Call 911 (no 911 bar); How it
// works; the two links. The drawing is as tall as the room the screen has left (on a short phone, the strip at its
// foot), so that everything is on the screen with nothing to scroll.
type Box = { name: string; left: number; top: number; right: number; bottom: number };
/** The replay option's words as a screen reader has them: its name, a dot, its day. */
const replayLabel = (lang: Lang) => `${STRINGS[lang]["check.replayName"]} · ${STRINGS[lang]["check.replayDay"].replaceAll(NBSP, " ")}`;

for (const [width, height] of [[375, 667], [390, 844]] as const) {
  test.describe(`Check at ${width} × ${height}: all on screen, nothing to scroll, nothing overlaps, equal side margins, one Call 911 of its own`, () => {
    test.use({ viewport: { width, height } });
    for (const lang of ["en", "fr"] as const) {
      for (const mode of ["replay", "live"] as const) {
        test(`${lang.toUpperCase()}, ${mode}`, async ({ page }) => {
          await start(page, lang, mode);
          await page.evaluate(() => document.fonts.ready);
          const parts = await page.evaluate(() => {
            const top = document.querySelector("header")!;
            const main = document.querySelector("main")!;
            const box = (el: Element | null) => {
              if (!el) return null;
              const r = el.getBoundingClientRect();
              return { name: (el.textContent ?? "").trim() || el.tagName, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
            };
            const [listen, other] = [...top.querySelectorAll("button")].map(box);
            return {
              brand: box(top.querySelector("h1")), // the app's mark and name
              listen,
              other, // the other language
              picture: box(main.querySelector("section svg[role=img]")),
              line: box(main.querySelector("section p")), // what the app is for
              data: box(main.querySelector("[role=group]")), // Live / Replay
              recorded: box(main.querySelector("#home-recorded")), // the replay's line: none in live
              check: box(main.querySelector('a[href="/q1"]')),
              note: box(main.querySelector("#home-privacy")),
              call: box(main.querySelector('a[href="tel:911"]')),
              how: box(main.querySelector('a[href="/how-it-works"]')),
              links: [...main.lastElementChild!.querySelectorAll("a, button")].map(box),
            };
          });
          expect(parts.recorded === null, "the replay's line is there in the replay alone").toBe(mode === "live");
          const { links, ...named } = parts;
          const boxes = [...Object.values(named), ...links].filter((box): box is Box => box !== null);
          expect(boxes).toHaveLength(mode === "replay" ? 13 : 12);
          for (const box of boxes) {
            expect(box.left, box.name).toBeGreaterThanOrEqual(0);
            expect(box.right, box.name).toBeLessThanOrEqual(width);
            expect(box.top, box.name).toBeGreaterThanOrEqual(0);
            expect(box.bottom, box.name).toBeLessThanOrEqual(height);
          }
          for (const [i, a] of boxes.entries()) {
            for (const b of boxes.slice(i + 1)) {
              const overlap = a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
              expect(overlap, `${a.name} / ${b.name}`).toBe(false);
            }
          }
          const brand = parts.brand!, other = parts.other!, picture = parts.picture!, line = parts.line!, data = parts.data!;
          const check = parts.check!, note = parts.note!, call = parts.call!, how = parts.how!;
          // The same margin on both sides: the two buttons, the name at the top left, the language at the top right.
          expect(Math.round(width - check.right)).toBe(Math.round(check.left));
          expect([Math.round(call.left), Math.round(call.right)]).toEqual([Math.round(check.left), Math.round(check.right)]);
          expect(Math.round(brand.left)).toBe(Math.round(check.left));
          expect(Math.round(width - other.right)).toBe(Math.round(check.left));
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
          // Nothing to scroll: the page is as tall as the screen.
          expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(height);

          // The top: a tenth of the screen, 56 px or more.
          const top = (await page.locator("header").boundingBox())!;
          expect(Math.round(top.height)).toBeGreaterThanOrEqual(Math.max(56, Math.round(height / 10)));

          // The card: white, with a soft shadow, and no taller than what it holds. From its top edge down: the drawing,
          // as wide as the card; the line; the switch; in the replay, its line. No gap among them is over 16 px.
          const card = page.locator("main section");
          const around = (await card.boundingBox())!;
          expect(await card.evaluate((el) => { const s = getComputedStyle(el); return [s.backgroundColor, s.boxShadow !== "none"]; })).toEqual([WHITE, true]);
          expect([picture.left, picture.top, picture.right].map((px) => Math.round(px))).toEqual([around.x, around.y, around.x + around.width].map((px) => Math.round(px)));
          const inCard = [picture, line, data, ...(parts.recorded ? [parts.recorded] : [])];
          for (const [i, part] of inCard.entries()) {
            const next = inCard[i + 1]?.top ?? around.y + around.height;
            expect(next - part.bottom, `under “${part.name}”`).toBeGreaterThanOrEqual(0);
            expect(next - part.bottom, `under “${part.name}”`).toBeLessThanOrEqual(16);
          }
          await expect(card.locator("h1, h2, h3")).toHaveCount(0); // no title in the card: the name is at the top
          await expect(card.locator("p").first()).toHaveText(STRINGS[lang]["check.tagline"]);
          // Under the card: I smell smoke 12 px or more under it, its line, Call 911, How it works.
          expect(check.top - (around.y + around.height)).toBeGreaterThanOrEqual(12);
          expect([note.top >= check.bottom, call.top >= note.bottom, how.top >= call.bottom]).toEqual([true, true, true]);

          // The drawing: one picture with a description in the screen's language. Between 80 px tall and half its
          // width (all of it); never taller than that, so it is never cut at the sides. Its three parts are whole
          // however much of the sky is cut: the small fire at the upwind end, the wind's arrow, the house.
          const drawing = page.getByRole("img", { name: STRINGS[lang]["check.picture"], exact: true });
          await expect(drawing).toHaveCount(1);
          await expect(card.locator("svg[role=img]")).toHaveAttribute("aria-label", STRINGS[lang]["check.picture"]);
          const tall = picture.bottom - picture.top;
          expect(tall).toBeGreaterThanOrEqual(80);
          expect(tall).toBeLessThanOrEqual((picture.right - picture.left) / 2 + 0.5);
          if (height > 740) expect(Math.round(tall)).toBe(Math.round((picture.right - picture.left) / 2));
          const [fire, wind, house] = await drawing.evaluate((svg) => [".pic-fire", ".pic-wind", ".pic-house"].map((part) => {
            const r = svg.querySelector(part)!.getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
          }));
          for (const [name, part] of Object.entries({ fire, wind, house })) {
            expect([part.left >= picture.left, part.right <= picture.right, part.top >= picture.top, part.bottom <= picture.bottom], `the ${name} is whole`).toEqual([true, true, true, true]);
          }
          expect([fire.right < wind.left, wind.right < house.left], "the fire, the arrow, the house").toEqual([true, true]);
          expect(fire.bottom - fire.top, "the fire is small beside the house").toBeLessThan((house.bottom - house.top) / 2);

          // The switch: two options the same size, 48 px or more to tap. The one in use is pressed, filled navy and
          // ticked; the other is navy words. The replay's option is its name, a dot and its day.
          const options = card.getByRole("group", { name: STRINGS[lang]["check.modeGroup"] }).getByRole("button");
          await expect(options).toHaveText([STRINGS[lang]["check.live"], replayLabel(lang)]);
          expect(await options.evaluateAll((els) => els.map((el) => el.getAttribute("aria-pressed")))).toEqual(mode === "live" ? ["true", "false"] : ["false", "true"]);
          const [live, replay] = [(await options.nth(0).boundingBox())!, (await options.nth(1).boundingBox())!];
          expect([Math.abs(live.width - replay.width) < 0.5, Math.abs(live.height - replay.height) < 0.5, Math.abs(live.y - replay.y) < 0.5], `${JSON.stringify(live)} ${JSON.stringify(replay)}`).toEqual([true, true, true]);
          expect(live.height).toBeGreaterThanOrEqual(48);
          const looks = await options.evaluateAll((els) => els.map((el) => { const s = getComputedStyle(el); return [s.backgroundColor, s.color, el.querySelectorAll("svg").length]; }));
          const [used, unused] = mode === "live" ? looks : [looks[1], looks[0]];
          expect(used).toEqual([NAVY, WHITE, 1]);
          expect(unused).toEqual(["rgba(0, 0, 0, 0)", NAVY, 0]);
          // In the replay, one small line under the switch says what it is; the option is described by it.
          const recorded = page.locator("#home-recorded");
          if (mode === "replay") {
            await expect(recorded).toHaveText(STRINGS[lang]["check.replayNote"]);
            expect(await recorded.evaluate((el) => getComputedStyle(el).fontSize)).toBe("14px");
            await expect(options.nth(1)).toHaveAttribute("aria-describedby", "home-recorded");
          } else {
            await expect(recorded).toHaveCount(0);
            expect(await options.nth(1).getAttribute("aria-describedby")).toBeNull();
          }

          // I smell smoke: filled navy, white words, 64 px or more to tap; its sign is the mark's two wisps of smoke.
          const smell = page.locator('main a[href="/q1"]');
          expect(await smell.evaluate((el) => { const s = getComputedStyle(el); return [s.backgroundColor, s.color]; })).toEqual([NAVY, WHITE]);
          expect(check.bottom - check.top).toBeGreaterThanOrEqual(64);
          const wisps = (svg: Element) => [...svg.querySelectorAll("path")].map((path) => path.getAttribute("d"));
          const mark = await page.locator("header h1 svg").evaluate(wisps);
          expect(mark).toHaveLength(2);
          expect(await smell.locator("svg").evaluate(wisps)).toEqual(mark);
          // Call 911: the screen's own, in the screen itself (no 911 bar), outlined red on white, 64 px or more to tap;
          // it says what was seen and the number it dials.
          const call911 = page.locator('a[href="tel:911"]');
          await expect(call911).toHaveCount(1);
          await expect(page.locator('main a[href="tel:911"]')).toHaveCount(1);
          expect(await call911.locator("..").evaluate((el) => getComputedStyle(el).position)).not.toBe("fixed");
          await expect(call911).toContainText(STRINGS[lang]["check.flames"]);
          await expect(call911).toContainText(STRINGS[lang]["sticky.call"]);
          expect(await call911.evaluate((el) => { const s = getComputedStyle(el); return [s.backgroundColor, s.color, s.borderTopColor, s.borderTopWidth, s.borderTopStyle]; })).toEqual([WHITE, RED, RED, "2px", "solid"]);
          expect(call.bottom - call.top).toBeGreaterThanOrEqual(64);
        });
      }
    }
  });
}

test("Check: what the card says, in English and French: where the smoke is coming from, with no promise of how long it takes; Live, and the replay with its day and its line", async ({ page }) => {
  await start(page, "en");
  const card = page.locator("main section");
  await expect(card.locator("p").first()).toHaveText("Find out where the smoke is coming from.");
  await expect(card.locator("svg[role=img]")).toHaveAttribute("aria-label", "Illustration: the wind carries smoke from a distant fire to a house.");
  const options = card.getByRole("group", { name: "Data mode" }).getByRole("button");
  await expect(options).toHaveText(["Live", "Replay · Aug 25, 2025"]);
  await expect(options.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(card.locator("p").last()).toHaveText("A recorded day, for demonstration.");
  await expect(page.locator("main")).not.toContainText(/60|second|minute/i);

  await toFrench(page);
  await expect(card.locator("p").first()).toHaveText("Découvrez d’où vient la fumée.");
  await expect(card.locator("svg[role=img]")).toHaveAttribute("aria-label", `Illustration${NBSP}: le vent porte la fumée d’un feu lointain jusqu’à une maison.`);
  await expect(card.getByRole("group", { name: "Mode de données" }).getByRole("button")).toHaveText(["En direct", "Reprise · 25 août 2025"]);
  await expect(card.locator("p").last()).toHaveText("Une journée enregistrée, pour la démonstration.");
  await expect(page.locator("main")).not.toContainText(/60|seconde|minute/i);
});

test("Check: the switch changes the data the check reads, by tap and by keyboard; its line comes and goes with the replay; the focus ring shows on both options", async ({ page }) => {
  await start(page, "en");
  const stored = (mode: string) => page.waitForFunction((m) => sessionStorage.getItem("smoke-or-fire")?.includes(`"mode":"${m}"`), mode);
  const live = page.getByRole("button", { name: "Live", exact: true });
  const replay = page.getByRole("button", { name: /^Replay/ });
  const line = page.getByText("A recorded day, for demonstration.", { exact: true });
  await expect(line).toBeVisible();

  await live.click();
  await stored("live");
  await expect(live).toHaveAttribute("aria-pressed", "true");
  await expect(replay).toHaveAttribute("aria-pressed", "false");
  await expect(live.locator("svg")).toHaveCount(1);
  await expect(replay.locator("svg")).toHaveCount(0);
  await expect(line).toHaveCount(0);
  // The option in use does nothing more when tapped again.
  await live.click();
  await expect(live).toHaveAttribute("aria-pressed", "true");

  // By keyboard: after the language link, Live, then the replay. The ring is inside the option, 3 px: white on the
  // filled one, navy on the other.
  const ring = (el: Element) => { const s = getComputedStyle(el); return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.outlineOffset]; };
  await page.getByRole("button", { name: "Français", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(live).toBeFocused();
  expect(await live.evaluate(ring)).toEqual(["solid", "3px", WHITE, "-5px"]);
  await page.keyboard.press("Tab");
  await expect(replay).toBeFocused();
  expect(await replay.evaluate(ring)).toEqual(["solid", "3px", NAVY, "-5px"]);
  await page.keyboard.press("Enter");
  await stored("replay");
  await expect(replay).toHaveAttribute("aria-pressed", "true");
  await expect(live).toHaveAttribute("aria-pressed", "false");
  await expect(line).toBeVisible();
  expect(await replay.evaluate(ring)).toEqual(["solid", "3px", WHITE, "-5px"]);
});

test("Check: the replay option’s name and day sit one over the other on a phone, their dot out of sight; from 480 px wide they are on one line with the dot", async ({ page }) => {
  for (const lang of ["en", "fr"] as const) {
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page, lang);
    await page.evaluate(() => document.fonts.ready);
    const options = page.getByRole("group", { name: STRINGS[lang]["check.modeGroup"] }).getByRole("button");
    await expect(options).toHaveText([STRINGS[lang]["check.live"], replayLabel(lang)]);
    const option = options.nth(1);
    const words = () => option.evaluate((el) => [...el.querySelectorAll("span > span")].map((part) => {
      const r = part.getBoundingClientRect();
      return { text: part.textContent, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width };
    }));
    let [name, dot, day] = await words();
    expect([name.text, dot.text!.trim(), day.text]).toEqual([STRINGS[lang]["check.replayName"], "·", STRINGS[lang]["check.replayDay"]]);
    expect(day.top, "the day is under the name").toBeGreaterThanOrEqual(name.bottom - 0.5);
    expect(Math.abs((name.left + name.right) / 2 - (day.left + day.right) / 2), "both centred").toBeLessThan(1);
    expect(dot.width).toBeLessThanOrEqual(1);
    const narrow = (await option.boundingBox())!;

    await page.setViewportSize({ width: 480, height: 844 });
    [name, dot, day] = await words();
    expect([name.right <= dot.left + 0.5, dot.right <= day.left + 0.5], "the name, the dot, the day").toEqual([true, true]);
    expect(dot.width).toBeGreaterThan(1);
    expect(Math.abs((name.top + name.bottom) / 2 - (day.top + day.bottom) / 2), "on one line").toBeLessThan(2);
    const wide = (await option.boundingBox())!;
    expect(wide.height).toBeLessThanOrEqual(narrow.height);
    // Still the same size as Live.
    const live = (await options.nth(0).boundingBox())!;
    expect([Math.abs(live.width - wide.width) < 0.5, Math.abs(live.height - wide.height) < 0.5]).toEqual([true, true]);
  }
});

test("Check: the app’s mark and name are at the top, small, and are the screen’s title; the language link names the other language in its own words, with no flag; Listen is on its line, in the same type", async ({ page }) => {
  await start(page, "en");
  const top = page.locator("header");
  await expect(top.locator("h1")).toHaveText("Smoke or Fire?");
  // The one title on the screen, and the name's one place on it: the card under it has none.
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("main")).not.toContainText("Smoke or Fire?");
  // The mark: the navy tile of the home-screen icon, 24 px, left of the name.
  const mark = top.locator("h1 svg");
  await expect(mark).toHaveCount(1);
  expect(await mark.evaluate((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), getComputedStyle(el.querySelector("rect")!).fill]; })).toEqual([24, 24, NAVY]);
  const french = top.getByRole("button", { name: "Français", exact: true });
  await expect(french).toHaveAttribute("lang", "fr"); // said as French by a screen reader
  await expect(top.getByRole("button", { name: "English", exact: true })).toHaveCount(0);
  await expect(top.locator("img")).toHaveCount(0);
  await expect(french.locator("svg")).toHaveCount(0);
  // Listen beside it: the same size, weight and colour of type, on the same line; both 56 px to tap.
  const listen = top.getByRole("button", { name: "Listen", exact: true });
  const type = (el: Element) => { const s = getComputedStyle(el); return [s.fontFamily, s.fontSize, s.fontWeight, s.color]; };
  expect(await listen.evaluate(type)).toEqual(await french.evaluate(type));
  const [a, b] = [(await listen.boundingBox())!, (await french.boundingBox())!];
  expect(Math.abs(a.y + a.height / 2 - (b.y + b.height / 2))).toBeLessThan(1);
  expect(Math.min(a.height, b.height)).toBeGreaterThanOrEqual(56);

  await french.click();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(top.locator("h1")).toHaveText(STRINGS.fr["check.title"]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(STRINGS.fr["check.title"]);
  await expect(top.getByRole("button", { name: "Écouter", exact: true })).toBeVisible();
  const english = top.getByRole("button", { name: "English", exact: true });
  await expect(english).toHaveAttribute("lang", "en");
  await expect(top.getByRole("button", { name: "Français", exact: true })).toHaveCount(0);
  await english.click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Smoke or Fire?");
});

test("Check at 320 px wide: the name stays, and Listen and the language go under it", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  for (const lang of ["en", "fr"] as const) {
    await start(page, lang);
    await page.evaluate(() => document.fonts.ready);
    const name = page.getByRole("heading", { level: 1, name: STRINGS[lang]["check.title"] });
    await expect(name).toBeVisible();
    const [title, tools] = [(await name.boundingBox())!, (await page.locator("header > div").boundingBox())!];
    expect(tools.y).toBeGreaterThanOrEqual(title.y + title.height - 0.5);
    expect(tools.x + tools.width).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  }
});

test("Check: the app’s own type and colours: Inter, ink on the beige page, the name at the top in 14 px; the drawing has the map’s orange for its fire, and red is Call 911’s alone", async ({ page }) => {
  await start(page, "en");
  await page.evaluate(() => document.fonts.ready);
  const look = await page.evaluate((alert) => {
    const of = (el: Element) => getComputedStyle(el);
    const screen = document.querySelector("main")!.parentElement!;
    const name = document.querySelector("header h1")!;
    const red = [...document.querySelectorAll("body *")].filter((el) => {
      const s = of(el);
      return [s.color, s.backgroundColor, s.borderTopColor, s.stroke, s.fill].includes(alert);
    });
    return {
      face: of(screen).fontFamily.split(",")[0].trim(),
      text: of(screen).color,
      page: [of(screen).backgroundColor, of(document.body).backgroundColor],
      line: of(document.querySelector("main section p")!).color,
      name: [of(name).fontSize, of(name).color],
      fire: of(document.querySelector(".pic-fire")!).fill,
      ground: of(document.querySelector(".pic-ground")!).fill,
      red: red.length,
      redOutsideCall911: red.filter((el) => !el.closest('a[href="tel:911"]')).length,
    };
  }, RED);
  expect(look).toMatchObject({ face: "Inter", text: INK, page: [PAGE, PAGE], line: INK, name: ["14px", INK], fire: "rgb(232, 89, 12)", ground: FIELD, redOutsideCall911: 0 });
  expect(look.red).toBeGreaterThan(0);
  // One typeface is asked for: the app's own.
  const families = await page.locator('link[rel="stylesheet"][href*="fonts.googleapis.com"]').evaluateAll((links) => links.flatMap((link) => new URL((link as HTMLLinkElement).href).searchParams.getAll("family").map((family) => family.split(":")[0])));
  expect(families).toEqual(["Inter"]);
});
