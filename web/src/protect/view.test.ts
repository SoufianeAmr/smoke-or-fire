// "Protect your home": every sentence of advice is found word for word in its saved source page; the screen's own
// words follow the app's wording rules; the view is built from the engine's answer (data/demo/).
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import bridgetown from "../../../data/demo/bridgetown.json";
import halifax from "../../../data/demo/halifax.json";
import moncton from "../../../data/demo/moncton.json";
import en from "../i18n/en.json";
import fr from "../i18n/fr.json";
import type { AqhiCategory, VerdictJson } from "../verdict/types";
import content from "./content.json";
import { TILES, protectView, toneOf } from "./view";
import sources from "./sources.json";

type Lang = "en" | "fr";
const LANGS = ["en", "fr"] as const;
const BANDS = ["low", "moderate", "high", "very_high"] as const;
const NBSP = String.fromCharCode(0xa0);
const NNBSP = String.fromCharCode(0x202f);
const NBH = String.fromCharCode(0x2011); // no-break hyphen: a date stays whole on one line
const json = (data: unknown) => data as VerdictJson;
/** The engine's answer for Moncton with another AQHI band, or with no reading. */
const withBand = (category: AqhiCategory | null) => {
  const display = { low: "2", moderate: "5", high: "8", very_high: "10+" };
  return json({ ...moncton, aqhi: category && { ...moncton.aqhi, category, display: display[category], value: category === "very_high" ? 11 : Number(display[category]) } });
};

// --- The saved source pages --------------------------------------------------------------------------------------
type SourceId = keyof typeof sources;
const IDS = Object.keys(sources) as SourceId[];
const file = (id: string, lang: Lang) => readFileSync(new URL(`./sources/${id}.${lang}.txt`, import.meta.url), "utf8").split(/\r?\n/);
/** A saved page: its header ("Key: value" lines) and, after the "---" line, the page's text, one block per line. */
const pages = new Map<string, { header: Record<string, string>; text: string[] }>();
function saved(id: string, lang: Lang) {
  const key = `${id}.${lang}`;
  if (!pages.has(key)) pages.set(key, parse(file(id, lang)));
  return pages.get(key)!;
}
function parse(lines: string[]) {
  const rule = lines.indexOf("---");
  const header = Object.fromEntries(lines.slice(0, rule).filter((line) => /^[A-Z][\w ]*: /.test(line)).map((line) => [line.slice(0, line.indexOf(": ")), line.slice(line.indexOf(": ") + 2)]));
  return { header, text: lines.slice(rule + 1).filter((line) => line !== "") };
}
/**
 * The app's typography, and nothing else: a curly apostrophe for a straight one, a no-break space for a space.
 * Letters, case, words, punctuation and their order are compared as they are.
 */
const typography = (text: string) => text.replaceAll("’", "'").replaceAll(NBSP, " ").replaceAll(NNBSP, " ");
/** Word for word in the saved page: on one of its lines (one paragraph, list item or table cell), never across two. */
const quoted = (id: string, lang: Lang, sentence: string) => saved(id, lang).text.some((line) => typography(line).includes(typography(sentence)));

/** Every sentence of advice the screen can show or say: [what, source, language, sentence]. */
function advice(): [string, string, Lang, string][] {
  const all: [string, string, Lang, string][] = [];
  for (const lang of LANGS) {
    for (const tile of TILES) {
      if (tile.note) all.push([`tile ${tile.id}, the line under its label`, tile.quotes[0].source, lang, tile.note[lang]]);
      for (const [i, quote] of tile.quotes.entries()) {
        all.push([`tile ${tile.id}, quote ${i + 1}`, quote.source, lang, quote[lang]]);
        for (const [j, item] of (quote.items ?? []).entries()) all.push([`tile ${tile.id}, quote ${i + 1}, item ${j + 1}`, quote.source, lang, item[lang]]);
      }
    }
    for (const band of BANDS) all.push([`at-risk message, ${band}`, content.atRisk.source, lang, content.atRisk.messages[band][lang]]);
    all.push(["at-risk, doctor’s advice", content.atRisk.source, lang, content.atRisk.doctor[lang]]);
  }
  return all;
}

describe("the saved sources", () => {
  test("each has its page in English and French, with its address, its date modified and the day it was retrieved", () => {
    expect(IDS.length).toBeGreaterThan(0);
    for (const id of IDS) {
      for (const lang of LANGS) {
        const { header, text } = saved(id, lang);
        const source = sources[id];
        expect(header, `${id}.${lang}`).toMatchObject({
          Source: source.publisher[lang],
          Title: source.title[lang],
          URL: source.url[lang],
          "Date modified": source.modified[lang],
          Retrieved: source.retrieved[lang],
        });
        expect(source.url[lang], `${id}.${lang}`).toMatch(/^https:\/\/(www\.)?(weather\.gc\.ca|meteo\.gc\.ca|canada\.ca)\//);
        expect([source.modified[lang], source.retrieved[lang]].every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)), `${id}.${lang} dates`).toBe(true);
        expect(source.retrieved[lang] >= source.modified[lang], `${id}.${lang}: retrieved after it was modified`).toBe(true);
        // The page's own text: its title first, and its date modified among its last lines, as the page shows it.
        expect(text[0], `${id}.${lang}`).toBe(source.title[lang]);
        expect(text.slice(-3), `${id}.${lang}`).toContain(source.modified[lang]);
        expect(text.length, `${id}.${lang}`).toBeGreaterThan(20);
      }
    }
  });

  test("the folder holds those pages and nothing else; every one is quoted, and every quote names one", () => {
    const files = readdirSync(new URL("./sources/", import.meta.url)).sort();
    expect(files).toEqual(IDS.flatMap((id) => LANGS.map((lang) => `${id}.${lang}.txt`)).sort());
    const named = new Set(advice().map(([, source]) => source));
    expect([...named].sort()).toEqual([...IDS].sort());
  });

  test("health messages are ECCC’s; home advice is Health Canada’s", () => {
    expect(sources[content.atRisk.source as SourceId].publisher).toEqual({ en: "Environment and Climate Change Canada", fr: "Environnement et Changement climatique Canada" });
    for (const tile of TILES) {
      for (const quote of tile.quotes) expect(sources[quote.source as SourceId].publisher, tile.id).toEqual({ en: "Health Canada", fr: "Santé Canada" });
    }
  });
});

describe("never invented: every sentence of advice is in its source, word for word", () => {
  test("the check itself: it finds a sentence, and fails on one changed word, one changed letter’s case, or a sentence made of two lines", () => {
    const id = "eccc-aqhi-messages";
    expect(quoted(id, "en", "Enjoy your usual outdoor activities.")).toBe(true);
    expect(quoted(id, "en", "Enjoy your normal outdoor activities.")).toBe(false);
    expect(quoted(id, "en", "enjoy your usual outdoor activities.")).toBe(false);
    expect(quoted(id, "en", "Enjoy your usual outdoor activities")).toBe(true); // a run of its words
    expect(quoted(id, "en", "Enjoy your usual outdoor activities. Ideal air quality for outdoor activities.")).toBe(false); // two table cells
    // The apostrophe's shape is the one thing that may differ.
    expect(quoted(id, "en", "Follow your doctor’s usual advice about exercising and managing your condition.")).toBe(true);
    expect(quoted(id, "en", "Follow your doctors usual advice about exercising and managing your condition.")).toBe(false);
  });

  for (const [what, source, lang, sentence] of advice()) {
    test(`${lang.toUpperCase()} ${what}: “${sentence.slice(0, 50)}…” is in ${source}.${lang}.txt`, () => {
      expect(sentence.trim()).not.toBe("");
      expect(quoted(source, lang, sentence), `not found word for word in ${source}.${lang}.txt: ${sentence}`).toBe(true);
    });
  }

  test("each band’s message is the one in its row of ECCC’s table, in the at-risk column", () => {
    const ROW = { en: { low: "Low Risk", moderate: "Moderate Risk", high: "High Risk", very_high: "Very High Risk" }, fr: { low: "Risque faible", moderate: "Risque modéré", high: "Risque élevé", very_high: "Risque très élevé" } };
    const COLUMNS = { en: ["At Risk Population*", "General Population"], fr: ["Message destiné à la population touchée*", "Message destiné à la population en général"] };
    for (const lang of LANGS) {
      const { text } = saved(content.atRisk.source, lang);
      // The at-risk column comes first: each row is its name, its index values, the at-risk message, the general one.
      const first = text.indexOf(COLUMNS[lang][0]);
      expect([first >= 0, text[first + 1]], lang).toEqual([true, COLUMNS[lang][1]]);
      for (const band of BANDS) {
        const row = text.indexOf(ROW[lang][band]);
        expect(row, `${lang} ${band}`).toBeGreaterThan(first);
        expect(typography(text[row + 2]), `${lang} ${band}`).toBe(typography(content.atRisk.messages[band][lang]));
      }
    }
  });

  test("a tile’s label is the opening of its first sentence, word for word, capital included, cut where a word ends", () => {
    for (const lang of LANGS) {
      for (const tile of TILES) {
        const [label, sentence] = [typography(tile.label[lang]), typography(tile.quotes[0][lang])];
        expect(sentence.startsWith(label), `${lang} ${tile.id}: “${label}” opens “${sentence}”`).toBe(true);
        expect(sentence.charAt(label.length), `${lang} ${tile.id}: cut at the end of a word`).toMatch(/^[\s.,]$/);
        expect(label.split(" ").length, `${lang} ${tile.id}: one line of advice, not a paragraph`).toBeLessThanOrEqual(16);
      }
    }
  });

  test("a label keeps the words that limit its advice: as much as possible, exhaust fans, what the system can handle", () => {
    const label = (id: string, lang: Lang) => TILES.find((tile) => tile.id === id)!.label[lang];
    expect(label("windows", "en")).toMatch(/as much as possible$/);
    expect(label("windows", "fr")).toMatch(/autant que possible$/);
    expect(label("fans", "en")).toMatch(/exhaust fans, such as bathroom fans$/);
    expect(label("fans", "fr")).toMatch(/ventilateurs d’extraction, comme les ventilateurs de salle de bain$/);
    expect(label("filter", "en")).toMatch(/that your ventilation system can handle$/);
    expect(label("filter", "fr")).toMatch(/pour votre système de ventilation$/);
  });

  test("the windows tile shows Health Canada’s line on heat under its label: a whole sentence of the same passage", () => {
    // "Keep windows and doors closed" is never read without "prioritize keeping cool": the page gives them together.
    for (const lang of LANGS) {
      const windows = TILES.find((tile) => tile.id === "windows")!;
      expect(windows.quotes[0][lang].split(/(?<=[.?!])\s+(?=\S)/), lang).toContain(windows.note![lang]);
      expect(windows.note![lang], lang).toMatch(lang === "en" ? /extreme heat.*keeping cool\.$/ : /chaleur extrême.*au frais\.$/);
    }
    expect(TILES.filter((tile) => tile.note).map((tile) => tile.id)).toEqual(["windows"]);
  });
});

// --- The screen's own words ----------------------------------------------------------------------------------------
/** Every string of the feature: the screen's own words, the labels and the quoted advice. */
function strings(lang: Lang): [string, string][] {
  return [
    ...Object.entries(content.strings).map(([key, text]): [string, string] => [key, text[lang]]),
    ...TILES.map((tile): [string, string] => [`label ${tile.id}`, tile.label[lang]]),
    ...advice().filter(([, , l]) => l === lang).map(([what, , , sentence]): [string, string] => [what, sentence]),
  ];
}

describe("the wording rules of the app’s strings hold here too", () => {
  test("English and French as equals: every string has both, and neither is empty", () => {
    const missing = Object.entries(content.strings).filter(([, text]) => !(text.en?.trim() && text.fr?.trim())).map(([key]) => key);
    expect(missing).toEqual([]);
    expect(Object.keys(content.strings).length).toBeGreaterThan(10);
    for (const tile of TILES) expect([tile.label.en.trim() !== "", tile.label.fr.trim() !== ""], tile.id).toEqual([true, true]);
  });

  test("French has a no-break space before ? ! : ;", () => {
    const noSpace = new RegExp(`[^${NBSP}${NNBSP}][?!:;]`);
    expect(strings("fr").filter(([, text]) => noSpace.test(text.replace(/\{\w+\}/g, ""))).map(([key]) => key)).toEqual([]);
  });

  test("apostrophes are curly, there is no emoji, and no sentence ends with two punctuation marks", () => {
    for (const lang of LANGS) {
      expect(strings(lang).filter(([, text]) => text.includes("'")).map(([key]) => key), lang).toEqual([]);
      expect(strings(lang).filter(([, text]) => /\p{Extended_Pictographic}/u.test(text)).map(([key]) => key), lang).toEqual([]);
      expect(strings(lang).filter(([, text]) => /[.?!:][.?!:]/.test(text.replace(/\s/g, ""))).map(([key]) => key), lang).toEqual([]);
    }
  });

  test("never the word safe, and nothing against calling 911 (the design lock’s hard rules)", () => {
    const banned = /safe|sécuri|(do not|don’t|never|no need to) call|ne (pas|jamais) appeler|n’appelez (pas|jamais)|9-1-1 for updates/i;
    for (const lang of LANGS) expect(strings(lang).filter(([, text]) => banned.test(text)).map(([key]) => key), lang).toEqual([]);
  });

  test("plain words: no jargon in what shows as the screen opens", () => {
    // PM2.5, HEPA, CADR, MERV and HVAC are in the sources; none is in a label or in the screen's own words.
    const jargon = /PM\s?2[.,]5|HEPA|CADR|MERV|HVAC|CVC|particul/i;
    for (const lang of LANGS) {
      const firstView = [...Object.entries(content.strings).filter(([key]) => !key.startsWith("voice.")).map(([key, text]): [string, string] => [key, text[lang]]), ...TILES.map((tile): [string, string] => [`label ${tile.id}`, tile.label[lang]])];
      expect(firstView.filter(([, text]) => jargon.test(text)).map(([key]) => key), lang).toEqual([]);
    }
  });

  test("the screen’s own words give no advice: they are never an instruction about health or the home", () => {
    // What tells a person what to do is quoted, never written here. The screen's own words name things, say what a
    // control does, and say where the advice comes from.
    // A letter before or after makes it another word; \b would not do, as it does not take é for a letter.
    const instruction = /(?<!\p{L})(keep|close|open|use|avoid|reduce|limit|stay|wear|take|run|go) (your|the|a|windows|doors|indoors|outdoors)(?!\p{L})|(?<!\p{L})(gardez|fermez|ouvrez|utilisez|évitez|réduisez|limitez|restez|portez|prenez)(?!\p{L})/iu;
    expect(["Évitez les activités.", "Keep the windows closed."].every((text) => instruction.test(text))).toBe(true); // the check itself
    for (const lang of LANGS) {
      const own = Object.entries(content.strings).map(([key, text]): [string, string] => [key, text[lang]]);
      expect(own.filter(([, text]) => instruction.test(text)).map(([key]) => key), lang).toEqual([]);
    }
  });
});

// --- The view ------------------------------------------------------------------------------------------------------
describe("the view, from the engine’s answer", () => {
  test("Moncton replay (AQHI 10+): the band in words, who measured it and when, and a link", () => {
    const view = protectView(json(moncton), "en");
    expect([view.title, view.band.category, view.band.tone, view.band.label]).toEqual(["Protect your home from smoke", "very_high", "raised", "Air quality: very high risk"]);
    expect(view.band.lines).toEqual(["Air Quality Health Index: 10+, at Moncton. Measured: 2025-08-25, 08:00 (Atlantic time).", "Source: Environment and Climate Change Canada"]);
    expect(view.band.link).toEqual({ label: "Check official air quality", host: "weather.gc.ca", url: "https://weather.gc.ca/airquality/pages/index_e.html" });
    expect([view.band.note, view.notice]).toEqual([null, null]);
  });

  test("in French, as an equal", () => {
    const view = protectView(json(moncton), "fr");
    expect([view.title, view.band.label]).toEqual(["Protégez votre maison de la fumée", `Qualité de l’air${NBSP}: risque très élevé`]);
    expect(view.band.lines[0]).toBe(`Cote air santé${NBSP}: 10+, à Moncton. Heure de la mesure${NBSP}: 2025-08-25, 8 h 00 (heure de l’Atlantique).`);
    expect(view.band.link.url).toBe("https://meteo.gc.ca/airquality/pages/index_f.html");
    expect(view.tiles.map((tile) => tile.label)).toEqual([
      "À l’intérieur, gardez les fenêtres et les portes fermées autant que possible",
      "Limitez l’utilisation des ventilateurs d’extraction, comme les ventilateurs de salle de bain",
      "Utilisez un purificateur d’air portatif certifié",
      "Utilisez un filtre à air de la meilleure qualité possible pour votre système de ventilation",
    ]);
  });

  test("the title says what the home is protected from: smoke, never the fire", () => {
    expect(LANGS.map((lang) => protectView(json(moncton), lang).title)).toEqual(["Protect your home from smoke", "Protégez votre maison de la fumée"]);
  });

  test("four tiles, in the order a person can do them: no cost and at once first", () => {
    const view = protectView(json(moncton), "en");
    expect(view.tiles.map((tile) => [tile.id, tile.icon, tile.label])).toEqual([
      ["windows", "window", "Keep windows and doors closed as much as possible"],
      ["fans", "fan", "Limit the use of exhaust fans, such as bathroom fans"],
      ["cleaner", "cleaner", "Use a certified portable air cleaner"],
      ["filter", "filter", "Use the highest quality air filter that your ventilation system can handle"],
    ]);
    expect(view.tiles.length).toBeGreaterThanOrEqual(3);
    expect(view.tiles.length).toBeLessThanOrEqual(4);
    expect(view.tiles.map((tile) => tile.note)).toEqual(["When there’s an extreme heat event occurring with a wildfire smoke event, prioritize keeping cool.", null, null, null]);
  });

  test("each tile’s details: Health Canada’s sentences, and for each who wrote it, the page, its date modified and its link", () => {
    const [windows, , cleaner] = protectView(json(moncton), "en").tiles;
    expect(windows.quotes).toEqual([
      {
        text: "Keep windows and doors closed as much as possible. When there’s an extreme heat event occurring with a wildfire smoke event, prioritize keeping cool.",
        items: [],
        source: {
          id: "hc-smoke-heat",
          by: "Source: Health Canada",
          title: "Wildfire smoke with extreme heat",
          dated: `Date modified: ${sources["hc-smoke-heat"].modified.en.replaceAll("-", NBH)}`,
          host: "canada.ca",
          url: "https://www.canada.ca/en/health-canada/services/publications/healthy-living/combine-wildfire-smoke-heat.html",
        },
      },
    ]);
    // The air cleaner: use one, then how to get the most out of it, from the fact sheet about them: its three items.
    expect(cleaner.quotes.map((quote) => [quote.source.id, quote.text, quote.items])).toEqual([
      ["hc-smoke-heat", "Use a certified portable air cleaner that can filter fine particles.", []],
      [
        "hc-air-cleaner",
        "To get the most out of your portable air cleaner:",
        ["keep your doors and windows closed", "operate your portable air cleaner in a room where you spend a lot of time", "follow manufacturer instructions for proper placement and use of your portable air cleaner."],
      ],
    ]);
    const french = protectView(json(moncton), "fr").tiles[0].quotes[0].source;
    expect([french.by, french.dated, french.url]).toEqual([`Source${NBSP}: Santé Canada`, `Date de modification${NBSP}: ${sources["hc-smoke-heat"].modified.fr.replaceAll("-", NBH)}`, sources["hc-smoke-heat"].url.fr]);
  });

  test("quiet at low risk, clear from moderate up; the band is always a word too", () => {
    expect(BANDS.map((band) => toneOf(withBand(band)))).toEqual(["calm", "raised", "raised", "raised"]);
    expect(BANDS.map((band) => protectView(withBand(band), "en").band.label)).toEqual(["Air quality: low risk", "Air quality: moderate risk", "Air quality: high risk", "Air quality: very high risk"]);
    expect(BANDS.map((band) => protectView(withBand(band), "fr").band.label)).toEqual(["faible", "modéré", "élevé", "très élevé"].map((word) => `Qualité de l’air${NBSP}: risque ${word}`));
  });

  test("no reading in the last 2 hours: said so, never a guess; no message is picked", () => {
    for (const lang of LANGS) {
      const view = protectView(withBand(null), lang);
      expect(view.band.category, lang).toBeNull();
      expect(view.band.label, lang).toBe(lang === "en" ? "Air quality: no recent reading" : `Qualité de l’air${NBSP}: aucune mesure récente`);
      expect(view.band.lines, lang).toEqual([(lang === "en" ? en : fr)["todo.noReading"]]);
      expect([view.atRisk.message, view.atRisk.kicker, view.atRisk.band, view.atRisk.note], lang).toEqual([null, null, null, null]);
      expect(view.atRisk.noReading, lang).not.toBeNull();
      expect(view.tiles.length, lang).toBe(4); // the home advice does not depend on the reading
    }
  });

  test("no reading is not low risk: clear when the air likely or possibly carries a fire’s smoke, quiet when nothing explains it", () => {
    // As the verdict's own advice goes (its break from the smoke is offered on the same rule).
    expect([moncton.verdict, toneOf(withBand(null))]).toEqual(["drifting", "raised"]);
    expect([halifax.verdict, toneOf(json({ ...halifax, aqhi: null }))]).toEqual(["unexplained", "calm"]);
    expect(toneOf(json(halifax))).toBe("calm");
  });

  test("the at-risk message is the band’s, under the band and whose message it is, with the doctor’s-advice line and ECCC’s page", () => {
    const expected = {
      low: "Enjoy your usual outdoor activities.",
      moderate: "Consider reducing or rescheduling strenuous activities outdoors if you are experiencing symptoms.",
      high: "Reduce or reschedule strenuous activities outdoors. Children and the elderly should also take it easy.",
      very_high: "Avoid strenuous activities outdoors. Children and the elderly should also avoid outdoor physical exertion.",
    };
    for (const band of BANDS) {
      const { atRisk } = protectView(withBand(band), "en");
      expect([atRisk.message, atRisk.noReading], band).toEqual([expected[band], null]);
      // The band on one line, whose message on the next: "risk" is never read twice in one sentence.
      expect([atRisk.band, atRisk.kicker], band).toEqual([`Air quality: ${en[`aq.risk.${band}`].toLowerCase()}`, "Official message for people at risk:"]);
      expect(atRisk.doctor, band).toBe("People with heart or breathing problems are at greater risk. Follow your doctor’s usual advice about exercising and managing your condition.");
      expect([atRisk.source.id, atRisk.source.by, atRisk.source.title, atRisk.source.url], band).toEqual(["eccc-aqhi-messages", "Source: Environment and Climate Change Canada", "Air Quality Health Index Messages", sources["eccc-aqhi-messages"].url.en]);
    }
    const french = protectView(withBand("high"), "fr").atRisk;
    expect([french.band, french.kicker]).toEqual([`Qualité de l’air${NBSP}: risque élevé`, `Message officiel pour les personnes à risque${NBSP}:`]);
  });

  test("low risk is never an all-clear: beside “Enjoy your usual outdoor activities”, the reading is said to be area-wide, on every verdict", () => {
    const NOTE = { lead: "This is an area-wide reading.", text: "Smoke from a nearby source can be much stronger where you are." };
    // Drifting smoke at low risk (Moncton's verdict with a low reading), and smoke nothing explains (Halifax).
    expect(protectView(withBand("low"), "en").atRisk.note).toEqual(NOTE);
    expect(protectView(json(halifax), "en").atRisk.note).toEqual(NOTE);
    expect(BANDS.filter((band) => protectView(withBand(band), "en").atRisk.note !== null)).toEqual(["low"]);
    expect(protectView(withBand("low"), "fr").atRisk.note).toEqual({ lead: fr["aq.areaWide.lead"], text: fr["aq.areaWide.text"] });
  });

  test("nothing explains the smoke (Halifax): the reading is area-wide, and the screen says so at the top too", () => {
    const view = protectView(json(halifax), "en");
    expect([view.band.category, view.band.tone]).toEqual(["low", "calm"]);
    expect(view.band.note).toEqual({ lead: "This is an area-wide reading.", text: "Smoke from a nearby source can be much stronger where you are." });
  });

  test("a fire close by (Bridgetown, 17 km): the verdict’s notice and its link come with the advice, in both languages", () => {
    expect(protectView(json(bridgetown), "en").notice).toEqual({
      text: "The fire is close to you. Follow official instructions, and call 911 if you see flames or a smoke column.",
      link: "Told to leave your home? What to do",
    });
    expect(protectView(json(bridgetown), "fr").notice).toEqual({ text: fr["verdict.notice"], link: fr["leave.entry"] });
    expect(protectView(json(moncton), "en").notice).toBeNull(); // 159 km away
  });

  test("the words about the device: saved, not saved, forgotten, and not forgotten when the device will not remove it", () => {
    const { atRisk } = protectView(json(moncton), "en");
    expect([atRisk.saved, atRisk.notSaved, atRisk.forget, atRisk.forgotten, atRisk.notForgotten]).toEqual([
      "Your answer is saved on this device only.",
      "This device could not save it. It will be forgotten when you leave this screen.",
      "Forget my answer",
      "Forgotten. Your answer is no longer on this device.",
      "This device did not let us remove it. To remove it, clear this site’s data in your browser.",
    ]);
  });
});

// --- Listen --------------------------------------------------------------------------------------------------------
describe("Listen reads the tiles, and the at-risk line when the switch is on", () => {
  const APP = { en, fr };
  const sentences = (text: string) => text.split(/(?<=[.?!])\s+(?=\S)/);
  const s = (lang: Lang, key: keyof typeof content.strings) => sentences(content.strings[key][lang]);
  /** The app's own spoken words this screen borrows: the fire-close notice, the area-wide note and the 911 line. */
  const BORROWED = ["voice.verdict.notice", "aq.areaWide.lead", "aq.areaWide.text", "voice.verdict.call"] as const;
  /** The screen's own spoken words, as sentences with their {…} values as wildcards. */
  const own = (lang: Lang) =>
    [...Object.entries(content.strings).filter(([key]) => key.startsWith("voice.")).map(([, text]) => text[lang]), ...BORROWED.map((key) => APP[lang][key])]
      .flatMap(sentences)
      .map((sentence) => new RegExp(`^${sentence.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{\w+\}/g, ".+")}$`));
  const isOwn = (lang: Lang, sentence: string) => own(lang).some((pattern) => pattern.test(sentence));
  const isQuoted = (lang: Lang, sentence: string) => IDS.some((id) => quoted(id, lang, sentence));
  /** Every sentence of every tile, in the tiles' order: each quote's sentences, then its list items. */
  const tileSentences = (lang: Lang) => TILES.flatMap((tile) => tile.quotes.flatMap((quote) => [...sentences(quote[lang]), ...(quote.items ?? []).map((item) => item[lang])]));
  const lower = (text: string, lang: Lang) => text.charAt(0).toLocaleLowerCase(lang) + text.slice(1);
  const bandSaid = (lang: Lang, band: (typeof BANDS)[number]) => content.strings["voice.band"][lang].replace("{risk}", lower(APP[lang][`aq.risk.${band}`], lang));

  for (const lang of LANGS) {
    test(`${lang.toUpperCase()} switch off: the title, ECCC’s band, then Health Canada named and every tile’s sentences in order, that there is a switch, then 911`, () => {
      const view = protectView(json(moncton), lang);
      expect(view.voice.off).toEqual([
        `${view.title}.`,
        bandSaid(lang, "very_high"),
        ...s(lang, "voice.intro"),
        ...tileSentences(lang),
        ...s(lang, "voice.tap"),
        ...s(lang, "voice.atRisk.off"),
        APP[lang]["voice.verdict.call"],
      ]);
      // The band is ECCC's: it is said before Health Canada is named, never under its name.
      expect(view.voice.off.indexOf(bandSaid(lang, "very_high"))).toBeLessThan(view.voice.off.indexOf(s(lang, "voice.intro")[0]));
      // No at-risk message while the switch is off, and nothing about the switch's state: these words are also what a
      // voice service hears when the device has no voice of its own, whatever the switch says.
      for (const band of BANDS) expect(view.voice.off.join(" ")).not.toContain(sentences(content.atRisk.messages[band][lang])[0]);
      expect(view.voice.off).not.toContain(s(lang, "voice.atRisk.on")[0]);
      expect(view.voice.off.join(" ")).not.toContain(content.atRisk.doctor[lang]);
    });

    test(`${lang.toUpperCase()} switch on: the same, then ECCC named, the band’s at-risk message and the doctor’s-advice line`, () => {
      for (const band of BANDS) {
        const view = protectView(withBand(band), lang);
        const [off, on] = [view.voice.off, view.voice.on];
        const start = off.indexOf(s(lang, "voice.atRisk.off")[0]);
        expect(on.slice(0, start), band).toEqual(off.slice(0, start));
        expect(on.slice(start), band).toEqual([
          ...s(lang, "voice.atRisk.on"),
          ...sentences(content.atRisk.messages[band][lang]),
          // At low risk, beside "Enjoy your usual outdoor activities": the reading is area-wide.
          ...(band === "low" ? [APP[lang]["aq.areaWide.lead"], APP[lang]["aq.areaWide.text"]] : []),
          ...sentences(content.atRisk.doctor[lang]),
          APP[lang]["voice.verdict.call"],
        ]);
        expect(s(lang, "voice.atRisk.on")[0], band).toContain(sources["eccc-aqhi-messages"].publisher[lang]);
      }
    });

    test(`${lang.toUpperCase()} what is said aloud never says the person has a condition, nor that their switch is on`, () => {
      for (const band of [...BANDS, null]) {
        const view = protectView(withBand(band), lang);
        const start = view.voice.off.indexOf(s(lang, "voice.atRisk.off")[0]);
        const said = view.voice.on.slice(start).join(" ");
        expect(said, String(band)).not.toMatch(/you (told me|have|said)|vous (avez|m’avez dit)|switch|interrupteur|asthma|asthme|COPD|MPOC/i);
        expect(said, String(band)).toContain(s(lang, band ? "voice.atRisk.on" : "voice.atRisk.none")[0]);
      }
    });

    test(`${lang.toUpperCase()} no reading: said so, no message picked; nothing explains the smoke: the area-wide note is said once, after the band`, () => {
      const none = protectView(withBand(null), lang).voice;
      expect(none.off).toContain(content.strings["voice.band.none"][lang]);
      expect(none.on.slice(none.on.indexOf(s(lang, "voice.atRisk.none")[0]))).toEqual([...s(lang, "voice.atRisk.none"), ...sentences(content.atRisk.doctor[lang]), APP[lang]["voice.verdict.call"]]);
      for (const band of BANDS) expect(none.on.join(" ")).not.toContain(sentences(content.atRisk.messages[band][lang])[0]);
      const unexplained = protectView(json(halifax), lang).voice;
      const band = unexplained.off.indexOf(bandSaid(lang, "low"));
      expect(unexplained.off.slice(band + 1, band + 3)).toEqual([APP[lang]["aq.areaWide.lead"], APP[lang]["aq.areaWide.text"]]);
      expect(unexplained.on.filter((sentence) => sentence === APP[lang]["aq.areaWide.lead"]).length).toBe(1);
    });

    test(`${lang.toUpperCase()} a fire close by (Bridgetown): the notice is said first, after the title, naming its link`, () => {
      const view = protectView(json(bridgetown), lang);
      const notice = sentences(APP[lang]["voice.verdict.notice"]).map((sentence) => sentence.replace("{link}", APP[lang]["leave.entry"]));
      expect(view.voice.off.slice(0, 1 + notice.length)).toEqual([`${view.title}.`, ...notice]);
      expect(view.voice.on.slice(0, 1 + notice.length)).toEqual([`${view.title}.`, ...notice]);
    });

    test(`${lang.toUpperCase()} every sentence said is the screen’s own or quoted word for word; one sentence at a time; numbers spelled out`, () => {
      for (const data of [...BANDS.map(withBand), withBand(null), json(halifax), json(bridgetown)]) {
        const view = protectView(data, lang);
        for (const sentence of [...view.voice.off, ...view.voice.on]) {
          expect(isOwn(lang, sentence) || isQuoted(lang, sentence), `${lang}: “${sentence}” is neither the screen’s own nor quoted`).toBe(true);
          // One sentence per utterance. The notice names a link that holds a question mark: that one is not split.
          if (!sentence.includes(APP[lang]["leave.entry"])) expect(sentence, "one sentence").not.toMatch(/[.?!]\s+\S/);
          expect(sentence).not.toMatch(/\b(911|811|211)\b|safe|sécuri/i);
          expect(sentence.replace(/\s/g, "")).not.toMatch(/[.?!:][.?!:]$/);
        }
      }
    });
  }
});
