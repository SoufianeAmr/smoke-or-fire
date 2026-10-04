// "Is burning allowed today?": the province's burn status for the person's county, on one card under "Why?" on the
// verdict screen. Each state by its shape, its word and its colour; the county; the time; the town's rules; the three
// tips; Fire Watch; the sources; Listen; the keyboard; small screens. Live answers are the engine's recorded ones with a
// `burn` field as the engine gives it; the replay has the field the engine saved (not checked).
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { TEST_ENGINE_URL } from "./engine";
import { openWhy, sheetTo } from "./verdict";

// Several of these tests open the verdict more than once: slow on a busy machine.
test.describe.configure({ timeout: 90_000 });

type Lang = "en" | "fr";
type State ="no_burn" | "restricted" | "permitted" | "season_closed" | "not_checked";
const LANGS = ["en", "fr"] as const;
const STRINGS: Record<Lang, Record<string, string>> = {
  en: JSON.parse(readFileSync(new URL("../src/i18n/en.json", import.meta.url), "utf8")),
  fr: JSON.parse(readFileSync(new URL("../src/i18n/fr.json", import.meta.url), "utf8")),
};
const s = (lang: Lang, key: string, vars: Record<string, string | number> = {}) => {
  expect(STRINGS[lang][key], `"${key}" in ${lang}.json`).toBeDefined();
  return STRINGS[lang][key].replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
};
const demo = (town: string) => JSON.parse(readFileSync(new URL(`../../data/demo/${town}.json`, import.meta.url), "utf8"));
/** Text as a person reads it: no-break spaces and line breaks as plain spaces. */
const plain = (text: string | null) => (text ?? "").replace(/\s+/g, " ").trim();
const NAVY = "rgb(27, 42, 74)";
const RED = "rgb(217, 45, 32)";
const AMBER = "rgb(247, 144, 9)";
const GREEN = "rgb(30, 123, 58)";
const WHITE = "rgb(255, 255, 255)";
// The wording src/i18n/strings.test.ts bans in every string, and the word "safe".
const NO_CALL = /safe|sécuri|(do not|don’t|never|no need to) call|ne (pas|jamais) appeler|n’appelez (pas|jamais)/i;

const CATEGORY: State[] = ["no_burn", "restricted", "permitted"];
/** The engine's burn field for Moncton (Westmorland County), checked at 8:52 a.m. Atlantic on the answer's day. */
const burnOf = (state: State, changes: object = {}) => ({
  state,
  county: "Westmorland",
  validUntil: CATEGORY.includes(state) ? "2025-08-25T17:00:00Z" : null,
  checkedAt: "2025-08-25T11:52:07Z",
  source: "gnb_burn_categories",
  reason: state === "not_checked" ? "unavailable" : null,
  ...changes,
});
/** A live answer made of the engine's recorded one for Moncton, with `burn` as its burn field (undefined: none). */
const liveAnswer = (burn: object | null | undefined, town = "moncton") => {
  const recorded = demo(town);
  const { burn: _recorded, ...rest } = recorded;
  return { ...rest, mode: "live", wind: { ...recorded.wind, run: "2025-08-25T06:00:00Z", recordedAt: null }, ...(burn === undefined ? {} : { burn }) };
};

async function start(page: Page, lang: Lang, mode: "replay" | "live") {
  await page.goto(`/?mode=${mode}`);
  await page.waitForFunction((m) => sessionStorage.getItem("smoke-or-fire")?.includes(`"mode":"${m}"`), mode);
  if (lang === "fr") {
    await page.getByRole("button", { name: "Français" }).click();
    await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"lang":"fr"'));
  }
}
async function search(page: Page, town: string) {
  await page.goto("/location");
  await page.locator("input[type=search]").fill(town);
  await page.getByRole("option", { name: new RegExp(`^${town},`) }).first().click();
  await expect(page.locator("#verdict-h")).toBeVisible({ timeout: 15_000 });
  // The card is in the sheet, under "Why?": one tap up from the answer ("Sources and why").
  await sheetTo(page, "half");
}
async function replay(page: Page, lang: Lang, town: string) {
  await start(page, lang, "replay");
  await search(page, town);
}
/** The phone's clock: the time of the engine's recorded answer (9 a.m. Atlantic on Aug 25, 2025), unless a test moves it. */
const CHECKED = "2025-08-25T12:00:00Z";
/** A screen left open: the phone's clock moves on, and the page is looked at again. */
async function later(page: Page, time: string) {
  await page.clock.setFixedTime(new Date(time));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
}
async function live(page: Page, lang: Lang, answer: object, town = "Moncton") {
  await page.clock.setFixedTime(new Date(CHECKED));
  await page.route(`${TEST_ENGINE_URL}/verdict**`, (route: Route) => route.fulfill({ json: answer, headers: { "access-control-allow-origin": "*" } }));
  await start(page, lang, "live");
  await search(page, town);
}

const card = (page: Page) => page.locator("main section.burn");
const block = (page: Page) => card(page).locator(".burn-status");
const sourcesToggle = (page: Page) => card(page).locator(".burn-sources-toggle");
const listen = (page: Page, lang: Lang) => card(page).getByRole("button", { name: s(lang, "burn.listen.play"), exact: true });
const look = (page: Page) =>
  block(page).evaluate((el) => {
    const style = getComputedStyle(el);
    return { shape: el.querySelector(".burn-shape")!.getAttribute("data-shape"), background: style.backgroundColor, border: `${style.borderTopStyle} ${style.borderTopColor}`, ink: style.color };
  });

// Each state: its shape, its word, and the block's colour and outline. No two share a shape or a word.
const STATES: { state: State; shape: string; background: string; border: string; ink: string }[] = [
  { state: "no_burn", shape: "octagon", background: RED, border: `solid ${RED}`, ink: WHITE },
  { state: "restricted", shape: "triangle", background: AMBER, border: `solid ${AMBER}`, ink: "rgb(26, 29, 33)" },
  { state: "permitted", shape: "circle", background: WHITE, border: `solid ${GREEN}`, ink: "rgb(26, 29, 33)" },
  { state: "season_closed", shape: "square", background: WHITE, border: `solid ${NAVY}`, ink: "rgb(26, 29, 33)" },
  { state: "not_checked", shape: "ring", background: WHITE, border: `dashed ${NAVY}`, ink: "rgb(26, 29, 33)" },
];

test.describe("the status: a shape, a word and a colour, for the person’s county", () => {
  for (const lang of LANGS) {
    for (const expected of STATES) {
      test(`${lang.toUpperCase()} ${expected.state}: under "Why?", the title, the county, the shape with its word, and what the province allows`, async ({ page }) => {
        await live(page, lang, liveAnswer(burnOf(expected.state)));

        await expect(card(page)).toBeVisible();
        await expect(card(page)).toHaveAttribute("data-state", expected.state);
        await expect(card(page).getByRole("heading", { level: 2 })).toHaveText(s(lang, "burn.title"));
        await expect(card(page).locator(".burn-county")).toHaveText(s(lang, "burn.county", { county: "Westmorland" }));
        expect(await look(page)).toEqual({ shape: expected.shape, background: expected.background, border: expected.border, ink: expected.ink });
        await expect(card(page).locator(".burn-word")).toHaveText(s(lang, `burn.word.${expected.state}`));
        await expect(card(page).locator(".burn-detail")).toHaveText(s(lang, `burn.detail.${expected.state}`));
        // The shape is a picture of the word beside it: a screen reader says the word.
        await expect(block(page).locator("svg")).toHaveAttribute("aria-hidden", "true");
        // It comes after "Why?": the answer about the smoke stays first, and nothing above moved.
        const [why, burn] = [(await page.locator("main .why-toggle").boundingBox())!, (await card(page).boundingBox())!];
        expect(burn.y).toBeGreaterThanOrEqual(why.y + why.height);
      });
    }

    test(`${lang.toUpperCase()}: before the province’s update a category says until when it is valid, in plain words, and to check again for the evening`, async ({ page }) => {
      // 17:00 UTC is 2 p.m. in New Brunswick; the check was at 9 a.m. the same day.
      await live(page, lang, liveAnswer(burnOf("no_burn")));
      expect(plain(await card(page).locator(".burn-until").textContent())).toBe(
        lang === "en" ? "Valid until 2 p.m. today. For this evening, check again after 2 p.m." : "Valide jusqu’à 14 h aujourd’hui. Pour ce soir, vérifiez de nouveau après 14 h.",
      );
    });

    test(`${lang.toUpperCase()}: after the province’s update a category is valid until tomorrow, and says when it is updated`, async ({ page }) => {
      await live(page, lang, liveAnswer(burnOf("no_burn", { validUntil: "2025-08-26T17:00:00Z" })));
      expect(plain(await card(page).locator(".burn-until").textContent())).toBe(
        lang === "en" ? "Valid until 2 p.m. tomorrow. The province updates them every day at 2 p.m." : "Valide jusqu’à 14 h demain. La province les met à jour chaque jour à 14 h.",
      );
    });

    test(`${lang.toUpperCase()}: season closed and not checked give no time`, async ({ page }) => {
      await live(page, lang, liveAnswer(burnOf("season_closed")));
      await expect(card(page).locator(".burn-until")).toHaveCount(0);
    });
  }

  test("the five states have five shapes and five words: none is told by colour alone", () => {
    expect(new Set(STATES.map((state) => state.shape)).size).toBe(5);
    for (const lang of LANGS) expect(new Set(STATES.map((state) => STRINGS[lang][`burn.word.${state.state}`])).size).toBe(5);
  });

  test("a category shown after its validity ended says today’s update is due", async ({ page }) => {
    // Checked at 12:00 UTC; the category ended at 11:00 UTC (the engine shows it for 2 hours more, never longer).
    await live(page, "en", liveAnswer(burnOf("permitted", { validUntil: "2025-08-25T11:00:00Z" })));
    await expect(card(page).locator(".burn-until")).toHaveText("This was valid until 8 a.m. today. Today’s update is due.");
  });

  test("a screen left open does not keep an old answer: due after 2 p.m., and not checked once it is over 26 hours old", async ({ page }) => {
    // Checked Monday at 9 a.m.: permitted until Tuesday 2 p.m.
    await live(page, "en", liveAnswer(burnOf("permitted", { validUntil: "2025-08-26T17:00:00Z" })));
    await expect(card(page).locator(".burn-until")).toContainText("tomorrow");

    await later(page, "2025-08-26T13:00:00Z"); // Tuesday 10 a.m.: "tomorrow" is now today
    expect(plain(await card(page).locator(".burn-until").textContent())).toBe("Valid until 2 p.m. today. For this evening, check again after 2 p.m.");
    await later(page, "2025-08-26T17:30:00Z"); // Tuesday 2:30 p.m.
    expect(plain(await card(page).locator(".burn-until").textContent())).toBe("This was valid until 2 p.m. today. Today’s update is due.");
    await expect(card(page)).toHaveAttribute("data-state", "permitted");

    await later(page, "2025-08-26T21:00:00Z"); // Tuesday 6 p.m.: nothing of Monday's answer is left
    await expect(card(page)).toHaveAttribute("data-state", "not_checked");
    await expect(card(page)).toHaveAttribute("data-reason", "expired");
    expect(await look(page)).toMatchObject({ shape: "ring", border: `dashed ${NAVY}` });
    await expect(card(page).locator(".burn-word")).toHaveText("Not checked");
    await expect(card(page).locator(".burn-detail")).toHaveText(s("en", "burn.detail.not_checked.expired"));
    await expect(card(page).locator(".burn-until")).toHaveCount(0);
  });

  for (const lang of LANGS) {
    test(`${lang.toUpperCase()}: not checked says why (the province not read, a county line, no county), and each time that burning is not thereby allowed`, async ({ page }) => {
      const said = lang === "en" ? "That does not mean burning is allowed." : "Cela ne veut pas dire que le brûlage est permis.";
      for (const [reason, key] of [["unavailable", "burn.detail.not_checked"], ["stale", "burn.detail.not_checked"], ["county_line", "burn.detail.not_checked.county_line"], ["no_county", "burn.detail.not_checked.no_county"]]) {
        await live(page, lang, liveAnswer(burnOf("not_checked", { reason, county: reason === "no_county" ? null : "Westmorland" })));
        await expect(card(page).locator(".burn-detail")).toHaveText(s(lang, key));
        expect(plain(await card(page).locator(".burn-detail").textContent())).toContain(said);
        // The province was asked, and nothing of its answer is shown: no "Checked with the province" under "Not checked".
        await sourcesToggle(page).click();
        await expect(card(page).locator("#burn-sources p")).toHaveCount(2);
        await page.unrouteAll();
      }
    });

    test(`${lang.toUpperCase()}: season closed says burning is not thereby allowed, and whom the province says to call`, async ({ page }) => {
      await live(page, lang, liveAnswer(burnOf("season_closed")));
      const detail = plain(await card(page).locator(".burn-detail").textContent());
      expect([detail.includes(lang === "en" ? "That does not mean burning is allowed" : "Cela ne veut pas dire que le brûlage est permis"), detail.includes("506-453-2690")]).toEqual([true, true]);
    });
  }

  test("burning permitted is a flame in a green circle, never a check mark", async ({ page }) => {
    await live(page, "en", liveAnswer(burnOf("permitted")));
    const drawn = await block(page).locator(".burn-shape").evaluate((svg) => [...svg.children].map((el) => `${el.tagName} ${getComputedStyle(el).fill}`));
    expect(drawn).toEqual([`circle ${GREEN}`, `path ${WHITE}`]);
  });

  test("a county that could not be told: not checked, and no county is named", async ({ page }) => {
    await live(page, "en", liveAnswer(burnOf("not_checked", { county: null, reason: "no_county", checkedAt: null })));
    await expect(card(page).locator(".burn-word")).toHaveText("Not checked");
    await expect(card(page).locator(".burn-county")).toHaveCount(0);
  });

  test("the burn status never changes the answer about the smoke", async ({ page }) => {
    const lines: string[] = [];
    for (const burn of [burnOf("no_burn"), burnOf("permitted"), burnOf("not_checked"), null]) {
      await live(page, "en", liveAnswer(burn));
      lines.push(plain(await page.locator("h1#verdict-h").textContent()));
      await page.unrouteAll();
    }
    expect(new Set(lines)).toEqual(new Set(["Drifting smoke · Long Lake fire · 159 km SSW"]));
  });
});

test.describe("where the card is not shown", () => {
  test("outside New Brunswick (Halifax, replay): no card", async ({ page }) => {
    await replay(page, "en", "Halifax");
    await expect(card(page)).toHaveCount(0);
    await openWhy(page);
    await expect(card(page)).toHaveCount(0);
  });

  test("the engine says null (outside New Brunswick), or nothing (an older engine): no card", async ({ page }) => {
    for (const burn of [null, undefined]) {
      await live(page, "en", liveAnswer(burn));
      await expect(page.locator("main .why-toggle")).toBeVisible();
      await expect(card(page)).toHaveCount(0);
      await page.unrouteAll();
    }
  });
});

test.describe("the replay: not checked, and it says why", () => {
  for (const lang of LANGS) {
    test(`${lang.toUpperCase()} Moncton, Aug 25, 2025: a dashed ring, "Not checked", the county, and no past status kept`, async ({ page }) => {
      await replay(page, lang, "Moncton");

      await expect(card(page)).toHaveAttribute("data-state", "not_checked");
      expect(await look(page)).toMatchObject({ shape: "ring", border: `dashed ${NAVY}` });
      await expect(card(page).locator(".burn-word")).toHaveText(s(lang, "burn.word.not_checked"));
      await expect(card(page).locator(".burn-county")).toHaveText(s(lang, "burn.county", { county: "Westmorland" }));
      await expect(card(page).locator(".burn-detail")).toHaveText(s(lang, "burn.detail.not_checked.replay"));
      await expect(card(page).locator(".burn-until")).toHaveCount(0);
      // The tips and the links are there all the same.
      await expect(card(page).locator(".burn-tips li")).toHaveCount(3);
      await sourcesToggle(page).click();
      await expect(card(page).locator("#burn-sources p").first()).toHaveText(s(lang, "burn.source.status.replay"));
    });
  }

  test("each New Brunswick replay town names its own county", async ({ page }) => {
    await start(page, "en", "replay");
    for (const [town, county] of [["Saint John", "Saint John County"], ["Fredericton", "York County"], ["Bathurst", "Gloucester County"], ["Edmundston", "Madawaska County"]]) {
      await search(page, town);
      await expect(card(page).locator(".burn-county")).toHaveText(county);
    }
  });
});

test.describe("the town’s rules, the three tips, Fire Watch and the sources", () => {
  for (const lang of LANGS) {
    test(`${lang.toUpperCase()}: one line on the town’s rules with a search for the town’s by-law, three tips with an icon each, and Fire Watch in ${lang === "en" ? "English" : "French"}`, async ({ page }) => {
      await live(page, lang, liveAnswer(burnOf("permitted")));

      await expect(card(page).locator(".burn-town")).toHaveText(s(lang, "burn.town"));
      const rules = card(page).getByRole("link", { name: s(lang, "burn.town.link") });
      await expect(rules).toHaveAttribute("href", `https://www.google.com/search?q=${encodeURIComponent(s(lang, "burn.town.query", { town: "Moncton" }))}`);

      const tips = card(page).locator(".burn-tips li");
      await expect(tips).toHaveCount(3);
      expect((await tips.allTextContents()).map(plain)).toEqual([s(lang, "burn.tip.fire"), s(lang, "burn.tip.mulch"), s(lang, "burn.tip.butts")].map(plain));
      expect(await tips.evaluateAll((items) => items.map((li) => [li.getAttribute("data-tip"), li.querySelectorAll("svg[aria-hidden=true]").length]))).toEqual([["fire", 1], ["drop", 1], ["butt", 1]]);

      const fireWatch = card(page).getByRole("link", { name: s(lang, "burn.fireWatch") });
      await expect(fireWatch).toHaveAttribute("href", lang === "en" ? "https://www.gnb.ca/en/emergency/fire-watch.html" : "https://www.gnb.ca/fr/urgence/indice-des-feux.html");
      // Each opens the other site in a new tab, and never hands it this page.
      for (const link of [rules, fireWatch]) {
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      }
    });

    test(`${lang.toUpperCase()}: the sources are one tap away: who gives the status, when it was checked, where the tips come from, and four links`, async ({ page }) => {
      await live(page, lang, liveAnswer(burnOf("restricted")));

      const panel = card(page).locator("#burn-sources");
      await expect(sourcesToggle(page)).toHaveAttribute("aria-expanded", "false");
      await expect(panel).toBeHidden();
      await sourcesToggle(page).click();
      await expect(sourcesToggle(page)).toHaveAttribute("aria-expanded", "true");
      await expect(panel).toBeVisible();

      const when = s(lang, "time.atlantic", { date: ["2025", "08", "25"].join(String.fromCharCode(0x2011)), hour: lang === "fr" ? 8 : "08", minute: "52" });
      expect((await panel.locator("p").allTextContents()).map(plain)).toEqual([s(lang, "burn.source.status"), s(lang, "burn.source.checked", { when }), s(lang, "burn.source.tips")].map(plain));
      expect(await panel.getByRole("link").evaluateAll((links) => links.map((a) => a.getAttribute("href")))).toEqual(
        ["article", "tips", "rules", "mulch"].map((name) => s(lang, `burn.source.link.${name}.url`)),
      );
      await sourcesToggle(page).click();
      await expect(panel).toBeHidden();
    });
  }
});

test.describe("built for seniors: large words, large targets, the keyboard, small screens", () => {
  for (const lang of LANGS) {
    test(`${lang.toUpperCase()}: every word on the card is 18 px or more, and everything to tap is 56 px or taller`, async ({ page }) => {
      await live(page, lang, liveAnswer(burnOf("no_burn")));
      await sourcesToggle(page).click();

      const small = await card(page).evaluate((el) =>
        [...el.querySelectorAll("*")].flatMap((node) => {
          if (node.closest("svg")) return [];
          const own = [...node.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
          const size = parseFloat(getComputedStyle(node).fontSize);
          return own && size < 18 ? [`${node.textContent!.trim().slice(0, 30)}: ${size}px`] : [];
        }),
      );
      expect(small).toEqual([]);

      const targets = card(page).locator("a, button");
      await expect(targets).toHaveCount(8); // Listen, the town's rules, Fire Watch, Sources, and the four source links
      for (const target of await targets.all()) {
        const box = (await target.boundingBox())!;
        expect(box.height, plain(await target.textContent())).toBeGreaterThanOrEqual(56);
        expect(box.width, plain(await target.textContent())).toBeGreaterThanOrEqual(56);
      }
    });
  }

  test("the keyboard reaches Listen, the town’s rules, Fire Watch and Sources in that order, each with a visible ring; Enter opens the sources", async ({ page }) => {
    await live(page, "en", liveAnswer(burnOf("permitted")));

    // The card follows "Why?" and the button to Protect your home: from that button, Tab goes into the card.
    await page.locator("main a.protect-link").focus();
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      const focused = page.locator(":focus");
      order.push(plain(await focused.evaluate((el) => el.getAttribute("aria-label") ?? el.querySelector("span span")?.textContent ?? el.textContent)));
      expect(await focused.evaluate((el) => el.closest("section.burn") !== null)).toBe(true);
      expect(await focused.evaluate((el) => { const style = getComputedStyle(el); return `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`; })).toBe(`solid 3px ${NAVY}`);
    }
    expect(order).toEqual(["Listen: is burning allowed today?", "Check your town’s rules", "Fire Watch: the province’s map", "Sources"]);

    await page.keyboard.press("Enter");
    await expect(card(page).locator("#burn-sources")).toBeVisible();
    await page.keyboard.press("Space");
    await expect(card(page).locator("#burn-sources")).toBeHidden();
  });

  for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 667 }]) {
    test.describe(`${viewport.width} × ${viewport.height}`, () => {
      test.use({ viewport });
      for (const lang of LANGS) {
        test(`${lang.toUpperCase()}: nothing is cut off or wider than the screen, and the card ends above the 911 bar`, async ({ page }) => {
          await live(page, lang, liveAnswer(burnOf("restricted")));
          await sourcesToggle(page).click();
          await page.evaluate(() => document.fonts.ready);

          expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
          const outside = await card(page).evaluate((el) => {
            const box = el.getBoundingClientRect();
            return [...el.querySelectorAll("p, h2, h3, a, button, li")].filter((node) => { const b = node.getBoundingClientRect(); return b.left < box.left - 0.5 || b.right > box.right + 0.5; }).map((node) => node.textContent!.trim().slice(0, 30));
          });
          expect(outside).toEqual([]);

          // The sheet scrolled to its end (the screen itself does not scroll): the card's last link is above the bar.
          await page.locator(".answer-sheet").evaluate((el) => el.scrollTo(0, el.scrollHeight));
          const bar = (await page.locator('a[href="tel:911"]').locator("..").boundingBox())!;
          const last = (await card(page).getByRole("link").last().boundingBox())!;
          expect(last.y + last.height).toBeLessThanOrEqual(bar.y + 0.5);
        });
      }
    });
  }

  test("the card adds no Call 911 button and no wording about calling: the screen keeps its one", async ({ page }) => {
    for (const lang of LANGS) {
      await live(page, lang, liveAnswer(burnOf("no_burn")));
      await sourcesToggle(page).click();
      await expect(page.locator('a[href="tel:911"]')).toHaveCount(1);
      await expect(card(page).locator('a[href^="tel:"]')).toHaveCount(0);
      expect(plain(await card(page).textContent())).not.toMatch(NO_CALL);
      await page.unrouteAll();
    }
  });
});

// --- Listen -----------------------------------------------------------------------------------------------------------

/** A speechSynthesis that records what is said and ends each sentence after 10 ms; cancel() interrupts the one being said. */
function fakeSpeech() {
  const w = window as unknown as Record<string, unknown>;
  const spoken: { u: Record<string, unknown>; end: number }[] = [];
  w.__spoken = spoken;
  w.__autoEnd = true;
  w.__cancels = 0;
  class Utterance {
    text: string; lang = ""; voice: unknown = null; rate = 1; pitch = 1; volume = 1; onend: (() => void) | null = null; onerror: (() => void) | null = null;
    constructor(text: string) { this.text = text; }
  }
  Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true, writable: true });
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      getVoices: () => [{ lang: "en-CA", name: "Microsoft Linda - English (Canada)" }, { lang: "fr-CA", name: "Amélie" }],
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
const spoken = (page: Page): Promise<{ text: string; lang: string }[]> =>
  page.evaluate(() => (window as unknown as { __spoken: { u: Record<string, unknown> }[] }).__spoken.map(({ u }) => ({ text: u.text as string, lang: u.lang as string })));
const script = (lang: Lang, key: string, vars: Record<string, string | number> = {}) =>
  s(lang, key).split(/(?<=[.?!])\s+(?=\S)/).map((sentence) => sentence.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match)));
const hold = (page: Page) => page.evaluate(() => { (window as unknown as Record<string, unknown>).__autoEnd = false; });
const verdictListen = (page: Page, lang: Lang): Locator => page.locator("section.glance").getByRole("button", { name: s(lang, "listen.play"), exact: true });

test.describe("Listen reads the card", () => {
  test.beforeEach(async ({ page }) => { await page.addInitScript(fakeSpeech); });

  for (const lang of LANGS) {
    test(`${lang.toUpperCase()}: the question, the answer for the county, when it is updated, the town’s rules, the tips, then Fire Watch`, async ({ page }) => {
      await live(page, lang, liveAnswer(burnOf("no_burn")));

      await listen(page, lang).click();
      await expect(card(page).getByRole("button", { name: s(lang, "burn.listen.stop"), exact: true })).toBeVisible();
      await expect(listen(page, lang)).toBeVisible({ timeout: 10_000 }); // the reading has ended: the button says Listen again

      const county = lang === "en" ? "Westmorland County" : "comté de Westmorland";
      expect(await spoken(page)).toEqual(
        [
          ...script(lang, "voice.burn.no_burn", { county }),
          ...script(lang, "voice.burn.again"), // checked before the day's update
          ...script(lang, "voice.burn.town"),
          ...script(lang, "voice.burn.tips"),
          ...script(lang, "voice.burn.more"),
        ].map((text) => ({ text, lang: lang === "en" ? "en-CA" : "fr-CA" })),
      );
    });
  }

  test("while it reads, the button says Stop, and is named for the card; a tap stops it", async ({ page }) => {
    await live(page, "en", liveAnswer(burnOf("permitted")));
    await hold(page);

    await listen(page, "en").click();
    const stop = card(page).getByRole("button", { name: "Stop: is burning allowed today?", exact: true });
    await expect(stop).toHaveText("Stop");
    await stop.click();
    await expect(listen(page, "en")).toHaveText("Listen");
    expect(await spoken(page)).toHaveLength(1);
  });

  test("one voice at a time: starting the verdict’s Listen stops the card’s, and the card’s stops the verdict’s", async ({ page }) => {
    await live(page, "en", liveAnswer(burnOf("permitted")));
    await hold(page);

    await listen(page, "en").click();
    await expect(card(page).getByRole("button", { name: "Stop: is burning allowed today?" })).toBeVisible();
    await verdictListen(page, "en").click();
    // The card's button is Listen again, and the verdict's is the one reading.
    await expect(listen(page, "en")).toBeVisible();
    await expect(page.locator("section.glance").getByRole("button", { name: "Stop", exact: true })).toBeVisible();
    const afterVerdict = await spoken(page);
    expect([afterVerdict.length, afterVerdict[0].text, /^Drifting smoke/.test(afterVerdict[1].text)]).toEqual([2, "Is burning allowed today?", true]);

    await listen(page, "en").click();
    await expect(verdictListen(page, "en")).toBeVisible();
    // Nothing more of the verdict is said after the card takes over: only the card's first sentence was added.
    await page.waitForTimeout(700);
    expect((await spoken(page)).map((said) => said.text)).toEqual([...afterVerdict.map((said) => said.text), "Is burning allowed today?"]);
  });

  test("opening “Why?” while the card is read does not cut its sentence: the verdict’s own Listen leaves the screen quietly", async ({ page }) => {
    await live(page, "en", liveAnswer(burnOf("no_burn")));
    await hold(page);

    await listen(page, "en").click();
    const reading = card(page).getByRole("button", { name: "Stop: is burning allowed today?", exact: true });
    await expect(reading).toBeVisible();
    const cancels = () => page.evaluate(() => (window as unknown as { __cancels: number }).__cancels);
    const before = await cancels();
    await openWhy(page);

    expect([await cancels(), (await spoken(page)).length]).toEqual([before, 1]);
    await expect(reading).toBeVisible();
  });

  test("the verdict’s own Listen is still the only button named Listen, and reads nothing of the card", async ({ page }) => {
    await live(page, "en", liveAnswer(burnOf("no_burn")));

    await expect(page.getByRole("button", { name: "Listen", exact: true })).toHaveCount(1);
    await verdictListen(page, "en").click();
    await expect(verdictListen(page, "en")).toBeVisible({ timeout: 10_000 });
    expect((await spoken(page)).filter((said) => /burn/i.test(said.text))).toEqual([]);
  });
});
