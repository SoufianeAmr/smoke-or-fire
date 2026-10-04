// The three questions before the trace: Do you see flames? Which looks like your sky? Is anything burning nearby?
// Every way through them and the screen each way ends on; what each question shows; the sky pictures; the three-dot
// progress mark; "About these questions"; the Nearby fire screen; that no answer is kept or sent anywhere; the keyboard;
// the moment after a question appears when a tap is ignored; reduced motion. English and French, in replay.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PATHS, answer } from "./look";

// Short tests that share nothing: they run side by side.
test.describe.configure({ mode: "parallel" });

type Lang = "en" | "fr";
type Box = { x: number; y: number; width: number; height: number };

const LANGS = ["en", "fr"] as const;
const STRINGS: Record<Lang, Record<string, string>> = {
  en: JSON.parse(readFileSync(new URL("../src/i18n/en.json", import.meta.url), "utf8")),
  fr: JSON.parse(readFileSync(new URL("../src/i18n/fr.json", import.meta.url), "utf8")),
};
const NAVY = "rgb(27, 42, 74)";
const RED = "rgb(217, 45, 32)";
const WHITE = "rgb(255, 255, 255)";
// The news story the questions come from.
const SOURCE = "https://yourgreatermoncton.ca/128945-2/";
const NO_CALL = /(do not|don’t|don't) call|n’appelez pas|ne pas appeler/i;
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
];

/** A string from the strings file, filled in. One that is not there fails the test that asks for it, not the whole file. */
function s(lang: Lang, key: string, vars: Record<string, string | number> = {}) {
  const value = STRINGS[lang][key];
  if (typeof value !== "string") throw new Error(`${lang}.json has no "${key}"`);
  return value.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

/**
 * A question: its address, its title, the screen Back opens, how its answers are laid out, and the answers in the
 * order they are on the page, each with its words and the screen it opens.
 */
type Question = { n: 1 | 2 | 3; route: string; title: string; back: string; across: number; down: number; answers: { key: string; words: string; to: string }[] };
const QUESTIONS: Question[] = [
  {
    n: 1, route: "/q1", title: "q1.title", back: "/", across: 1, down: 3,
    answers: [
      { key: "yes", words: "q1.yes", to: "/emergency" },
      { key: "no", words: "q1.no", to: "/q2" },
      { key: "notSure", words: "look.notSure", to: "/emergency" },
    ],
  },
  {
    n: 2, route: "/q2", title: "q2.title", back: "/q1", across: 2, down: 2,
    answers: [
      { key: "column", words: "q2.column", to: "/emergency" },
      { key: "haze", words: "q2.haze", to: "/q3" },
      { key: "smell", words: "q2.smell", to: "/q3" },
      { key: "notSure", words: "look.notSure", to: "/emergency" },
    ],
  },
  {
    n: 3, route: "/q3", title: "q3.title", back: "/q2", across: 2, down: 3,
    answers: [
      { key: "firePit", words: "q3.firePit", to: "/nearby-fire" },
      { key: "mulch", words: "q3.mulch", to: "/emergency" },
      { key: "people", words: "q3.people", to: "/emergency" },
      { key: "other", words: "q3.other", to: "/emergency" },
      { key: "nothing", words: "q3.nothing", to: "/location" },
      { key: "notSure", words: "look.notSure", to: "/emergency" },
    ],
  },
];
/** The title of each screen the questions end on. */
const END_TITLE = { "/emergency": "emergency.title", "/nearby-fire": "nearby.title", "/location": "location.title" };
/** The three sky pictures: what each shows, and the words under it. */
const PICTURES = [
  { key: "column", alt: "q2.column.alt", caption: "q2.column" },
  { key: "haze", alt: "q2.haze.alt", caption: "q2.haze" },
  { key: "smell", alt: "q2.smell.alt", caption: "q2.smell" },
];

const title = (page: Page) => page.locator("h1");
const group = (page: Page) => page.locator("main .look-answers");
const answers = (page: Page) => page.locator("main .look-answers a[data-answer]");
const answerTo = (page: Page, key: string) => page.locator(`main .look-answers a[data-answer="${key}"]`);
const centre = (box: Box) => [box.x + box.width / 2, box.y + box.height / 2] as const;

/** Open the app in replay, in a language, once both are saved (so page.goto keeps them). */
async function start(page: Page, lang: Lang) {
  await page.goto("/?mode=replay");
  await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"mode":"replay"'));
  if (lang === "fr") {
    await page.getByRole("button", { name: "Français" }).click();
    await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"lang":"fr"'));
  }
}

/** The question in front: its title, and its answers on the screen. */
async function onQuestion(page: Page, lang: Lang, q: Question) {
  await expect(title(page)).toHaveText(s(lang, q.title));
  await expect(group(page)).toBeVisible();
}

/** A question opened by its address, with its type in place. */
async function openQuestion(page: Page, lang: Lang, q: Question) {
  await start(page, lang);
  await page.goto(q.route);
  await onQuestion(page, lang, q);
  await page.evaluate(() => document.fonts.ready);
}

/** Each answer's words as shown, its picture aside, in the order they are on the page. */
const words = (page: Page) =>
  answers(page).evaluateAll((links) =>
    links.map((link) => {
      let text = "";
      const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) if (!node.parentElement?.closest('svg, [aria-hidden="true"]')) text += node.textContent;
      return text.replace(/\s+/g, " ").trim();
    }),
  );

/** Anything to read in main besides the title, the answers and the About line. */
const otherText = (page: Page) =>
  page.locator("main").evaluate((main) => {
    const found: string[] = [];
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? "").trim();
      if (text && !node.parentElement?.closest("h1, a[data-answer], .look-about, svg")) found.push(text);
    }
    return found;
  });

/** Where each answer is on the screen, with its key. */
const boxes = (page: Page): Promise<(Box & { key: string })[]> =>
  answers(page).evaluateAll((links) =>
    links.map((link) => {
      const { x, y, width, height } = link.getBoundingClientRect();
      return { key: link.getAttribute("data-answer") ?? "", x, y, width, height };
    }),
  );

/** The distinct positions among these, a pixel or more apart, in order: the columns, or the rows. */
const lines = (values: number[]) => [...values].sort((a, b) => a - b).filter((value, i, sorted) => i === 0 || value - sorted[i - 1] >= 1);
const lineOf = (all: number[], value: number) => all.findIndex((line) => Math.abs(line - value) < 1);

/** What the browser holds for the app: the session's one entry, and everything else it could have written. */
const kept = (page: Page) =>
  page.evaluate(() => ({ session: sessionStorage.getItem("smoke-or-fire"), sessionKeys: Object.keys(sessionStorage), local: localStorage.length, cookie: document.cookie }));

/** The address bar, in parts, and what the screen's history entry carries. */
const address = (page: Page) =>
  page.evaluate(() => ({ path: location.pathname, search: location.search, hash: location.hash, carried: history.state?.usr ?? null }));

/** A file of the app itself (no question mark in its address), or the type from Google Fonts. */
const ownFile = (url: URL, origin: string) =>
  url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com" || (url.origin === origin && url.pathname.startsWith("/assets/") && url.search === "" && url.hash === "");

test.describe("tap by tap: every way through the questions, and the screen it ends on", () => {
  for (const lang of LANGS) {
    for (const path of PATHS) {
      test(`${lang.toUpperCase()}: ${path.answers.join(" → ")} ends on ${path.ends}`, async ({ page }) => {
        await start(page, lang);
        await page.locator('a[href="/q1"]').click(); // I smell smoke
        for (const [i, key] of path.answers.entries()) {
          await expect(page).toHaveURL(new RegExp(`${QUESTIONS[i].route}$`));
          await onQuestion(page, lang, QUESTIONS[i]);
          await answer(page, key);
        }
        await expect(page).toHaveURL(new RegExp(`${path.ends}$`));
        await expect(title(page)).toHaveText(s(lang, END_TITLE[path.ends]));
      });
    }

    test(`${lang.toUpperCase()}: each question's answers, top to bottom, and the screen each one opens`, async ({ page }) => {
      await start(page, lang);
      for (const q of QUESTIONS) {
        await page.goto(q.route);
        await onQuestion(page, lang, q);
        // A bare address: nothing after it says which answer was tapped.
        const links = await answers(page).evaluateAll((els) => els.map((el) => [el.getAttribute("data-answer"), el.getAttribute("href")]));
        expect(links, q.route).toEqual(q.answers.map(({ key, to }) => [key, to]));
      }
    });
  }
});

test.describe("each question: one title, answers in words and pictures, big enough to tap", () => {
  for (const lang of LANGS) {
    for (const q of QUESTIONS) {
      test(`${lang.toUpperCase()} ${q.route}: the title and the answers are all there is to read; each answer has a picture and its words`, async ({ page }) => {
        await openQuestion(page, lang, q);
        await expect(page.locator("h1, h2, h3")).toHaveCount(1);
        await expect(page.locator("main h1#look-q.look-title")).toHaveText(s(lang, q.title));
        // No hint under the title, no line under an answer, no counter: no paragraph outside the closed About line.
        expect(await page.locator("main").evaluate((main) => [...main.querySelectorAll("p")].filter((p) => !p.closest("#look-about-text")).map((p) => p.textContent))).toEqual([]);
        expect(await otherText(page)).toEqual([]);

        // The answers: a group named by the question, in order, each with its words and nothing more.
        await expect(group(page)).toHaveAttribute("role", "group");
        await expect(group(page)).toHaveAccessibleName(s(lang, q.title));
        expect(await words(page)).toEqual(q.answers.map((a) => s(lang, a.words)));
        // Never colour alone: a picture or an icon, and the words.
        for (const a of q.answers) {
          await expect(answerTo(page, a.key).locator("svg").first()).toBeVisible();
          await expect(answerTo(page, a.key).getByText(s(lang, a.words), { exact: true })).toBeVisible();
          // Read aloud, an answer is its words and no more; a sky picture is what it shows, then its caption.
          const picture = q.n === 2 ? PICTURES.find((p) => p.key === a.key) : undefined;
          await expect(answerTo(page, a.key)).toHaveAccessibleName(picture ? `${s(lang, picture.alt)} ${s(lang, picture.caption)}` : s(lang, a.words));
        }
        await expect(page.getByRole("link", { name: s(lang, "nav.back"), exact: true })).toHaveAttribute("href", q.back);
      });

      test(`${lang.toUpperCase()} ${q.route}: every answer is 56 px or more each way, and all are the same size, ${q.across} across and ${q.down} down`, async ({ page }) => {
        await openQuestion(page, lang, q);
        const all = await boxes(page);
        expect(all.map((box) => box.key)).toEqual(q.answers.map((a) => a.key));
        for (const box of all) {
          expect(box.height, box.key).toBeGreaterThanOrEqual(56);
          expect(box.width, box.key).toBeGreaterThanOrEqual(56);
        }
        const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
        expect(spread(all.map((box) => box.width))).toBeLessThan(0.5);
        expect(spread(all.map((box) => box.height))).toBeLessThan(0.5);

        // In reading order: left to right, then down.
        const [columns, rows] = [lines(all.map((box) => box.x)), lines(all.map((box) => box.y))];
        expect([columns.length, rows.length]).toEqual([q.across, q.down]);
        expect(all.map((box) => [lineOf(rows, box.y), lineOf(columns, box.x)])).toEqual(q.answers.map((_, i) => [Math.floor(i / q.across), i % q.across]));
        // One across: a row as wide as the screen allows.
        if (q.across === 1) expect(all[0].width).toBeGreaterThan(0.8 * page.viewportSize()!.width);
      });
    }

    test(`${lang.toUpperCase()}: Yes is red with white words; No, Not sure and the sky pictures are white with a navy edge`, async ({ page }) => {
      const [q1, q2] = QUESTIONS;
      await openQuestion(page, lang, q1);
      const fill = (key: string) => answerTo(page, key).evaluate((el) => { const st = getComputedStyle(el); return [st.backgroundColor, st.borderTopWidth, st.borderTopColor]; });
      const ink = (key: string) => answerTo(page, key).locator(".look-label").evaluate((el) => getComputedStyle(el).color);
      for (const a of q1.answers) await expect(answerTo(page, a.key).locator(".look-label")).toHaveText(s(lang, a.words));
      expect([(await fill("yes"))[0], await ink("yes")]).toEqual([RED, WHITE]);
      for (const key of ["no", "notSure"]) expect([...(await fill(key)), await ink(key)], key).toEqual([WHITE, "3px", NAVY, NAVY]);

      await page.goto(q2.route);
      await onQuestion(page, lang, q2);
      for (const { key } of q2.answers) expect(await fill(key), key).toEqual([WHITE, "3px", NAVY]);
    });
  }
});

test.describe("the sky pictures", () => {
  /** Every green on the page: a colour with clearly more green in it than red and than blue. */
  const greens = (page: Page) =>
    page.evaluate(() => {
      const found: string[] = [];
      for (const el of document.querySelectorAll("body *")) {
        const st = getComputedStyle(el);
        for (const colour of [st.fill, st.stroke, st.stopColor, st.color, st.backgroundColor, st.borderTopColor]) {
          const [, r, g, b] = (String(colour ?? "").match(/^rgba?\((\d+), (\d+), (\d+)/) ?? []).map(Number);
          if (g > r + 16 && g > b + 16) found.push(`${el.tagName.toLowerCase()} ${colour}`);
        }
      }
      return found;
    });

  for (const lang of LANGS) {
    test(`${lang.toUpperCase()}: each picture says what it shows, has a caption of four words at most, and the two are read together`, async ({ page }) => {
      await openQuestion(page, lang, QUESTIONS[1]);
      for (const { key, alt, caption } of PICTURES) {
        const tile = answerTo(page, key);
        const picture = tile.locator("svg[role=img]");
        await expect(tile.locator("[role=img]")).toHaveCount(1);
        await expect(picture).toBeVisible();
        await expect(picture).toHaveAttribute("aria-label", s(lang, alt));
        const under = tile.locator(".look-caption");
        await expect(under).toBeVisible();
        await expect(under).toHaveText(s(lang, caption));
        expect(((await under.textContent()) ?? "").trim().split(/\s+/).length, key).toBeLessThanOrEqual(4);
        await expect(tile).toHaveAccessibleName(`${s(lang, alt)} ${s(lang, caption)}`);
      }
      // Not sure has no picture to describe: its question mark is left out of its name.
      const unsure = answerTo(page, "notSure");
      await expect(unsure).toBeVisible();
      await expect(unsure.locator("[role=img]")).toHaveCount(0);
      await expect(unsure).toHaveAccessibleName(s(lang, "look.notSure"));
    });

    test(`${lang.toUpperCase()}: three different drawings, colour aside`, async ({ page }) => {
      await openQuestion(page, lang, QUESTIONS[1]);
      // Each picture as its shapes alone: what is drawn and where, with no fill or stroke.
      const shapes = await answers(page).locator("svg[role=img]").evaluateAll((pictures) =>
        pictures.map((picture) =>
          [...picture.querySelectorAll("*")]
            .map((el) => [el.tagName, ...["d", "points", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "transform"].map((name) => el.getAttribute(name) ?? "")].join(" "))
            .join("\n"),
        ),
      );
      expect(shapes).toHaveLength(3);
      expect(shapes.filter((shape) => shape === "")).toEqual([]);
      expect(new Set(shapes).size).toBe(3);
    });
  }

  test("no green in any picture or icon: the three questions and Nearby fire", async ({ page }) => {
    await start(page, "en");
    for (const q of QUESTIONS) {
      await page.goto(q.route);
      await expect(answers(page).locator("svg").first()).toBeVisible();
      expect(await greens(page), q.route).toEqual([]);
    }
    await page.goto("/nearby-fire");
    await expect(page.locator("main.nearby-main svg").first()).toBeVisible();
    expect(await greens(page), "/nearby-fire").toEqual([]);
  });
});

test.describe("the progress mark: three dots, no words", () => {
  for (const lang of LANGS) {
    for (const q of QUESTIONS) {
      test(`${lang.toUpperCase()} ${q.route}: dot ${q.n} of the three is the wider one`, async ({ page }) => {
        await openQuestion(page, lang, q);
        const mark = page.locator(".look-steps");
        await expect(mark).toHaveCount(1);
        await expect(mark).toBeVisible();
        await expect(mark).toHaveAttribute("role", "img");
        await expect(mark).toHaveAttribute("aria-label", s(lang, "look.step", { n: q.n }));
        await expect(page.locator(".look-dot")).toHaveCount(3);
        const dots = await mark.locator(".look-dot").evaluateAll((els) =>
          els.map((el) => ({ current: el.getAttribute("data-current") === "true", width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })),
        );
        expect(dots.map((dot) => dot.current)).toEqual([1, 2, 3].map((n) => n === q.n));
        // Shape, not colour alone: the current dot is wider than the other two, which are alike.
        const others = dots.filter((dot) => !dot.current);
        for (const dot of dots) expect(Math.min(dot.width, dot.height)).toBeGreaterThan(0);
        for (const other of others) expect(dots[q.n - 1].width).toBeGreaterThan(other.width);
        expect(Math.abs(others[0].width - others[1].width)).toBeLessThan(0.5);
        // No words: nothing inside the mark, and no "Question 1 of 3" anywhere on the screen.
        expect(await mark.evaluate((el) => el.textContent)).toBe("");
        expect(await page.locator("body").innerText()).not.toMatch(/Question \d/);
      });
    }
  }
});

test.describe("About these questions: closed until asked for, then clear of the 911 bar", () => {
  /** How far the revealed text reaches below the top of the 911 bar (nothing, when it is clear of it), and that the bar is the fixed one. */
  const underBar = (page: Page) =>
    page.evaluate(() => {
      const text = document.querySelector("#look-about-text")!.getBoundingClientRect();
      const bar = document.querySelector('a[href="tel:911"]')!.parentElement!;
      return { px: Math.max(0, Math.round(text.bottom - bar.getBoundingClientRect().top)), bar: getComputedStyle(bar).position };
    });

  for (const viewport of VIEWPORTS) {
    test.describe(`${viewport.width} × ${viewport.height}`, () => {
      test.use({ viewport });
      for (const lang of LANGS) {
        for (const q of QUESTIONS) {
          test(`${lang.toUpperCase()} ${q.route}: closed at first; a tap shows the line and its source above the 911 bar; a second tap closes it`, async ({ page }) => {
            await openQuestion(page, lang, q);
            const toggle = page.locator(".look-about-toggle");
            const text = page.locator("#look-about-text");
            await expect(toggle).toHaveAccessibleName(s(lang, "look.about"));
            await expect(page.getByRole("button", { name: s(lang, "look.about"), exact: true })).toHaveCount(1);
            await expect(toggle).toHaveAttribute("aria-expanded", "false");
            await expect(toggle).toHaveAttribute("aria-controls", "look-about-text");
            // A text link: 16 px, underlined, 56 px to tap.
            expect(await toggle.evaluate((el) => { const st = getComputedStyle(el); return [el.tagName, st.fontSize, st.textDecorationLine]; })).toEqual(["BUTTON", "16px", "underline"]);
            expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(56);
            await expect(text).toHaveCount(1); // on the page, not shown
            await expect(text).toBeHidden();

            await toggle.click();
            await expect(toggle).toHaveAttribute("aria-expanded", "true");
            await expect(text).toBeVisible();
            await expect(text.locator("p")).toHaveText(s(lang, "look.about.body"));
            const source = text.locator("a");
            await expect(source).toHaveText(s(lang, "look.about.source"));
            expect(s(lang, "look.about.source.url")).toBe(SOURCE);
            await expect(source).toHaveAttribute("href", SOURCE);
            await expect(source).toHaveAttribute("target", "_blank");
            expect(((await source.getAttribute("rel")) ?? "").split(/\s+/)).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));
            expect((await source.boundingBox())!.height).toBeGreaterThanOrEqual(56);
            // Shown where it can be read: its bottom edge at or above the top of the 911 bar.
            await expect.poll(() => underBar(page)).toEqual({ px: 0, bar: "fixed" });
            // The line and its source, and nothing against calling 911.
            expect(await page.locator("body").innerText()).not.toMatch(NO_CALL);

            await toggle.click();
            await expect(toggle).toHaveAttribute("aria-expanded", "false");
            await expect(text).toHaveCount(1);
            await expect(text).toBeHidden();
          });
        }
      }
    });
  }
});

test.describe("Nearby fire: it may explain the smell; Call 911 is the main thing to tap, with one link under it on to the trace", () => {
  for (const viewport of VIEWPORTS) {
    test.describe(`${viewport.width} × ${viewport.height}`, () => {
      test.use({ viewport });
      for (const lang of LANGS) {
        test(`${lang.toUpperCase()}: one line, a second line, and the big red Call 911 button on screen; no 911 bar; under it, the link on to the trace`, async ({ page }) => {
          await start(page, lang);
          await page.goto("/nearby-fire");
          await expect(title(page)).toHaveText(s(lang, "nearby.title"));
          await expect(page.locator("main p")).toHaveText(s(lang, "nearby.sub"));
          await page.evaluate(() => document.fonts.ready);

          // One Call 911 on the whole screen, in main: red, with its icon and its words, 104 px tall or more.
          await expect(page.locator('a[href="tel:911"]')).toHaveCount(1);
          const call = page.locator('main a[href="tel:911"]');
          await expect(call).toHaveText(s(lang, "emergency.call"));
          await expect(call.locator("svg").first()).toBeVisible();
          expect(await call.evaluate((el) => { const st = getComputedStyle(el); return [st.backgroundColor, st.color]; })).toEqual([RED, WHITE]);
          const box = (await call.boundingBox())!;
          expect(box.height).toBeGreaterThanOrEqual(104);
          // All of it on the screen as the screen opens.
          expect(await page.evaluate(() => window.scrollY)).toBe(0);
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.5);
          // The button is the screen's own: there is no fixed bar around it.
          expect(await call.evaluate((el) => [el, el.parentElement!].map((part) => getComputedStyle(part).position))).not.toContain("fixed");

          // One more thing to tap in main, under the button: the link on to the trace, smaller and not red.
          await expect(page.locator("main a, main button")).toHaveCount(2);
          const check = page.locator('main a[href="/location"]');
          await expect(check).toHaveText(s(lang, "nearby.check"));
          const link = (await check.boundingBox())!;
          expect(link.height).toBeGreaterThanOrEqual(56);
          expect(link.y).toBeGreaterThanOrEqual(box.y + box.height - 0.5);
          expect(link.y + link.height).toBeLessThanOrEqual(viewport.height + 0.5); // on the screen as it opens
          expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0); // nothing to scroll
          expect(link.width * link.height).toBeLessThan(box.width * box.height);
          expect(parseFloat(await check.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(18);
          // One red button on the screen: Call 911.
          const red = await page.locator("a, button").evaluateAll((els) => els.filter((el) => getComputedStyle(el).backgroundColor === "rgb(217, 45, 32)").map((el) => el.getAttribute("href")));
          expect(red).toEqual(["tel:911"]);
          const text = await page.locator("body").innerText();
          expect(text).not.toMatch(/safe|sécuri/i);
          expect(text).not.toMatch(NO_CALL);
        });
      }
    });
  }

  for (const lang of LANGS) {
    test(`${lang.toUpperCase()}: Back goes to the last question`, async ({ page }) => {
      await start(page, lang);
      await page.goto("/nearby-fire");
      await expect(title(page)).toHaveText(s(lang, "nearby.title"));
      const back = page.getByRole("link", { name: s(lang, "nav.back"), exact: true });
      await expect(back).toHaveAttribute("href", "/q3");
      await back.click();
      await expect(page).toHaveURL(/\/q3$/);
      await onQuestion(page, lang, QUESTIONS[2]);
    });
  }

  for (const lang of LANGS) {
    test(`${lang.toUpperCase()}: the link under Call 911 opens Where are you?`, async ({ page }) => {
      await start(page, lang);
      await page.goto("/nearby-fire");
      const check = page.getByRole("link", { name: s(lang, "nearby.check"), exact: true });
      await expect(check).toHaveAttribute("href", "/location");
      await check.click();
      await expect(page).toHaveURL(/\/location$/);
      await expect(page.locator("h1")).toHaveText(s(lang, "location.title"));
    });
  }

  // On the next screen the 911 bar is at the bottom, where this link is (at 320 px its Call 911 button is as wide as the
  // screen). The link waits out a double tap before it leads on, so the second tap falls here: not on that button, and
  // not on the search box. Replay, where the banner makes the screen its tallest; as the screen opens, and at its end.
  for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 550 }, { width: 360, height: 640 }, { width: 320, height: 568 }]) {
    for (const lang of LANGS) {
      test(`${viewport.width} × ${viewport.height} ${lang.toUpperCase()}: a double tap anywhere on the link opens Where are you? and lands on nothing there`, async ({ page }) => {
        test.setTimeout(60_000);
        await page.setViewportSize(viewport);
        // Any tap on a phone number is counted, and stopped: no call is placed.
        await page.addInitScript(() => {
          const w = window as unknown as { __tel: number };
          w.__tel = 0;
          document.addEventListener("click", (event) => {
            if (!(event.target as Element).closest('a[href^="tel:"]')) return;
            w.__tel += 1;
            event.preventDefault();
          }, true);
        });
        await start(page, lang);
        let taps = 0;
        for (const scrolled of [false, true]) {
          for (const [along, down] of [[0.1, 0.15], [0.5, 0.15], [0.9, 0.15], [0.1, 0.85], [0.5, 0.85], [0.9, 0.85]]) {
            await page.goto("/nearby-fire");
            await page.evaluate(() => document.fonts.ready);
            const check = page.locator('main a[href="/location"]');
            await expect(check).toHaveText(s(lang, "nearby.check"));
            if (scrolled) await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
            else expect(await page.evaluate(() => window.scrollY)).toBe(0);
            const box = (await check.boundingBox())!;
            // Near the top of the link and near its bottom, no lower than the screen goes.
            const [x, y] = [box.x + box.width * along, Math.min(box.y + box.height * down, viewport.height - 2)];
            if (y < box.y + 1) continue; // the link is under the fold as the screen opens: nothing of it to tap
            taps += 1;
            await page.mouse.click(x, y);
            await page.waitForTimeout(120);
            await page.mouse.click(x, y);
            await expect(page).toHaveURL(/\/location$/);
            await page.waitForTimeout(300);
            const landed = await page.evaluate(() => ({ tel: (window as unknown as { __tel: number }).__tel, focus: document.activeElement?.tagName }));
            expect(landed, `${scrolled ? "scrolled to the end" : "as the screen opens"}, ${along} along the link and ${down} down it, at ${Math.round(x)}, ${Math.round(y)}`).toEqual({ tel: 0, focus: "BODY" });
          }
        }
        expect(taps).toBeGreaterThanOrEqual(6);
      });
    }
  }

  // Back on Where are you? returns to the screen the person came from: the last question, or Nearby fire when they came
  // by its link. That is remembered only while the app is open. Opened by its address, reloaded, or reached from any
  // other screen, Back goes to the last question.
  const backLink = (page: Page, lang: Lang) => page.getByRole("link", { name: s(lang, "nav.back"), exact: true });
  /** From Check: I smell smoke, then these answers, one question after another. */
  async function through(page: Page, lang: Lang, keys: string[]) {
    await start(page, lang);
    await page.locator('a[href="/q1"]').click(); // I smell smoke
    for (const key of keys) await answer(page, key);
  }
  /** To Where are you? by the link: no flames, grey haze, a neighbour's fire pit, then the link under Call 911. */
  async function byTheLink(page: Page, lang: Lang) {
    await through(page, lang, ["no", "haze", "firePit"]);
    await expect(page).toHaveURL(/\/nearby-fire$/);
    await page.getByRole("link", { name: s(lang, "nearby.check"), exact: true }).click();
    await expect(page).toHaveURL(/\/location$/); // the link leads on once a double tap is over
    await expect(title(page)).toHaveText(s(lang, "location.title"));
  }

  for (const lang of LANGS) {
    test(`${lang.toUpperCase()}: Where are you? reached by answering Nothing: Back goes to the last question`, async ({ page }) => {
      await through(page, lang, ["no", "haze", "nothing"]);
      await expect(page).toHaveURL(/\/location$/);
      await expect(title(page)).toHaveText(s(lang, "location.title"));
      await expect(backLink(page, lang)).toHaveAttribute("href", "/q3");
      await backLink(page, lang).click();
      await expect(page).toHaveURL(/\/q3$/);
      await onQuestion(page, lang, QUESTIONS[2]);
    });

    test(`${lang.toUpperCase()}: Where are you? reached by the link: Back returns to Nearby fire`, async ({ page }) => {
      await byTheLink(page, lang);
      await expect(backLink(page, lang)).toHaveAttribute("href", "/nearby-fire");
      await backLink(page, lang).click();
      await expect(page).toHaveURL(/\/nearby-fire$/);
      await expect(title(page)).toHaveText(s(lang, "nearby.title"));
    });

    test(`${lang.toUpperCase()}: Where are you? opened by its address: Back goes to the last question`, async ({ page }) => {
      await start(page, lang);
      await page.goto("/location");
      await expect(title(page)).toHaveText(s(lang, "location.title"));
      await expect(backLink(page, lang)).toHaveAttribute("href", "/q3");
    });

    test(`${lang.toUpperCase()}: having come by the link is kept nowhere: not in the address, the history entry or the browser's storage; after a reload, Back goes to the last question`, async ({ page }) => {
      await byTheLink(page, lang);
      await expect(backLink(page, lang)).toHaveAttribute("href", "/nearby-fire");
      expect(await address(page)).toEqual({ path: "/location", search: "", hash: "", carried: null });
      // The session's one entry: mode, language, no place, no location. Nothing else anywhere.
      const { session, sessionKeys, local, cookie } = await kept(page);
      expect(sessionKeys).toEqual(["smoke-or-fire"]);
      expect(Object.keys(JSON.parse(session!)).sort()).toEqual(["lang", "mode", "place", "shared"]);
      expect(JSON.parse(session!)).toEqual({ mode: "replay", lang, place: null, shared: null });
      expect([local, cookie]).toEqual([0, ""]);

      await page.reload();
      await expect(title(page)).toHaveText(s(lang, "location.title"));
      await expect(backLink(page, lang)).toHaveAttribute("href", "/q3");
    });

    test(`${lang.toUpperCase()}: Where are you? reached by the link, then again by Back from the next screen: Back goes to the last question`, async ({ page }) => {
      await byTheLink(page, lang);
      await expect(backLink(page, lang)).toHaveAttribute("href", "/nearby-fire");
      await page.locator("input[type=search]").fill("Monc");
      await page.getByRole("option", { name: /^Moncton,/ }).click();
      await expect(page).toHaveURL(/\/loading$/);
      await expect(title(page)).toHaveText(s(lang, "loading.title"));
      await expect(backLink(page, lang)).toHaveAttribute("href", "/location");
      await backLink(page, lang).click();
      await expect(page).toHaveURL(/\/location$/);
      await expect(title(page)).toHaveText(s(lang, "location.title"));
      await expect(backLink(page, lang)).toHaveAttribute("href", "/q3");
    });
  }
});

test.describe("nothing about the answers is kept or sent", () => {
  for (const lang of LANGS) {
    for (const path of PATHS) {
      test(`${lang.toUpperCase()}: ${path.answers.join(" → ")}`, async ({ page }) => {
        await start(page, lang);
        await page.locator('a[href="/q1"]').click(); // I smell smoke
        await onQuestion(page, lang, QUESTIONS[0]);
        const before = await kept(page);
        const sent: { method: string; url: string }[] = [];
        page.on("request", (request) => sent.push({ method: request.method(), url: request.url() }));
        const visited: string[] = [];
        page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) visited.push(frame.url()); });

        // Each screen's address is its path alone, and its history entry carries nothing.
        let on = QUESTIONS[0].route;
        expect(await address(page)).toEqual({ path: on, search: "", hash: "", carried: null });
        for (const [i, key] of path.answers.entries()) {
          await answer(page, key);
          on = QUESTIONS[i].answers.find((a) => a.key === key)!.to;
          await expect.poll(() => address(page)).toEqual({ path: on, search: "", hash: "", carried: null });
        }
        expect(on).toBe(path.ends);
        await expect(title(page)).toHaveText(s(lang, END_TITLE[path.ends]));
        await page.waitForTimeout(300); // whatever the last screen asks for has gone out

        // The session's one entry is as it was: mode, language, no place, no location. Nothing else anywhere.
        const after = await kept(page);
        expect(before.session).not.toBeNull();
        expect(after.session).toBe(before.session);
        expect(Object.keys(JSON.parse(after.session!)).sort()).toEqual(["lang", "mode", "place", "shared"]);
        expect(JSON.parse(after.session!)).toEqual({ mode: "replay", lang, place: null, shared: null });
        expect(after.sessionKeys).toEqual(["smoke-or-fire"]);
        expect([after.local, after.cookie]).toEqual([0, ""]);
        expect(visited.filter((url) => /[?#]/.test(url))).toEqual([]);
        // Nothing posted, nothing fetched but the app's own files and the type.
        const origin = new URL(page.url()).origin;
        expect(sent.filter(({ method, url }) => method !== "GET" || !ownFile(new URL(url), origin)).map(({ method, url }) => `${method} ${url}`)).toEqual([]);
      });
    }
  }

  test("the comparison does notice a write: switching language changes what is kept", async ({ page }) => {
    await start(page, "en");
    await page.locator('a[href="/q1"]').click();
    await onQuestion(page, "en", QUESTIONS[0]);
    const before = await kept(page);
    await page.getByRole("button", { name: "Français" }).click();
    await expect.poll(async () => (await kept(page)).session).not.toBe(before.session);
    expect(JSON.parse((await kept(page)).session!)).toEqual({ ...JSON.parse(before.session!), lang: "fr" });
  });
});

test.describe("keyboard only", () => {
  /** The focus ring an element shows: its outline's style and width. */
  const ring = (locator: Locator) => locator.evaluate((el) => { const st = getComputedStyle(el); return { style: st.outlineStyle, width: parseFloat(st.outlineWidth) }; });

  for (const lang of LANGS) {
    test(`${lang.toUpperCase()}: Tab reaches each answer in order, with a focus ring; Enter answers; the next question takes the focus`, async ({ page }) => {
      await start(page, lang);
      await page.locator('a[href="/q1"]').focus(); // I smell smoke
      await page.keyboard.press("Enter");
      for (const [i, pick] of ["no", "haze", null].entries()) {
        const q = QUESTIONS[i];
        await onQuestion(page, lang, q);
        // Reached from inside the app, the question itself has the focus, with no ring of its own.
        const heading = page.locator("h1.look-title");
        await expect(heading).toBeFocused();
        const own = await ring(heading);
        expect(own.style === "none" || own.width === 0, `the title's outline: ${own.style}, ${own.width}px`).toBe(true);
        for (const { key } of q.answers) {
          await page.keyboard.press("Tab");
          await expect(answerTo(page, key)).toBeFocused();
          const shown = await ring(answerTo(page, key));
          expect(shown.style, key).not.toBe("none");
          expect(shown.width, key).toBeGreaterThanOrEqual(2);
        }
        if (pick === null) break;
        // Back up to the answer, and Enter.
        for (let steps = q.answers.length - 1 - q.answers.findIndex((a) => a.key === pick); steps > 0; steps--) await page.keyboard.press("Shift+Tab");
        await expect(answerTo(page, pick)).toBeFocused();
        await expect(group(page)).toHaveAttribute("data-ready", "true");
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(new RegExp(`${QUESTIONS[i + 1].route}$`));
      }

      // After the last answer comes the About line; opened, its source is the next stop.
      const toggle = page.locator(".look-about-toggle");
      await page.keyboard.press("Tab");
      await expect(toggle).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Tab");
      await expect(page.locator("#look-about-text a")).toBeFocused();
    });

    test(`${lang.toUpperCase()}: the About line opens with Enter and with Space`, async ({ page }) => {
      await openQuestion(page, lang, QUESTIONS[0]);
      const toggle = page.locator(".look-about-toggle");
      const text = page.locator("#look-about-text");
      await toggle.focus();
      await page.keyboard.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(text).toBeVisible();
      await page.keyboard.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(text).toBeHidden();
      await page.keyboard.press("Space");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(text).toBeVisible();
    });
  }
});

// The taps here are the mouse itself at a point, with no waiting for the answer to be ready. The page's clock is the
// test's: a question's first 400 ms pass only when the test lets them, so nothing depends on how fast the machine is.
test.describe("a tap in a question's first moments is ignored, so a double tap can't answer the next question unseen", () => {
  /** Stop the page's clock. */
  const stopClock = (page: Page) => page.clock.pauseAt(Date.now() + 60_000);
  const pathname = (page: Page) => page.evaluate(() => location.pathname);
  /** The answer under a point of the screen. */
  const answerAt = (page: Page, x: number, y: number) =>
    page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest("a[data-answer]")?.getAttribute("data-answer") ?? null, [x, y]);

  /** The middle of the largest patch of screen a box shares with one of the others (16 px each way or more), and which one. */
  function sharedSpot(box: Box, others: (Box & { key: string })[]) {
    let best: { x: number; y: number; key: string; area: number } | null = null;
    for (const other of others) {
      const [left, right] = [Math.max(box.x, other.x), Math.min(box.x + box.width, other.x + other.width)];
      const [top, bottom] = [Math.max(box.y, other.y), Math.min(box.y + box.height, other.y + other.height)];
      if (right - left < 16 || bottom - top < 16) continue;
      const area = (right - left) * (bottom - top);
      if (!best || area > best.area) best = { x: (left + right) / 2, y: (top + bottom) / 2, key: other.key, area };
    }
    return best;
  }

  for (const lang of LANGS) {
    test(`${lang.toUpperCase()}: a double tap on No answers the first question only, though its second tap lands on a sky picture`, async ({ page }) => {
      await page.clock.install();
      await start(page, lang);
      // Where the No row and a sky picture share the screen: there, the second tap of a double tap lands on that picture.
      const [q1, q2] = QUESTIONS;
      await page.goto(q2.route);
      await onQuestion(page, lang, q2);
      await page.evaluate(() => document.fonts.ready);
      const tiles = await boxes(page);
      await page.goto(q1.route);
      await onQuestion(page, lang, q1);
      await page.evaluate(() => document.fonts.ready);
      const spot = sharedSpot((await boxes(page)).find((box) => box.key === "no")!, tiles);
      expect(spot, "a spot inside both No and a sky picture").not.toBeNull();
      const { x, y, key } = spot!;
      await expect(group(page)).toHaveAttribute("data-ready", "true");
      await stopClock(page);

      await page.mouse.click(x, y); // No
      await expect(page).toHaveURL(/\/q2$/);
      await expect(group(page)).toHaveAttribute("data-ready", "false");
      await page.clock.runFor(100);
      await page.mouse.click(x, y); // the second tap, 100 ms after the first
      expect(await pathname(page)).toBe(q2.route);
      await page.clock.runFor(1000);
      await expect(group(page)).toHaveAttribute("data-ready", "true");
      expect(await pathname(page)).toBe(q2.route);
      await expect(title(page)).toHaveText(s(lang, q2.title));

      // Not a miss: that spot is the picture, and now that the question has been on screen a while, the same tap answers it.
      expect(await answerAt(page, x, y)).toBe(key);
      await page.mouse.click(x, y);
      await expect(page).toHaveURL(new RegExp(`${q2.answers.find((a) => a.key === key)!.to}$`));
    });

    test(`${lang.toUpperCase()}: a tap before a question is ready does nothing; the same tap answers once it is`, async ({ page }) => {
      await page.clock.install();
      await start(page, lang);
      await stopClock(page); // on Check: the first question's first moments won't pass by themselves
      const [q1, q2] = QUESTIONS;
      await page.mouse.click(...centre((await page.locator('a[href="/q1"]').boundingBox())!)); // I smell smoke
      await onQuestion(page, lang, q1);
      await expect(group(page)).toHaveAttribute("data-ready", "false");
      const no = centre((await answerTo(page, "no").boundingBox())!);
      await page.mouse.click(...no);
      expect(await pathname(page)).toBe(q1.route);
      await page.clock.runFor(200);
      await expect(group(page)).toHaveAttribute("data-ready", "false");
      await page.mouse.click(...no);
      expect(await pathname(page)).toBe(q1.route);
      await expect(title(page)).toHaveText(s(lang, q1.title));

      // Only the answers wait. Call 911 takes a tap from the first moment: the app does not stop it. (The test does,
      // after noting that, so no call is placed.)
      const call = page.locator("a.sticky-call");
      const [x, y] = centre((await call.boundingBox())!);
      const stopped = await page.evaluate(([x, y]) => {
        const link = document.querySelector("a.sticky-call")!;
        const onTop = link.contains(document.elementFromPoint(x, y));
        let byTheApp: boolean | null = null;
        window.addEventListener("click", (event) => { byTheApp = event.defaultPrevented; event.preventDefault(); }, { once: true });
        (link as HTMLElement).click();
        return { onTop, byTheApp };
      }, [x, y]);
      expect(stopped).toEqual({ onTop: true, byTheApp: false });
      await expect(group(page)).toHaveAttribute("data-ready", "false");

      await page.clock.runFor(400);
      await expect(group(page)).toHaveAttribute("data-ready", "true");
      await page.mouse.click(...no);
      await expect(page).toHaveURL(/\/q2$/);
      await onQuestion(page, lang, q2);
    });
  }
});

test.describe("reduced motion", () => {
  /** How an answer moves when pressed: what its transition is on, and for how long. */
  const press = (link: Locator) =>
    link.evaluate((el) => {
      const st = getComputedStyle(el);
      return { on: st.transitionProperty, seconds: Math.max(...st.transitionDuration.split(",").map((duration) => parseFloat(duration))) };
    });
  /** The answer's size while a finger holds it down (1: as it was). The tap itself is cancelled, so the screen stays. */
  async function held(page: Page, link: Locator, settle: (scale: () => Promise<number>) => Promise<void>) {
    await page.evaluate(() => document.addEventListener("click", (event) => event.preventDefault(), true));
    await page.mouse.move(...centre((await link.boundingBox())!));
    await page.mouse.down();
    await settle(() => link.evaluate((el) => { const t = getComputedStyle(el).transform; return t === "none" ? 1 : Number(t.match(/^matrix\(([-\d.]+)/)?.[1]); }));
    await page.mouse.up();
  }

  for (const lang of LANGS) {
    test(`${lang.toUpperCase()}: as a rule, an answer shrinks a little under the finger`, async ({ page }) => {
      await openQuestion(page, lang, QUESTIONS[0]);
      const no = answerTo(page, "no");
      const { on, seconds } = await press(no);
      expect(on).toMatch(/transform|all/);
      expect(seconds).toBeGreaterThan(0);
      await held(page, no, (scale) => expect.poll(scale).toBeLessThan(1));
      await expect(page).toHaveURL(/\/q1$/);
    });
  }

  test.describe("when the phone asks for it", () => {
    test.use({ reducedMotion: "reduce" });
    for (const lang of LANGS) {
      test(`${lang.toUpperCase()}: an answer doesn't move`, async ({ page }) => {
        await openQuestion(page, lang, QUESTIONS[0]);
        const no = answerTo(page, "no");
        const { on, seconds } = await press(no);
        expect(on === "none" || seconds < 0.001, `a transition on ${on} for ${seconds} s`).toBe(true);
        await held(page, no, async (scale) => {
          await page.waitForTimeout(200); // longer than the press would take
          expect(await scale()).toBe(1);
        });
        await expect(page).toHaveURL(/\/q1$/);
      });
    }
  });
});
