// Best time to air out your home: one answer from ECCC's FireWork smoke forecast, on a tile under "Why?" on the verdict
// and on a screen of its own, with the 48 hours it comes from. Live answers are the engine's shape, built in ./airout;
// the replay (Aug 25, 2025) has no recorded forecast and says so. In English and French.
import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TEST_ENGINE_URL } from "./engine";
import { FORECASTS, NOT_AVAILABLE, STRINGS, airOut, s, verdict, type Lang } from "./airout";

const LANGS = ["en", "fr"] as const;
const NAVY = "rgb(27, 42, 74)";
const WHITE = "rgb(255, 255, 255)";
/** Text as a person reads it: no-break spaces and line breaks as plain spaces. */
const plain = (text: string | null) => (text ?? "").replace(/\s+/g, " ").trim();
const title = (lang: Lang, answer: string) => plain(s(lang, "airout.title", { label: s(lang, "airout.label"), answer }));
const main = (page: Page) => page.locator("main.airout");
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Every piece of text shown inside `selector` that is under 18 px. */
const smallText = (page: Page, selector: string) =>
  page.locator(selector).evaluate((root) => {
    const found: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const element = node.parentElement!;
      if (!text || !element.checkVisibility()) continue;
      const size = parseFloat(getComputedStyle(element).fontSize);
      if (size < 18) found.push(`${size}px: ${text}`);
    }
    return found;
  });

/** Every link and button inside `selector` that is under 56 px tall. */
const smallTargets = (page: Page, selector: string) =>
  page.locator(`${selector} a, ${selector} button`).evaluateAll((targets) =>
    targets.filter((el) => el.getBoundingClientRect().height < 56).map((el) => `${Math.round(el.getBoundingClientRect().height)}px: ${el.textContent?.trim()}`),
  );

// --- the tile on the verdict ------------------------------------------------------------------------------------

const TILES: [string, object | undefined, (lang: Lang) => string, string][] = [
  ["a best time", FORECASTS.mondayMorning, (lang) => (lang === "en" ? "Mon 5 to 8 a.m." : "lun. 5 h à 8 h"), "window"],
  ["no useful window", FORECASTS.none, (lang) => s(lang, "airout.none"), "none"],
  ["the forecast could not be read", NOT_AVAILABLE, (lang) => s(lang, "airout.notAvailable"), "notAvailable"],
  ["an older engine, with no forecast in its answer", undefined, (lang) => s(lang, "airout.notAvailable"), "notAvailable"],
];

for (const lang of LANGS) {
  test.describe(`The tile on the verdict, ${lang.toUpperCase()}`, () => {
    for (const [what, smoke, answer, state] of TILES) {
      test(`${what}: the question and its one answer, under "Why?"`, async ({ page }) => {
        await verdict(page, lang, "live", smoke);
        const tile = page.locator("main .airout-tile");
        await expect(tile).toHaveCount(1);
        await expect(tile).toHaveAttribute("data-state", state);
        await expect(tile).toHaveAttribute("href", "/air-out");
        expect(plain(await tile.innerText())).toBe(`${s(lang, "airout.label")} ${answer(lang)}`);
        // Under "Why?", which keeps its place: the card, the badges and "Why?" are as they were.
        const [why, box] = [(await page.locator("main .why-toggle").boundingBox())!, (await tile.boundingBox())!];
        expect(box.y).toBeGreaterThanOrEqual(why.y + why.height);
        expect(box.height).toBeGreaterThanOrEqual(72);
        expect(await smallText(page, "main .airout-tile")).toEqual([]);
      });
    }

    test("the replay has no recorded forecast: forecast not available, never a guess", async ({ page }) => {
      await verdict(page, lang, "replay");
      expect(plain(await page.locator("main .airout-tile").innerText())).toBe(`${s(lang, "airout.label")} ${s(lang, "airout.notAvailable")}`);
    });
  });
}

for (const mode of ["live", "replay"] as const) {
  test(`nothing explains the smoke (Halifax, ${mode}): Call 911 stays the largest thing to tap, and the tile waits behind Why?`, async ({ page }) => {
    await verdict(page, "en", mode, FORECASTS.mondayMorning, "Halifax");
    await expect(page.locator(".sticky-first")).toBeVisible();
    const tile = page.locator("main .airout-tile");
    await expect(tile).toHaveCount(1);
    await expect(tile).toBeHidden();
    // Every link and button on the screen as it opens: none is as large as Call 911.
    const sizes = await page.evaluate(() => {
      const area = (el: Element) => el.getBoundingClientRect().width * el.getBoundingClientRect().height;
      const shown = [...document.querySelectorAll("a, button")].filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().top < window.innerHeight);
      const call = shown.filter((el) => el.getAttribute("href") === "tel:911");
      return { calls: call.length, call: area(call[0]), largestOther: Math.max(...shown.filter((el) => !call.includes(el)).map(area)) };
    });
    expect([sizes.calls, sizes.call > sizes.largestOther]).toEqual([1, true]);
    // One tap on "Why?": the tile is there, after the reasons, and opens its screen.
    await page.locator("main .why-toggle").click();
    await expect(tile).toBeVisible();
    expect(plain(await tile.innerText())).toBe(`Best time to air out your home ${mode === "live" ? "Mon 5 to 8 a.m." : "Forecast not available"}`);
    await tile.click();
    await expect(page).toHaveURL(/\/air-out$/);
    await expect(page.locator("main.airout h1")).toBeVisible();
  });
}

test("the tile leaves the card, the badges and Why? above the 911 bar on a small phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await verdict(page, "en", "live", FORECASTS.mondayMorning);
  const [why, bar] = [(await page.locator("main .why-toggle").boundingBox())!, (await page.locator('a[href="tel:911"]').locator("..").boundingBox())!];
  expect(why.y + why.height).toBeLessThanOrEqual(bar.y);
});

// --- the screen --------------------------------------------------------------------------------------------------

for (const lang of LANGS) {
  test.describe(`The screen, ${lang.toUpperCase()}`, () => {
    test("a best time: the answer as the title, what the forecast shows, the caution, then the strip", async ({ page }) => {
      await airOut(page, lang, "live", FORECASTS.mondayMorning);
      await expect(page).toHaveURL(/\/air-out$/);
      const answer = lang === "en" ? "Mon 5 to 8 a.m." : "lun. 5 h à 8 h";
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      expect(plain(await page.getByRole("heading", { level: 1 }).getAttribute("aria-label"))).toBe(title(lang, answer));
      expect(plain(await main(page).locator("h1").innerText())).toBe(`${s(lang, "airout.label")} ${answer}`);
      await expect(main(page)).toHaveAttribute("data-state", "window");
      await expect(main(page).locator("p").nth(0)).toHaveText(s(lang, "airout.shows.clear"));
      await expect(main(page).locator("p").nth(1)).toHaveText(s(lang, "airout.caution"));
      await expect(main(page).getByRole("heading", { level: 2 })).toHaveText(s(lang, "airout.strip.title", { n: 48 }));
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
    });

    test("the strip is labelled a forecast, with ECCC, its model run and when it was read", async ({ page }) => {
      await airOut(page, lang, "live", FORECASTS.mondayMorning);
      const card = main(page).locator(".strip-card");
      await expect(card.getByText(s(lang, "airout.strip.by"))).toBeVisible();
      const when = (date: string, hour: string, minute: string) => s(lang, "time.atlantic", { date, hour: lang === "fr" ? Number(hour) : hour, minute });
      await expect(card.getByText(s(lang, "airout.strip.run", { when: when("2026-10-03", "21", "00") }))).toBeVisible();
      await expect(card.getByText(s(lang, "airout.strip.checked", { when: when("2026-10-04", "03", "24") }))).toBeVisible();
      await expect(card.getByText(s(lang, "airout.strip.zone"))).toBeVisible();
    });

    test("sources: ECCC’s maps, ECCC’s legend for the levels and Health Canada, each a link that opens apart", async ({ page }) => {
      await airOut(page, lang, "live", FORECASTS.mondayMorning);
      for (const name of ["maps", "legend", "health"]) {
        const link = main(page).getByRole("link", { name: s(lang, `airout.link.${name}`) });
        await expect(link).toHaveAttribute("href", s(lang, `airout.link.${name}.url`));
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", "noopener noreferrer");
        await expect(link).toContainText(s(lang, `airout.link.${name}.host`));
      }
      // The rule in one sentence, as the app's reading of the forecast; then Health Canada's advice and the limits.
      await expect(main(page).getByText(s(lang, "airout.rule", { min: 3 }))).toBeVisible();
      await expect(main(page).getByText(s(lang, "airout.advice"))).toBeVisible();
      await expect(main(page).getByText(s(lang, "airout.limits"))).toBeVisible();
    });

    test("no useful window: keep windows closed, said by a square mark as well as its words", async ({ page }) => {
      await airOut(page, lang, "live", FORECASTS.none);
      expect(plain(await page.getByRole("heading", { level: 1 }).getAttribute("aria-label"))).toBe(title(lang, s(lang, "airout.none")));
      await expect(main(page).locator("p").nth(0)).toHaveText(s(lang, "airout.none.body", { n: 48, min: 3 }));
      await expect(main(page).locator("p").nth(1)).toHaveText(s(lang, "airout.none.again"));
      // The strip is still there to look at, with no best time on it or in its legend.
      await expect(main(page).locator(".strip-bar[data-level]:not(.strip-legend *)")).toHaveCount(48);
      await expect(main(page).locator(".strip-best")).toHaveCount(0);
      await expect(main(page).locator(".strip-legend")).not.toContainText(s(lang, "airout.legend.best"));
      const mark = main(page).locator(".airout-mark");
      expect(await mark.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).borderTopLeftRadius.endsWith("%") && getComputedStyle(el).borderTopLeftRadius !== "50%"])).toEqual([NAVY, true]);
    });

    test("the forecast could not be read: said plainly, no strip, a dashed mark, and ECCC’s own maps a tap away", async ({ page }) => {
      await airOut(page, lang, "live", NOT_AVAILABLE);
      expect(plain(await page.getByRole("heading", { level: 1 }).getAttribute("aria-label"))).toBe(title(lang, s(lang, "airout.notAvailable")));
      await expect(main(page).locator("p").nth(0)).toHaveText(s(lang, "airout.notAvailable.body"));
      await expect(main(page).locator(".strip-card")).toHaveCount(0);
      expect(await main(page).locator(".airout-mark").evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).borderTopStyle])).toEqual([WHITE, "dashed"]);
      await expect(main(page).getByRole("link", { name: s(lang, "airout.link.maps") })).toBeVisible();
      await expect(main(page).getByRole("link", { name: s(lang, "airout.link.legend") })).toHaveCount(0);
    });

    test("the replay: forecast not available, and why", async ({ page }) => {
      await airOut(page, lang, "replay");
      expect(plain(await page.getByRole("heading", { level: 1 }).getAttribute("aria-label"))).toBe(title(lang, s(lang, "airout.notAvailable")));
      await expect(main(page).locator("p").nth(0)).toHaveText(s(lang, "airout.notAvailable.replay"));
      await expect(main(page).locator(".strip-card")).toHaveCount(0);
      await expect(page.getByRole("link", { name: s(lang, "banner.exit") })).toBeVisible(); // the replay banner
    });

    test("a window that starts now is said with its condition, and what to do if the smoke is still there", async ({ page }) => {
      await airOut(page, lang, "live", FORECASTS.clearNow);
      expect(plain(await main(page).locator("h1 .airout-answer").innerText())).toBe(s(lang, "airout.now"));
      await expect(main(page).locator("p").nth(1)).toHaveText(s(lang, "airout.caution.now"));
    });

    test("the best time in ECCC’s lowest class says it is not smoke-free", async ({ page }) => {
      await airOut(page, lang, "live", FORECASTS.lightOvernight);
      expect(plain(await main(page).locator("h1 .airout-answer").innerText())).toBe(lang === "en" ? "Sun 10 p.m. to Mon 6 a.m." : "dim. 22 h à lun. 6 h");
      await expect(main(page).locator("p").nth(0)).toHaveText(s(lang, "airout.shows.light"));
    });

    test("every text is 18 px or more and every link and button 56 px or more", async ({ page }) => {
      await airOut(page, lang, "live", FORECASTS.mondayMorning);
      await main(page).locator("button[aria-controls=strip-list]").click();
      expect(await smallText(page, "main.airout")).toEqual([]);
      expect(await smallTargets(page, "main.airout")).toEqual([]);
    });

    test("at twice the text size (200%) nothing is cut off or wider than the screen, and the list still opens", async ({ page }) => {
      await airOut(page, lang, "live", FORECASTS.lightOvernight);
      // Every piece of text in the screen's own content, twice as large: sizes are read first, then set.
      const twice = () =>
        page.evaluate(() => {
          const texts = [...document.querySelectorAll<HTMLElement>("main.airout *")].filter((el) => !el.dataset.twice && [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim()));
          const sizes = texts.map((el) => parseFloat(getComputedStyle(el).fontSize));
          texts.forEach((el, i) => {
            el.dataset.twice = "1";
            el.style.fontSize = `${sizes[i] * 2}px`;
          });
        });
      const problems = () =>
        main(page).evaluate((root) =>
          [...root.querySelectorAll<HTMLElement>("*")].filter((el) => !el.closest("svg")).flatMap((el) => {
            const box = el.getBoundingClientRect();
            const cut = el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible";
            return box.right > window.innerWidth + 0.5 || box.left < -0.5 || cut ? [`${el.className || el.tagName}: ${Math.round(box.left)}–${Math.round(box.right)}${cut ? " cut" : ""}`] : [];
          }),
        );
      await twice();
      expect(await problems()).toEqual([]);
      expect(await sideways(page)).toBeLessThanOrEqual(0);
      await main(page).locator("button[aria-controls=strip-list]").click();
      await twice();
      await expect(main(page).locator("#strip-list li").first()).toBeVisible();
      expect(await problems()).toEqual([]);
    });

    test("every text stands out from what is behind it: 4.5 to 1 or more (WCAG AA)", async ({ page }) => {
      for (const smoke of [FORECASTS.lightOvernight, NOT_AVAILABLE]) {
        await page.unroute(`${TEST_ENGINE_URL}/verdict**`);
        await airOut(page, lang, "live", smoke);
        if (smoke !== NOT_AVAILABLE) await main(page).locator("button[aria-controls=strip-list]").click();
        const weak = await main(page).evaluate((root) => {
          const channels = (css: string) => css.match(/[\d.]+/g)!.map(Number);
          const luminance = ([r, g, b]: number[]) => {
            const linear = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
            return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
          };
          const behind = (el: Element | null): number[] => {
            for (; el; el = el.parentElement) {
              const fill = channels(getComputedStyle(el).backgroundColor);
              if (fill.length === 3 || fill[3] > 0) return fill;
            }
            return [255, 255, 255];
          };
          const found: string[] = [];
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const element = node.parentElement!;
            if (!node.textContent?.trim() || !element.checkVisibility()) continue;
            const [a, b] = [luminance(channels(getComputedStyle(element).color)), luminance(behind(element))];
            const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            if (ratio < 4.5) found.push(`${ratio.toFixed(2)}: ${node.textContent.trim()}`);
          }
          return found;
        });
        expect(weak).toEqual([]);
      }
    });

    for (const [what, width, height] of [["a 320 px phone", 320, 568], ["a 390 px phone at twice the size", 195, 422]] as const) {
      test(`${what}: nothing runs off the side, and the answer and the strip are whole`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        for (const smoke of [FORECASTS.lightOvernight, FORECASTS.none, NOT_AVAILABLE]) {
          await page.unroute(`${TEST_ENGINE_URL}/verdict**`);
          await airOut(page, lang, "live", smoke);
          if (smoke !== NOT_AVAILABLE) await main(page).locator("button[aria-controls=strip-list]").click();
          expect(await sideways(page)).toBeLessThanOrEqual(0);
          // Back, Listen and the language switch are whole on the screen, each still 56 px tall to the finger.
          const controls = await page.locator(".airout-top a, .airout-top button").evaluateAll((all) => all.map((el) => el.getBoundingClientRect()).map((box) => [Math.floor(box.left), Math.ceil(box.right), Math.round(box.height)]));
          expect(controls).toHaveLength(4);
          expect(controls.filter(([left, right, tall]) => left < 0 || right > width || tall < 56)).toEqual([]);
          // No text in the screen's own content is cut by its edge.
          const cut = await main(page).evaluate((root, edge) => {
            const out: string[] = [];
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              if (!node.textContent?.trim() || !node.parentElement!.checkVisibility()) continue;
              const range = document.createRange();
              range.selectNodeContents(node);
              const box = range.getBoundingClientRect();
              if (box.left < -0.5 || box.right > edge + 0.5) out.push(node.textContent.trim());
            }
            return out;
          }, width);
          expect(cut).toEqual([]);
        }
      });
    }
  });
}

// --- the strip ---------------------------------------------------------------------------------------------------

test.describe("The strip", () => {
  test("48 hours as bars, a row for each day, the same clock hour in the same place on every row", async ({ page }) => {
    await airOut(page, "en", "live", FORECASTS.sample);
    const days = main(page).locator(".strip-day");
    await expect(days).toHaveCount(3);
    expect(await days.locator(":scope > span").allInnerTexts()).toEqual(["Today", "Tomorrow", "Tuesday"]);
    // From Sunday 3 a.m. to Tuesday 2 a.m.: 21 hours, 24, then 3.
    expect(await days.evaluateAll((rows) => rows.map((row) => row.querySelectorAll(".strip-bar").length))).toEqual([21, 24, 3]);
    // 6 a.m. on each row sits at the same place across the row.
    const six = await days.evaluateAll((rows) => rows.map((row) => Math.round(row.querySelector('.strip-cell[data-hour="6"]')!.getBoundingClientRect().left)));
    expect(new Set(six).size).toBe(1);
    // The clock under each row.
    expect((await days.first().locator(".strip-tick").allInnerTexts()).map(plain)).toEqual(["6 a.m.", "noon", "6 p.m."]);
  });

  test("the best time has an outline around its bars, and the legend says what the outline is", async ({ page }) => {
    await airOut(page, "en", "live", FORECASTS.mondayMorning);
    const best = main(page).locator(".strip-day").nth(1).locator(".strip-best");
    await expect(best).toHaveCount(1);
    await expect(main(page).locator(".strip-best")).toHaveCount(1);
    await expect(main(page).locator('.strip-day .strip-bar[data-best="true"]')).toHaveCount(4);
    // The outline holds the four bars of 5, 6, 7 and 8 a.m., and no other.
    const [outline, first, last, before, after] = await Promise.all(
      [".strip-best", '.strip-cell[data-hour="5"]', '.strip-cell[data-hour="8"]', '.strip-cell[data-hour="4"]', '.strip-cell[data-hour="9"]'].map(async (cell) => (await main(page).locator(".strip-day").nth(1).locator(cell).boundingBox())!),
    );
    expect(outline.x).toBeLessThanOrEqual(first.x);
    expect(outline.x + outline.width).toBeGreaterThanOrEqual(last.x + last.width);
    expect(outline.x).toBeGreaterThan(before.x + before.width / 2);
    expect(outline.x + outline.width).toBeLessThan(after.x + after.width / 2);
    expect(await best.evaluate((el) => [getComputedStyle(el).borderTopColor, parseFloat(getComputedStyle(el).borderTopWidth) >= 3])).toEqual([NAVY, true]);
    await expect(main(page).locator(".strip-legend")).toContainText("Best time to air out");
  });

  test("a level is never told by colour alone: a bar is taller with each class, and patterned by ECCC’s colour families", async ({ page }) => {
    await airOut(page, "en", "live", FORECASTS.everyLevel);
    // The first twelve hours are ECCC's twelve classes, in order (Sunday 3 a.m. to 2 p.m.).
    const bars = await main(page).locator(".strip-day").first().locator(".strip-bar").evaluateAll((all) =>
      all.slice(0, 12).map((bar) => {
        const style = getComputedStyle(bar);
        return { level: Number(bar.getAttribute("data-level")), height: bar.getBoundingClientRect().height, pattern: bar.getAttribute("data-pattern"), fill: style.backgroundColor, image: style.backgroundImage !== "none", outline: style.borderTopColor };
      }),
    );
    expect(bars.map((bar) => bar.level)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (let level = 1; level < 12; level++) expect(bars[level].height, `level ${level}`).toBeGreaterThan(bars[level - 1].height);
    expect(bars.map((bar) => bar.pattern)).toEqual(["none", "dots", "dots", "dots", "lines", "lines", "lines", "cross", "cross", "cross", "cross", "solid"]);
    expect(bars.map((bar) => bar.image)).toEqual([false, true, true, true, true, true, true, true, true, true, true, false]);
    // ECCC's own colours, from its legend for the layer; "no smoke" is a hollow box.
    expect(bars.map((bar) => bar.fill)).toEqual([
      WHITE, "rgb(33, 197, 244)", "rgb(24, 153, 201)", "rgb(13, 103, 150)", "rgb(254, 252, 55)", "rgb(254, 203, 46)", "rgb(253, 153, 63)",
      "rgb(252, 103, 105)", "rgb(254, 59, 59)", "rgb(254, 1, 1)", "rgb(202, 7, 19)", "rgb(101, 2, 5)",
    ]);
    // A pale bar still shows on the white card: every bar has a dark outline.
    expect(new Set(bars.slice(1).map((bar) => bar.outline))).toEqual(new Set(["rgb(26, 29, 33)"]));
  });

  test("day and night: a band over the bars, with a sun or a moon", async ({ page }) => {
    await airOut(page, "en", "live", FORECASTS.sample);
    const sky = await main(page).locator(".strip-day").nth(1).locator(".strip-sky").evaluateAll((bands) =>
      bands.map((band) => ({ sky: band.getAttribute("data-sky"), picture: band.querySelector("svg circle") ? "sun" : band.querySelector("svg") ? "moon" : null, fill: getComputedStyle(band).backgroundColor })),
    );
    expect(sky).toEqual([
      { sky: "night", picture: "moon", fill: NAVY },
      { sky: "day", picture: "sun", fill: "rgb(246, 227, 168)" },
      { sky: "night", picture: "moon", fill: NAVY },
    ]);
    // Day starts over the 8 a.m. bar, the first hour with the sun up.
    const [day, eight] = [(await main(page).locator(".strip-day").nth(1).locator('.strip-sky[data-sky="day"]').boundingBox())!, (await main(page).locator(".strip-day").nth(1).locator('.strip-cell[data-hour="8"]').boundingBox())!];
    expect(Math.abs(day.x - eight.x)).toBeLessThanOrEqual(2);
    await expect(main(page).locator(".strip-legend")).toContainText("Day");
    await expect(main(page).locator(".strip-legend")).toContainText("Night");
  });

  test("to a screen reader the strip is one picture, named with the answer; the list says it hour by hour", async ({ page }) => {
    await airOut(page, "en", "live", FORECASTS.sample);
    const picture = main(page).getByRole("img");
    await expect(picture).toHaveCount(1);
    expect(plain(await picture.getAttribute("aria-label"))).toBe("Chart: the smoke forecast for the next 48 hours, hour by hour. Best time to air out your home: From Sun 11 a.m.");
    const toggle = main(page).getByRole("button", { name: "Show the forecast as a list" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(main(page).getByRole("button", { name: "Hide the list" })).toHaveAttribute("aria-expanded", "true");
    expect((await main(page).locator("#strip-list li").allInnerTexts()).map(plain)).toEqual([
      "Sun 3 to 5 a.m.: no smoke",
      "Sun 6 to 10 a.m.: smoke level 1 of 11 (1 to 10 µg/m³)",
      "Sun 11 a.m. to Tue 2 a.m.: no smoke",
    ]);
    await expect(main(page).locator("#strip-list")).toContainText("PM2.5");
    await main(page).getByRole("button", { name: "Hide the list" }).click();
    await expect(main(page).locator("#strip-list")).toHaveCount(0);
  });

  test("smoke level is said in plain words: PM2.5 only in the list, a tap away", async ({ page }) => {
    await airOut(page, "en", "live", FORECASTS.mondayMorning);
    expect(await main(page).innerText()).not.toMatch(/PM\s?2[.,]5|µg/);
  });
});

// --- around the screen -------------------------------------------------------------------------------------------

test.describe("Around the screen", () => {
  test("Back returns to the verdict; opened with no check done, the screen goes to Check", async ({ page }) => {
    await airOut(page, "en", "live", FORECASTS.mondayMorning);
    await page.getByRole("link", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/verdict$/);
    await expect(page.locator("#verdict-h")).toBeVisible();
    await page.goto("/air-out");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "I smell smoke" })).toBeVisible();
  });

  test("the 911 bar is on the screen: one Call 911, and nothing on the screen discourages the call", async ({ page }) => {
    await airOut(page, "en", "live", FORECASTS.none);
    await expect(page.locator('a[href="tel:911"]')).toHaveCount(1);
    await expect(page.locator('a[href="tel:911"]')).toBeVisible();
    await expect(page.getByText(STRINGS.en["sticky.title"])).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(/safe|(do not|don’t|never|no need to) call/i);
  });

  test("the language switch changes the screen where it stands", async ({ page }) => {
    await airOut(page, "en", "live", FORECASTS.mondayMorning);
    await page.getByRole("button", { name: "Français" }).click();
    await expect(page).toHaveURL(/\/air-out$/);
    expect(plain(await main(page).locator("h1").innerText())).toBe("Meilleur moment pour aérer votre maison lun. 5 h à 8 h");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  });

  test("the phone asks the engine, with the spot and nothing else: ECCC is never called from the browser", async ({ page }) => {
    const asked: URL[] = [];
    page.on("request", (request) => asked.push(new URL(request.url())));
    await airOut(page, "en", "live", FORECASTS.mondayMorning);
    await main(page).locator("button[aria-controls=strip-list]").click();
    // No request to a Government of Canada address: the forecast came in the engine's answer.
    expect(asked.filter((url) => /(^|\.)(gc\.ca|canada\.ca)$/.test(url.hostname)).map(String)).toEqual([]);
    const engine = asked.filter((url) => url.host === new URL(TEST_ENGINE_URL).host);
    expect(engine.map((url) => [url.pathname, [...url.searchParams.keys()].sort()])).toEqual([["/verdict", ["lat", "lon", "mode"]]]);
  });

  // "Protect your home" is a screen built on another branch (feat/protect). Here its link must not show; once that
  // screen is in the app, it must, and lead to it.
  const PROTECT = existsSync(fileURLToPath(new URL("../src/protect/Protect.tsx", import.meta.url)));
  test(PROTECT ? "Protect your home is a tap away, and opens its screen" : "no link to Protect your home while that screen is not in the app", async ({ page }) => {
    await airOut(page, "en", "live", FORECASTS.none);
    const link = main(page).getByRole("link", { name: STRINGS.en["airout.protect"] });
    if (!PROTECT) return void (await expect(link).toHaveCount(0));
    await link.click();
    await expect(page).toHaveURL(/\/protect$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

// --- Listen ------------------------------------------------------------------------------------------------------

/** A speechSynthesis that records what is said and ends each sentence at once. */
async function recordSpeech(page: Page) {
  await page.addInitScript(() => {
    const spoken: { text: string; lang: string }[] = [];
    const w = window as unknown as Record<string, unknown>;
    w.__spoken = spoken;
    w.SpeechSynthesisUtterance = class {
      lang = "";
      onend: (() => void) | null = null;
      constructor(public text: string) {}
    };
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { getVoices: () => [], cancel: () => undefined, speak: (u: { text: string; lang: string; onend: (() => void) | null }) => { spoken.push({ text: u.text, lang: u.lang }); setTimeout(() => u.onend?.(), 5); } },
    });
  });
}
// A sentence that ends on "a.m." takes no second period.
const sentences = (lang: Lang, key: string, vars: Record<string, string | number> = {}) =>
  STRINGS[lang][key].split(/(?<=[.?!])\s+(?=\S)/).map((sentence) => sentence.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match)).replace(/\.\.$/, "."));

const SCRIPTS: [string, object, "live" | "replay", (lang: Lang) => string[]][] = [
  ["a best time", FORECASTS.mondayMorning, "live", (lang) => [
    ...sentences(lang, "voice.airout.window", { when: lang === "en" ? "Monday, from 5 to 8 a.m." : "lundi, de 5 h à 8 h" }),
    ...sentences(lang, "voice.airout.strip"), ...sentences(lang, "voice.airout.source"), ...sentences(lang, "voice.verdict.call"),
  ]],
  ["no useful window", FORECASTS.none, "live", (lang) => [
    ...sentences(lang, "voice.airout.none", { n: 48 }), ...sentences(lang, "voice.airout.strip"), ...sentences(lang, "voice.airout.source"), ...sentences(lang, "voice.verdict.call"),
  ]],
  ["the replay", NOT_AVAILABLE, "replay", (lang) => [...sentences(lang, "voice.airout.notAvailable.replay"), ...sentences(lang, "voice.verdict.call")]],
];

for (const lang of LANGS) {
  for (const [what, smoke, mode, script] of SCRIPTS) {
    test(`Listen, ${lang.toUpperCase()}, ${what}: says the answer, then how to call 911, sentence by sentence`, async ({ page }) => {
      await recordSpeech(page);
      await airOut(page, lang, mode, smoke);
      await page.getByRole("button", { name: s(lang, "listen.play") }).click();
      await expect(page.getByRole("button", { name: s(lang, "listen.play") })).toBeVisible({ timeout: 15_000 }); // read to the end
      const said = await page.evaluate(() => (window as unknown as { __spoken: { text: string; lang: string }[] }).__spoken);
      expect(said.map((u) => u.text)).toEqual(script(lang));
      expect(new Set(said.map((u) => u.lang))).toEqual(new Set([lang === "en" ? "en-CA" : "fr-CA"]));
      // Numbers to call are spelled out for the voice, and the last thing said is how to call 911.
      expect(said.filter((u) => /\b(911|811|211)\b/.test(u.text))).toEqual([]);
      expect(said[said.length - 1].text).toBe(sentences(lang, "voice.verdict.call").at(-1));
    });
  }
}
