// "Keep it on your phone" (Check): the home-screen icon from the manifest; "Add to home screen", which opens the browser's
// install prompt when it offered one, or else shows the steps for the phone, and is hidden when the app is open from the
// home screen; "Send to someone", with the phone's share sheet or else a text message. Nothing is installed or cached:
// there is no service worker.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { navigations } from "./navigations";

type Lang = "en" | "fr";
const STRINGS: Record<Lang, Record<string, string>> = {
  en: JSON.parse(readFileSync(new URL("../src/i18n/en.json", import.meta.url), "utf8")),
  fr: JSON.parse(readFileSync(new URL("../src/i18n/fr.json", import.meta.url), "utf8")),
};
const NBSP = String.fromCharCode(0xa0);
const URL_SENT = "https://smoke-or-fire.vercel.app";
const TEXT = {
  en: "Smoke or Fire? tells you in 60 seconds if the smoke you smell is from a known fire. Nothing to install:",
  fr: `Fumée ou feu${NBSP}? vous dit en 60 secondes si la fumée que vous sentez vient d’un feu connu. Rien à installer${NBSP}:`,
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
  if (lang === "fr") await page.getByRole("button", { name: "Français" }).click();
}
const addLink = (page: Page, lang: Lang) => page.getByRole("button", { name: LINE[lang].add, exact: true });
const sendLink = (page: Page, lang: Lang) => page.getByRole("link", { name: LINE[lang].send, exact: true });
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
        await expect(page.locator("main").getByText("·", { exact: true })).toBeVisible();
      }
      // Text links: navy, underlined, no fill; 56 px to tap, text at least 16 px.
      for (const link of [addLink(page, lang), sendLink(page, lang)]) {
        expect(await link.evaluate((el) => { const s = getComputedStyle(el); return [s.color, s.textDecorationLine, s.backgroundColor]; })).toEqual(["rgb(27, 42, 74)", "underline", "rgba(0, 0, 0, 0)"]);
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
        await expect(page.locator("main").getByText("·", { exact: true })).toHaveCount(0);
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
        await expect(page.locator("main").getByText("·", { exact: true })).toHaveCount(0);
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

    // The sheet covers the 911 bar, so it carries its own Call 911 button.
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
      expect(look.slice(0, 2)).toEqual(["rgb(217, 45, 32)", "rgb(255, 255, 255)"]);
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
    const dot = page.locator("main").getByText("·", { exact: true });
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
    await expect(page.locator("main").getByText("·", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.locator("main").getByText("·", { exact: true })).toBeVisible();
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

// Check, with the line: Listen and EN/FR, logo, title, tagline, I smell smoke, Live/Replay, How it works, the two links;
// and under them the 911 bar. On a short phone (up to 740 px tall) the logo is smaller and sits beside the title, so
// that everything is above the bar with nothing to scroll.
for (const [width, height] of [[375, 667], [390, 844]] as const) {
  test.describe(`Check at ${width} × ${height}: all on screen above the 911 bar, nothing to scroll, nothing overlaps, 16 px above I smell smoke, equal side margins`, () => {
    test.use({ viewport: { width, height } });
    for (const lang of ["en", "fr"] as const) {
      for (const mode of ["replay", "live"] as const) {
        test(`${lang.toUpperCase()}, ${mode}`, async ({ page }) => {
          await start(page, lang, mode);
          await page.evaluate(() => document.fonts.ready);
          const boxes = await page.evaluate(() => {
            const main = document.querySelector("main")!;
            const parts = [
              ...main.previousElementSibling!.children, // Listen, EN/FR
              main.querySelector(".check-head svg"),
              main.querySelector("h1"),
              main.querySelector(".check-tagline"),
              main.querySelector('a[href="/q1"]'),
              main.querySelector("[role=group]"),
              main.querySelector('a[href="/how-it-works"]'),
              ...main.lastElementChild!.querySelectorAll("a, button"),
            ];
            return parts.map((el) => {
              const r = el!.getBoundingClientRect();
              return { name: (el!.textContent ?? "").trim() || el!.tagName, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
            });
          });
          expect(boxes).toHaveLength(10);
          for (const box of boxes) {
            expect(box.left, box.name).toBeGreaterThanOrEqual(0);
            expect(box.right, box.name).toBeLessThanOrEqual(width);
            expect(box.top, box.name).toBeGreaterThanOrEqual(0);
            expect(box.bottom, box.name).toBeLessThanOrEqual(height);
          }
          // The 911 bar (the parent of its Call 911 button): fixed at the bottom, whole on the screen, and every part ends
          // at or above its top.
          const call = page.locator('a[href="tel:911"]');
          await expect(call).toHaveCount(1);
          expect(await call.locator("..").evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
          const bar = (await call.locator("..").boundingBox())!;
          expect([bar.x >= -0.5, bar.y >= 0, bar.x + bar.width <= width + 0.5, bar.y + bar.height <= height + 0.5], `911 bar: ${JSON.stringify(bar)}`).toEqual([true, true, true, true]);
          for (const box of boxes) expect(box.bottom, `${box.name}, above the 911 bar`).toBeLessThanOrEqual(bar.y);
          for (const [i, a] of boxes.entries()) {
            for (const b of boxes.slice(i + 1)) {
              const overlap = a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
              expect(overlap, `${a.name} / ${b.name}`).toBe(false);
            }
          }
          const [, langs, logo, title, tagline, cta] = boxes;
          expect(cta.top - tagline.bottom).toBeGreaterThanOrEqual(16);
          // The same margin on both sides: the button, and EN/FR at the top right.
          expect(Math.round(width - cta.right)).toBe(Math.round(cta.left));
          expect(Math.round(width - langs.right)).toBe(Math.round(cta.left));
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
          // Nothing to scroll: the page is as tall as the screen.
          expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(height);
          // The logo: 64 px, above the title; on a short phone 44 px, beside the title on the same row.
          const size = [logo.right - logo.left, logo.bottom - logo.top].map((px) => Math.round(px));
          if (height <= 740) {
            expect(size).toEqual([44, 44]);
            expect(logo.right, "the logo is left of the title").toBeLessThanOrEqual(title.left);
            const centre = (logo.top + logo.bottom) / 2;
            expect([centre >= title.top, centre <= title.bottom], `logo ${logo.top}–${logo.bottom}, title ${title.top}–${title.bottom}`).toEqual([true, true]);
          } else {
            expect(size).toEqual([64, 64]);
            expect(logo.bottom, "the logo is above the title").toBeLessThanOrEqual(title.top);
          }
        });
      }
    }
  });
}
