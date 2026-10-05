// Pictures of the three questions, the screens around them and every state of the verdict, in English and French, at
// 390 × 844: saved to screenshots/ as <nn>-<name>-<lang>.png, for a person to look at. The verdict's map is the
// detailed one (this project runs with WebGL), at each height of the sheet, in the replay and live. Replay mode, but for the verdict
// states only a live answer gives (no fire in range, ECCC's alert not checked or active now). Nothing is compared: a
// picture's test fails only when its screen could not be reached. Never part of `npm run e2e`: run with
// `npm run e2e:shots`.
import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TEST_ENGINE_URL } from "./engine";
import { answer } from "./look";
import { openBadge, openWhy, sheetTo } from "./verdict";
import { toFrench } from "./language";

type Lang = "en" | "fr";
const STRINGS: Record<Lang, Record<string, string>> = {
  en: JSON.parse(readFileSync(new URL("../src/i18n/en.json", import.meta.url), "utf8")),
  fr: JSON.parse(readFileSync(new URL("../src/i18n/fr.json", import.meta.url), "utf8")),
};
const OUT = fileURLToPath(new URL("../screenshots", import.meta.url));
// What the phone answers on "Show my location": Moncton's own point in the community list (NRCan CGNDB), good to 20 m,
// so the nearest community is Moncton and the picture reads "Near Moncton, NB".
const MONCTON = { latitude: 46.0995, longitude: -64.7998, accuracy: 20 };

/** Check in replay mode, in the language; saved, so the next page.goto() opens the same way. */
async function start(page: Page, lang: Lang) {
  await page.goto("/?mode=replay");
  await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"mode":"replay"'));
  if (lang === "fr") {
    await toFrench(page);
    await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"lang":"fr"'));
  }
}

/** A question, opened by its address: in front once its answers take taps. */
async function question(page: Page, route: "/q1" | "/q2" | "/q3") {
  await page.goto(route);
  await expect(page).toHaveURL(new RegExp(`${route}$`));
  await expect(page.locator('main .look-answers[data-ready="true"]')).toBeVisible();
}

/** A replay town's verdict as it opens: the map drawn (the detailed one, or the outline map with its note; or no map,
 *  on a small phone where the card and the fire-is-close notice leave it no room), and the glance card in the sheet. */
async function verdict(page: Page, town: string) {
  await page.goto("/location");
  await page.locator("input[type=search]").fill(town);
  await page.getByRole("option", { name: new RegExp(`^${town},`) }).first().click();
  await expect(page.locator("#verdict-h")).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => { const map = document.querySelector(".map-stage"); return map?.getAttribute("data-basemap") === "tiles" || map?.hasAttribute("data-fallback") || (map as HTMLElement | null)?.inert === true; }, null, { timeout: 20_000 });
}
/** A browser with no WebGL, for the picture of the outline map. Before the page loads. */
const noWebGL = (page: Page) =>
  page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
      return /webgl/.test(kind) ? null : (original as (...args: unknown[]) => unknown).call(this, kind, ...rest);
    } as typeof original;
  });

const demo = (town: string) => JSON.parse(readFileSync(new URL(`../../data/demo/${town}.json`, import.meta.url), "utf8"));
// A live answer made of the engine's recorded one: checked now, with the winds' newest model run and ECCC's answer.
const liveAnswer = (town: string, airQuality: object) => {
  const recorded = demo(town);
  return { ...recorded, mode: "live", wind: { ...recorded.wind, run: "2026-10-03T18:00:00Z", recordedAt: null }, alerts: { airQuality } };
};
const NONE = { state: "none", source: "eccc_geomet", checkedAt: "2026-10-03T19:30:01Z", alert: null };
const NOT_CHECKED = { state: "not_checked", source: "eccc_geomet", checkedAt: null, alert: null };
const WARNING = {
  state: "active", source: "eccc_geomet", checkedAt: "2026-10-03T19:30:01Z",
  alert: {
    code: "AQW", nameEn: "air quality warning", nameFr: "avertissement de qualité de l'air", colourEn: "yellow", colourFr: "jaune",
    zoneEn: "Moncton and Southeast New Brunswick", zoneFr: "Moncton et sud-est du Nouveau-Brunswick",
    issued: "2026-10-03T12:31:43Z", expires: "2026-10-04T04:31:43Z", url: null,
  },
};

/** A live verdict, the engine answering GET /verdict with `body`. The language chosen at the start is kept. */
async function liveVerdict(page: Page, body: object, town: string) {
  await page.route(`${TEST_ENGINE_URL}/verdict**`, (route: Route) => route.fulfill({ json: body, headers: { "access-control-allow-origin": "*" } }));
  await page.goto("/?mode=live");
  await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"mode":"live"'));
  await verdict(page, town);
}

/** `whole`: the picture shows the whole page, however tall, with the 911 bar at its foot (the layout of a tall phone:
 *  never with `phone`). `phone`: a smaller screen than the 390 × 844 of the other pictures, taken at that size. */
type Shot = { name: string; file: string; whole?: boolean; phone?: { width: number; height: number }; open: (page: Page, lang: Lang) => Promise<void> };
const SMALL = { width: 375, height: 667 };
const SMALLEST = { width: 320, height: 568 };

const SHOTS: Shot[] = [
  {
    name: "01 Check",
    file: "01-check",
    // Already open after the start: I smell smoke, and the screen's own Call 911 under it.
    open: async (page) => {
      await expect(page.locator('main a[href="/q1"]')).toBeVisible();
      await expect(page.locator('a[href="tel:911"]')).toBeVisible();
    },
  },
  { name: "02 Q1", file: "02-q1", open: (page) => question(page, "/q1") },
  { name: "03 Q2", file: "03-q2", open: (page) => question(page, "/q2") },
  { name: "04 Q3", file: "04-q3", open: (page) => question(page, "/q3") },
  {
    name: "05 Q3, About these questions open",
    file: "05-q3-about",
    open: async (page) => {
      await question(page, "/q3");
      await page.locator("main .look-about-toggle").click();
      await expect(page.locator("#look-about-text")).toBeVisible();
    },
  },
  {
    name: "06 Nearby fire",
    file: "06-nearby-fire",
    open: async (page) => {
      await page.goto("/nearby-fire");
      await expect(page).toHaveURL(/\/nearby-fire$/);
      await expect(page.locator('main.nearby-main a[href="tel:911"]')).toBeVisible();
    },
  },
  {
    name: "07 Call 911 now, no location",
    file: "07-call-911-now",
    // Reached as a person does, by answering Yes: only "Show my location" under Where you are.
    open: async (page) => {
      await question(page, "/q1");
      await answer(page, "yes");
      await expect(page).toHaveURL(/\/emergency$/);
      await expect(page.locator("main .where-show")).toBeVisible();
      await expect(page.locator("main .where-name, main .where-coords")).toHaveCount(0);
    },
  },
  {
    name: "08 Call 911 now, with the phone's location",
    file: "08-call-911-now-location",
    // The phone allows its location and answers on the tap: the coordinates at once, the town's name when the list of
    // communities has loaded. The picture is taken with or without the name.
    open: async (page) => {
      await page.context().grantPermissions(["geolocation"]);
      await page.context().setGeolocation(MONCTON);
      await page.goto("/emergency");
      await page.locator("main .where-show").click();
      await expect(page.locator("main .where-coords")).toBeVisible();
      await page.locator("main .where-name").waitFor({ timeout: 5_000 }).catch(() => {});
    },
  },
  {
    name: "09 Check, Add to home screen open",
    file: "09-check-add-to-home-screen",
    // On a computer: both phones' steps, and the sheet's own Call 911 button.
    open: async (page, lang) => {
      await page.getByRole("button", { name: STRINGS[lang]["keep.add"], exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("dialog").locator('a[href="tel:911"]')).toBeVisible();
    },
  },
  // The verdict: one picture for each state the engine returns and each state of ECCC's alert badge, as the screen
  // opens; then one badge open, and "Why?" open.
  {
    name: "10 Verdict, drifting smoke (Moncton): ECCC alert active",
    file: "10-verdict-drifting",
    open: async (page) => {
      await verdict(page, "Moncton");
      await expect(page.locator('main .badge[data-badge="alert"]')).toHaveAttribute("data-tone", "active");
    },
  },
  {
    name: "11 Verdict, unclear (Miramichi): ECCC alert none in effect",
    file: "11-verdict-unclear",
    open: async (page) => {
      await verdict(page, "Miramichi");
      await expect(page.locator('main .badge[data-badge="alert"]')).toHaveAttribute("data-tone", "none");
    },
  },
  {
    name: "12 Verdict, unexplained (Halifax): Call 911 is the main action",
    file: "12-verdict-unexplained",
    open: async (page) => {
      await verdict(page, "Halifax");
      await expect(page.locator('.sticky-first a[href="tel:911"]')).toBeVisible();
    },
  },
  {
    name: "13 Verdict, no fire in range (live)",
    file: "13-verdict-no-fires",
    open: async (page) => {
      const halifax = liveAnswer("halifax", NONE);
      await liveVerdict(page, { ...halifax, noFiresInRange: true, nearestFire: null, closestApproach: null, forward: null, sources: { ...halifax.sources, checkedMinutesAgo: 7 } }, "Halifax");
      await expect(page.locator("section.glance")).toHaveAttribute("data-state", "unexplained");
    },
  },
  {
    name: "14 Verdict, the fire is close (Bridgetown): the notice stays in front",
    file: "14-verdict-fire-close",
    open: async (page) => {
      await verdict(page, "Bridgetown");
      await expect(page.locator("main > section").first().locator('a[href="/leave"]')).toBeVisible();
    },
  },
  {
    name: "15 Verdict, ECCC alert not checked (live)",
    file: "15-verdict-alert-not-checked",
    open: async (page) => {
      await liveVerdict(page, liveAnswer("moncton", NOT_CHECKED), "Moncton");
      await expect(page.locator('main .badge[data-badge="alert"]')).toHaveAttribute("data-tone", "notChecked");
    },
  },
  {
    name: "16 Verdict, an unnamed fire on Canada’s official list (Bathurst)",
    file: "16-verdict-official-list",
    open: async (page) => {
      await verdict(page, "Bathurst");
      await sheetTo(page, "half");
      await expect(page.locator('main .badge[data-badge="fire"]')).toBeVisible();
    },
  },
  {
    name: "17 Verdict, one badge open: ECCC’s alert in the replay (Moncton)",
    file: "17-verdict-badge-open",
    whole: true,
    open: async (page) => {
      await verdict(page, "Moncton");
      await openBadge(page, "alert");
    },
  },
  {
    name: "18 Verdict, one badge open: ECCC’s alert, live",
    file: "18-verdict-badge-open-live",
    whole: true,
    open: async (page) => {
      await liveVerdict(page, liveAnswer("moncton", WARNING), "Moncton");
      await openBadge(page, "alert");
    },
  },
  {
    name: "19 Verdict, Why? open (Moncton)",
    file: "19-verdict-why-open",
    whole: true,
    open: async (page) => {
      await verdict(page, "Moncton");
      await openWhy(page);
    },
  },
  // Small phones: the three badges share one row, so they and "Why?" show above the 911 bar as the screen opens.
  {
    name: "20 Verdict on a small phone (375 × 667), drifting smoke (Moncton)",
    file: "20-verdict-small-drifting",
    phone: SMALL,
    open: (page) => verdict(page, "Moncton"),
  },
  {
    name: "21 Verdict on a small phone (375 × 667), unexplained (Halifax)",
    file: "21-verdict-small-unexplained",
    phone: SMALL,
    open: (page) => verdict(page, "Halifax"),
  },
  {
    name: "22 Verdict on a small phone (375 × 667), a badge open: its name, source, time and link",
    file: "22-verdict-small-badge-open",
    phone: SMALL,
    open: async (page) => {
      await verdict(page, "Halifax");
      await openBadge(page, "fire");
    },
  },
  {
    name: "23 Verdict on the smallest phone (320 × 568), drifting smoke (Moncton)",
    file: "23-verdict-smallest-drifting",
    phone: SMALLEST,
    open: (page) => verdict(page, "Moncton"),
  },
  {
    name: "24 Verdict on the smallest phone (320 × 568), unexplained (Halifax)",
    file: "24-verdict-smallest-unexplained",
    phone: SMALLEST,
    open: (page) => verdict(page, "Halifax"),
  },
  {
    name: "25 Verdict on a small phone (375 × 667), the fire is close (Bridgetown): the notice comes first",
    file: "25-verdict-small-fire-close",
    phone: SMALL,
    open: (page) => verdict(page, "Bridgetown"),
  },
  {
    name: "26 Verdict on a small phone (375 × 667), the fire is close, scrolled: the badges and Why? after the notice",
    file: "26-verdict-small-fire-close-scrolled",
    phone: SMALL,
    open: async (page) => {
      await verdict(page, "Bridgetown");
      await sheetTo(page, "half");
      await page.locator("main .why-toggle").scrollIntoViewIfNeeded();
    },
  },
  {
    name: "27 Verdict on a small phone (375 × 667), ECCC alert not checked (live)",
    file: "27-verdict-small-alert-not-checked",
    phone: SMALL,
    open: (page) => liveVerdict(page, liveAnswer("moncton", NOT_CHECKED), "Moncton"),
  },
  // The answer on the map: each height of the sheet, in the replay and live; the legend; and the outline map.
  { name: "30 Map, replay (Moncton): peek, the card", file: "30-map-replay-peek", open: (page) => verdict(page, "Moncton") },
  { name: "31 Map, replay (Moncton): half, the badges", file: "31-map-replay-half", open: async (page) => { await verdict(page, "Moncton"); await sheetTo(page, "half"); } },
  { name: "32 Map, replay (Moncton): full, Why?", file: "32-map-replay-full", open: async (page) => { await verdict(page, "Moncton"); await openWhy(page); } },
  { name: "33 Map, live (Moncton): peek, the card", file: "33-map-live-peek", open: (page) => liveVerdict(page, liveAnswer("moncton", WARNING), "Moncton") },
  { name: "34 Map, live (Moncton): half, the badges", file: "34-map-live-half", open: async (page) => { await liveVerdict(page, liveAnswer("moncton", WARNING), "Moncton"); await sheetTo(page, "half"); } },
  { name: "35 Map, live (Moncton): full, Why?", file: "35-map-live-full", open: async (page) => { await liveVerdict(page, liveAnswer("moncton", WARNING), "Moncton"); await openWhy(page); } },
  {
    name: "36 Map, the legend: each layer with its source and its time",
    file: "36-map-legend",
    whole: true,
    open: async (page, lang) => {
      await verdict(page, "Moncton");
      await page.getByRole("button", { name: STRINGS[lang]["map.legend"] }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
    },
  },
  {
    name: "37 Map, no WebGL: the outline map, the same overlay, and a note",
    file: "37-map-outline",
    open: async (page) => {
      await noWebGL(page);
      await verdict(page, "Moncton");
      await expect(page.locator(".map-note")).toBeVisible();
    },
  },
  { name: "38 Map on a small phone (375 × 667), replay (Moncton): peek", file: "38-map-small-peek", phone: SMALL, open: (page) => verdict(page, "Moncton") },
  { name: "39 Map on the smallest phone (320 × 568), replay (Moncton): peek", file: "39-map-smallest-peek", phone: SMALLEST, open: (page) => verdict(page, "Moncton") },
  {
    name: "40 Map, moved: Recentre in the credit's corner",
    file: "40-map-moved",
    open: async (page, lang) => {
      await verdict(page, "Moncton");
      await page.getByRole("button", { name: STRINGS[lang]["map.zoomIn"] }).click();
      await expect(page.getByRole("button", { name: STRINGS[lang]["map.recentre"] })).toBeVisible();
      await page.waitForTimeout(900);
    },
  },
];

/** Wait as pixels.spec.ts does (the network quiet, the fonts in), switch animations off, and save the picture. */
async function save(page: Page, file: string, whole = false) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
  if (whole) {
    // A phone as tall as the page: everything shows, and the 911 bar stays at the foot. On the verdict the page is
    // the phone's height and the sheet (or the legend) scrolls inside it: tall enough for all it holds.
    const height = await page.evaluate(() => {
      const inside = document.querySelector<HTMLElement>(".map-legend") ?? document.querySelector<HTMLElement>(".answer-sheet");
      if (!inside) return document.documentElement.scrollHeight;
      const box = inside.getBoundingClientRect();
      return Math.ceil(box.top + inside.scrollHeight + (window.innerHeight - box.bottom));
    });
    await page.setViewportSize({ width: page.viewportSize()!.width, height });
    await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector(".answer-sheet")?.scrollTo(0, 0); });
  }
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, file) });
}

for (const lang of ["en", "fr"] as const) {
  test.describe(`Pictures, ${lang.toUpperCase()}`, () => {
    // One test per picture: a screen that can't be reached doesn't hide the others.
    for (const shot of SHOTS) {
      test(shot.name, async ({ page }) => {
        if (shot.phone) await page.setViewportSize(shot.phone);
        await start(page, lang);
        await shot.open(page, lang);
        await save(page, `${shot.file}-${lang}.png`, shot.whole);
      });
    }
  });
}
