// The verdict as one glance: a large icon in its own shape and colour, one line, the source badges under it, and
// "Why?" in front of everything the screen said before. In the replay (Aug 25, 2025) and live, in English and French.
// The card is in a sheet at the foot of the map: the screen opens on the card alone; the badges and "Why?" are one tap
// up ("Sources and why", the sheet at half), where most of these tests look at them.
import { expect, test, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { TEST_ENGINE_URL } from "./engine";
import { openBadge, openWhy, sheetTo } from "./verdict";
import { toFrench } from "./language";

type Lang = "en" | "fr";
const LANGS = ["en", "fr"] as const;
const NBSP = String.fromCharCode(0xa0);
const STRINGS: Record<Lang, Record<string, string>> = {
  en: JSON.parse(readFileSync(new URL("../src/i18n/en.json", import.meta.url), "utf8")),
  fr: JSON.parse(readFileSync(new URL("../src/i18n/fr.json", import.meta.url), "utf8")),
};
const s = (lang: Lang, key: string, vars: Record<string, string | number> = {}) => STRINGS[lang][key].replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
const demo = (town: string) => JSON.parse(readFileSync(new URL(`../../data/demo/${town}.json`, import.meta.url), "utf8"));
const NAVY = "rgb(27, 42, 74)";
const RED = "rgb(217, 45, 32)";
const WHITE = "rgb(255, 255, 255)";
// The wording src/i18n/strings.test.ts bans in every string, and the word "safe".
const NO_CALL = /safe|sécuri|(do not|don’t|never|no need to) call|ne (pas|jamais) appeler|n’appelez (pas|jamais)/i;
/** Text as a person reads it: no-break spaces and line breaks as plain spaces. */
const plain = (text: string | null) => (text ?? "").replace(/\s+/g, " ").trim();

async function start(page: Page, lang: Lang, mode: "replay" | "live") {
  await page.goto(`/?mode=${mode}`);
  await page.waitForFunction((m) => sessionStorage.getItem("smoke-or-fire")?.includes(`"mode":"${m}"`), mode);
  if (lang === "fr") {
    await toFrench(page);
    await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"lang":"fr"'));
  }
}
/** `raised`: the sheet is brought to half, where the badges and "Why?" are; false leaves the screen as it opens. */
async function search(page: Page, town: string, raised = true) {
  await page.goto("/location");
  await page.locator("input[type=search]").fill(town);
  await page.getByRole("option", { name: new RegExp(`^${town},`) }).first().click();
  await expect(page.locator("#verdict-h")).toBeVisible({ timeout: 15_000 });
  if (raised) await sheetTo(page, "half");
}
/** The replay town's verdict: its card in front, the badges and "Why?" under it (or, not `raised`, as it opens). */
async function replay(page: Page, lang: Lang, town: string, raised = true) {
  await start(page, lang, "replay");
  await search(page, town, raised);
}
/** A live verdict: the engine answers GET /verdict with `answer`. */
async function live(page: Page, lang: Lang, answer: object, town = "Moncton", raised = true) {
  await page.route(`${TEST_ENGINE_URL}/verdict**`, (route: Route) => route.fulfill({ json: answer, headers: { "access-control-allow-origin": "*" } }));
  await start(page, lang, "live");
  await search(page, town, raised);
}

// Live answers, made of the engine's recorded ones: checked now, with the winds' newest model run and ECCC's answer.
const WARNING = {
  code: "AQW", nameEn: "air quality warning", nameFr: "avertissement de qualité de l'air", colourEn: "yellow", colourFr: "jaune",
  zoneEn: "Moncton and Southeast New Brunswick", zoneFr: "Moncton et sud-est du Nouveau-Brunswick",
  issued: "2026-10-03T12:31:43Z", expires: "2026-10-04T04:31:43Z", url: null,
};
const ECCC = {
  active: { state: "active", source: "eccc_geomet", checkedAt: "2026-10-03T19:30:01Z", alert: WARNING },
  none: { state: "none", source: "eccc_geomet", checkedAt: "2026-10-03T19:30:01Z", alert: null },
  notChecked: { state: "not_checked", source: "eccc_geomet", checkedAt: null, alert: null },
};
const liveAnswer = (town: string, airQuality: object | undefined, run: string | null = "2026-10-03T18:00:00Z") => {
  const recorded = demo(town);
  return { ...recorded, mode: "live", wind: { ...recorded.wind, run, recordedAt: null }, alerts: airQuality && { airQuality } };
};
/** Screen 7d: live, with no fire within 500 km, the fire sources checked 7 minutes before. */
const noFires = () => {
  const halifax = liveAnswer("halifax", ECCC.none);
  return { ...halifax, noFiresInRange: true, nearestFire: null, closestApproach: null, forward: null, sources: { ...halifax.sources, checkedMinutesAgo: 7 } };
};

const card = (page: Page) => page.locator("section.glance");
const line = (page: Page) => page.locator("h1#verdict-h");
const badges = (page: Page) => page.locator("main .badge");
const badge = (page: Page, id: string) => page.locator(`main .badge[data-badge="${id}"]`);
/** The badge's full name, as written on it. */
const badgeName = (page: Page, id: string) => badge(page, id).locator(".badge-label");
const call = (page: Page) => page.locator('a[href="tel:911"]');
const look = (page: Page) =>
  card(page).evaluate((el) => {
    const shape = el.querySelector(".glance-shape")!;
    return { state: el.getAttribute("data-state"), background: getComputedStyle(el).backgroundColor, shape: shape.getAttribute("data-shape"), icon: shape.innerHTML };
  });

// The three states the engine returns, each on a replay town, and the line each shows.
const STATES = [
  {
    town: "Moncton", state: "drifting", shape: "circle", background: "rgb(232, 89, 12)",
    line: { en: "Drifting smoke · Long Lake fire · 159 km SSW", fr: "Fumée qui dérive · Feu de Long Lake · 159 km SSO" },
  },
  {
    town: "Miramichi", state: "unclear", shape: "diamond", background: "rgb(247, 144, 9)",
    line: { en: "Unclear · Maybe a fire near Fontaine · Look outside", fr: "Incertain · Peut-être un feu près de Fontaine · Regardez dehors" },
  },
  {
    town: "Halifax", state: "unexplained", shape: "triangle", background: RED,
    line: { en: "Unexplained smoke · No known fire upwind", fr: "Fumée inexpliquée · Aucun feu connu en amont du vent" },
  },
];

test.describe("the card: one line under a large icon", () => {
  for (const lang of LANGS) {
    for (const state of STATES) {
      test(`${lang.toUpperCase()} ${state.state} (${state.town} replay): as the screen opens, the icon in its shape and colour and the line as the title; one tap up, the badges, and "Why?" closed`, async ({ page }) => {
        await replay(page, lang, state.town, false);

        expect(await look(page)).toMatchObject({ state: state.state, shape: state.shape, background: state.background });
        const shape = card(page).locator(".glance-shape");
        await expect(shape).toBeVisible();
        expect((await shape.boundingBox())!.width).toBeGreaterThanOrEqual(72); // a large icon
        // The line is the screen's title, and its only one.
        expect(plain(await line(page).innerText())).toBe(state.line[lang]);
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        expect(plain(await line(page).innerText()).split(" ").filter((word) => word !== "·").length).toBeLessThanOrEqual(11);
        // The dots never start a line: each follows its part after a no-break space.
        expect((await line(page).locator(".glance-part").allTextContents()).slice(0, -1).every((part) => part.endsWith(`${NBSP}·`))).toBe(true);
        // The badges are on the page, out of sight and out of reach until the sheet is raised.
        // (In New Brunswick the burn status is a fourth, after the verdict's three: Moncton, Miramichi.)
        expect(await badges(page).evaluateAll((all) => all.map((b) => b.getAttribute("data-badge")))).toEqual(["fire", "trace", "alert", ...(state.town === "Halifax" ? [] : ["burn"])]);
        for (const b of await badges(page).all()) await expect(b).toBeHidden();
        await sheetTo(page, "half");
        for (const b of await badges(page).all()) await expect(b).toBeVisible();
        // Everything the verdict said before is on the page, behind "Why?", and not shown.
        const why = page.locator("main .why-toggle");
        await expect(why).toHaveText(s(lang, "card.why"));
        await expect(why).toHaveAttribute("aria-expanded", "false");
        await expect(page.locator("#why-all")).toBeHidden();
        for (const hidden of ["#answer-h", "section[aria-labelledby=fire-h]", "#conf-h", "#todo-h", "#aqhi-h"]) {
          await expect(page.locator(hidden)).toHaveCount(1);
          await expect(page.locator(hidden)).toBeHidden();
        }
      });
    }
  }

  test("each state has its own shape, its own colour and its own icon: no two alike in any of the three", async ({ page }) => {
    const looks = [];
    for (const state of STATES) {
      await replay(page, "en", state.town);
      looks.push(await look(page));
    }
    expect((["state", "shape", "background", "icon"] as const).map((key) => new Set(looks.map((l) => l[key])).size)).toEqual([3, 3, 3, 3]);
  });

  test("no fire in range (live): unexplained smoke, none known within 500 km, with the same red triangle", async ({ page }) => {
    await live(page, "en", noFires(), "Halifax");

    expect(await look(page)).toMatchObject({ state: "unexplained", shape: "triangle", background: RED });
    expect(plain(await line(page).innerText())).toBe("Unexplained smoke · No known fire within 500 km");
    await expect(page.getByRole("link", { name: "Exit" })).toHaveCount(0); // live: no replay banner
  });

  test("an unnamed fire is named by its nearest community; a fire nobody’s satellite saw shows Canada’s official list", async ({ page }) => {
    await replay(page, "en", "Bathurst");

    expect(plain(await line(page).innerText())).toBe("Drifting smoke · Fire near Heath Steele · 52 km SW");
    await expect(badgeName(page, "fire")).toHaveText("Official active fire list");
    const panel = await openBadge(page, "fire");
    expect(await panel.locator("p").allTextContents()).toEqual(["It’s on Canada’s official active fire list.", "Source: Natural Resources Canada (CWFIS)."]);
  });
});

test.describe("the arrow beside the distance", () => {
  /** The arrow's turn on screen, in degrees clockwise from north, and its name. */
  const arrow = (page: Page) =>
    line(page).locator(".glance-arrow").evaluate((el) => {
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      return { deg: Math.round(((Math.atan2(m.b, m.a) * 180) / Math.PI + 360) % 360 * 10) / 10, role: el.getAttribute("role"), label: el.getAttribute("aria-label") };
    });

  test("Moncton: points south-southwest, from the person toward the fire, and says so", async ({ page }) => {
    await replay(page, "en", "Moncton");

    expect(await arrow(page)).toEqual({ deg: 202.5, role: "img", label: "toward the south-southwest" });
    await expect(page.getByRole("img", { name: "toward the south-southwest" })).toBeVisible();
    // Beside the distance: in the line's last part, after "159 km SSW".
    await expect(line(page).locator(".glance-part").last().locator(".glance-arrow")).toHaveCount(1);
    // A screen reader hears the direction in words as part of the title, after a space (a no-break one: the arrow
    // stays with the distance).
    await expect(line(page)).toHaveAccessibleName(/159 km SSW\stoward the south-southwest$/);
  });

  test("in French, and for a fire to the southeast (West Dalhousie)", async ({ page }) => {
    await replay(page, "fr", "Moncton");
    expect(await arrow(page)).toEqual({ deg: 202.5, role: "img", label: "vers le sud-sud-ouest" });

    await replay(page, "fr", "West Dalhousie");
    expect(await arrow(page)).toEqual({ deg: 135, role: "img", label: "vers le sud-est" });
  });

  test("no arrow where the line gives no distance: unclear, unexplained", async ({ page }) => {
    for (const town of ["Miramichi", "Halifax"]) {
      await replay(page, "en", town);
      await expect(page.locator(".glance-arrow")).toHaveCount(0);
    }
  });
});

test.describe("the badges: one tap shows the source, its time and a link", () => {
  /** How far the open panel reaches below the top of the 911 bar (nothing, when it is clear of it). */
  const underBar = (page: Page, id: string) =>
    page.evaluate((panelId) => {
      const panel = document.querySelector(`#badge-${panelId}`)!.getBoundingClientRect();
      const bar = document.querySelector('a[href="tel:911"]')!.parentElement!.getBoundingClientRect();
      return Math.max(0, Math.round(panel.bottom - bar.top));
    }, id);
  const panelOf = async (page: Page, id: "fire" | "trace" | "alert") => {
    const panel = await openBadge(page, id);
    const links = await panel.locator("a").evaluateAll((all) => all.map((a) => ({ text: (a.textContent ?? "").trim(), href: a.getAttribute("href"), target: a.getAttribute("target"), rel: a.getAttribute("rel"), height: Math.round(a.getBoundingClientRect().height) })));
    return { lines: await panel.locator("p").allTextContents(), links };
  };
  const outside = { target: "_blank", rel: "noopener noreferrer" };

  test("each badge is a button 56 px tall or more, closed at first, that names the panel it opens", async ({ page }) => {
    await replay(page, "en", "Moncton");

    await expect(page.getByRole("group", { name: "Sources" })).toBeVisible();
    for (const id of ["fire", "trace", "alert"]) {
      const b = badge(page, id);
      expect(await b.evaluate((el) => [el.tagName, el.getAttribute("aria-expanded"), el.getAttribute("aria-controls")])).toEqual(["BUTTON", "false", `badge-${id}`]);
      expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(56);
      await expect(page.locator(`#badge-${id}`)).toHaveCount(1);
      await expect(page.locator(`#badge-${id}`)).toBeHidden();
    }
    await expect(page.getByRole("button", { name: "Satellite fire detection" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Wind trace" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ECCC air quality alert: active" })).toBeVisible();
  });

  test("the satellite fire detection: the satellite, the detection time, FIRMS and CWFIS, and a link to each", async ({ page }) => {
    await replay(page, "en", "Moncton");

    const { lines, links } = await panelOf(page, "fire");
    expect(lines).toEqual(["Terra saw it burning 10 hours ago.", "Detected: 2025-08-24, 22:43 (Atlantic time).", "Sources: NASA FIRMS and Natural Resources Canada (CWFIS)."]);
    expect(links.map(({ height, ...link }) => link)).toEqual([
      { text: "NASA fire mapfirms.modaps.eosdis.nasa.gov", href: "https://firms.modaps.eosdis.nasa.gov/map/", ...outside },
      { text: "Canada’s fire mapcwfis.cfs.nrcan.gc.ca", href: "https://cwfis.cfs.nrcan.gc.ca/interactive-map", ...outside },
    ]);
    expect(links.every((link) => link.height >= 56)).toBe(true);
  });

  test("the wind trace, in the replay: the wind’s source, when the recorded winds were downloaded, and how far back", async ({ page }) => {
    await replay(page, "en", "Moncton");

    const { lines, links } = await panelOf(page, "trace");
    expect(lines).toEqual(["Hourly winds from the GFS weather model (NOAA), through Open-Meteo.", "Recorded winds for the replay, downloaded 2026-09-26.", "Traced back 20 hours from Moncton."]);
    expect(links.map(({ height, ...link }) => link)).toEqual([{ text: "Open-Meteoopen-meteo.com", href: "https://open-meteo.com/en/docs/gfs-api", ...outside }]);
  });

  test("the wind trace, live: the newest model run in the winds; “not checked” when the engine has none", async ({ page }) => {
    await live(page, "en", liveAnswer("moncton", ECCC.none));
    expect((await panelOf(page, "trace")).lines[1]).toBe("Newest model run in these winds: 2026-10-03, 15:00 (Atlantic time).");

    await page.unroute(`${TEST_ENGINE_URL}/verdict**`);
    await live(page, "en", liveAnswer("moncton", ECCC.none, null));
    expect((await panelOf(page, "trace")).lines[1]).toBe("Model run: not checked.");
  });

  for (const lang of LANGS) {
    test(`${lang.toUpperCase()} ECCC’s alert in the replay: ECCC’s own name and zone, when it was issued, and the archived message`, async ({ page }) => {
      await replay(page, lang, "Moncton");

      await expect(badgeName(page, "alert")).toHaveText(s(lang, "badge.alert.active"));
      const { lines, links } = await panelOf(page, "alert");
      expect(lines).toEqual(
        lang === "en"
          ? [
              "Special air quality statement",
              "Moncton and Southeast New Brunswick",
              "Issued 2025-08-25, 04:50 (Atlantic time).",
              "Valid until at least 2025-08-25, 20:50 (Atlantic time).",
              "Data source: Environment and Climate Change Canada. For the replay, converted from the copy of ECCC’s messages kept by the NAAD System archive.",
            ]
          : [
              "Bulletin spécial sur la qualité de l'air",
              "Moncton et sud-est du Nouveau-Brunswick",
              "Émise le 2025-08-25, 4 h 50 (heure de l’Atlantique).",
              "Valide au moins jusqu’au 2025-08-25, 20 h 50 (heure de l’Atlantique).",
              `Source des données${NBSP}: Environnement et Changement climatique Canada. Pour la reprise, données converties à partir de la copie des messages d’ECCC conservée dans les archives du Système ADNA.`,
            ],
      );
      expect(links.map(({ height, ...link }) => link)).toEqual([
        {
          text: `${s(lang, "badge.alert.link.message")}alertsarchive.pelmorex.com`,
          href: "https://alertsarchive.pelmorex.com/archive/2025-08-25/2025-08-25T07_51_32_18Iurn%263oid%2632.49.0.1.124.3033216116.2025_001.xml",
          ...outside,
        },
      ]);
    });
  }

  test("ECCC’s alert, live: the colour ECCC gives, when ECCC answered, and ECCC’s page for the place", async ({ page }) => {
    await live(page, "en", liveAnswer("moncton", ECCC.active));

    const { lines, links } = await panelOf(page, "alert");
    expect(lines).toEqual([
      "Air quality warning (yellow)",
      "Moncton and Southeast New Brunswick",
      "Issued 2026-10-03, 09:31 (Atlantic time).",
      "Valid until at least 2026-10-04, 01:31 (Atlantic time).",
      "Checked with ECCC: 2026-10-03, 16:30 (Atlantic time).",
      "Data source: Environment and Climate Change Canada.",
    ]);
    // The spot rounded to about 1 km: enough for ECCC to find the forecast zone.
    expect(links.map(({ height, ...link }) => link)).toEqual([{ text: "ECCC alerts for this placeweather.gc.ca", href: "https://weather.gc.ca/en/location/index.html?coords=46.10,-64.80", ...outside }]);
  });

  test("one panel at a time, each clear of the 911 bar; a second tap closes it", async ({ page }) => {
    await replay(page, "en", "Moncton");

    for (const id of ["fire", "trace", "alert"] as const) {
      await openBadge(page, id);
      await expect(badge(page, id)).toHaveAttribute("aria-expanded", "true");
      expect(await page.locator(".badge-panel:not([hidden])").evaluateAll((all) => all.map((p) => p.id))).toEqual([`badge-${id}`]);
      await expect.poll(() => underBar(page, id)).toBe(0);
    }
    await badge(page, "alert").click();
    await expect(badge(page, "alert")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#badge-alert")).toBeHidden();
  });

  test("with the keyboard: Enter on a badge opens it", async ({ page }) => {
    await replay(page, "en", "Moncton");

    await badge(page, "trace").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#badge-trace")).toBeVisible();
  });
});

test.describe("badge states differ by shape and word, never by colour alone", () => {
  /** A badge's outline, as drawn. */
  const drawn = (page: Page, id: string) =>
    badge(page, id).evaluate((el) => {
      const st = getComputedStyle(el);
      return { tone: el.getAttribute("data-tone"), fill: st.backgroundColor, ink: st.color, border: `${st.borderTopWidth} ${st.borderTopStyle} ${st.borderTopColor}`, radius: parseFloat(st.borderTopLeftRadius) >= 28 };
    });
  const FILLED = { tone: "active", fill: NAVY, ink: WHITE, border: `2px solid ${NAVY}`, radius: true };
  const OUTLINE = { tone: "none", fill: WHITE, ink: NAVY, border: `2px solid ${NAVY}`, radius: true };
  const DASHED = { tone: "notChecked", fill: WHITE, ink: NAVY, border: `2px dashed ${NAVY}`, radius: true };

  for (const lang of LANGS) {
    test(`${lang.toUpperCase()} active: a filled pill, and the word in its label (Moncton replay)`, async ({ page }) => {
      await replay(page, lang, "Moncton");

      expect(await drawn(page, "alert")).toEqual(FILLED);
      await expect(badgeName(page, "alert")).toHaveText(s(lang, "badge.alert.active"));
      expect(s(lang, "badge.alert.active")).toMatch(lang === "en" ? /: active$/ : /: en vigueur$/);
    });

    test(`${lang.toUpperCase()} none in effect: an outlined pill, and the words (Halifax replay)`, async ({ page }) => {
      await replay(page, lang, "Halifax");

      expect(await drawn(page, "alert")).toEqual(OUTLINE);
      await expect(badgeName(page, "alert")).toHaveText(s(lang, "badge.alert.none"));
      expect(s(lang, "badge.alert.none")).toMatch(lang === "en" ? /: none in effect$/ : /: aucune en vigueur$/);
      // Nothing explains the smoke: the fire detections are "none" too, outlined the same way.
      expect(await drawn(page, "fire")).toEqual(OUTLINE);
      await expect(badgeName(page, "fire")).toHaveText(s(lang, "badge.fire.nonePath"));
    });

    test(`${lang.toUpperCase()} not checked: a dashed outline, and the words (live, ECCC could not be asked)`, async ({ page }) => {
      await live(page, lang, liveAnswer("moncton", ECCC.notChecked));

      expect(await drawn(page, "alert")).toEqual(DASHED);
      await expect(badgeName(page, "alert")).toHaveText(s(lang, "badge.alert.notChecked"));
      expect(s(lang, "badge.alert.notChecked")).toMatch(lang === "en" ? /: not checked$/ : /: non vérifiée$/);
      const panel = await openBadge(page, "alert");
      // Never a guess: it says the alerts were not checked, and where to look.
      expect(await panel.locator("p").allTextContents()).toEqual([s(lang, "badge.alert.notChecked.body"), s(lang, "badge.alert.source")]);
      await expect(panel.locator("a")).toHaveAttribute("href", lang === "en" ? "https://weather.gc.ca/en/location/index.html?coords=46.10,-64.80" : "https://meteo.gc.ca/fr/location/index.html?coords=46.10,-64.80");
    });
  }

  test("an engine that says nothing about alerts (an older one): not checked, dashed, never “none”", async ({ page }) => {
    await live(page, "en", liveAnswer("moncton", undefined));

    expect(await drawn(page, "alert")).toEqual(DASHED);
    await expect(badgeName(page, "alert")).toHaveText("ECCC air quality alert: not checked");
  });

  test("none in effect, live: ECCC’s answer and when it was given", async ({ page }) => {
    await live(page, "en", liveAnswer("moncton", ECCC.none));

    expect(await drawn(page, "alert")).toEqual(OUTLINE);
    const panel = await openBadge(page, "alert");
    expect(await panel.locator("p").allTextContents()).toEqual([
      "No air quality alert from ECCC is in effect for this place.",
      "Checked with ECCC: 2026-10-03, 16:30 (Atlantic time).",
      "Data source: Environment and Climate Change Canada.",
    ]);
  });

  test("the three states are three shapes: no two drawn alike, and each with a word of its own", () => {
    const shapes = [FILLED, OUTLINE, DASHED].map((d) => `${d.fill} ${d.border}`);
    const words = LANGS.map((lang) => ["active", "none", "notChecked"].map((state) => s(lang, `badge.alert.${state}`).split(": ").pop()));
    expect([new Set(shapes).size, ...words.map((w) => new Set(w).size)]).toEqual([3, 3, 3]);
  });
});

test.describe("“Why?”: everything the verdict said, unchanged, one tap away", () => {
  for (const lang of LANGS) {
    test(`${lang.toUpperCase()} Moncton: a tap shows the band’s words, the map, how sure, what to do, the air quality and the reasons; a second tap hides them`, async ({ page }) => {
      await replay(page, lang, "Moncton");
      const why = page.locator("main .why-toggle");
      expect(await why.evaluate((el) => [el.tagName, el.getAttribute("aria-controls")])).toEqual(["BUTTON", "why-all"]);
      expect((await why.boundingBox())!.height).toBeGreaterThanOrEqual(56);

      await openWhy(page);
      await expect(why).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByRole("region", { name: s(lang, "card.answer") })).toBeVisible();
      // The band's words, as they were.
      const answer = page.locator("section[aria-labelledby=answer-h]");
      expect(await answer.locator("> *").allTextContents()).toEqual(
        lang === "en"
          ? ["DRIFTING SMOKE", "Likely from the Long Lake fire", "Smoke drifting from Nova Scotia, about 159 km south-southwest of you."]
          : ["FUMÉE QUI DÉRIVE", "Elle vient probablement du feu de Long Lake", "Fumée venue de la Nouvelle-Écosse, à environ 159 km au sud-sud-ouest de chez vous."],
      );
      // Still one title on the screen: the old headline is a heading under it.
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 2, name: s(lang, "verdict.headline.drifting", { fire: lang === "en" ? "the Long Lake fire" : "du feu de Long Lake" }) })).toBeVisible();
      // The cards, in the order they had.
      expect(await page.locator("#why-all > div > section").evaluateAll((all) => all.map((el) => el.getAttribute("aria-labelledby") ?? "why"))).toEqual(["answer-h", "fire-h", "conf-h", "todo-h", "aqhi-h", "why"]);
      await expect(page.locator("#why-all svg[role=img]")).toBeVisible(); // the map
      await expect(page.locator("#why-all polyline.fan")).toHaveCount(24);
      await expect(page.locator("#conf-h")).toHaveText(s(lang, "confidence.low"));
      await expect(page.locator("#todo-h")).toHaveText(s(lang, "todo.title"));
      await expect(page.locator('#why-all a[href="tel:811"]')).toBeVisible();
      await expect(page.locator("#aqhi-h")).toHaveText(s(lang, "aq.title"));
      // "Why we think this" is open: its reasons are read without another tap.
      await expect(page.getByRole("button", { name: s(lang, "why.title") })).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator("#why-body li")).toHaveCount(4);
      expect(await page.locator("body").innerText()).not.toMatch(NO_CALL);

      await why.click();
      await expect(why).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator("#why-all")).toBeHidden();
    });
  }

  test("unclear (Miramichi): the two possibilities are behind it too", async ({ page }) => {
    await replay(page, "en", "Miramichi");
    await expect(page.locator("section[aria-labelledby=poss-h]")).toBeHidden();

    await openWhy(page);
    await expect(page.locator("#poss-h")).toHaveText("Two possibilities");
    expect(await page.locator("#why-all > div > section").evaluateAll((all) => all.map((el) => el.getAttribute("aria-labelledby") ?? "why"))).toEqual(["answer-h", "fire-h", "conf-h", "poss-h", "todo-h", "aqhi-h", "why"]);
  });

  test("a fire close by (Bridgetown): the notice and its link are in front as the screen opens, without a tap, and above the badges", async ({ page }) => {
    await replay(page, "en", "Bridgetown", false);

    const notice = page.locator("main > section").first();
    await expect(notice).toContainText("The fire is close to you. Follow official instructions, and call 911 if you see flames or a smoke column.");
    await expect(notice.getByRole("link", { name: "Told to leave your home? What to do" })).toBeVisible();
    await sheetTo(page, "half");
    await expect(notice.getByRole("link", { name: "Told to leave your home? What to do" })).toBeVisible();
    const [noticeBox, firstBadge] = [await notice.boundingBox(), await badge(page, "fire").boundingBox()];
    expect(noticeBox!.y + noticeBox!.height).toBeLessThanOrEqual(firstBadge!.y);
    expect(plain(await line(page).innerText())).toBe("Drifting smoke · Long Lake fire · 17 km SSE");
  });
});

test.describe("Call 911", () => {
  /** Every Call 911 link on the page, and the area of the largest other thing to tap that is on screen. */
  const tappable = (page: Page) =>
    page.evaluate(() => {
      const area = (el: Element) => { const r = el.getBoundingClientRect(); return r.width * r.height; };
      const onScreen = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight; };
      const all = [...document.querySelectorAll("a, button")].filter(onScreen);
      const calls = all.filter((el) => el.getAttribute("href") === "tel:911");
      return { calls: calls.length, call: Math.round(area(calls[0])), largestOther: Math.round(Math.max(...all.filter((el) => !calls.includes(el)).map(area))) };
    });

  for (const lang of LANGS) {
    test(`${lang.toUpperCase()} nothing explains the smoke (Halifax): Call 911 is the main action, in the bar that stays on the screen`, async ({ page }) => {
      await replay(page, lang, "Halifax");

      const bar = page.locator(".sticky-first");
      await expect(bar).toBeVisible();
      expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
      await expect(bar.locator("p")).toHaveText(s(lang, "sticky.look"));
      await expect(call(page)).toHaveCount(1); // one Call 911 button per view
      await expect(call(page)).toHaveText(s(lang, "sticky.call"));
      expect(await call(page).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(RED);
      const [button, barBox] = [await call(page).boundingBox(), await bar.boundingBox()];
      expect(button!.height).toBeGreaterThanOrEqual(72);
      expect(button!.width).toBeGreaterThanOrEqual(barBox!.width * 0.8);
      // The largest thing to tap on the screen, by far.
      const sizes = await tappable(page);
      expect([sizes.calls, sizes.call > sizes.largestOther]).toEqual([1, true]);
      // The screen's last thing clears the taller bar when scrolled to.
      await page.locator("main .why-toggle").scrollIntoViewIfNeeded();
      const whyBox = await page.locator("main .why-toggle").boundingBox();
      expect(whyBox!.y + whyBox!.height).toBeLessThanOrEqual((await bar.boundingBox())!.y);
      // Never anything against calling: closed, with each badge open, and with "Why?" open.
      expect(await page.locator("body").innerText()).not.toMatch(NO_CALL);
      for (const id of ["fire", "trace", "alert"] as const) {
        await openBadge(page, id);
        expect(await page.locator("body").innerText()).not.toMatch(NO_CALL);
      }
      await openWhy(page);
      expect(await page.locator("body").innerText()).not.toMatch(NO_CALL);
      await expect(call(page)).toHaveCount(1);
    });
  }

  test("no fire in range (live): the same main action", async ({ page }) => {
    await live(page, "en", noFires(), "Halifax");

    await expect(page.locator(".sticky-first p")).toHaveText("Look outside. See flames or a smoke column?");
    await expect(call(page)).toHaveCount(1);
    expect((await call(page).boundingBox())!.height).toBeGreaterThanOrEqual(72);
  });

  test("drifting and unclear keep the slim bar: its line, and one red Call 911 button", async ({ page }) => {
    for (const town of ["Moncton", "Miramichi"]) {
      await replay(page, "en", town);
      await expect(page.locator(".sticky-first")).toHaveCount(0);
      await expect(page.locator(".sticky-title")).toHaveText("See flames or a smoke column?");
      await expect(call(page)).toHaveCount(1);
      expect(await call(page).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(RED);
    }
  });
});

test.describe("on a small phone: with the sheet at half, the badges and “Why?” show above the 911 bar without scrolling", () => {
  type Box = { top: number; bottom: number; left: number; right: number; width: number; height: number };
  type Measures = { scrolled: number; width: number; bar: number; under: number; badges: Box[]; why: Box; line: Box };
  /** Where things are as the screen stands: how far the sheet is scrolled, the 911 bar's top edge, the foot of the
   *  sheet's handle (what the sheet shows starts under it), the three badges, "Why?", and the card's line. */
  const measure = (page: Page): Promise<Measures> =>
    page.evaluate(() => {
      const box = (el: Element) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
      return {
        scrolled: document.querySelector(".answer-sheet")!.scrollTop,
        width: window.innerWidth,
        under: document.querySelector(".sheet-handle")!.getBoundingClientRect().bottom,
        bar: document.querySelector('a[href="tel:911"]')!.parentElement!.getBoundingClientRect().top,
        badges: [...document.querySelectorAll("main .badge")].map(box),
        why: box(document.querySelector("main .why-toggle")!),
        line: box(document.querySelector("#verdict-h")!),
      };
    });
  /** New Brunswick's replay towns: there the burn status is a fourth badge. */
  const NEW_BRUNSWICK = ["Moncton", "Miramichi", "Bathurst", "Edmundston"];
  const badgesIn = (town: string) => (NEW_BRUNSWICK.includes(town) ? 4 : 3);
  /**
   * The badges (`count`: three, or four with the burn status), 56 px or more each way, side by side in one row (four
   * on a phone under 360 px wide: two by two), and "Why?" under them: all whole above the bar.
   */
  function expectAllAboveTheBar(m: Measures, count = 3) {
    expect([m.scrolled, m.badges.length]).toEqual([0, count]); // as the sheet comes up: nothing scrolled
    for (const b of m.badges) {
      expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(56);
      expect([b.left >= 0, b.right <= m.width, b.top >= m.line.bottom]).toEqual([true, true, true]); // on the screen, under the card
      expect(b.bottom).toBeLessThanOrEqual(m.bar + 0.5);
    }
    // One row (or two rows of two), left to right, none over another.
    const rows = count === 4 && m.width < 360 ? 2 : 1;
    expect(new Set(m.badges.map((b) => Math.round(b.top))).size).toBe(rows);
    m.badges.forEach((b, i) => { if (i % (count / rows) > 0) expect(m.badges[i - 1].right).toBeLessThanOrEqual(b.left); });
    expect(m.why.height).toBeGreaterThanOrEqual(56);
    expect([m.why.left >= 0, m.why.right <= m.width, m.why.top >= Math.max(...m.badges.map((b) => b.bottom))]).toEqual([true, true, true]);
    expect(m.why.bottom).toBeLessThanOrEqual(m.bar + 0.5);
  }
  /** What a badge shows: its word (text on the page, drawn or not), how it is drawn, and whether its full name is drawn. */
  const shown = (page: Page, id: string) =>
    badge(page, id).evaluate((el) => {
      const [word, label, st] = [el.querySelector(".badge-short")!, el.querySelector(".badge-label")!, getComputedStyle(el)];
      // The drawn words, line by line, against the pill: 8 px or more inside it on each side, clear of its outline.
      const range = document.createRange();
      range.selectNodeContents(word);
      const [pill, lines] = [el.getBoundingClientRect(), [...range.getClientRects()]];
      return {
        word: word.textContent,
        wordSeen: word.getBoundingClientRect().height > 0,
        wordInside: lines.length > 0 && lines.every((r) => r.left >= pill.left + 8 && r.right <= pill.right - 8 && r.top >= pill.top && r.bottom <= pill.bottom),
        // On a small phone the full name stays on the page for screen readers, drawn 1 px wide: not seen.
        nameSeen: label.getBoundingClientRect().width > 1,
        drawn: `${st.backgroundColor === "rgb(27, 42, 74)" ? "filled" : "white"} ${st.borderTopStyle}`,
        type: parseFloat(getComputedStyle(word).fontSize),
      };
    });
  const word = (lang: Lang, key: string) => s(lang, `badge.short.${key}`);

  // The two sizes asked for. Each verdict the engine returns, and the towns that leave the least room: an unnamed fire
  // (a longer line), and replay towns whose name wraps the replay banner onto two lines.
  const PHONES = [{ width: 375, height: 667 }, { width: 320, height: 568 }];
  const TOWNS = ["Moncton", "Miramichi", "Halifax", "Bathurst", "Edmundston", "Charlottetown"];
  // Sizes in between, for the tightest towns: a 390 px phone in a browser with its bars (664 px, the last height
  // before everything is tightened), a 360 × 640 phone, and a 375 px phone in a browser with its bars (550 px).
  const BETWEEN = [{ width: 390, height: 664 }, { width: 360, height: 640 }, { width: 375, height: 550 }];
  const TIGHTEST = ["Edmundston", "Halifax", "Bathurst", "Charlottetown"];

  for (const viewport of [...PHONES, ...BETWEEN]) {
    test.describe(`${viewport.width} × ${viewport.height}`, () => {
      test.use({ viewport });

      for (const lang of LANGS) {
        for (const town of PHONES.includes(viewport) ? TOWNS : TIGHTEST) {
          test(`${lang.toUpperCase()} ${town} replay: the ${badgesIn(town)} badges and “Why?”, whole above the bar`, async ({ page }) => {
            await replay(page, lang, town);
            await page.evaluate(() => document.fonts.ready);

            expectAllAboveTheBar(await measure(page), badgesIn(town));
          });
        }

        test(`${lang.toUpperCase()} no fire in range (live), where Call 911 is the main action: the same`, async ({ page }) => {
          await live(page, lang, noFires(), "Halifax");
          await page.evaluate(() => document.fonts.ready);

          expectAllAboveTheBar(await measure(page));
          // The bar is still the main action: one red Call 911 as wide as the bar, 56 px tall or more.
          await expect(call(page)).toHaveCount(1);
          const [button, bar] = [await call(page).boundingBox(), await page.locator(".sticky-first").boundingBox()];
          expect([button!.height >= 56, button!.width >= bar!.width * 0.8]).toEqual([true, true]);
          await expect(page.locator(".sticky-first p")).toBeVisible(); // "Look outside…" is still said
        });
      }
    });
  }

  for (const viewport of PHONES) {
    test.describe(`${viewport.width} × ${viewport.height}: what each badge shows`, () => {
      test.use({ viewport });

      for (const lang of LANGS) {
        test(`${lang.toUpperCase()} an icon and one word that says the state; the outline says it too; the full name is what a screen reader says`, async ({ page }) => {
          // Halifax: no detection near the path (outlined, "None"), the trace made (filled, "Wind"), no alert in effect
          // (outlined, "None"): the state by the outline and by the word, never by the fill alone.
          await replay(page, lang, "Halifax");
          expect([await shown(page, "fire"), await shown(page, "trace"), await shown(page, "alert")]).toEqual([
            { word: word(lang, "none"), wordSeen: true, wordInside: true, nameSeen: false, drawn: "white solid", type: 16 },
            { word: word(lang, "trace"), wordSeen: true, wordInside: true, nameSeen: false, drawn: "filled solid", type: 16 },
            { word: word(lang, "none"), wordSeen: true, wordInside: true, nameSeen: false, drawn: "white solid", type: 16 },
          ]);
          for (const id of ["fire", "trace", "alert"]) await expect(badge(page, id).locator("svg").first()).toBeVisible();
          await expect(badge(page, "fire")).toHaveAccessibleName(plain(s(lang, "badge.fire.nonePath")));
          await expect(badge(page, "trace")).toHaveAccessibleName(s(lang, "badge.trace"));
          await expect(badge(page, "alert")).toHaveAccessibleName(plain(s(lang, "badge.alert.none")));

          // Moncton: a satellite saw the fire, and ECCC's alert is active: filled, with the badge's own word.
          await replay(page, lang, "Moncton");
          expect([await shown(page, "fire"), await shown(page, "alert")]).toEqual([
            { word: word(lang, "fire"), wordSeen: true, wordInside: true, nameSeen: false, drawn: "filled solid", type: 16 },
            { word: word(lang, "alert"), wordSeen: true, wordInside: true, nameSeen: false, drawn: "filled solid", type: 16 },
          ]);
        });

        test(`${lang.toUpperCase()} not checked: a dashed outline and the words, and the row and “Why?” still clear the bar`, async ({ page }) => {
          await live(page, lang, liveAnswer("moncton", ECCC.notChecked));
          await page.evaluate(() => document.fonts.ready);

          // Two words: they sit inside the dashed outline (on two lines where one would touch it).
          expect(await shown(page, "alert")).toEqual({ word: word(lang, "notChecked"), wordSeen: true, wordInside: true, nameSeen: false, drawn: "white dashed", type: 16 });
          // Moncton: the burn status is the fourth badge, and here it is not checked either: its words are inside too.
          expect(await shown(page, "burn")).toMatchObject({ wordSeen: true, wordInside: true, nameSeen: false, drawn: "white dashed", type: 16 });
          expectAllAboveTheBar(await measure(page), 4);
        });

        test(`${lang.toUpperCase()} a tap on a badge shows its full name, then its source, its time and its link, where they can be read`, async ({ page }) => {
          await replay(page, lang, "Moncton");

          for (const [id, key] of [["fire", "badge.fire.satellite"], ["trace", "badge.trace"], ["alert", "badge.alert.active"]] as const) {
            const panel = await openBadge(page, id);
            await expect(badge(page, id)).toHaveAttribute("aria-expanded", "true");
            await expect(panel.locator(".badge-name")).toBeVisible();
            await expect(panel.locator(".badge-name")).toHaveText(s(lang, key));
            expect((await panel.locator("p").count()) >= 2).toBe(true);
            await expect(panel.locator("a").first()).toBeVisible();
            expect((await panel.locator("a").first().boundingBox())!.height).toBeGreaterThanOrEqual(56);
            expect(await page.locator(".badge-panel:not([hidden])").count()).toBe(1); // one at a time
            // Under the row, the column's whole width. A panel that fits above the bar is whole above it. One taller
            // than the room there (the smallest phone) starts just under its badge, which stays on the screen.
            await expect
              .poll(async () => {
                const [m, p] = [await measure(page), (await panel.boundingBox())!];
                const tapped = m.badges[["fire", "trace", "alert"].indexOf(id)];
                const fits = p.height + 76 <= m.bar - m.under - 12;
                // Too tall to fit: the sheet has scrolled the row to its top, under the handle, the panel right under it.
                return [p.x >= 0 && p.x + p.width <= m.width && p.width > m.width - 40, tapped.top >= m.under - 0.5, p.y >= tapped.bottom && p.y <= tapped.bottom + 24, fits ? p.y + p.height <= m.bar + 0.5 : m.scrolled > 0 && tapped.top <= m.under + 30];
              })
              .toEqual([true, true, true, true]);
            // Its end comes into reach.
            await panel.locator("a").last().scrollIntoViewIfNeeded();
            const [link, bar] = [(await panel.locator("a").last().boundingBox())!, (await measure(page)).bar];
            expect(link.y + link.height).toBeLessThanOrEqual(bar + 0.5);
            await page.evaluate(() => document.querySelector(".answer-sheet")!.scrollTo(0, 0));
          }
          await badge(page, "alert").click();
          await expect(page.locator("#badge-alert")).toBeHidden();
        });
      }

      // The one case where they do not all fit: the notice is what to do, so it comes first, and it is tall.
      for (const lang of LANGS) {
        test(`${lang.toUpperCase()} a fire close by (Bridgetown): the notice comes first, as the screen opens; one tap up, the row of badges after it, then “Why?”, which needs a scroll`, async ({ page }) => {
          await replay(page, lang, "Bridgetown", false);
          await page.evaluate(() => document.fonts.ready);
          // As the screen opens: the card, then the notice, with nothing scrolled.
          const first = (await page.locator("main > section").first().boundingBox())!;
          const asOpened = await measure(page);
          expect([asOpened.scrolled, first.y >= asOpened.line.bottom]).toEqual([0, true]);
          if (viewport.height >= 667) expect(first.y + first.height).toBeLessThanOrEqual(asOpened.bar + 0.5); // the notice whole
          await sheetTo(page, "half");

          const notice = (await page.locator("main > section").first().boundingBox())!;
          const opened = await measure(page);
          expect([opened.scrolled, notice.y >= opened.line.bottom]).toEqual([0, true]);
          // Still one row of three, after the notice.
          expect([new Set(opened.badges.map((b) => Math.round(b.top))).size, opened.badges.every((b) => b.top >= notice.y + notice.height)]).toEqual([1, true]);
          if (viewport.height >= 667) {
            // 375 × 667, the sheet at half: the notice whole, and the three badges whole under it, above the bar.
            expect(notice.y + notice.height).toBeLessThanOrEqual(opened.bar + 0.5);
            expect(opened.badges.every((b) => b.bottom <= opened.bar + 0.5 && Math.min(b.width, b.height) >= 56)).toBe(true);
          } else {
            // The smallest phone: the notice's first lines; the rest is a scroll away.
            expect(notice.y + 80).toBeLessThanOrEqual(opened.bar);
          }
          const link = page.locator("main > section").first().locator("a");
          await link.scrollIntoViewIfNeeded();
          expect((await link.boundingBox())!.y + (await link.boundingBox())!.height).toBeLessThanOrEqual((await measure(page)).bar + 0.5);
          await page.locator("main .why-toggle").scrollIntoViewIfNeeded();
          const scrolledTo = await measure(page);
          expect([scrolledTo.badges.every((b) => b.bottom <= scrolledTo.bar + 0.5), scrolledTo.why.bottom <= scrolledTo.bar + 0.5]).toEqual([true, true]);
        });
      }
    });
  }

  test.describe("the layout is chosen as the screen opens, and kept while it is read", () => {
    const tops = (page: Page) => badges(page).evaluateAll((all) => [...new Set(all.map((b) => Math.round(b.getBoundingClientRect().top)))].length);

    test("a browser’s bars slide away and the screen grows taller: the row of badges stays a row, the card its size", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 740 }); // a 390 px phone in a browser, its bars showing
      await replay(page, "en", "Moncton");
      expect(await tops(page)).toBe(1);

      await openWhy(page);
      // (The card is smaller at the sheet's half height: its size is read with "Why?" open, as it stays.)
      const before = await line(page).evaluate((el) => getComputedStyle(el).fontSize);
      // Taller than any phone: a layout that followed the height would put the badges back in a column, with a larger line.
      await page.setViewportSize({ width: 390, height: 1040 });
      await expect.poll(() => page.evaluate(() => window.innerHeight)).toBe(1040);
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

      expect([await tops(page), await line(page).evaluate((el) => getComputedStyle(el).fontSize)]).toEqual([1, before]);
      await expect(badge(page, "alert").locator(".badge-short")).toBeVisible();
    });

    test("the screen is turned (a new width): the layout is chosen again", async ({ page }) => {
      await page.setViewportSize({ width: 480, height: 1024 }); // a tall screen: one badge under the other
      await replay(page, "en", "Moncton");
      expect(await tops(page)).toBe(4); // the verdict's three, and New Brunswick's burn status

      await page.setViewportSize({ width: 1024, height: 480 });
      await expect.poll(() => tops(page)).toBe(1);
    });
  });

  test("on a phone (390 × 844) the badges share one row too: a column of three would leave none of the map showing above the sheet", async ({ page }) => {
    await replay(page, "en", "Moncton");

    const m = await measure(page);
    expect(new Set(m.badges.map((b) => Math.round(b.top))).size).toBe(1);
    const map = (await page.locator(".map-stage").boundingBox())!;
    const top = (await page.locator(".answer-sheet").boundingBox())!.y;
    // The sheet at half also holds, under "Why?", what a person can do next. A strip of the map still shows above it
    // where the phone has room for one (84 px, its Legend button's); else the sheet stands over the whole map.
    const overMap = (await page.locator(".answer-sheet").getAttribute("data-whole")) !== null;
    expect(top - map.y >= 84 || overMap, `${Math.round(top - map.y)} px of map above the sheet at half`).toBe(true);
  });

  test("on a tall screen (480 × 1024) each badge carries its full name, one under the other", async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 1024 });
    await replay(page, "en", "Moncton");

    const m = await measure(page);
    expect(new Set(m.badges.map((b) => Math.round(b.left))).size).toBe(1); // one column
    expect(m.badges[0].bottom <= m.badges[1].top && m.badges[1].bottom <= m.badges[2].top).toBe(true);
    for (const id of ["fire", "trace", "alert"]) expect(await shown(page, id)).toMatchObject({ wordSeen: false, nameSeen: true });
    expect(m.why.bottom).toBeLessThanOrEqual(m.bar);
    // The panel a tap opens does not repeat the name the badge already shows.
    const panel = await openBadge(page, "alert");
    await expect(panel.locator(".badge-name")).toBeHidden();
  });
});
