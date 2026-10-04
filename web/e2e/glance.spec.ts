// The verdict as one glance: a large icon in its own shape and colour, one line, the source badges under it, and
// "Why?" in front of everything the screen said before. In the replay (Aug 25, 2025) and live, in English and French.
import { expect, test, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { TEST_ENGINE_URL } from "./engine";
import { openBadge, openWhy } from "./verdict";

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
    await page.getByRole("button", { name: "Français" }).click();
    await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"lang":"fr"'));
  }
}
async function search(page: Page, town: string) {
  await page.goto("/location");
  await page.locator("input[type=search]").fill(town);
  await page.getByRole("option", { name: new RegExp(`^${town},`) }).first().click();
  await expect(page.locator("#verdict-h")).toBeVisible({ timeout: 15_000 });
}
/** The replay town's verdict: its card in front. */
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
      test(`${lang.toUpperCase()} ${state.state} (${state.town} replay): as the screen opens, the icon in its shape and colour, the line as the title, the badges, and "Why?" closed`, async ({ page }) => {
        await replay(page, lang, state.town);

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
        await expect(badges(page)).toHaveCount(3);
        expect(await badges(page).evaluateAll((all) => all.map((b) => b.getAttribute("data-badge")))).toEqual(["fire", "trace", "alert"]);
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
    await expect(badge(page, "fire")).toHaveText("Official active fire list");
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

      await expect(badge(page, "alert")).toHaveText(s(lang, "badge.alert.active"));
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
      await expect(badge(page, "alert")).toHaveText(s(lang, "badge.alert.active"));
      expect(s(lang, "badge.alert.active")).toMatch(lang === "en" ? /: active$/ : /: en vigueur$/);
    });

    test(`${lang.toUpperCase()} none in effect: an outlined pill, and the words (Halifax replay)`, async ({ page }) => {
      await replay(page, lang, "Halifax");

      expect(await drawn(page, "alert")).toEqual(OUTLINE);
      await expect(badge(page, "alert")).toHaveText(s(lang, "badge.alert.none"));
      expect(s(lang, "badge.alert.none")).toMatch(lang === "en" ? /: none in effect$/ : /: aucune en vigueur$/);
      // Nothing explains the smoke: the fire detections are "none" too, outlined the same way.
      expect(await drawn(page, "fire")).toEqual(OUTLINE);
      await expect(badge(page, "fire")).toHaveText(s(lang, "badge.fire.nonePath"));
    });

    test(`${lang.toUpperCase()} not checked: a dashed outline, and the words (live, ECCC could not be asked)`, async ({ page }) => {
      await live(page, lang, liveAnswer("moncton", ECCC.notChecked));

      expect(await drawn(page, "alert")).toEqual(DASHED);
      await expect(badge(page, "alert")).toHaveText(s(lang, "badge.alert.notChecked"));
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
    await expect(badge(page, "alert")).toHaveText("ECCC air quality alert: not checked");
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

  test("a fire close by (Bridgetown): the notice and its link stay in front, above the badges, without a tap", async ({ page }) => {
    await replay(page, "en", "Bridgetown");

    const notice = page.locator("main > section").first();
    await expect(notice).toContainText("The fire is close to you. Follow official instructions, and call 911 if you see flames or a smoke column.");
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
