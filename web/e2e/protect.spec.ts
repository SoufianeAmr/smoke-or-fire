// "Protect your home": one button on the verdict opens a screen of its own. ECCC's air quality band, four icon tiles of
// Health Canada's advice (details and source on a tap), and a switch, "I have asthma or COPD", that shows ECCC's message
// for the at-risk population and stays on the device. In the replay (Aug 25, 2025) and live, in English and French.
import { test, type BrowserContext, type Page, type Request } from "@playwright/test";
import { readFileSync } from "node:fs";
import { TEST_ENGINE_URL } from "./engine";
import { BANDS, LANGS, TEST_TIMEOUT, answerAt, engine, expect, live, newCheck, open, protectButton, replay, start, verdictFor, type Band, type Lang } from "./protect";

test.describe.configure({ timeout: TEST_TIMEOUT });

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const APP: Record<Lang, Record<string, string>> = { en: JSON.parse(read("../src/i18n/en.json")), fr: JSON.parse(read("../src/i18n/fr.json")) };
type Text = Record<Lang, string>;
type Quote = Text & { source: string; items?: Text[] };
const CONTENT: {
  strings: Record<string, Text>;
  tiles: { id: string; icon: string; label: Text; note?: Text; quotes: Quote[] }[];
  atRisk: { source: string; messages: Record<Band, Text>; doctor: Text };
} = JSON.parse(read("../src/protect/content.json"));
const SOURCES: Record<string, { publisher: Text; title: Text; url: Text; modified: Text; retrieved: Text }> = JSON.parse(read("../src/protect/sources.json"));
const own = (lang: Lang, key: string, vars: Record<string, string | number> = {}) => CONTENT.strings[key][lang].replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
const KEY = "smoke-or-fire.protect.at-risk";
const NAVY = "rgb(27, 42, 74)";
const WHITE = "rgb(255, 255, 255)";
const sentences = (text: string) => text.split(/(?<=[.?!])\s+(?=\S)/);
const plain = (text: string | null) => (text ?? "").replace(/\s+/g, " ").trim();
/** A label inside a sentence or after a colon: "High risk" → "high risk". */
const lower = (text: string, lang: Lang) => text.charAt(0).toLocaleLowerCase(lang) + text.slice(1);
/** A source's date modified as the screen says it: its hyphens do not break, so the date stays on one line. */
const dated = (lang: Lang, id: string) => own(lang, "source.modified", { date: SOURCES[id].modified[lang].replaceAll("-", String.fromCharCode(0x2011)) });
/** The band as the screen says it: "Air quality: high risk". */
const bandLabel = (lang: Lang, level: Band) => own(lang, "band", { risk: lower(APP[lang][`aq.risk.${level}`], lang) });

// --- The screen's parts ----------------------------------------------------------------------------------------------
const main = (page: Page) => page.locator("main.protect-main");
const band = (page: Page) => main(page).locator("button.protect-band-toggle");
const tiles = (page: Page) => main(page).locator("li.protect-tile");
const tile = (page: Page, id: string) => main(page).locator(`li.protect-tile[data-tile="${id}"]`);
const toggle = (page: Page, id: string) => tile(page, id).locator("button.protect-tile-toggle");
const details = (page: Page, id: string) => page.locator(`#protect-${id}`);
const atRisk = (page: Page) => main(page).getByRole("switch");
const message = (page: Page) => main(page).locator(".protect-message");
const forget = (page: Page, lang: Lang) => main(page).getByRole("button", { name: own(lang, "atRisk.forget"), exact: true });
const bar = (page: Page) => page.locator('a[href="tel:911"]').locator("..");
const stored = (page: Page) => page.evaluate((key) => localStorage.getItem(key), KEY);

// --- Word for word -----------------------------------------------------------------------------------------------------
/** The app's typography, and nothing else: a curly apostrophe for a straight one, a no-break space for a space. */
const typography = (text: string) => text.replaceAll("’", "'").replace(/[\u00a0\u202f]/g, " ");
/** A saved source page's text, one block per line. */
const savedPage = (id: string, lang: Lang) => {
  const lines = read(`../src/protect/sources/${id}.${lang}.txt`).split(/\r?\n/);
  return lines.slice(lines.indexOf("---") + 1);
};
const quoted = (id: string, lang: Lang, sentence: string) => savedPage(id, lang).some((line) => typography(line).includes(typography(sentence)));

/** Every piece of text shown in the screen's main part: what it says, and the source it is quoted from, if any. */
const shown = (page: Page) =>
  main(page).evaluate((root) => {
    const texts: { text: string; source: string | null }[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement!;
      // Line breaks and runs of spaces as one space; a no-break space stays what it is.
      const text = (node.textContent ?? "").replace(/[ \t\r\n]+/g, " ").trim();
      if (!text || parent.closest("[hidden], svg") || getComputedStyle(parent).display === "none") continue;
      texts.push({ text, source: parent.closest("[data-quote]")?.getAttribute("data-source") ?? null });
    }
    return texts;
  });
/** The screen's own words: its strings, the app's strings it borrows, and what it cites of each source. */
function ownWords(lang: Lang) {
  const escape = (text: string) => text.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
  const pattern = (text: string) => new RegExp(`^${text.split(/\{\w+\}/).map(escape).join(".+")}$`);
  const borrowed = ["aq.source", "todo.noReading", "todo.officialLink", "todo.officialLink.host", "aq.areaWide.lead", "aq.areaWide.text", "verdict.notice", "leave.entry"].map((key) => APP[lang][key]);
  const cited = Object.values(SOURCES).flatMap((source) => [source.title[lang], source.url[lang].split("/")[2].replace(/^www\./, "")]);
  return [...Object.entries(CONTENT.strings).filter(([key]) => !key.startsWith("voice.")).map(([, text]) => text[lang]), ...CONTENT.tiles.map((t) => t.label[lang]), ...borrowed, ...cited].map(pattern);
}

// =====================================================================================================================
test.describe("on the verdict: one button, after “Why?”", () => {
  for (const lang of LANGS) {
    test(`${lang.toUpperCase()} Moncton (very high risk): the button is named “${CONTENT.strings.title[lang]}”, 56 px or more, filled; a tap opens the screen`, async ({ page }) => {
      await start(page, lang);
      await verdictFor(page, "Moncton");

      const link = await protectButton(page);
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAccessibleName(CONTENT.strings.title[lang]);
      await expect(link).toHaveAttribute("href", "/protect");
      const [why, box] = [(await page.locator("main .why-toggle").boundingBox())!, (await link.boundingBox())!];
      expect(box.y).toBeGreaterThanOrEqual(why.y + why.height); // after "Why?"
      expect(box.height).toBeGreaterThanOrEqual(56);
      // Clear at high risk: filled navy with white words. Never red, orange or amber.
      expect(await link.evaluate((el) => [el.getAttribute("data-tone"), getComputedStyle(el).backgroundColor, getComputedStyle(el).color])).toEqual(["raised", NAVY, WHITE]);
      expect(parseFloat(await link.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(18);
      await expect(link.locator("svg").first()).toBeVisible();

      await open(page);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(CONTENT.strings.title[lang]);
    });
  }

  for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }, { width: 320, height: 568 }]) {
    for (const lang of LANGS) {
      test(`${lang.toUpperCase()} ${viewport.width} × ${viewport.height}, Halifax (low risk, nothing explains the smoke): the button is quiet, its name on two lines at most, and Call 911 is still the largest thing to tap`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await start(page, lang);
        await verdictFor(page, "Halifax");
        await page.evaluate(() => document.fonts.ready);

        const link = await protectButton(page);
        expect(await link.evaluate((el) => [el.getAttribute("data-tone"), getComputedStyle(el).backgroundColor, getComputedStyle(el).color])).toEqual(["calm", WHITE, NAVY]);
        const name = link.locator(".protect-link-name");
        expect(await name.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)))).toBeLessThanOrEqual(2);
        expect(parseFloat(await name.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(18);
        const [call, button] = [(await page.locator('a[href="tel:911"]').boundingBox())!, (await link.boundingBox())!];
        expect(button.height).toBeGreaterThanOrEqual(56);
        expect(call.width * call.height).toBeGreaterThan(button.width * button.height);
        await expect(page.locator('a[href="tel:911"]')).toHaveCount(1);
      });
    }
  }

  for (const lang of LANGS) {
    test(`${lang.toUpperCase()} a fire close by (Bridgetown): the screen opens on the verdict’s notice and its link, before any advice about staying in`, async ({ page }) => {
      await replay(page, lang, "Bridgetown");

      const notice = main(page).locator(".protect-notice");
      await expect(notice.locator("p")).toHaveText(APP[lang]["verdict.notice"]);
      const leave = notice.getByRole("link", { name: plain(APP[lang]["leave.entry"]) });
      await expect(leave).toHaveAttribute("href", "/leave");
      expect((await leave.boundingBox())!.height).toBeGreaterThanOrEqual(56);
      // Above the band and the tiles.
      const [noticeBox, bandBox] = [(await notice.boundingBox())!, (await band(page).boundingBox())!];
      expect(noticeBox.y + noticeBox.height).toBeLessThanOrEqual(bandBox.y);
      await leave.click();
      await expect(page).toHaveURL(/\/leave$/);
    });
  }

  test("far from the fire (Moncton, 159 km): no notice on the screen", async ({ page }) => {
    await replay(page, "en");
    await expect(main(page).locator(".protect-notice")).toHaveCount(0);
  });

  test("the verdict keeps what it had: its three badges and “Why?” before the button, and one Listen", async ({ page }) => {
    await start(page, "en");
    await verdictFor(page, "Moncton");

    // Their order, whatever else the screen gains: the badges, "Why?", what it opens, then the button.
    const parts = await page.locator("main.verdict-main .sheet-more > *").evaluateAll((all) => all.map((el) => el.className.split(" ")[0] || el.id));
    const order = ["badges", "why-toggle", "why-all", "protect-link"].map((part) => parts.indexOf(part));
    expect(order.every((at) => at >= 0), parts.join(", ")).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    await expect(page.locator("main .badge")).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Listen", exact: true })).toHaveCount(1);
  });

  test("with the keyboard: Enter on the button opens the screen; Back returns to the verdict, as it was", async ({ page }) => {
    await start(page, "en");
    await verdictFor(page, "Moncton");
    const title = await page.locator("#verdict-h").innerText();

    await (await protectButton(page)).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/protect$/);
    await page.getByRole("link", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/verdict$/);
    expect(await page.locator("#verdict-h").innerText()).toBe(title);
  });

  test("opened by its address with no check made: back to Check, never a guess", async ({ page }) => {
    await start(page, "en");
    await page.goto("/protect");
    await expect(page).toHaveURL(/\/(\?mode=replay)?$/);
    await expect(page.getByRole("link", { name: "I smell smoke" })).toBeVisible();
  });
});

test.describe("the screen: the band, four tiles, one switch", () => {
  for (const lang of LANGS) {
    test(`${lang.toUpperCase()} Moncton replay: one title, the band in words, four tiles in order, the switch off, Listen, and the 911 bar`, async ({ page }) => {
      await replay(page, lang);

      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(CONTENT.strings.title[lang]);
      await expect(band(page)).toHaveText(bandLabel(lang, "very_high"));
      await expect(main(page).locator(".protect-intro")).toHaveText(CONTENT.strings.intro[lang]);
      // The tiles: a list named for a screen reader, each a button with its icon and its label, closed.
      await expect(main(page).getByRole("list", { name: CONTENT.strings.tiles[lang] })).toBeVisible();
      await expect(tiles(page)).toHaveCount(4);
      expect(await tiles(page).evaluateAll((all) => all.map((el) => el.getAttribute("data-tile")))).toEqual(["windows", "fans", "cleaner", "filter"]);
      for (const t of CONTENT.tiles) {
        const button = toggle(page, t.id);
        await expect(button).toHaveAccessibleName(plain(t.label[lang]));
        expect(await button.evaluate((el) => [el.tagName, el.getAttribute("aria-expanded"), el.getAttribute("aria-controls")])).toEqual(["BUTTON", "false", `protect-${t.id}`]);
        await expect(button.locator("svg").first()).toBeVisible();
        await expect(details(page, t.id)).toBeHidden();
      }
      // Under the windows tile's label, without a tap: Health Canada's line on heat, quoted from the same passage.
      const heat = main(page).locator(".protect-tile-note");
      await expect(heat).toHaveCount(1);
      await expect(tile(page, "windows").locator(".protect-tile-note")).toBeVisible();
      const line = sentences(CONTENT.tiles[0].quotes[0][lang])[1];
      await expect(heat.locator("p")).toHaveText(line);
      expect(line).toMatch(lang === "en" ? /prioritize keeping cool\.$/ : /la priorité est de demeurer au frais\.$/);
      expect(await heat.evaluate((el) => [el.tagName, el.getAttribute("data-source"), el.hasAttribute("data-quote")])).toEqual(["BLOCKQUOTE", "hc-smoke-heat", true]);
      expect(quoted("hc-smoke-heat", lang, line)).toBe(true);
      // The switch: off, and nothing kept.
      await expect(atRisk(page)).toHaveAccessibleName(CONTENT.strings["atRisk.label"][lang]);
      await expect(atRisk(page)).toHaveAttribute("aria-checked", "false");
      expect(await stored(page)).toBeNull();
      // Listen, the replay banner, and the slim 911 bar with the screen's one Call 911.
      await expect(page.getByRole("button", { name: APP[lang]["listen.play"], exact: true })).toHaveCount(1);
      await expect(page.getByRole("link", { name: APP[lang]["banner.exit"] })).toBeVisible();
      await expect(page.locator('a[href="tel:911"]')).toHaveCount(1);
      await expect(bar(page).locator("p")).toHaveText(APP[lang]["sticky.title"]);
      expect(await bar(page).evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
    });

    test(`${lang.toUpperCase()} as the screen opens (390 × 844): the title, the band, and the windows tile with its line on heat show above the 911 bar; the rest is a scroll away`, async ({ page }) => {
      await replay(page, lang);
      await page.evaluate(() => document.fonts.ready);

      const top = async () => (await bar(page).boundingBox())!.y;
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      for (const part of [page.getByRole("heading", { level: 1 }), band(page), tile(page, "windows")]) {
        const box = (await part.boundingBox())!;
        expect(box.y + box.height, await part.innerText()).toBeLessThanOrEqual((await top()) + 0.5);
      }
      for (const part of [...(await tiles(page).all()), atRisk(page)]) {
        await part.scrollIntoViewIfNeeded();
        const box = (await part.boundingBox())!;
        expect(box.y + box.height).toBeLessThanOrEqual((await top()) + 0.5);
      }
    });
  }

  test("the four icons are four drawings, each its own, drawn for this app", async ({ page }) => {
    await replay(page, "en");

    const drawn = await tiles(page).evaluateAll((all) => all.map((el) => { const svg = el.querySelector("svg.protect-art")!; return { icon: svg.getAttribute("data-icon"), d: svg.innerHTML, hidden: svg.getAttribute("aria-hidden"), width: svg.getBoundingClientRect().width }; }));
    expect(drawn.map((icon) => icon.icon)).toEqual(["window", "fan", "cleaner", "filter"]);
    expect(new Set(drawn.map((icon) => icon.d)).size).toBe(4);
    expect(drawn.every((icon) => icon.hidden === "true" && icon.width >= 28)).toBe(true); // the label says it; the icon is large
    // None is one of the app's other icons (src/components/icons.tsx, some of them Lucide's): no path of theirs is reused.
    const others = [...read("../src/components/icons.tsx").matchAll(/ d="([^"]+)"/g)].map((match) => match[1]);
    expect(others.length).toBeGreaterThan(20);
    expect(drawn.flatMap((icon) => others.filter((d) => icon.d.includes(`d="${d}"`)))).toEqual([]);
  });

  for (const viewport of [{ width: 375, height: 667 }, { width: 320, height: 568 }, { width: 375, height: 550 }]) {
    test.describe(`${viewport.width} × ${viewport.height}`, () => {
      test.use({ viewport });
      for (const lang of LANGS) {
        test(`${lang.toUpperCase()} the title and the band show above the 911 bar (from 667 px tall, the first tile too); every tile and the switch can be scrolled clear of it; nothing is wider than the screen`, async ({ page }) => {
          await replay(page, lang);
          await page.evaluate(() => document.fonts.ready);

          const top = async () => (await bar(page).boundingBox())!.y;
          expect(await page.evaluate(() => window.scrollY)).toBe(0);
          for (const part of [page.getByRole("heading", { level: 1 }), band(page), ...(viewport.height >= 667 ? [toggle(page, "windows")] : [])]) {
            const box = (await part.boundingBox())!;
            expect(box.y + box.height).toBeLessThanOrEqual((await top()) + 0.5);
          }
          for (const part of [...(await tiles(page).all()), atRisk(page)]) {
            await part.scrollIntoViewIfNeeded();
            const box = (await part.boundingBox())!;
            expect(box.y + box.height).toBeLessThanOrEqual((await top()) + 0.5);
          }
          // With everything open too.
          await atRisk(page).click();
          for (const t of CONTENT.tiles) {
            await toggle(page, t.id).click();
            const wide = await main(page).evaluate((root) => [...root.querySelectorAll("*")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5 || el.getBoundingClientRect().left < -0.5).map((el) => el.className));
            expect(wide, t.id).toEqual([]);
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
        });
      }
    });
  }
});

test.describe("built for an 80-year-old: large text, large targets, no sideways scroll, calm colours", () => {
  /** The screen with everything shown: the band's source, one tile's details at a time, and the switch on. */
  async function everything(page: Page, each: (what: string) => Promise<void>) {
    await each("as it opens");
    await band(page).click();
    await atRisk(page).click();
    await each("band and switch open");
    for (const t of CONTENT.tiles) {
      await toggle(page, t.id).click();
      await each(`tile ${t.id} open`);
    }
  }

  for (const lang of LANGS) {
    test(`${lang.toUpperCase()} every word is 18 px or more, and every button and link 56 px or more each way`, async ({ page }) => {
      await replay(page, lang);
      await everything(page, async (what) => {
        const small = await main(page).evaluate((root) => {
          const found: string[] = [];
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const parent = node.parentElement!;
            if (!(node.textContent ?? "").trim() || parent.closest("[hidden], svg")) continue;
            if (parseFloat(getComputedStyle(parent).fontSize) < 18) found.push(`${getComputedStyle(parent).fontSize}: ${node.textContent}`);
          }
          return found;
        });
        expect(small, what).toEqual([]);
        const targets = await main(page).evaluate((root) => [...root.querySelectorAll("a, button")].filter((el) => !el.closest("[hidden]")).map((el) => { const r = el.getBoundingClientRect(); return { name: (el.textContent ?? "").trim().slice(0, 30), size: Math.floor(Math.min(r.width, r.height)) }; }));
        expect(targets.length, what).toBeGreaterThanOrEqual(6);
        expect(targets.filter((target) => target.size < 56), what).toEqual([]);
      });
    });

    for (const town of ["Moncton", "Halifax"]) {
      test(`${lang.toUpperCase()} WCAG 2.1 AA contrast: every word is 4.5 to 1 or more against what is behind it, at ${town === "Moncton" ? "very high" : "low"} risk (${town})`, async ({ page }) => {
        await replay(page, lang, town);
        await everything(page, async (what) => {
          const weak = await main(page).evaluate((root) => {
            const rgb = (colour: string) => (colour.match(/[\d.]+/g) ?? []).map(Number);
            const luminance = ([r, g, b]: number[]) => { const [R, G, B] = [r, g, b].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * R + 0.7152 * G + 0.0722 * B; };
            const behind = (el: Element | null): number[] => {
              for (let at = el; at; at = at.parentElement) {
                const c = rgb(getComputedStyle(at).backgroundColor);
                if (c.length >= 3 && (c.length === 3 || c[3] > 0)) return c;
              }
              return [250, 246, 240];
            };
            const found: string[] = [];
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              const parent = node.parentElement!;
              if (!(node.textContent ?? "").trim() || parent.closest("[hidden], svg")) continue;
              const [a, b] = [luminance(rgb(getComputedStyle(parent).color)), luminance(behind(parent))];
              const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
              if (ratio < 4.5) found.push(`${ratio.toFixed(2)}: ${node.textContent}`);
            }
            return found;
          });
          expect(weak, `${town}, ${what}`).toEqual([]);
        });
      });
    }

    test(`${lang.toUpperCase()} at twice the text size (200%): nothing is cut off or wider than the screen, and every button still works`, async ({ page }) => {
      await replay(page, lang);
      const twice = () =>
        page.evaluate(() => {
          for (const el of document.querySelectorAll<HTMLElement>("main.protect-main *")) {
            if ([...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim()) && !el.dataset.twice) {
              el.dataset.twice = "1";
              el.style.fontSize = `${parseFloat(getComputedStyle(el).fontSize) * 2}px`;
            }
          }
        });
      const problems = () =>
        main(page).evaluate((root) =>
          [...root.querySelectorAll<HTMLElement>("*")].filter((el) => !el.closest("[hidden], svg")).flatMap((el) => {
            const r = el.getBoundingClientRect();
            const cut = el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible";
            return r.right > window.innerWidth + 0.5 || r.left < -0.5 || cut ? [`${el.className}: ${Math.round(r.left)}–${Math.round(r.right)}${cut ? " cut" : ""}`] : [];
          }),
        );
      await twice();
      expect(await problems()).toEqual([]);
      await band(page).click();
      await atRisk(page).click();
      await expect(atRisk(page)).toHaveAttribute("aria-checked", "true");
      for (const t of CONTENT.tiles) {
        await toggle(page, t.id).click();
        await expect(details(page, t.id)).toBeVisible();
        await twice();
        expect(await problems(), t.id).toEqual([]);
      }
      await expect(forget(page, lang)).toBeVisible();
    });
  }

  /** Everything in the screen's main part that moves: a transition or an animation that takes time. */
  const moving = (page: Page) =>
    main(page).evaluate((root) =>
      [root, ...root.querySelectorAll("*")]
        .filter((el) => {
          const st = getComputedStyle(el);
          const seconds = (value: string) => Math.max(...value.split(",").map((v) => parseFloat(v) || 0));
          return seconds(st.transitionDuration) > 0 || (st.animationName !== "none" && seconds(st.animationDuration) > 0);
        })
        .map((el) => el.className),
    );

  test("reduced motion: nothing on the screen moves", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await replay(page, "en");
    await atRisk(page).click();
    await toggle(page, "windows").click();

    expect(await moving(page)).toEqual([]);
  });

  test("without that setting, the switch slides: the reduced-motion check has something to switch off", async ({ page }) => {
    await replay(page, "en");
    await atRisk(page).click();
    expect((await moving(page)).length).toBeGreaterThan(0);
  });

  for (const level of BANDS) {
    test(`calm colours at ${level}: navy, white, ink, grey and the page’s own beige; never red, orange, amber or green`, async ({ page }) => {
      const ALLOWED = ["27, 42, 74", "255, 255, 255", "26, 29, 33", "79, 85, 97", "250, 246, 240", "243, 238, 230", "0, 0, 0"];
      await live(page, "en", level);
      await band(page).click();
      await atRisk(page).click();
      await toggle(page, "cleaner").click();
      const colours = await main(page).evaluate((root) => [...new Set([root, ...root.querySelectorAll("*")].filter((el) => !el.closest("[hidden]")).flatMap((el) => { const st = getComputedStyle(el); return [st.color, st.backgroundColor, st.borderTopColor, st.stroke, st.fill]; }))].filter((c) => /\d/.test(c)));
      expect(colours.filter((colour) => !ALLOWED.some((ok) => colour.includes(ok)))).toEqual([]);
    });
  }
});

test.describe("the band: ECCC’s air quality level, by colour, shape and word", () => {
  /** How the band is drawn: filled, outlined or dashed; where its gauge's needle points. */
  const drawn = (page: Page) =>
    band(page).evaluate((el) => {
      const st = getComputedStyle(el);
      return { band: el.getAttribute("data-band"), fill: st.backgroundColor, ink: st.color, outline: `${st.borderTopWidth} ${st.borderTopStyle}`, needle: el.querySelector(".protect-needle")?.getAttribute("d") ?? null };
    });
  const tone = (page: Page) => main(page).getAttribute("data-tone");
  /** The tiles' icon discs: filled navy when raised, pale when calm. */
  const disc = (page: Page) => toggle(page, "windows").locator(".protect-icon").evaluate((el) => getComputedStyle(el).backgroundColor);

  // Where the gauge's needle ends, left to right on its 32-unit dial: further right as the risk rises.
  const NEEDLE_X: Record<Band, [number, number]> = { low: [0, 11], moderate: [11, 16], high: [16, 21], very_high: [21, 32] };
  /** Where a path's last point is, across: "M16 22 8.7 18.6" and "M16 22l3.4-7.3" both start at the hub. */
  const needleX = (d: string) => {
    const [, x0, , relative, dx] = d.match(/^M([\d.]+) ([\d.]+)(l?)\s?(-?[\d.]+)/)!;
    return relative ? Number(x0) + Number(dx) : Number(dx);
  };

  for (const lang of LANGS) {
    for (const level of BANDS) {
      test(`${lang.toUpperCase()} ${level}: the level in words; ${level === "low" ? "quiet (outlined, pale icons)" : "clear (filled)"}; the gauge’s needle in its own place`, async ({ page }) => {
        await live(page, lang, level);

        await expect(band(page)).toHaveText(bandLabel(lang, level));
        const { needle, ...look } = await drawn(page);
        expect({ ...look, tone: await tone(page), disc: await disc(page) }).toEqual(
          level === "low"
            ? { band: "low", fill: WHITE, ink: NAVY, outline: "2px solid", tone: "calm", disc: "rgb(243, 238, 230)" }
            : { band: level, fill: NAVY, ink: WHITE, outline: "2px solid", tone: "raised", disc: NAVY },
        );
        // Shape as well as word: each level's needle ends in its own part of the dial.
        expect(needle).not.toBeNull();
        const [from, to] = NEEDLE_X[level];
        expect(needleX(needle!)).toBeGreaterThanOrEqual(from);
        expect(needleX(needle!)).toBeLessThan(to);
      });
    }

    test(`${lang.toUpperCase()} no reading in the last 2 hours: a dashed outline and the words, never a level; the tiles are still there; the switch picks no message`, async ({ page }) => {
      await live(page, lang, null);

      await expect(band(page)).toHaveText(own(lang, "band.none"));
      expect(await drawn(page)).toEqual({ band: "none", fill: WHITE, ink: NAVY, outline: "2px dashed", needle: null });
      // Not styled as low risk: the verdict says smoke is drifting here, so the tiles are clear, as from moderate up.
      expect([await tone(page), await disc(page)]).toEqual(["raised", NAVY]);
      await expect(tiles(page)).toHaveCount(4);
      await band(page).click();
      expect(await page.locator("#protect-band p").allTextContents()).toEqual([APP[lang]["todo.noReading"]]);
      await atRisk(page).click();
      await expect(message(page)).toContainText(own(lang, "atRisk.noReading"));
      for (const level of BANDS) await expect(message(page)).not.toContainText(sentences(CONTENT.atRisk.messages[level][lang])[0]);
      await expect(message(page)).toContainText(CONTENT.atRisk.doctor[lang]);
    });
  }

  test("a tap on the band shows the reading, who measured it and when, and a link to ECCC; a second tap hides them", async ({ page }) => {
    await replay(page, "en");

    expect(await band(page).evaluate((el) => [el.getAttribute("aria-expanded"), el.getAttribute("aria-controls")])).toEqual(["false", "protect-band"]);
    await expect(page.locator("#protect-band")).toBeHidden();
    await band(page).click();
    await expect(band(page)).toHaveAttribute("aria-expanded", "true");
    expect(await page.locator("#protect-band p").allTextContents()).toEqual(["Air Quality Health Index: 10+, at Moncton. Measured: 2025-08-25, 08:00 (Atlantic time).", "Source: Environment and Climate Change Canada"]);
    const link = page.locator("#protect-band a");
    expect(await link.evaluate((a) => [a.getAttribute("href"), a.getAttribute("target"), a.getAttribute("rel")])).toEqual(["https://weather.gc.ca/airquality/pages/index_e.html", "_blank", "noopener noreferrer"]);
    await band(page).click();
    await expect(page.locator("#protect-band")).toBeHidden();
  });

  for (const lang of LANGS) {
    test(`${lang.toUpperCase()} nothing explains the smoke (Halifax, low risk): quiet, and the screen says the reading is area-wide without a tap`, async ({ page }) => {
      await replay(page, lang, "Halifax");

      expect([await tone(page), (await drawn(page)).fill]).toEqual(["calm", WHITE]);
      await expect(main(page).locator(".protect-note")).toHaveText(`${APP[lang]["aq.areaWide.lead"]} ${APP[lang]["aq.areaWide.text"]}`);
      await expect(page.locator('a[href="tel:911"]')).toHaveCount(1);
    });
  }
});

test.describe("the tiles: details on a tap, with the source", () => {
  for (const lang of LANGS) {
    test(`${lang.toUpperCase()} each tile shows Health Canada’s sentences and, for each, who wrote it, the page, its date modified and a link`, async ({ page }) => {
      await replay(page, lang);

      for (const t of CONTENT.tiles) {
        await toggle(page, t.id).click();
        await expect(toggle(page, t.id)).toHaveAttribute("aria-expanded", "true");
        const panel = details(page, t.id);
        await expect(panel).toBeVisible();
        const quotes = panel.locator("[data-quote]");
        await expect(quotes).toHaveCount(t.quotes.length);
        for (const [i, quote] of t.quotes.entries()) {
          await expect(quotes.nth(i)).toHaveAttribute("data-source", quote.source);
          expect(await quotes.nth(i).locator("p, li").allTextContents()).toEqual([quote[lang], ...(quote.items ?? []).map((item) => item[lang])]);
          await expect(quotes.nth(i)).toHaveAttribute("cite", SOURCES[quote.source].url[lang]);
        }
        const links = await panel.locator("a").evaluateAll((all) => all.map((a) => ({ href: a.getAttribute("href"), target: a.getAttribute("target"), rel: a.getAttribute("rel"), lines: [...a.querySelectorAll(".protect-source-line")].map((line) => line.textContent), height: Math.round(a.getBoundingClientRect().height) })));
        expect(links.map(({ height, ...link }) => link)).toEqual(
          t.quotes.map((quote) => ({
            href: SOURCES[quote.source].url[lang],
            target: "_blank",
            rel: "noopener noreferrer",
            lines: [own(lang, "source.by", { publisher: SOURCES[quote.source].publisher[lang] }), SOURCES[quote.source].title[lang], dated(lang, quote.source), "canada.ca"],
          })),
        );
        expect(links.every((link) => link.height >= 56)).toBe(true);
        // The line on heat under the windows label: there while the tile is closed; open, the passage holds it.
        await expect(main(page).locator(".protect-tile-note")).toHaveCount(t.id === "windows" ? 0 : 1);
      }
    });
  }

  test("one tile open at a time, each clear of the 911 bar; a second tap closes it", async ({ page }) => {
    await replay(page, "en");

    for (const t of CONTENT.tiles) {
      await toggle(page, t.id).click();
      expect(await main(page).locator(".protect-details:not([hidden])").evaluateAll((all) => all.map((el) => el.id))).toEqual([`protect-${t.id}`]);
      await expect.poll(async () => { const [panel, top] = [(await details(page, t.id).boundingBox())!, (await bar(page).boundingBox())!.y]; return panel.height > top - 80 || panel.y + panel.height <= top + 0.5; }).toBe(true);
    }
    await toggle(page, "filter").click();
    await expect(toggle(page, "filter")).toHaveAttribute("aria-expanded", "false");
    await expect(details(page, "filter")).toBeHidden();
  });

  test("with the keyboard: Tab reaches every tile in order; Enter and Space open and close", async ({ page }) => {
    await replay(page, "en");

    await band(page).focus();
    for (const t of CONTENT.tiles) {
      await page.keyboard.press("Tab");
      await expect(toggle(page, t.id)).toBeFocused();
    }
    await toggle(page, "fans").focus();
    await page.keyboard.press("Enter");
    await expect(details(page, "fans")).toBeVisible();
    // The focus ring shows: navy, 3 px.
    expect(await toggle(page, "fans").evaluate((el) => { const st = getComputedStyle(el); return [st.outlineStyle, st.outlineWidth, st.outlineColor]; })).toEqual(["solid", "3px", NAVY]);
    await page.keyboard.press("Space");
    await expect(details(page, "fans")).toBeHidden();
  });
});

test.describe("never invented: every sentence of advice on the screen is in its saved source, word for word", () => {
  for (const lang of LANGS) {
    for (const level of [...BANDS, null]) {
      test(`${lang.toUpperCase()} ${level ?? "no reading"}: with the switch on and each tile open, what is quoted is in its source page, and everything else is the screen’s own words`, async ({ page }) => {
        await live(page, lang, level);
        await band(page).click();
        await atRisk(page).click();
        const allowed = ownWords(lang);
        let quotes = 0;
        for (const t of CONTENT.tiles) {
          await toggle(page, t.id).click();
          await expect(details(page, t.id)).toBeVisible();
          for (const { text, source } of await shown(page)) {
            if (source) {
              quotes++;
              expect(quoted(source, lang, text), `“${text}” is not in ${source}.${lang}.txt word for word`).toBe(true);
            } else {
              // The band's own values: the level, the reading, the station and the time.
              expect(allowed.some((pattern) => pattern.test(text)), `“${text}” is neither quoted from a source nor one of the screen’s own strings`).toBe(true);
            }
          }
        }
        expect(quotes).toBeGreaterThanOrEqual(level ? 12 : 8); // the tiles' sentences, and the at-risk lines each time
        if (level) {
          const atRiskQuotes = await message(page).locator("[data-quote] p").allTextContents();
          expect(atRiskQuotes).toEqual([CONTENT.atRisk.messages[level][lang], CONTENT.atRisk.doctor[lang]]);
          expect(await message(page).locator("[data-quote]").evaluateAll((all) => all.map((el) => el.getAttribute("data-source")))).toEqual(["eccc-aqhi-messages", "eccc-aqhi-messages"]);
        }
      });
    }
  }
});

test.describe("the switch: “I have asthma or COPD”", () => {
  for (const lang of LANGS) {
    test(`${lang.toUpperCase()} off by default: “${CONTENT.strings["atRisk.no"][lang]}”, what it does, no message, nothing to forget, nothing kept`, async ({ page }) => {
      await replay(page, lang);

      await expect(atRisk(page)).toHaveAttribute("aria-checked", "false");
      await expect(atRisk(page).locator(".protect-switch-word")).toHaveText(CONTENT.strings["atRisk.no"][lang]);
      await expect(main(page).locator(".protect-help")).toHaveText(CONTENT.strings["atRisk.help"][lang]);
      await expect(message(page)).toHaveCount(0);
      await expect(forget(page, lang)).toHaveCount(0);
      for (const level of BANDS) await expect(main(page)).not.toContainText(sentences(CONTENT.atRisk.messages[level][lang])[0]);
      expect(await stored(page)).toBeNull();
    });

    for (const level of BANDS) {
      test(`${lang.toUpperCase()} on, at ${level}: ECCC’s message for the at-risk population at that band, the doctor’s-advice line, ECCC’s page, and “${CONTENT.strings["atRisk.forget"][lang]}”`, async ({ page }) => {
        await live(page, lang, level);
        await atRisk(page).click();

        await expect(atRisk(page)).toHaveAttribute("aria-checked", "true");
        await expect(atRisk(page).locator(".protect-switch-word")).toHaveText(CONTENT.strings["atRisk.yes"][lang]);
        // The band on one line, whose message it is on the next.
        expect(await message(page).locator(".protect-kicker > *").allTextContents()).toEqual([bandLabel(lang, level), own(lang, "atRisk.kicker")]);
        expect(await message(page).locator("[data-quote] p").allTextContents()).toEqual([CONTENT.atRisk.messages[level][lang], CONTENT.atRisk.doctor[lang]]);
        // The message is in the screen's ordinary weight and size: a quoted line, not a headline.
        expect(await message(page).locator("[data-quote] p").first().evaluate((el) => [getComputedStyle(el).fontWeight, getComputedStyle(el).fontSize])).toEqual(["400", "18px"]);
        // At low risk, beside "Enjoy your usual outdoor activities": the reading is area-wide. Never an all-clear to a
        // person who smells smoke, whatever the verdict.
        if (level === "low") await expect(message(page).locator(".protect-note")).toHaveText(`${APP[lang]["aq.areaWide.lead"]} ${APP[lang]["aq.areaWide.text"]}`);
        else await expect(message(page).locator(".protect-note")).toHaveCount(0);
        // No other band's message.
        for (const other of BANDS.filter((b) => b !== level)) await expect(message(page)).not.toContainText(CONTENT.atRisk.messages[other][lang]);
        const eccc = SOURCES["eccc-aqhi-messages"];
        const link = message(page).locator("a.protect-source");
        expect(await link.evaluate((a) => [a.getAttribute("href"), a.getAttribute("target"), a.getAttribute("rel")])).toEqual([eccc.url[lang], "_blank", "noopener noreferrer"]);
        expect(await link.locator(".protect-source-line").allTextContents()).toEqual([own(lang, "source.by", { publisher: eccc.publisher[lang] }), eccc.title[lang], dated(lang, "eccc-aqhi-messages"), lang === "en" ? "weather.gc.ca" : "meteo.gc.ca"]);
        await expect(message(page).locator(".protect-kept")).toHaveText(CONTENT.strings["atRisk.saved"][lang]);
        await expect(forget(page, lang)).toBeVisible();
        expect(await stored(page)).toBe("on");
      });
    }

    test(`${lang.toUpperCase()} “${CONTENT.strings["atRisk.forget"][lang]}”: the switch goes off, the message goes, the device keeps nothing, and the screen says so`, async ({ page }) => {
      await replay(page, lang);
      await atRisk(page).click();
      expect(await stored(page)).toBe("on");

      await forget(page, lang).click();
      await expect(atRisk(page)).toHaveAttribute("aria-checked", "false");
      await expect(message(page)).toHaveCount(0);
      await expect(main(page).getByRole("status")).toHaveText(CONTENT.strings["atRisk.forgotten"][lang]);
      expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
      // No time pressure: the words stay until the next tap.
      await page.waitForTimeout(1500);
      await expect(main(page).getByRole("status")).toHaveText(CONTENT.strings["atRisk.forgotten"][lang]);
      await atRisk(page).click();
      await expect(main(page).getByRole("status")).toHaveText("");
    });
  }

  test.describe("across checks", () => {
    // These make several checks in one page. On a busy machine a later check sometimes stays on the loading screen
    // (the app's existing tests showed the same before this feature); such a run is made again.
    test.describe.configure({ retries: 2 });

    test("it is remembered on the device: on after a new check, after the app is closed and opened again, and in French", async ({ page }) => {
      await replay(page, "en");
      await atRisk(page).click();

      // A new check, for another town.
      await page.getByRole("link", { name: "Back" }).click();
      await newCheck(page);
      await verdictFor(page, "Halifax");
      await open(page);
      await expect(atRisk(page)).toHaveAttribute("aria-checked", "true");
      await expect(message(page)).toContainText(CONTENT.atRisk.messages.low.en);
      // The page loaded again: the check is gone, the choice is not.
      await page.reload();
      await start(page, "fr");
      await verdictFor(page, "Moncton");
      await open(page);
      await expect(atRisk(page)).toHaveAttribute("aria-checked", "true");
      await expect(message(page)).toContainText(CONTENT.atRisk.messages.very_high.fr);
    });

    test("switching it off forgets it too; forgotten stays forgotten", async ({ page }) => {
      await replay(page, "en");
      await atRisk(page).click();
      await atRisk(page).click();

      await expect(atRisk(page)).toHaveAttribute("aria-checked", "false");
      expect(await stored(page)).toBeNull();
      await expect(main(page).getByRole("status")).toHaveText(CONTENT.strings["atRisk.forgotten"].en);
      await page.reload();
      await start(page, "en");
      await verdictFor(page, "Moncton");
      await open(page);
      await expect(atRisk(page)).toHaveAttribute("aria-checked", "false");
    });
  });

  test("a button, never a gesture alone: a tap or a key turns it on and off; its state is a word and a position, not a colour alone", async ({ page }) => {
    await replay(page, "en");

    expect(await atRisk(page).evaluate((el) => [el.tagName, el.getAttribute("type")])).toEqual(["BUTTON", "button"]);
    const knob = () => atRisk(page).locator(".protect-switch-knob").evaluate((el) => Math.round(el.getBoundingClientRect().left - el.parentElement!.getBoundingClientRect().left));
    const off = await knob();
    await atRisk(page).focus();
    await page.keyboard.press("Space");
    await expect(atRisk(page)).toHaveAttribute("aria-checked", "true");
    await expect(atRisk(page).locator(".protect-switch-word")).toHaveText("Yes");
    await expect.poll(knob).toBeGreaterThan(off + 10);
    await page.keyboard.press("Enter");
    await expect(atRisk(page)).toHaveAttribute("aria-checked", "false");
    await expect(atRisk(page).locator(".protect-switch-word")).toHaveText("No");
  });

  test("a device that refuses storage (a private window): the switch works for this visit, and the screen says it was not saved", async ({ page }) => {
    // The device's storage refuses to keep anything; the app's own session state still works.
    await page.addInitScript(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
        if (this === window.localStorage) throw new DOMException("refused", "QuotaExceededError");
        return set.call(this, key, value);
      };
    });
    await replay(page, "en");
    await atRisk(page).click();

    await expect(atRisk(page)).toHaveAttribute("aria-checked", "true");
    await expect(message(page).locator(".protect-kept")).toHaveText(CONTENT.strings["atRisk.notSaved"].en);
    await expect(message(page)).toContainText(CONTENT.atRisk.messages.very_high.en);
    expect(await stored(page)).toBeNull();
    // As the screen said: it is forgotten when the person leaves the screen.
    await page.getByRole("link", { name: "Back" }).click();
    await open(page);
    await expect(atRisk(page)).toHaveAttribute("aria-checked", "false");
  });

  test("a device that will not remove the entry: the screen does not claim it is forgotten, and says how to remove it", async ({ page }) => {
    await page.addInitScript(() => {
      const remove = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function (this: Storage, key: string) {
        if (this === window.localStorage) throw new DOMException("refused", "SecurityError");
        return remove.call(this, key);
      };
    });
    await replay(page, "en");
    await atRisk(page).click();
    expect(await stored(page)).toBe("on");

    await forget(page, "en").click();
    await expect(atRisk(page)).toHaveAttribute("aria-checked", "false");
    await expect(main(page).getByRole("status")).toHaveText(CONTENT.strings["atRisk.notForgotten"].en);
    await expect(main(page).getByRole("status")).not.toContainText("Forgotten");
    expect(await stored(page)).toBe("on"); // still there, as the screen says
  });
});

test.describe("private: nothing about the switch leaves the device", () => {
  type Sent = { method: string; url: string; body: string | null; headers: Record<string, string> };
  const record = (context: BrowserContext) => {
    const sent: Sent[] = [];
    context.on("request", (request: Request) => sent.push({ method: request.method(), url: request.url(), body: request.postData(), headers: request.headers() }));
    return sent;
  };
  /** What would give it away in a request: the entry's name, or any word for what it says. */
  const TELLS = /smoke-or-fire\.protect|at-?risk|asthma|asthme|copd|mpoc/i;
  const tells = (sent: Sent[]) => sent.filter((request) => TELLS.test(decodeURIComponent(request.url)) || TELLS.test(request.body ?? "") || Object.entries(request.headers).some(([name, value]) => TELLS.test(name) || TELLS.test(value)));

  test("turning it on, off, and forgetting it sends nothing at all", async ({ page, context }) => {
    await replay(page, "en");
    await page.waitForLoadState("networkidle");
    const sent = record(context);

    await atRisk(page).click();
    await expect(message(page)).toBeVisible();
    await atRisk(page).click();
    await atRisk(page).click();
    await forget(page, "en").click();
    await expect(main(page).getByRole("status")).not.toHaveText("");
    await page.waitForTimeout(500);
    expect(sent).toEqual([]);
  });

  test("it is in the device’s storage and nowhere else: no cookie, not in the address, not in the app’s own session state", async ({ page, context }) => {
    await replay(page, "en");
    const before = page.url();
    await atRisk(page).click();
    await expect(message(page)).toBeVisible();

    expect(await page.evaluate(() => Object.entries(localStorage))).toEqual([[KEY, "on"]]);
    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate(() => document.cookie)).toBe("");
    expect(page.url()).toBe(before);
    expect(new URL(page.url()).search + new URL(page.url()).hash).toBe("");
    const session = await page.evaluate(() => Object.entries(sessionStorage).map(([key, value]) => `${key}=${value}`).join("\n"));
    expect(session).toContain('"lang":"en"');
    expect(session).not.toMatch(TELLS);
    expect(await page.evaluate(() => history.state === null || !/risk|asthma|protect/i.test(JSON.stringify(history.state)))).toBe(true);
  });

  /** A person's whole visit, live: a check, the screen, every tile, the band, back, a second check, a reload. */
  async function visit(page: Page, on: boolean) {
    await engine(page, answerAt("high"));
    await start(page, "en", "live");
    await verdictFor(page, "Moncton");
    await open(page);
    if (on) {
      await atRisk(page).click();
      await expect(message(page)).toBeVisible();
    }
    await band(page).click();
    for (const t of CONTENT.tiles) await toggle(page, t.id).click();
    await page.getByRole("link", { name: "Back" }).click();
    await newCheck(page);
    await verdictFor(page, "Moncton"); // the engine is asked again, with the switch on
    await open(page);
    await expect(atRisk(page)).toHaveAttribute("aria-checked", String(on));
    await page.getByRole("button", { name: "Français" }).click();
    await page.reload(); // every file is asked for again
    await expect(page.getByRole("link", { name: APP.fr["check.cta"] })).toBeVisible();
    await page.waitForLoadState("networkidle");
  }

  // What this compares is every request the pages make by themselves. What Listen says goes through the browser's own
  // speech, not through a request a page can see: the Listen tests below hold which voice reads what. A source link
  // that is followed is the source's plain address, with no referrer: the test after this one.
  test.describe("across checks", () => {
    // Two visits of two checks each; on a busy machine a later check sometimes stays on the loading screen.
    test.describe.configure({ retries: 2 });
    wholeVisit();
  });
  function wholeVisit() {
  test("the same visit with the switch on and off: the pages send the very same requests, the engine’s included; none names it", async ({ browser, baseURL }) => {
    const runs: Record<"off" | "on", Sent[]> = { off: [], on: [] };
    for (const state of ["off", "on"] as const) {
      const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
      runs[state] = record(context);
      const page = await context.newPage();
      await visit(page, state === "on");
      if (state === "on") expect(await stored(page)).toBe("on");
      expect(await context.cookies(), state).toEqual([]);
      await context.close();
    }
    const line = (request: Sent) => `${request.method} ${request.url} ${request.body ?? ""}`;
    // The engine was asked for a verdict twice in each visit: its address carries the place and the mode, and nothing
    // else. Its only other requests are the quiet wake-up pings the first screen sends when the app opens on it in
    // live mode: GET /health, with nothing in it at all, switch on or off.
    const ping = (request: Sent) => request.url === `${TEST_ENGINE_URL}/health`;
    for (const visit of [runs.on, runs.off]) {
      const toEngine = visit.filter((request) => request.url.startsWith(TEST_ENGINE_URL));
      const asked = toEngine.filter((request) => new URL(request.url).pathname === "/verdict");
      expect(asked.map((request) => [...new URL(request.url).searchParams.keys()].sort().join(","))).toEqual(["lat,lon,mode", "lat,lon,mode"]);
      const pings = toEngine.filter((request) => !asked.includes(request));
      expect(pings.map((request) => [request.method, request.url, request.body ?? null])).toEqual(pings.map(() => ["GET", `${TEST_ENGINE_URL}/health`, null]));
    }
    // How many pings a visit sends is not fixed: the first screen sends one only if it had drawn before the visit
    // moved on. They are held above for what they carry, and left out of the comparison of the two visits.
    expect(runs.on.filter((request) => !ping(request)).map(line).sort()).toEqual(runs.off.filter((request) => !ping(request)).map(line).sort());
    // Header by header, the two visits are alike too: nothing is added when the switch is on.
    const names = (sent: Sent[]) => [...new Set(sent.flatMap((request) => Object.keys(request.headers)))].sort();
    expect(names(runs.on)).toEqual(names(runs.off));
    expect(tells(runs.on)).toEqual([]);
    expect(tells(runs.off)).toEqual([]);
    expect(runs.on.length).toBeGreaterThan(5);
  });
  }

  test("the links to the sources are plain addresses: the source’s own page, nothing added, and no referrer", async ({ page }) => {
    await replay(page, "en");
    await atRisk(page).click();
    await band(page).click();
    for (const t of CONTENT.tiles) {
      await toggle(page, t.id).click();
      const links = await main(page).locator("a:visible").evaluateAll((all) => all.map((a) => ({ href: a.getAttribute("href")!, rel: a.getAttribute("rel"), target: a.getAttribute("target") })));
      expect(links.length).toBeGreaterThanOrEqual(3);
      const known = [...Object.values(SOURCES).map((source) => source.url.en), APP.en["todo.officialLink.url"]];
      expect(links.filter((link) => !known.includes(link.href) || link.rel !== "noopener noreferrer" || link.target !== "_blank")).toEqual([]);
    }
    expect(await page.locator('meta[name="referrer"]').getAttribute("content")).toBe("no-referrer");
  });
});

// --- Listen ----------------------------------------------------------------------------------------------------------
type Voice = { lang: string; name: string; localService: boolean };
// The browser's voices. As in Chrome and Edge, the most natural ones are voice services (what they say goes to a
// server); the plainer ones work on the device. The app prefers a natural voice in English, a Canadian one in French.
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

/**
 * A speechSynthesis that records what is said and ends each sentence after 10 ms (as e2e/listen.spec.ts has it). Its
 * voices can change while the page is open, as a browser's do: __setVoices(list) replaces them and, unless told to
 * keep quiet, says so with a voiceschanged event.
 */
function fakeSpeech(voices: Voice[]) {
  const w = window as unknown as Record<string, unknown>;
  const spoken: { u: Record<string, unknown>; end: number }[] = [];
  const listeners = new Set<() => void>();
  let list = voices;
  w.__spoken = spoken;
  w.__cancels = 0;
  w.__autoEnd = true;
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

test.describe("Listen reads the tiles, and the at-risk line when the switch is on", () => {
  const listen = (page: Page, lang: Lang) => page.getByRole("button", { name: APP[lang]["listen.play"], exact: true });
  /** The tiles' sentences as the screen shows them: each tile opened in turn, its quoted text read from the screen. */
  async function tilesShown(page: Page) {
    const all: string[] = [];
    for (const t of CONTENT.tiles) {
      await toggle(page, t.id).click();
      for (const quote of await details(page, t.id).locator("[data-quote]").all()) {
        all.push(...sentences((await quote.locator("p").first().textContent())!), ...(await quote.locator("li").allTextContents()));
      }
    }
    await toggle(page, CONTENT.tiles.at(-1)!.id).click(); // closed again, as the screen opens
    return all;
  }
  /** One reading, from the tap on Listen to its end: what was said, sentence by sentence. */
  async function reading(page: Page, lang: Lang) {
    const before = (await spoken(page)).length;
    await listen(page, lang).click();
    await expect.poll(async () => (await spoken(page)).length, { timeout: 30_000 }).toBeGreaterThan(before);
    await expect(listen(page, lang)).toBeVisible({ timeout: 60_000 }); // the button says Listen again: the reading has ended
    return (await spoken(page)).slice(before);
  }
  /** What the screen says whatever the switch's state, up to the at-risk part: the title, ECCC's band, then Health
   *  Canada named and each tile's sentences. */
  const start = async (page: Page, lang: Lang) => [
    `${await page.getByRole("heading", { level: 1 }).innerText()}.`,
    own(lang, "voice.band", { risk: lower(APP[lang]["aq.risk.very_high"], lang) }),
    ...sentences(own(lang, "voice.intro")),
    ...(await tilesShown(page)),
    ...sentences(own(lang, "voice.tap")),
  ];
  /** What Listen says first, once, where the language has only a voice service (every screen's Listen does). */
  const notice = (lang: Lang) => sentences(APP[lang]["voice.online"]);
  /** The switch-off words, whole. */
  const offScript = async (page: Page, lang: Lang) => [...(await start(page, lang)), ...sentences(own(lang, "voice.atRisk.off")), APP[lang]["voice.verdict.call"]];
  /** The switch-on words, whole: ECCC named, the band's message and the doctor's-advice line as the screen shows them. */
  const onScript = async (page: Page, lang: Lang) => [
    ...(await start(page, lang)),
    ...sentences(own(lang, "voice.atRisk.on")),
    ...(await message(page).locator("[data-quote] p").allTextContents()).flatMap(sentences),
    APP[lang]["voice.verdict.call"],
  ];

  test.describe("a browser with a voice of its own and a voice service", () => {
    test.beforeEach(async ({ page }) => { await page.addInitScript(fakeSpeech, VOICES); });

    for (const lang of LANGS) {
      test(`${lang.toUpperCase()} switch off: the title, ECCC’s band, then Health Canada named and every tile’s sentences as written, that there is a switch, then 911`, async ({ page }) => {
        await replay(page, lang);
        const button = listen(page, lang);
        await expect(button).toBeVisible();
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(56);
        expect(await spoken(page)).toEqual([]); // never plays by itself

        const expected = await offScript(page, lang);
        const heard = await reading(page, lang);
        expect(heard.map((u) => u.text)).toEqual(expected);
        expect(heard.every((u) => u.lang === `${lang}-CA`)).toBe(true);
        // Every tile's label is said: it is the start of its first sentence.
        const all = heard.map((u) => u.text).join(" ");
        for (const t of CONTENT.tiles) expect(typography(all)).toContain(typography(t.label[lang]));
        // No at-risk message; 911 is spelled out.
        for (const level of BANDS) expect(all).not.toContain(sentences(CONTENT.atRisk.messages[level][lang])[0]);
        expect(all).not.toMatch(/\b911\b|safe|sécuri/i);
        // Every sentence of advice said is in its source, word for word.
        for (const sentence of await tilesShown(page)) expect(Object.keys(SOURCES).some((id) => quoted(id, lang, sentence)), sentence).toBe(true);
      });

      test(`${lang.toUpperCase()} switch on: ECCC is named, then the at-risk line for the band and the doctor’s-advice line`, async ({ page }) => {
        await replay(page, lang);
        await atRisk(page).click();
        const shownMessage = await message(page).locator("[data-quote] p").allTextContents();
        expect(shownMessage).toEqual([CONTENT.atRisk.messages.very_high[lang], CONTENT.atRisk.doctor[lang]]);

        const heard = await reading(page, lang);
        expect(heard.map((u) => u.text)).toEqual(await onScript(page, lang));
        for (const sentence of shownMessage.flatMap(sentences)) expect(quoted("eccc-aqhi-messages", lang, sentence), sentence).toBe(true);
        // Whose message it is, said aloud. Never that the person has a condition, nor that their switch is on.
        const all = heard.map((u) => u.text).join(" ");
        expect(all).toContain(SOURCES["eccc-aqhi-messages"].publisher[lang]);
        const atRiskPart = heard.map((u) => u.text).slice((await start(page, lang)).length).join(" ");
        expect(atRiskPart).not.toMatch(/asthma|asthme|COPD|MPOC|switch|interrupteur/i);
      });

      test(`${lang.toUpperCase()} the voice is the one that works on the device, switch off or on: which voice reads tells nothing`, async ({ page }) => {
        await replay(page, lang);
        const off = await reading(page, lang);
        await atRisk(page).click();
        const on = await reading(page, lang);
        expect([[...new Set(off.map((u) => u.voice))], [...new Set(on.map((u) => u.voice))]]).toEqual([[ON_DEVICE[lang]], [ON_DEVICE[lang]]]);
      });
    }

    test("flipping the switch while it reads stops the reading: what was being read is no longer what the screen says", async ({ page }) => {
      await replay(page, "en");
      await page.evaluate(() => { (window as unknown as { __autoEnd: boolean }).__autoEnd = false; });
      await listen(page, "en").click();
      await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
      const before = await cancels(page);

      await atRisk(page).click();
      await expect(listen(page, "en")).toBeVisible();
      expect(await cancels(page)).toBeGreaterThan(before);
      const count = (await spoken(page)).length;
      await page.waitForTimeout(800);
      expect((await spoken(page)).length).toBe(count);
    });

    test("the device’s voice is gone by the time Listen is tapped (the browser has not said so yet): nothing is said, never by the voice service", async ({ page }) => {
      await replay(page, "en");
      await atRisk(page).click();
      await expect(message(page)).toBeVisible();
      await setVoices(page, SERVICES_ONLY, true); // no voiceschanged: the screen still believes it has a device voice

      await listen(page, "en").click();
      await page.waitForTimeout(800);
      expect(await spoken(page)).toEqual([]);
      await expect(listen(page, "en")).toBeVisible();
    });

    test("French with the switch on, where only English has a device voice: French is read as with the switch off", async ({ page }) => {
      await page.addInitScript(fakeSpeech, VOICES.filter((voice) => voice.name !== ON_DEVICE.fr));
      await replay(page, "en");
      await atRisk(page).click();
      expect((await reading(page, "en")).map((u) => u.text)).toEqual(await onScript(page, "en"));

      await page.getByRole("button", { name: "Français" }).click();
      await expect(message(page)).toContainText(CONTENT.atRisk.messages.very_high.fr);
      const french = await reading(page, "fr");
      // French has only a voice service: Listen says so first.
      expect(french.map((u) => u.text)).toEqual([...notice("fr"), ...(await offScript(page, "fr"))]);
      expect([...new Set(french.map((u) => u.voice))]).toEqual([SERVICE.fr]);
    });
  });

  test.describe("a browser whose only voices are voice services", () => {
    test.beforeEach(async ({ page }) => { await page.addInitScript(fakeSpeech, SERVICES_ONLY); });

    for (const lang of LANGS) {
      test(`${lang.toUpperCase()} the switch changes nothing of what is said: on, Listen says what it says off, word for word, and the message stays on the screen`, async ({ page }) => {
        await replay(page, lang);
        const off = await reading(page, lang);
        // The first reading says the voice is a service; that is said once.
        expect(off.map((u) => u.text)).toEqual([...notice(lang), ...(await offScript(page, lang))]);

        await atRisk(page).click();
        await expect(message(page)).toContainText(CONTENT.atRisk.messages.very_high[lang]);
        const on = await reading(page, lang);
        expect(on.map((u) => u.text)).toEqual(off.map((u) => u.text).slice(notice(lang).length));
        expect(on.map((u) => u.text)).toEqual(await offScript(page, lang));
        expect([...new Set(on.map((u) => u.voice))]).toEqual([SERVICE[lang]]);
        // Nothing a voice service hears depends on the switch: not the message, not whose it is.
        const all = on.map((u) => u.text).join(" ");
        expect(all).not.toContain(sentences(CONTENT.atRisk.messages.very_high[lang])[0]);
        expect(all).not.toContain(sentences(CONTENT.atRisk.doctor[lang])[0]);
        expect(all).not.toContain(sentences(own(lang, "voice.atRisk.on"))[0]);
      });
    }

    test("the browser lists its voices late, and one works on the device: before, the switch-off words by the service; after, the at-risk line by the device’s voice", async ({ page }) => {
      await replay(page, "en");
      await atRisk(page).click();
      const before = await reading(page, "en");
      expect(before.map((u) => u.text)).toEqual([...notice("en"), ...(await offScript(page, "en"))]);

      await setVoices(page, VOICES); // the browser says its voices changed
      const after = await reading(page, "en");
      expect(after.map((u) => u.text)).toEqual(await onScript(page, "en"));
      expect([...new Set(after.map((u) => u.voice))]).toEqual([ON_DEVICE.en]);
    });
  });

  test("without speech in the browser: no Listen button, and the screen works", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true });
      Object.defineProperty(window, "SpeechSynthesisUtterance", { value: undefined, configurable: true });
    });
    await replay(page, "en");
    await expect(page.getByRole("button", { name: /^(Listen|Stop)$/ })).toHaveCount(0);
    await toggle(page, "windows").click();
    await expect(details(page, "windows")).toBeVisible();
    await atRisk(page).click();
    await expect(message(page)).toBeVisible();
  });
});
