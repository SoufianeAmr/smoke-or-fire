// Feature 3a, "the answer lives on the map": the verdict screen's map and the sheet over it, in a browser that draws
// the detailed map (WebGL on, the real tiles). The sheet's three heights and its buttons; Call 911 at each of them;
// the frame the map opens on; the overlay; moving the map; the legend and what it says of each layer; each way the
// detailed map can fail, and the outline map that then shows the same things; the same map live and in the replay;
// and what the build weighs.
import { expect, test, type Page, type Route } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { PNG } from "pngjs";
import { TEST_ENGINE_URL } from "./engine";
import { handle, openWhy, sheet, sheetTo } from "./verdict";

type Lang = "en" | "fr";
const LANGS = ["en", "fr"] as const;
const NBSP = String.fromCharCode(0xa0);
const STRINGS: Record<Lang, Record<string, string>> = {
  en: JSON.parse(readFileSync(new URL("../src/i18n/en.json", import.meta.url), "utf8")),
  fr: JSON.parse(readFileSync(new URL("../src/i18n/fr.json", import.meta.url), "utf8")),
};
const s = (lang: Lang, key: string, vars: Record<string, string | number> = {}) => STRINGS[lang][key].replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
const demo = (town: string) => JSON.parse(readFileSync(new URL(`../../data/demo/${town}.json`, import.meta.url), "utf8"));
const plain = (text: string | null) => (text ?? "").replace(/\s+/g, " ").trim();

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
  await expect(page.locator("#verdict-h")).toBeVisible({ timeout: 20_000 });
}
/** A replay town's verdict, as it opens. */
async function replay(page: Page, lang: Lang, town: string) {
  await start(page, lang, "replay");
  await search(page, town);
}
/** A live verdict: the engine answers GET /verdict with `answer`. */
async function live(page: Page, lang: Lang, answer: object, town = "Moncton") {
  await page.route(`${TEST_ENGINE_URL}/verdict**`, (route: Route) => route.fulfill({ json: answer, headers: { "access-control-allow-origin": "*" } }));
  await start(page, lang, "live");
  await search(page, town);
}
const liveAnswer = (town: string) => {
  const recorded = demo(town);
  return { ...recorded, mode: "live", wind: { ...recorded.wind, run: "2026-10-03T18:00:00Z", recordedAt: null } };
};

const stage = (page: Page) => page.locator(".map-stage");
const call = (page: Page) => page.locator('a[href="tel:911"]');
/** The detailed map is drawn. */
const tiles = (page: Page) => expect(stage(page)).toHaveAttribute("data-basemap", "tiles", { timeout: 20_000 });
/** The outline map stays, for this reason. */
const outline = async (page: Page, why: "tiles" | "webgl" | "reduced") => {
  await expect(stage(page)).toHaveAttribute("data-fallback", why, { timeout: 20_000 });
  await expect(stage(page)).toHaveAttribute("data-basemap", "outline");
};
/** Two frames on: what was asked for is on the screen. */
const settled = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))));
/** The map has come to rest: what the overlay draws has stopped changing (the frame is set once the buttons are placed). */
async function atRest(page: Page) {
  let before = "";
  await expect.poll(async () => { const now = await shapes(page); const same = now === before; before = now; return same; }, { intervals: [250], timeout: 15_000 }).toBe(true);
}

type Box = { x: number; y: number; width: number; height: number };
/** Where the stage, the sheet's top edge, the two marks and the map's buttons are, on the screen. */
const layout = (page: Page) =>
  page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const map = document.querySelector(".map-stage")!;
    return {
      stage: box(map)!,
      sheetTop: document.querySelector(".answer-sheet")!.getBoundingClientRect().top,
      you: box(map.querySelector('[data-mark="you"]')),
      focus: box(map.querySelector('[data-mark="focus"]')),
      buttons: [...map.querySelectorAll("[data-avoid]")].map((el) => box(el)!),
    };
  });
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
/** What is wrong with a mark's place: nothing, when it is whole on the map, above the sheet and under no button. */
function hidden(what: string, mark: Box | null, at: Awaited<ReturnType<typeof layout>>): string[] {
  if (!mark) return [`${what}: not drawn`];
  const found: string[] = [];
  if (mark.x < at.stage.x - 0.5 || mark.x + mark.width > at.stage.x + at.stage.width + 0.5 || mark.y < at.stage.y - 0.5) found.push(`${what}: off the map`);
  if (mark.y + mark.height > at.sheetTop + 0.5) found.push(`${what}: under the sheet (${Math.round(mark.y + mark.height)} > ${Math.round(at.sheetTop)})`);
  if (at.buttons.some((button) => overlaps(mark, button))) found.push(`${what}: under a button`);
  return found;
}
/** What the overlay draws, layer by layer. */
const drawn = (page: Page) =>
  page.evaluate(() => {
    const overlay = document.querySelector(".map-overlay")!;
    const count = (selector: string) => overlay.querySelectorAll(selector).length;
    return {
      trails: [...overlay.querySelectorAll("[data-trail]")].map((el) => `${el.getAttribute("data-trail")}${el.hasAttribute("data-chosen") ? "*" : ""}`).sort(),
      beads: count('[data-chosen] circle.map-bead'),
      embers: count('[data-layer="detections"] circle'),
      fires: count('[data-layer="fires"] .map-fire'),
      zone: count('[data-layer="zone"] polygon.map-zone'),
      you: count('[data-mark="you"]'),
      labels: [...overlay.querySelectorAll("[data-label] text")].map((el) => el.textContent),
    };
  });
/** The overlay's shapes as numbers: every point of every layer, as placed on the screen. */
const shapes = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".map-overlay [data-layer] *, .map-overlay [data-mark] *")]
      .map((el) => ["points", "cx", "cy", "r", "transform"].map((name) => el.getAttribute(name) ?? "").join("|"))
      .join("\n"),
  );

// --- The sheet: three heights, moved by its buttons ---------------------------------------------------------------

test.describe("the sheet: the card, then the badges, then everything, each by a button", () => {
  for (const lang of LANGS) {
    test(`${lang.toUpperCase()} Moncton: opens on the map and the card; “${STRINGS[lang]["sheet.more"]}” shows the badges and “Why?”; “Why?” shows everything; “${STRINGS[lang]["sheet.less"]}” goes back to the map`, async ({ page }) => {
      await replay(page, lang, "Moncton");
      await tiles(page);

      // Peek: the map, the card with its line as the screen's one title, and nothing of the rest in sight or in reach.
      await expect(sheet(page)).toHaveAttribute("data-detent", "peek");
      await expect(page.getByRole("region", { name: s(lang, "map.region"), exact: true })).toBeVisible();
      // The map is named once: its canvas is not a second region inside it.
      await expect(page.getByRole("region", { name: new RegExp(`^${s(lang, "map.region")}`) })).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.locator("#verdict-h")).toBeVisible();
      await expect(handle(page)).toHaveAccessibleName(s(lang, "sheet.more"));
      await expect(page.locator("main .badge")).toHaveCount(4); // the verdict's three, and New Brunswick's burn status
      for (const hiddenThing of ["main .badge >> nth=0", "main .why-toggle", "#why-all"]) await expect(page.locator(hiddenThing)).toBeHidden();
      expect((await layout(page)).sheetTop - (await layout(page)).stage.y).toBeGreaterThanOrEqual(280); // most of the room is the map's

      // Half: the badges in one row, two chips (what a person can do next: Protect your home, when to air out) and
      // "Why?", whole above the 911 bar. The map is an extra and gives way to them: a strip of it still shows above
      // the sheet where the phone has room for one (84 px, its Legend button's); where it has not, the sheet stands
      // over the whole map, and its handle brings the map back.
      await handle(page).click();
      await expect(sheet(page)).toHaveAttribute("data-detent", "half");
      await expect(handle(page)).toHaveAccessibleName(s(lang, "sheet.less"));
      const bar = (await call(page).locator("..").boundingBox())!.y;
      for (const shown of [...(await page.locator("main .badge").all()), ...(await page.locator("main .sheet-chips a").all()), page.locator("main .why-toggle")]) {
        await expect(shown).toBeVisible();
        const box = (await shown.boundingBox())!;
        expect(box.y + box.height).toBeLessThanOrEqual(bar + 0.5);
      }
      await expect(page.locator("main .why-toggle")).toHaveAttribute("aria-expanded", "false");
      const strip = (await layout(page)).sheetTop - (await layout(page)).stage.y;
      const overMap = (await sheet(page).getAttribute("data-whole")) !== null;
      expect(strip >= 84 || overMap, `${Math.round(strip)} px of map above the sheet at half`).toBe(true);

      // Full: everything screens 7a–7d say; the sheet stands over the whole map, which takes no focus.
      await page.locator("main .why-toggle").click();
      await expect(sheet(page)).toHaveAttribute("data-detent", "full");
      await expect(page.locator("#why-all")).toBeVisible();
      await expect(page.locator("#answer-h")).toBeVisible();
      await expect(stage(page)).toHaveAttribute("inert", "");
      await expect(handle(page)).toBeVisible(); // the way back to the map stays on the screen

      // Back to the map, by the handle.
      await handle(page).click();
      await expect(sheet(page)).toHaveAttribute("data-detent", "peek");
      await expect(page.locator("#why-all")).toBeHidden();
      await expect(stage(page)).not.toHaveAttribute("inert", "");
    });
  }

  test("with the keyboard: Enter on the handle raises the sheet; the arrow keys move it one height at a time", async ({ page }) => {
    await replay(page, "en", "Moncton");
    await handle(page).focus();
    await page.keyboard.press("Enter");
    await expect(sheet(page)).toHaveAttribute("data-detent", "half");
    await page.keyboard.press("ArrowUp");
    await expect(sheet(page)).toHaveAttribute("data-detent", "full");
    await page.keyboard.press("ArrowDown");
    await expect(sheet(page)).toHaveAttribute("data-detent", "half");
    await page.keyboard.press("ArrowDown");
    await expect(sheet(page)).toHaveAttribute("data-detent", "peek");
    await expect(handle(page)).toBeFocused(); // the focus never left the handle
  });

  test("a flick on the handle does what its button does: up raises the sheet, down lowers it", async ({ page }) => {
    await replay(page, "en", "Moncton");
    const flick = async (by: number) => {
      // The sheet measures itself and settles a frame after its height changes: the press waits until the handle has
      // stopped moving (hover does), so it lands on the handle, as a finger does.
      await handle(page).hover();
      const box = (await handle(page).boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + by, { steps: 4 });
      await page.mouse.up();
    };
    await flick(-80);
    await expect(sheet(page)).toHaveAttribute("data-detent", "half");
    await flick(-80);
    await expect(sheet(page)).toHaveAttribute("data-detent", "full");
    await flick(80);
    await expect(sheet(page)).toHaveAttribute("data-detent", "half");
    await flick(80);
    await expect(sheet(page)).toHaveAttribute("data-detent", "peek");
  });

  test("Back is forgiving: it lowers the sheet, it closes the legend, and it never leaves the verdict to do so", async ({ page }) => {
    await replay(page, "en", "Moncton");
    await openWhy(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/verdict$/);
    await expect(sheet(page)).toHaveAttribute("data-detent", "peek");
    await expect(page.locator("#verdict-h")).toBeVisible();

    await page.getByRole("button", { name: "Legend" }).click();
    await expect(page.getByRole("dialog", { name: "What the map shows" })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/verdict$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("coming back from How it works finds the sheet as it was left: at full, with “Why?” open", async ({ page }) => {
    await replay(page, "en", "Moncton");
    await openWhy(page);
    await page.getByRole("link", { name: "How this works" }).click();
    await expect(page).toHaveURL(/\/how-it-works$/);
    await page.getByRole("link", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL(/\/verdict$/);
    await expect(sheet(page)).toHaveAttribute("data-detent", "full");
    await expect(page.locator("#answer-h")).toBeVisible();
  });

  test("a change of height is said to a screen reader, once it happens; nothing is said as the screen opens, where the answer has the focus", async ({ page }) => {
    await replay(page, "en", "Moncton");
    await expect(page.locator("#verdict-h")).toBeFocused();
    const status = page.locator("p.sr-only[role=status]");
    await expect(status).toHaveText("");
    await sheetTo(page, "half");
    await expect(status).toHaveText("The sources are showing.");
    await sheetTo(page, "full");
    await expect(status).toHaveText("The full explanation is showing.");
    await sheetTo(page, "peek");
    await expect(status).toHaveText("The map and the answer are showing.");
  });
});

// --- Call 911 at every height ----------------------------------------------------------------------------------------

test.describe("Call 911 is one tap away at every height of the sheet, and with the legend open", () => {
  /** The one Call 911 link: on the screen, whole, on top of everything at its own middle, and in reach. */
  async function reachable(page: Page, when: string) {
    await expect(call(page), when).toHaveCount(1);
    await expect(call(page), when).toBeVisible();
    const found = await call(page).evaluate((link) => {
      const r = link.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { whole: r.top >= 0 && r.bottom <= window.innerHeight + 0.5 && r.left >= 0 && r.right <= window.innerWidth + 0.5, onTop: top !== null && link.contains(top), inert: link.closest("[inert]") !== null, href: link.getAttribute("href") };
    });
    expect(found, when).toEqual({ whole: true, onTop: true, inert: false, href: "tel:911" });
  }
  for (const [town, what] of [["Moncton", "the slim bar"], ["Halifax", "the bar whose main action is Call 911"]] as const) {
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
      test(`${town} (${what}) at ${viewport.width} × ${viewport.height}: at peek, at half, at full, scrolled to the end, and with the legend open`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await replay(page, "en", town);
        await reachable(page, "as the screen opens");
        if (await page.getByRole("button", { name: "Legend" }).count()) {
          await page.getByRole("button", { name: "Legend" }).click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await reachable(page, "with the legend open");
          await page.keyboard.press("Escape");
          await expect(page.getByRole("dialog")).toHaveCount(0);
        }
        await sheetTo(page, "half");
        await reachable(page, "at half");
        await sheetTo(page, "full");
        await reachable(page, "at full");
        await sheet(page).evaluate((el) => el.scrollTo(0, el.scrollHeight));
        await reachable(page, "at full, scrolled to the end");
      });
    }
  }
});

// --- The frame --------------------------------------------------------------------------------------------------------

test.describe("the map opens on the person and the fire, both whole above the sheet and under no button", () => {
  const PHONES = [{ width: 390, height: 844 }, { width: 375, height: 667 }, { width: 320, height: 568 }];
  for (const viewport of PHONES) {
    test(`${viewport.width} × ${viewport.height}: Moncton (drifting), Miramichi (unclear), Halifax (unexplained, the taller bar), in English and French`, async ({ page }) => {
      test.setTimeout(300_000); // six verdicts, each after its Loading screen
      await page.setViewportSize(viewport);
      const problems: string[] = [];
      for (const lang of LANGS) {
        for (const town of ["Moncton", "Miramichi", "Halifax"]) {
          await replay(page, lang, town);
          await tiles(page);
          await settled(page);
          const at = await layout(page);
          problems.push(...[...hidden("the person", at.you, at), ...hidden("the fire", at.focus, at)].map((problem) => `${lang} ${town}: ${problem}`));
        }
      }
      expect(problems).toEqual([]);
    });
  }

  test("the frame follows the sheet while the map has not been touched: at half, the two are still whole above it", async ({ page }) => {
    await replay(page, "en", "Moncton");
    await tiles(page);
    const before = await layout(page);
    await sheetTo(page, "half");
    await expect.poll(async () => { const at = await layout(page); return [...hidden("the person", at.you, at), ...hidden("the fire", at.focus, at)]; }).toEqual([]);
    const after = await layout(page);
    expect(after.sheetTop).toBeLessThan(before.sheetTop - 60);
    expect(after.focus!.y).toBeLessThan(before.focus!.y - 30); // the map moved up with it
  });
});

// --- The sheet at half is compact: the map stays in view ------------------------------------------------------------

// At half the sheet holds the card, small; the source badges in one row (in New Brunswick the burn status is a fourth);
// one row of two chips (Protect your home, when to air out); then "Why?". Everything else waits for "Why?". So on a
// phone the map still shows the person and the fire above it.
test.describe("the sheet at half is compact: the map still shows the person and the fire", () => {
  /** What the sheet shows at half, top to bottom, and where the 911 bar starts. */
  const half = (page: Page) =>
    page.evaluate(() => {
      const box = (el: Element) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
      const all = (selector: string) => [...document.querySelectorAll(selector)].filter((el) => (el as HTMLElement).offsetParent !== null).map(box);
      return {
        badges: all("main .badge"),
        chips: all("main .sheet-chips a"),
        why: all("main .why-toggle"),
        full: all("main section.burn, main a.protect-link, main a.airout-tile").length,
        bar: document.querySelector("[data-bar911]")!.getBoundingClientRect().top,
        call: box(document.querySelector('a[href="tel:911"]')!),
      };
    });

  for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    for (const lang of LANGS) {
      test(`${viewport.width} × ${viewport.height} ${lang.toUpperCase()} Moncton (New Brunswick): four badges, two chips and “Why?” above the 911 bar, and the map shows the person and the fire`, async ({ page }, info) => {
        await page.setViewportSize(viewport);
        await replay(page, lang, "Moncton");
        await tiles(page);
        await sheetTo(page, "half");
        // The sheet does not stand over the whole map: the person and the fire are whole above it, under no button.
        await expect(sheet(page)).not.toHaveAttribute("data-whole", "true");
        await expect.poll(async () => { const at = await layout(page); return [...hidden("the person", at.you, at), ...hidden("the fire", at.focus, at)]; }).toEqual([]);
        const at = await layout(page);
        const strip = at.sheetTop - at.stage.y;
        info.annotations.push({ type: "map above the sheet at half", description: `${Math.round(strip)} px` });
        expect(strip).toBeGreaterThanOrEqual(84);

        const shown = await half(page);
        // Four badges in one row: the verdict's three, and the burn status.
        expect(await page.locator("main .badge").evaluateAll((all) => all.map((b) => b.getAttribute("data-badge")))).toEqual(["fire", "trace", "alert", "burn"]);
        expect(new Set(shown.badges.map((b) => Math.round(b.top))).size).toBe(1);
        // Then one row of two chips, then "Why?", each 56 px or more, all above the 911 bar.
        expect(shown.chips).toHaveLength(2);
        expect(new Set(shown.chips.map((c) => Math.round(c.top))).size).toBe(1);
        expect(shown.why).toHaveLength(1);
        for (const target of [...shown.badges, ...shown.chips, ...shown.why]) {
          expect(target.height).toBeGreaterThanOrEqual(56);
          expect(target.bottom).toBeLessThanOrEqual(shown.bar + 0.5);
        }
        expect(Math.max(...shown.badges.map((b) => b.bottom))).toBeLessThanOrEqual(shown.chips[0].top + 0.5);
        expect(Math.max(...shown.chips.map((c) => c.bottom))).toBeLessThanOrEqual(shown.why[0].top + 0.5);
        // The burn card, the button to Protect your home and the air-out tile wait for "Why?".
        expect(shown.full).toBe(0);
        await page.locator("main .why-toggle").click();
        await expect(sheet(page)).toHaveAttribute("data-detent", "full");
        await expect(page.locator("main section.burn")).toBeVisible();
        await expect(page.locator("main a.protect-link")).toBeVisible();
        await expect(page.locator("main a.airout-tile")).toBeVisible();
        await expect(page.locator("main .sheet-chips")).toHaveCount(0);
      });

      // Nothing explains the smoke: the 911 bar is the taller one. Fredericton is in New Brunswick too: four badges.
      for (const [town, badges] of [["Halifax", 3], ["Fredericton", 4]] as const) {
      test(`${viewport.width} × ${viewport.height} ${lang.toUpperCase()} ${town} (nothing explains the smoke, ${badges} badges): Call 911 stays the main action, the two chips are quiet, and the map shows the person and the fire`, async ({ page }, info) => {
        await page.setViewportSize(viewport);
        await replay(page, lang, town);
        await tiles(page);
        await sheetTo(page, "half");
        await expect(sheet(page)).not.toHaveAttribute("data-whole", "true");
        await expect.poll(async () => { const at = await layout(page); return [...hidden("the person", at.you, at), ...hidden("the fire", at.focus, at)]; }).toEqual([]);
        const at = await layout(page);
        info.annotations.push({ type: "map above the sheet at half", description: `${Math.round(at.sheetTop - at.stage.y)} px` });

        const shown = await half(page);
        expect(at.sheetTop - at.stage.y).toBeGreaterThanOrEqual(84);
        expect(shown.badges).toHaveLength(badges); // outside New Brunswick: no burn status
        expect(new Set(shown.badges.map((b) => Math.round(b.top))).size).toBe(1);
        expect(shown.chips).toHaveLength(2);
        // Both chips are outlined, never filled, and Call 911 is the largest thing to tap.
        expect(await page.locator("main .sheet-chips a").evaluateAll((all) => all.map((a) => getComputedStyle(a).backgroundColor))).toEqual(["rgb(255, 255, 255)", "rgb(255, 255, 255)"]);
        await expect(page.locator(".sticky-first")).toBeVisible();
        for (const target of [...shown.badges, ...shown.chips, ...shown.why]) {
          expect(target.bottom).toBeLessThanOrEqual(shown.bar + 0.5);
          expect(shown.call.width * shown.call.height).toBeGreaterThan(target.width * target.height);
        }
        await expect(page.locator('a[href="tel:911"]')).toHaveCount(1);
      });
      }
    }
  }
});

// --- The overlay ------------------------------------------------------------------------------------------------------

test.describe("the overlay, on the detailed map", () => {
  test("Moncton: the ribbon (three heights, the chosen one with a bead an hour), the embers, the official fires, ECCC’s zone, the person, and two labels", async ({ page }) => {
    await replay(page, "en", "Moncton");
    await tiles(page);
    const answer = demo("moncton");
    const overlay = await drawn(page);
    expect(overlay.trails).toEqual(["100m*", "850hPa", "925hPa"]);
    expect(overlay.beads).toBe(answer.path.hoursTraced);
    expect(overlay.embers).toBeGreaterThan(450); // 498 in all; the few far off the screen are not drawn
    expect(overlay.embers).toBeLessThanOrEqual(answer.map.detections.length);
    expect(overlay.fires).toBeGreaterThan(0);
    expect([overlay.zone, overlay.you]).toEqual([1, 1]);
    expect(overlay.labels).toEqual(expect.arrayContaining(["You", "Long Lake fire"]));
    // Hidden from a screen reader: the map's summary says what it shows.
    await expect(page.locator(".map-overlay")).toHaveAttribute("aria-hidden", "true");
  });

  test("an ember’s size is its fire power: the dots are not all one size, none smaller than 3.5 px nor larger than 12", async ({ page }) => {
    await replay(page, "en", "Moncton");
    await tiles(page);
    const radii = await page.locator('.map-overlay [data-layer="detections"] circle').evaluateAll((dots) => dots.map((dot) => Number(dot.getAttribute("r"))));
    expect([Math.min(...radii) >= 3.5, Math.max(...radii) <= 12, new Set(radii).size > 20]).toEqual([true, true, true]);
  });

  test("the basemap is under the overlay where it should be: the Bay of Fundy is water, the land west of Moncton is land", async ({ page }) => {
    await replay(page, "en", "Moncton");
    await tiles(page);
    await settled(page);
    // Where the map puts two known places gives its view; the picture is taken with only the basemap showing.
    const at = await layout(page);
    const answer = demo("moncton");
    const merc = (lat: number, lon: number) => [(lon + 180) / 360, 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI)];
    const [a, b] = [merc(answer.map.you.lat, answer.map.you.lon), merc(answer.map.focus.lat, answer.map.focus.lon)];
    const [ay, by] = [at.you!.y + at.you!.height / 2, at.focus!.y + at.focus!.height / 2];
    const scale = (by - ay) / (b[1] - a[1]);
    const place = (lat: number, lon: number) => { const m = merc(lat, lon); return [Math.round(at.you!.x + at.you!.width / 2 + (m[0] - a[0]) * scale), Math.round(ay + (m[1] - a[1]) * scale)]; };
    await page.addStyleTag({ content: ".map-carried,.map-head,.map-bottom{visibility:hidden !important}" });
    await settled(page);
    const picture = PNG.sync.read(await page.screenshot());
    const colour = ([x, y]: number[]) => { const i = (picture.width * y + x) * 4; return [picture.data[i], picture.data[i + 1], picture.data[i + 2]]; };
    const near = (c: number[], hex: string) => [1, 3, 5].every((from, n) => Math.abs(c[n] - parseInt(hex.slice(from, from + 2), 16)) <= 14);
    const share = (lats: number[], lons: number[], hex: string) => {
      const points = lats.flatMap((lat) => lons.map((lon) => place(lat, lon))).filter(([x, y]) => x > at.stage.x + 4 && x < at.stage.x + at.stage.width - 4 && y > at.stage.y + 4 && y < at.sheetTop - 4);
      expect(points.length).toBeGreaterThanOrEqual(9);
      return points.filter((point) => near(colour(point), hex)).length / points.length;
    };
    // The middle of the Bay of Fundy (its name is written there, so not every pixel is water), and inland New Brunswick.
    expect(share([45.0, 45.08, 45.16, 45.24], [-65.9, -65.75, -65.6, -65.45], "#D8E3EE")).toBeGreaterThanOrEqual(0.75);
    expect(share([45.85, 45.95, 46.05, 46.15], [-65.6, -65.5, -65.4, -65.3], "#EFE7DA")).toBeGreaterThanOrEqual(0.6);
  });

  test("the map’s names follow the language: Nova Scotia, then Nouvelle-Écosse (the canvas is described in words either way)", async ({ page }) => {
    await replay(page, "en", "Moncton");
    await tiles(page);
    const canvas = page.locator(".map-stage canvas");
    await expect(canvas).toHaveAttribute("aria-label", s("en", "map.canvas"));
    await expect(canvas).toHaveAttribute("aria-describedby", "map-summary");
    expect(await page.locator("#map-summary").textContent()).toMatch(/^Map: over about 6 hours, the air moved from the Long Lake fire in Nova Scotia north-northeast to Moncton\. 498 satellite fire detections/);
    await page.getByRole("button", { name: "Français" }).click();
    await expect(canvas).toHaveAttribute("aria-label", s("fr", "map.canvas"));
    expect(await page.locator("#map-summary").textContent()).toMatch(/^Carte\s: /);
  });
});

// --- Moving the map ---------------------------------------------------------------------------------------------------

test.describe("moving the map", () => {
  /** Count what changes inside the overlay from now on. */
  const watch = (page: Page) =>
    page.evaluate(() => {
      const w = window as unknown as { __changes: number };
      w.__changes = 0;
      new MutationObserver((list) => { w.__changes += list.length; }).observe(document.querySelector(".map-overlay")!, { subtree: true, childList: true, attributes: true, characterData: true });
    });
  const changes = (page: Page) => page.evaluate(() => (window as unknown as { __changes: number }).__changes);
  const carried = (page: Page) => page.locator(".map-carried").evaluate((el) => getComputedStyle(el).transform);
  /** How many times the page asked the phone where it is. */
  const spyOnGps = (page: Page) =>
    page.addInitScript(() => {
      const w = window as unknown as { __gps: number };
      w.__gps = 0;
      const count = () => { w.__gps++; };
      if (navigator.geolocation) Object.assign(navigator.geolocation, { getCurrentPosition: count, watchPosition: () => { count(); return 0; } });
    });
  const gps = (page: Page) => page.evaluate(() => (window as unknown as { __gps: number }).__gps);

  test("a finger drags it: the overlay is carried by a transform and nothing in it is redrawn until the map rests; then Recentre brings the opening frame back, with no GPS call", async ({ page }) => {
    await spyOnGps(page);
    await replay(page, "en", "Moncton");
    await tiles(page);
    await settled(page);
    const opened = await layout(page);
    const signature = await shapes(page);
    await expect(page.getByRole("button", { name: "Recentre" })).toHaveCount(0); // nothing to recentre yet
    await expect(page.getByRole("link", { name: "© OpenStreetMap" })).toBeVisible();

    // Drag from a clear spot of the map, 90 px right and 50 px down.
    const from = { x: opened.stage.x + opened.stage.width * 0.3, y: opened.stage.y + (opened.sheetTop - opened.stage.y) * 0.55 };
    await watch(page);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 90, from.y + 50, { steps: 15 });
    await settled(page);
    // Mid-drag: the overlay is moved by a transform (a plain shift, no scaling), with the same shapes drawn; every mark
    // has moved by that shift, which is the finger's (less the few px a drag takes to start).
    // "matrix(1, 0, 0, 1, 87, 48)": its six numbers.
    const [a, , , , e, f] = ((await carried(page)).match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const during = { a, e, f };
    expect([Math.round(during.a * 1000) / 1000, during.e > 70 && during.e <= 91, during.f > 35 && during.f <= 51]).toEqual([1, true, true]);
    expect([await changes(page), await shapes(page)]).toEqual([0, signature]);
    const mid = await layout(page);
    expect([Math.abs(mid.you!.x - opened.you!.x - during.e) <= 1, Math.abs(mid.you!.y - opened.you!.y - during.f) <= 1, Math.abs(mid.focus!.x - opened.focus!.x - during.e) <= 1]).toEqual([true, true, true]);
    await page.mouse.up();

    // At rest: drawn again through the new view, the transform gone, every mark where the map now is.
    await expect.poll(() => carried(page)).toBe("none");
    await expect(stage(page)).toHaveAttribute("data-moved", "true");
    expect(await changes(page)).toBeGreaterThan(0);
    const rested = await layout(page);
    expect(rested.you!.x - opened.you!.x).toBeGreaterThanOrEqual(70);
    expect(rested.you!.y - opened.you!.y).toBeGreaterThanOrEqual(35);

    // Recentre: its button took the credit's corner (the credit is in the legend); one tap, and the frame is back.
    const recentre = page.getByRole("button", { name: "Recentre" });
    await expect(recentre).toBeVisible();
    await expect(page.locator(".map-stage").getByRole("link", { name: "© OpenStreetMap" })).toHaveCount(0);
    await recentre.click();
    await expect.poll(async () => { const now = await layout(page); return [Math.round(now.you!.x - opened.you!.x), Math.round(now.you!.y - opened.you!.y), Math.round(now.focus!.y - opened.focus!.y)]; }).toEqual([0, 0, 0]);
    await expect(recentre).toHaveCount(0);
    expect(await gps(page)).toBe(0);
  });

  test("the + and − buttons zoom it one step about the person, who stays where they are on the map; no gesture is needed, and none asks for the phone’s position", async ({ page }) => {
    await spyOnGps(page);
    await replay(page, "en", "Moncton");
    await tiles(page);
    await atRest(page);
    const apart = async () => { const at = await layout(page); return Math.hypot(at.focus!.x - at.you!.x, at.focus!.y - at.you!.y); };
    const opened = await apart();
    const you = (await layout(page)).you!;
    await page.getByRole("button", { name: "Zoom in" }).click();
    // One zoom closer: everything twice as far apart (to the tenth of a pixel the marks are drawn at).
    await expect.poll(async () => Math.round(((await apart()) / opened) * 10) / 10, { timeout: 10_000 }).toBe(2);
    // Closer to the person's place: their dot has not moved.
    await atRest(page);
    const after = (await layout(page)).you!;
    expect([Math.round(after.x - you.x), Math.round(after.y - you.y)]).toEqual([0, 0]);
    await expect(page.getByRole("button", { name: "Recentre" })).toBeVisible();
    await page.getByRole("button", { name: "Zoom out" }).click();
    await expect.poll(async () => Math.round(((await apart()) / opened) * 10) / 10, { timeout: 10_000 }).toBe(1);
    await page.getByRole("button", { name: "Zoom out" }).click();
    await expect.poll(async () => Math.round(((await apart()) / opened) * 10) / 10, { timeout: 10_000 }).toBe(0.5);
    expect(await gps(page)).toBe(0);
  });

  test("the keyboard moves it too: the map takes the focus, and an arrow key pans it", async ({ page }) => {
    await replay(page, "en", "Moncton");
    await tiles(page);
    await settled(page);
    const opened = await layout(page);
    await page.locator(".map-stage canvas").focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await layout(page)).you!.x, { timeout: 10_000 }).toBeLessThan(opened.you!.x - 20);
  });
});

// --- When the detailed map cannot be drawn ----------------------------------------------------------------------------

test.describe("when the detailed map cannot be drawn, the outline map shows the same things, and says why", () => {
  const noWebGL = (page: Page) =>
    page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
        return /webgl/.test(kind) ? null : (original as (...args: unknown[]) => unknown).call(this, kind, ...rest);
      } as typeof original;
    });
  const NOT_TILES = "<!doctype html><html><head><title>Smoke or Fire?</title></head><body><div id=\"root\"></div></body></html>";
  const WAYS: { name: string; why: "tiles" | "webgl"; arrange: (page: Page) => Promise<unknown> }[] = [
    { name: "the tiles cannot be fetched", why: "tiles", arrange: (page) => page.route("**/tiles/*.pmtiles", (route) => route.abort()) },
    // What the host answers for a file that is not there, since every other address is the app's own page: that page,
    // as a byte range of itself (seen on the live site: 206, text/html, "bytes 0-1388/1389").
    { name: "the tiles’ address answers with a web page", why: "tiles", arrange: (page) => page.route("**/tiles/*.pmtiles", (route) => route.fulfill({ status: 206, contentType: "text/html; charset=utf-8", headers: { "content-range": `bytes 0-${NOT_TILES.length - 1}/${NOT_TILES.length}` }, body: NOT_TILES })) },
    { name: "the map library cannot be fetched", why: "tiles", arrange: (page) => page.route("**/vendor/**/maplibre-gl.mjs", (route) => route.abort()) },
    { name: "the browser has no WebGL", why: "webgl", arrange: noWebGL },
  ];
  for (const way of WAYS) {
    for (const lang of LANGS) {
      test(`${lang.toUpperCase()} ${way.name}: the outline map, the whole overlay on it, and a note in plain words`, async ({ page }) => {
        await way.arrange(page);
        await replay(page, lang, "Moncton");
        await outline(page, way.why);

        await expect(page.locator(".map-stage canvas")).toHaveCount(0);
        const map = page.locator("svg.map-outline");
        await expect(map).toBeVisible();
        await expect(map).toHaveAttribute("role", "img");
        expect(await map.getAttribute("aria-label")).toBe(await page.locator("#map-summary").textContent());
        // The same overlay as on the detailed map.
        const overlay = await drawn(page);
        expect(overlay.trails).toEqual(["100m*", "850hPa", "925hPa"]);
        expect([overlay.beads, overlay.zone, overlay.you, overlay.embers > 450, overlay.fires > 0]).toEqual([20, 1, 1, true, true]);
        expect(overlay.labels).toEqual(expect.arrayContaining([s(lang, "layer.you")]));
        // The note, in the app's language, never a blank map; and the person and the fire still whole above the sheet.
        await expect(page.locator(".map-note")).toHaveText(s(lang, `map.note.${way.why}`));
        await settled(page);
        const at = await layout(page);
        expect([...hidden("the person", at.you, at), ...hidden("the fire", at.focus, at)]).toEqual([]);
        // No OpenStreetMap credit where no OpenStreetMap data is drawn; the legend names the outlines' source.
        await expect(page.locator(".map-credit")).toHaveCount(0);
        await page.getByRole("button", { name: s(lang, "map.legend") }).click();
        await expect(page.locator('.map-legend [data-row="base"] p').first()).toHaveText(s(lang, "layer.base.outline"));
      });
    }
  }

  test("on the outline map the + and − buttons still zoom, and Recentre still brings the frame back", async ({ page }) => {
    await noWebGL(page);
    await replay(page, "en", "Moncton");
    await outline(page, "webgl");
    await settled(page);
    const apart = async () => { const at = await layout(page); return Math.hypot(at.focus!.x - at.you!.x, at.focus!.y - at.you!.y); };
    const opened = await apart();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect.poll(async () => Math.round(((await apart()) / opened) * 10) / 10).toBe(2);
    await page.getByRole("button", { name: "Recentre" }).click();
    await expect.poll(async () => Math.round(((await apart()) / opened) * 10) / 10).toBe(1);
  });

  const withoutMap = () => { const { map, ...older } = liveAnswer("moncton"); return older; };
  const NO_KEY: [string, object][] = [
    ["an engine that sends no map key (an older one)", withoutMap()],
    ["an engine whose map could not be built (null)", { ...liveAnswer("moncton"), map: null }],
    ["a map key of a version this app does not know", { ...liveAnswer("moncton"), map: { ...liveAnswer("moncton").map, version: 2 } }],
  ];
  for (const [what, answer] of NO_KEY) {
    test(`${what}: the outline map with the paths, the person and the fire’s name; no detections claimed, and the note and the legend say so`, async ({ page }) => {
      await live(page, "en", answer);
      await outline(page, "reduced");

      const overlay = await drawn(page);
      expect(overlay.trails).toEqual(["100m*", "850hPa", "925hPa"]);
      expect([overlay.beads, overlay.you, overlay.embers, overlay.fires, overlay.zone]).toEqual([20, 1, 0, 0, 0]);
      expect(overlay.labels).toEqual(expect.arrayContaining(["You", "Long Lake fire"]));
      await expect(page.locator(".map-note")).toHaveText("Simple map: the fire detections and the alert zone are not on it right now. The air’s path is.");
      // The verdict itself is whole: the map is never the only place the answer is.
      await expect(page.locator("#verdict-h")).toHaveText(`Drifting smoke${NBSP}· Long Lake fire${NBSP}· 159 km SSW`);
      await page.getByRole("button", { name: "Legend" }).click();
      for (const row of ["zone", "detections", "fires"]) await expect(page.locator(`.map-legend [data-row="${row}"] p`)).toHaveText(["Not on the map right now: no details were received for it."]);
      await expect(page.locator('.map-legend [data-row="path"] p').nth(1)).toHaveText("Hourly winds from the GFS weather model (NOAA), through Open-Meteo.");
    });
  }
});

// --- The legend -------------------------------------------------------------------------------------------------------

test.describe("the legend: each layer says who it comes from, when, and gives a link", () => {
  const rows = (page: Page) =>
    page.locator(".map-legend [data-row]").evaluateAll((all) => all.map((row) => ({ id: row.getAttribute("data-row"), title: row.querySelector("h3")!.textContent, lines: [...row.querySelectorAll("p")].map((p) => p.textContent), links: [...row.querySelectorAll("a")].map((a) => a.getAttribute("href")), mark: row.querySelector("svg.map-swatch") !== null })));

  test("Moncton replay: ECCC’s zone first with the alert’s issue time, the winds and when they were recorded, the detections’ newest time, Canada’s list, the person, and OpenStreetMap with its data’s date", async ({ page }) => {
    await replay(page, "en", "Moncton");
    await tiles(page);
    await page.getByRole("button", { name: "Legend" }).click();
    const legend = page.getByRole("dialog", { name: "What the map shows" });
    await expect(legend).toBeVisible();
    await expect(page.locator("#legend-h")).toBeFocused();

    const found = await rows(page);
    expect(found.map((row) => [row.id, row.title, row.mark])).toEqual([
      ["zone", "ECCC alert zone", true],
      ["path", "The air’s path", true],
      ["detections", "Satellite fire detections", true],
      ["fires", "Fires on Canada’s official list", true],
      ["you", "You", true],
      ["base", "The map underneath", true],
    ]);
    const lines = Object.fromEntries(found.map((row) => [row.id, row.lines]));
    expect(lines.zone).toEqual([
      "Dashed outline: ECCC’s forecast zone under the air quality alert.",
      "Issued 2025-08-25, 04:50 (Atlantic time).",
      "Data source: Environment and Climate Change Canada. For the replay, converted from the copy of ECCC’s messages kept by the NAAD System archive.",
    ]);
    expect(lines.path.slice(1)).toEqual(["Hourly winds from the GFS weather model (NOAA), through Open-Meteo.", "Recorded winds for the replay, downloaded 2026-09-26."]);
    expect(lines.detections.slice(1)).toEqual([
      "498 detections within 500 km of Moncton.",
      "Newest one seen by a satellite: 2025-08-25, 03:29 (Atlantic time).",
      "Sources: NASA FIRMS and Natural Resources Canada (CWFIS).",
      "Recorded data for the replay.",
    ]);
    expect(lines.fires.slice(1)).toEqual(["11 flames within 500 km of Moncton.", "Source: Natural Resources Canada (CWFIS).", "Recorded data for the replay."]);
    expect(lines.base).toEqual(["Roads, towns and coastlines from OpenStreetMap, as of 2026-09-28. The map is kept on this site: no other site learns what you look at."]);
    const links = Object.fromEntries(found.map((row) => [row.id, row.links]));
    expect(links.base).toEqual(["https://www.openstreetmap.org/copyright", "https://protomaps.com"]);
    expect(links.detections).toEqual(["https://firms.modaps.eosdis.nasa.gov/map/", "https://cwfis.cfs.nrcan.gc.ca/interactive-map"]);
    expect([links.zone.length, links.path, links.fires]).toEqual([1, ["https://open-meteo.com/en/docs/gfs-api"], ["https://cwfis.cfs.nrcan.gc.ca/interactive-map"]]);
    // The summary heads it, in words anyone can read: the map is never the only way to what it shows.
    await expect(legend.locator("> p")).toHaveText(await page.locator("#map-summary").textContent() ?? "");
    // Every link opens outside the app, without telling the other site where it came from.
    expect(await legend.locator("a").evaluateAll((all) => all.every((a) => a.getAttribute("target") === "_blank" && a.getAttribute("rel") === "noopener noreferrer"))).toBe(true);
  });

  test("live: when each source was checked, the winds’ model run, and ECCC’s answer", async ({ page }) => {
    const recorded = liveAnswer("moncton");
    const layers = recorded.map.layers;
    await live(page, "en", {
      ...recorded,
      alerts: { airQuality: { ...recorded.alerts.airQuality, source: "eccc_geomet", checkedAt: "2026-10-03T19:30:01Z", alert: { ...recorded.alerts.airQuality.alert, url: null } } },
      map: {
        ...recorded.map,
        layers: {
          ...layers,
          detections: { ...layers.detections, firms: { ok: true, checkedAt: "2026-10-03T19:24:00Z" }, cwfis: { ok: true, checkedAt: "2026-10-03T19:18:00Z" } },
          fires: { ...layers.fires, checkedAt: "2026-10-03T19:18:00Z" },
          alertZone: { ...layers.alertZone, source: "eccc_geomet", checkedAt: "2026-10-03T19:30:01Z" },
        },
      },
    });
    await page.getByRole("button", { name: "Legend" }).click();
    const lines = Object.fromEntries((await rows(page)).map((row) => [row.id, row.lines]));
    expect(lines.zone.slice(1)).toEqual(["Issued 2025-08-25, 04:50 (Atlantic time).", "Checked with ECCC: 2026-10-03, 16:30 (Atlantic time).", "Data source: Environment and Climate Change Canada."]);
    expect(lines.path[2]).toBe("Newest model run in these winds: 2026-10-03, 15:00 (Atlantic time).");
    expect([lines.detections.at(-1), lines.fires.at(-1)]).toEqual(["Checked: 2026-10-03, 16:18 (Atlantic time).", "Checked: 2026-10-03, 16:18 (Atlantic time)."]);
  });

  test("never a guess: no alert, so no zone, said in words; nothing is drawn for it", async ({ page }) => {
    await replay(page, "en", "Halifax");
    await tiles(page);
    expect((await drawn(page)).zone).toBe(0);
    await page.getByRole("button", { name: "Legend" }).click();
    await expect(page.locator('.map-legend [data-row="zone"] p').first()).toHaveText("No zone to draw: no ECCC air quality alert was in effect here at the replay time.");
  });

  test("in French, as an equal: the same six layers, each with its lines", async ({ page }) => {
    await replay(page, "fr", "Moncton");
    await tiles(page);
    await page.getByRole("button", { name: "Légende" }).click();
    await expect(page.getByRole("dialog", { name: "Ce que montre la carte" })).toBeVisible();
    const found = await rows(page);
    expect(found.map((row) => row.title)).toEqual(["Zone d’alerte d’ECCC", "Le trajet de l’air", "Détections de feux par satellite", "Feux de la liste officielle du Canada", "Vous", "Le fond de carte"]);
    expect(found.every((row) => row.lines.length >= 1 && row.lines.every((line) => line !== null && line.length > 20))).toBe(true);
    expect(found.find((row) => row.id === "zone")!.lines![1]).toBe("Émise le 2025-08-25, 4 h 50 (heure de l’Atlantique).");
  });

  test("it is a panel, not a trap: Escape and Close shut it and the focus goes back to its button; the top bar and Call 911 stay in reach while the map and the sheet under it do not", async ({ page }) => {
    await replay(page, "en", "Moncton");
    const open = page.getByRole("button", { name: "Legend" });
    await expect(open).toHaveAttribute("aria-expanded", "false");
    await open.click();
    await expect(page.getByRole("dialog")).toHaveAttribute("aria-modal", "false");
    expect(await page.evaluate(() => [".map-stage", ".answer-sheet"].map((selector) => document.querySelector(selector)!.hasAttribute("inert")))).toEqual([true, true]);
    expect(await page.evaluate(() => [".glance-top", "[data-bar911]"].map((selector) => document.querySelector(selector)!.closest("[inert]") !== null))).toEqual([false, false]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(open).toBeFocused();
    await open.click();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(open).toBeFocused();
  });
});

// --- The credit -------------------------------------------------------------------------------------------------------

test("the map’s credit: “© OpenStreetMap” in a corner of the detailed map, linked to OpenStreetMap’s copyright page, readable, with 56 px to tap", async ({ page }) => {
  await replay(page, "en", "Moncton");
  await tiles(page);
  const credit = page.locator(".map-stage").getByRole("link", { name: "© OpenStreetMap" });
  await expect(credit).toBeVisible();
  await expect(credit).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
  expect([await credit.getAttribute("target"), await credit.getAttribute("rel")]).toEqual(["_blank", "noopener noreferrer"]);
  expect((await credit.boundingBox())!.height).toBeGreaterThanOrEqual(56);
  const text = credit.locator("span");
  expect(await text.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(18);
  // In a corner: against the map's left edge, just above the sheet.
  const [box, at] = [(await text.boundingBox())!, await layout(page)];
  expect([box.x - at.stage.x <= 16, at.sheetTop - (box.y + box.height) <= 16]).toEqual([true, true]);
});

// --- Accessibility ----------------------------------------------------------------------------------------------------

test.describe("accessibility of what is new on the screen", () => {
  test("every word is 18 px or more, and every button and link 56 px or more each way: on the map, on the sheet’s handle, in the legend", async ({ page }) => {
    await replay(page, "en", "Moncton");
    await tiles(page);
    const measure = (scope: string) =>
      page.evaluate((selector) => {
        const root = document.querySelector(selector)!;
        const small: string[] = [];
        for (const el of [root, ...root.querySelectorAll("*")]) {
          if (el.closest("svg") && !el.matches("text")) continue;
          const own = [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim());
          if (own && el.getClientRects().length > 0 && parseFloat(getComputedStyle(el).fontSize) < 18) small.push(`${(el.textContent ?? "").trim().slice(0, 30)}: ${getComputedStyle(el).fontSize}`);
        }
        const tight = [...root.querySelectorAll("a, button")]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => ({ name: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30), box: el.getBoundingClientRect() }))
          .filter(({ box }) => box.height < 55.5 || box.width < 55.5)
          .map(({ name, box }) => `${name}: ${Math.round(box.width)} × ${Math.round(box.height)}`);
        return { small, tight };
      }, scope);
    expect(await measure(".map-stage")).toEqual({ small: [], tight: [] });
    expect(await measure(".sheet-handle")).toEqual({ small: [], tight: [] });
    await page.getByRole("button", { name: "Legend" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await measure(".map-legend")).toEqual({ small: [], tight: [] });
  });

  test("Tab goes down the screen in the order it is laid out, and never into what is out of sight", async ({ page }) => {
    await replay(page, "en", "Moncton");
    await tiles(page);
    // From the first thing on the screen (the replay banner's Exit), Tab by Tab.
    const focused = () => page.evaluate(() => { const el = document.activeElement!; return el === document.body ? "" : el.tagName === "CANVAS" ? "the map" : (el.getAttribute("aria-label") ?? el.textContent ?? "").trim(); });
    await page.getByRole("link", { name: "Exit" }).focus();
    const order = [await focused()];
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press("Tab");
      const name = await focused();
      if (!name || order.includes(name)) break;
      order.push(name);
    }
    const expected = ["Exit", "New check", "EN", "Français", "the map", "Legend", "© OpenStreetMap", "Zoom out", "Zoom in", "Sources and why", "Listen", "Call 911"];
    // Listen is there only where the browser can speak.
    expect(order.filter((name) => name !== "Listen")).toEqual(expected.filter((name) => name !== "Listen"));

    // At full, the map and the top bar are under the sheet: Tab skips them.
    await openWhy(page);
    await page.getByRole("link", { name: "Exit" }).focus();
    await page.keyboard.press("Tab");
    expect(await focused()).toBe("Show the map");
  });

  test("at 200% zoom on a laptop (640 × 360 of room): nothing is wider than the screen, the answer and Call 911 are there, and the sheet still moves", async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    await replay(page, "en", "Moncton");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await expect(call(page)).toBeVisible();
    await expect(handle(page)).toBeVisible();
    await page.locator("#verdict-h").scrollIntoViewIfNeeded();
    await expect(page.locator("#verdict-h")).toBeVisible();
    await sheetTo(page, "half");
    await page.locator("main .why-toggle").scrollIntoViewIfNeeded();
    await expect(page.locator("main .why-toggle")).toBeVisible();
    await openWhy(page);
    await expect(call(page)).toBeVisible();
  });
});

// --- Live and replay, one code path -----------------------------------------------------------------------------------

test("Moncton, Aug 25, 2025: the engine’s answer draws the same map whether it comes live or from the replay", async ({ page }) => {
  // The replay has a banner (44 px) the live screen has not: on a screen that much taller, the map has the same room.
  await page.setViewportSize({ width: 390, height: 888 });
  await replay(page, "en", "Moncton");
  await tiles(page);
  await atRest(page);
  const [replayed, counts, size] = [await shapes(page), await drawn(page), (await layout(page)).stage];
  expect(replayed.length).toBeGreaterThan(5000);

  await page.setViewportSize({ width: 390, height: 844 });
  await live(page, "en", liveAnswer("moncton"));
  await tiles(page);
  await atRest(page);
  const stageNow = (await layout(page)).stage;
  expect([stageNow.width, stageNow.height]).toEqual([size.width, size.height]);
  // Every point of every layer, where the screen puts it: the same, to the tenth of a pixel.
  expect(await drawn(page)).toEqual(counts);
  expect(await shapes(page)).toBe(replayed);
});

// --- What the build weighs --------------------------------------------------------------------------------------------

test.describe("budgets: what the build weighs, gzipped", () => {
  const dist = new URL("../dist-e2e/", import.meta.url);
  const gzip = (file: URL) => gzipSync(readFileSync(file), { level: 9 }).length;
  const assets = () => readdirSync(new URL("assets/", dist));
  /** The main bundle as it was before the map: index-*.js at 6b77886, gzip -9. */
  const MAIN_BEFORE = 175_860;
  const MAP_BUDGET = 350_000;

  test("the main bundle is no larger than before the map; the verdict and the map are files of their own", async ({}, info) => {
    const main = assets().filter((name) => /^index-.*\.js$/.test(name));
    expect(main).toHaveLength(1);
    const size = gzip(new URL(`assets/${main[0]}`, dist));
    info.annotations.push({ type: "main bundle", description: `${size} bytes gzip (before: ${MAIN_BEFORE})` });
    console.log(`main bundle: ${size} bytes gzip (before the map: ${MAIN_BEFORE})`);
    expect(size).toBeLessThanOrEqual(MAIN_BEFORE);
    expect(assets().filter((name) => /^(Verdict|TileMap)-.*\.js$/.test(name)).map((name) => name.split("-")[0]).sort()).toEqual(["TileMap", "Verdict"]);
    // Nothing of MapLibre or of the tile reader is in the main bundle.
    const source = readFileSync(new URL(`assets/${main[0]}`, dist), "utf8");
    expect([/maplibregl/.test(source), /PMTiles/.test(source)]).toEqual([false, false]);
  });

  test("the map (MapLibre’s three modules and the app’s tile map) is 350 KB or less", async ({}, info) => {
    const vendor = readdirSync(new URL("vendor/", dist));
    expect(vendor).toHaveLength(1);
    const modules = readdirSync(new URL(`vendor/${vendor[0]}/`, dist)).filter((name) => name.endsWith(".mjs"));
    expect(modules.sort()).toEqual(["maplibre-gl-shared.mjs", "maplibre-gl-worker.mjs", "maplibre-gl.mjs"]);
    const parts = [...modules.map((name) => [name, gzip(new URL(`vendor/${vendor[0]}/${name}`, dist))] as const), ...assets().filter((name) => /^TileMap-.*\.js$/.test(name)).map((name) => ["TileMap", gzip(new URL(`assets/${name}`, dist))] as const)];
    const total = parts.reduce((sum, [, size]) => sum + size, 0);
    info.annotations.push({ type: "map", description: `${total} bytes gzip: ${parts.map(([name, size]) => `${name} ${size}`).join(", ")}` });
    console.log(`map: ${total} bytes gzip (${parts.map(([name, size]) => `${name} ${size}`).join(", ")})`);
    expect(total).toBeLessThanOrEqual(MAP_BUDGET);
  });

  test("the map’s library starts coming while the person picks their place, before any town is chosen; not on a phone that asks to save data", async ({ page, browser }) => {
    const library = /\/vendor\/maplibre-gl-[\d.]+\/maplibre-gl\.mjs$/;
    await start(page, "en", "replay");
    const asked = page.waitForResponse((response) => library.test(response.url()), { timeout: 20_000 });
    await page.goto("/location");
    expect((await asked).status()).toBe(200);
    await expect(page).toHaveURL(/\/location$/); // still picking

    // Save-Data: nothing of the map is asked for here; the Loading screen fetches it, as it always does.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const saving = await context.newPage();
    await saving.addInitScript(() => Object.defineProperty(navigator, "connection", { value: { saveData: true }, configurable: true }));
    const early: string[] = [];
    saving.on("request", (request) => void (library.test(request.url()) && early.push(request.url())));
    await start(saving, "en", "replay");
    await saving.goto("/location");
    await saving.waitForTimeout(2500);
    expect(early).toEqual([]);
    await saving.locator("input[type=search]").fill("Moncton");
    await saving.getByRole("option", { name: /^Moncton,/ }).first().click();
    await expect(saving.locator("#verdict-h")).toBeVisible({ timeout: 20_000 });
    expect(early.length).toBe(1);
    await context.close();
  });

  test("the map is fetched while the Loading screen shows, and the tiles by byte range (206), never whole", async ({ page }) => {
    const asked: { url: string; range: string | null; status: number }[] = [];
    page.on("response", (response) => asked.push({ url: response.url(), range: response.request().headers()["range"] ?? null, status: response.status() }));
    await start(page, "en", "replay");
    asked.length = 0;
    await search(page, "Moncton"); // returns as the verdict shows
    const before = asked.map((request) => request.url.replace(/^https?:\/\/[^/]+/, ""));
    for (const needed of [/\/assets\/Verdict-.*\.js$/, /\/assets\/TileMap-.*\.js$/, /\/vendor\/maplibre-gl-[\d.]+\/maplibre-gl\.mjs$/, /\/vendor\/maplibre-gl-[\d.]+\/maplibre-gl-shared\.mjs$/, /\/tiles\/maritimes-\d+\.pmtiles$/]) {
      expect(before.some((url) => needed.test(url)), `${needed} fetched before the verdict shows`).toBe(true);
    }
    await tiles(page);
    const tileRequests = asked.filter((request) => /\.pmtiles$/.test(request.url));
    expect(tileRequests.length).toBeGreaterThan(1);
    expect(tileRequests.every((request) => request.status === 206 && /^bytes=\d+-\d+$/.test(request.range ?? ""))).toBe(true);
  });
});

// --- What an independent review found: each defect, with the test that now holds it -----------------------------------

test.describe("found in review", () => {
  /** A real answer with no fire in range (a control day of the validation set), as a live engine gives it. */
  const noFire = (name: string) => {
    const recorded = JSON.parse(readFileSync(new URL(`../../data/validation/answers/${name}.json`, import.meta.url), "utf8"));
    return { ...recorded, mode: "live", wind: { ...recorded.wind, run: "2026-10-03T18:00:00Z", recordedAt: null } };
  };
  const english = (page: Page) => page.getByRole("button", { name: "EN", exact: true });
  const french = (page: Page) => page.getByRole("button", { name: "Français" });
  const barIsLive = (page: Page) => page.locator(".glance-top").evaluate((el) => !(el as HTMLElement).inert);
  /** The sheet's top edge is at or under the top bar's foot. */
  const underTheBar = async (page: Page) => {
    const [bar, panel] = [(await page.locator(".glance-top").boundingBox())!, (await sheet(page).boundingBox())!];
    return panel.y >= bar.y + bar.height - 0.5;
  };

  for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    test(`${viewport.width} × ${viewport.height}, no fire in range (7d): the detailed map opens with the person whole above the sheet, where the app put them`, async ({ page }) => {
      await page.setViewportSize(viewport);
      for (const [name, town] of [["control-charlottetown-2025-05-24", "Charlottetown"], ["control-moncton-2025-10-27", "Moncton"]] as const) {
        await live(page, "en", noFire(name), town);
        await tiles(page);
        await atRest(page);
        const at = await layout(page);
        expect([town, at.focus, hidden("you", at.you, at)]).toEqual([town, null, []]);
      }
      // ECCC's alerts were not read for this answer: the map's words say so, and do not leave "no zone" to be guessed.
      await expect(page.locator("#map-summary")).toContainText(s("en", "layer.zone.notChecked"));
    });
  }

  test("at 200% zoom (640 × 360), with only the card showing, the top bar stays in reach: the language there and back, and New check", async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    await replay(page, "en", "Halifax"); // unexplained: the taller 911 bar, the least room
    expect(await stage(page).evaluate((el) => (el as HTMLElement).inert)).toBe(true); // no room for a map here
    expect([await barIsLive(page), await underTheBar(page)]).toEqual([true, true]);
    await french(page).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    expect([await barIsLive(page), await underTheBar(page)]).toEqual([true, true]);
    await english(page).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    // Raised, the sheet's button does not promise a map this screen has no room for; lowered, the status says what shows.
    await handle(page).click();
    await expect(sheet(page)).toHaveAttribute("data-detent", "half");
    await expect(handle(page)).toHaveText(s("en", "sheet.close"));
    await handle(page).click();
    await expect(sheet(page)).toHaveAttribute("data-detent", "peek");
    await expect(page.locator('p.sr-only[role="status"]')).toHaveText(s("en", "sheet.status.peek.noMap"));
    expect(await barIsLive(page)).toBe(true);
    await page.getByRole("link", { name: s("en", "nav.newCheck") }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("375 × 667 with a fire close by (Bridgetown): French and back, and French again, never lock the top bar", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await replay(page, "en", "Bridgetown");
    for (const [press, lang] of [[french, "fr"], [english, "en"], [french, "fr"]] as const) {
      await press(page).click();
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await settled(page);
      expect([lang, await barIsLive(page), await underTheBar(page)]).toEqual([lang, true, true]);
    }
  });

  test("a network that neither answers nor fails: the outline map shows, the detailed one stays out of sight, and after 20 s a note says it did not load", async ({ page }) => {
    test.setTimeout(120_000);
    let asked = 0;
    const waiting: Route[] = [];
    // The file's header is answered; nothing after it ever is.
    await page.route("**/tiles/*.pmtiles", (route) => (++asked <= 1 ? route.continue() : void waiting.push(route)));
    await replay(page, "en", "Moncton");
    await expect(stage(page)).toHaveAttribute("data-basemap", "outline");
    await expect(page.locator(".map-outline")).toBeVisible();
    await expect(page.locator(".map-tiles canvas")).toBeAttached({ timeout: 20_000 }); // the detailed map has been started
    expect(await page.locator(".map-tiles").evaluate((el) => getComputedStyle(el).visibility)).toBe("hidden");
    await expect(page.locator(".map-note")).toHaveCount(0);
    expect((await drawn(page)).you).toBe(1); // the overlay is all there meanwhile
    await expect(stage(page)).toHaveAttribute("data-fallback", "tiles", { timeout: 40_000 });
    await expect(page.locator(".map-note")).toHaveText(s("en", "map.note.tiles"));
    await expect(page.locator(".map-tiles")).toHaveCount(0);
    for (const route of waiting) await route.abort().catch(() => {});
  });

  test("the file opens but its tiles fail: the note says the map could not be loaded, and never blames the device", async ({ page }) => {
    let asked = 0;
    await page.route("**/tiles/*.pmtiles", (route) => (++asked <= 1 ? route.continue() : route.abort()));
    await replay(page, "en", "Moncton");
    await outline(page, "tiles");
    await page.waitForTimeout(1500); // a map taken down gives its drawing context back: that is not the device failing
    await expect(stage(page)).toHaveAttribute("data-fallback", "tiles");
    await expect(page.locator(".map-note")).toHaveText(s("en", "map.note.tiles"));
  });

  test("the map’s names follow the language even when it changes twice at once: French and straight back to English, then French", async ({ page }) => {
    await replay(page, "en", "Moncton");
    await tiles(page);
    const names = page.locator(".map-tiles [lang]");
    await expect(names).toHaveAttribute("lang", "en");
    await french(page).click();
    await english(page).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await settled(page);
    await expect(names).toHaveAttribute("lang", "en");
    await french(page).click();
    await expect(names).toHaveAttribute("lang", "fr");
    await expect(page.locator(".map-tiles canvas")).toHaveAttribute("aria-label", s("fr", "map.canvas"));
  });

  test("the legend takes the focus once: the detailed map arriving behind it does not take a reader back to its title", async ({ page }) => {
    // The tiles come slowly: the legend is open before the detailed map has drawn.
    await page.route("**/tiles/*.pmtiles", async (route) => {
      await new Promise((later) => setTimeout(later, 2500));
      await route.continue().catch(() => {});
    });
    await replay(page, "en", "Moncton");
    await expect(stage(page)).toHaveAttribute("data-basemap", "outline");
    await page.getByRole("button", { name: s("en", "map.legend") }).click();
    await expect(page.locator("#legend-h")).toBeFocused();
    const close = page.getByRole("button", { name: s("en", "map.panel.close") });
    await close.focus();
    await tiles(page); // the basemap changes under the open legend
    await expect(page.locator('[data-row="base"]')).toContainText("OpenStreetMap");
    await expect(close).toBeFocused();
  });

  test("two presses at once move the sheet one height and close the legend with one Close: the verdict is never left", async ({ page }) => {
    await replay(page, "en", "Moncton");
    await sheetTo(page, "half");
    await handle(page).evaluate((el) => {
      for (let i = 0; i < 2; i++) el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    await expect(sheet(page)).toHaveAttribute("data-detent", "peek");
    await page.waitForTimeout(600);
    expect(new URL(page.url()).pathname).toBe("/verdict");
    await expect(page.locator("#verdict-h")).toBeVisible();

    await page.getByRole("button", { name: s("en", "map.legend") }).evaluate((el) => {
      (el as HTMLElement).click();
      (el as HTMLElement).click();
    });
    await expect(page.locator("#legend-h")).toBeVisible();
    await page.getByRole("button", { name: s("en", "map.panel.close") }).click();
    await expect(page.locator("#legend-h")).toHaveCount(0);
    await page.waitForTimeout(600);
    expect(new URL(page.url()).pathname).toBe("/verdict");
    await expect(sheet(page)).toHaveAttribute("data-detent", "peek");
  });

  test("a mark moved off the map takes its label with it: none is left at the edge beside something it does not name", async ({ page }) => {
    await replay(page, "en", "Moncton");
    await tiles(page);
    await atRest(page);
    await expect(page.locator('.map-overlay [data-label="fire"]')).toHaveCount(1);
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: s("en", "map.zoomIn") }).click();
      await atRest(page);
    }
    const at = await layout(page);
    const centre = (box: { x: number; y: number; width: number; height: number }) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    const onTheMap = (box: { x: number; y: number; width: number; height: number } | null) => {
      if (!box) return false;
      const { x, y } = centre(box);
      return x >= at.stage.x && x <= at.stage.x + at.stage.width && y >= at.stage.y && y <= at.sheetTop;
    };
    expect(onTheMap(at.focus)).toBe(false); // eight times closer, about the middle: the fire is off the map
    await expect(page.locator('.map-overlay [data-label="fire"]')).toHaveCount(0);
    await expect(page.locator('.map-overlay [data-label="you"]')).toHaveCount(onTheMap(at.you) ? 1 : 0);
  });

  test("with “Why?” open over the whole map, the map does nothing: no tile asked for, nothing redrawn, and it is as it was when the sheet comes down", async ({ page }) => {
    await replay(page, "en", "Moncton");
    await tiles(page);
    await sheetTo(page, "half");
    await atRest(page);
    const before = await shapes(page);
    const asked: string[] = [];
    page.on("request", (request) => void (/\.pmtiles$/.test(request.url()) && asked.push(request.url())));
    await page.evaluate(() => {
      const w = window as unknown as { __changes: number };
      w.__changes = 0;
      new MutationObserver((list) => { w.__changes += list.length; }).observe(document.querySelector(".map-carried")!, { subtree: true, childList: true, attributes: true });
    });
    await sheetTo(page, "full");
    await page.waitForTimeout(1000);
    expect([asked.length, await page.evaluate(() => (window as unknown as { __changes: number }).__changes)]).toEqual([0, 0]);
    await sheetTo(page, "half");
    await atRest(page);
    expect(await shapes(page)).toBe(before);
  });

  test("a map that breaks while it is drawn leaves the answer, the sheet and Call 911 as they are, and says so", async ({ page }) => {
    await page.addInitScript(() => {
      const Real = window.ResizeObserver;
      window.ResizeObserver = class extends Real {
        observe(target: Element, options?: ResizeObserverOptions) {
          if (target.classList.contains("map-stage")) throw new Error("test: the map breaks");
          super.observe(target, options);
        }
      };
    });
    await replay(page, "en", "Moncton");
    await expect(page.locator(".map-stage[data-broken]")).toBeVisible();
    await expect(page.locator(".map-note")).toHaveText(s("en", "map.note.broken"));
    await expect(page.locator("#verdict-h")).toBeVisible();
    await expect(call(page)).toBeVisible();
    await sheetTo(page, "half");
    await expect(page.locator("main .why-toggle")).toBeVisible();
    await openWhy(page);
  });

  test("a reload on the verdict goes back to the start with Call 911 on the screen, and a pull down on the verdict does not reload it", async ({ page }) => {
    await replay(page, "en", "Moncton");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY)).toBe("none");
    await page.reload();
    await expect(page).toHaveURL(/\/$/);
    await expect(call(page)).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY)).toBe("auto");
  });
});
