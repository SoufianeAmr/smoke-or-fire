import { describe, expect, test, vi } from "vitest";
import airoutEn from "../airout/strings.en.json";
import airoutFr from "../airout/strings.fr.json";
import sharedEn from "./en.json";
import sharedFr from "./fr.json";
import { TODO } from "./index";

// Every string of the app: the shared tables, and the words that ship with a later screen's own files.
const en = { ...sharedEn, ...airoutEn };
const fr = { ...sharedFr, ...airoutFr };

// A ? ! : or ; not preceded by a no-break space (U+00A0) or narrow no-break space (U+202F).
const NO_SPACE_BEFORE_PUNCTUATION = new RegExp(`[^${String.fromCharCode(0xa0, 0x202f)}][?!:;]`);

describe("strings", () => {
  test("the words of “Best time to air out” ship with that feature, not with the first screens: the shared tables do not hold them, and they are known once its file has loaded", async () => {
    expect(Object.keys({ ...sharedEn, ...sharedFr }).filter((key) => /^(voice\.)?airout\./.test(key))).toEqual([]);
    expect(Object.keys(airoutEn).filter((key) => !/^(voice\.)?airout\./.test(key))).toEqual([]);
    vi.resetModules();
    const { translate } = await import("./index");
    await import("../airout/strings");
    expect([translate("en", "airout.label"), translate("fr", "airout.label")]).toEqual([airoutEn["airout.label"], airoutFr["airout.label"]]);
  });

  test("English and French have the same keys", () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  test("French has a non-breaking space before ? ! : ;", () => {
    const broken = Object.entries(fr)
      .filter(([, text]) => text !== TODO && !text.startsWith("http"))
      .filter(([, text]) => NO_SPACE_BEFORE_PUNCTUATION.test(text.replace(/\{\w+\}/g, "")))
      .map(([key]) => key);
    expect(broken).toEqual([]);
  });

  test("French has a non-breaking space inside « »", () => {
    const nbsp = `[${String.fromCharCode(0xa0, 0x202f)}]`;
    const broken = Object.entries(fr).filter(([, text]) => new RegExp(`«(?!${nbsp})|(?<!${nbsp})»`).test(text)).map(([key]) => key);
    expect(Object.values(fr).some((text) => text.includes("«"))).toBe(true);
    expect(broken).toEqual([]);
  });

  test("apostrophes are curly (’), never straight", () => {
    const straight = [...Object.entries(en), ...Object.entries(fr)]
      .filter(([, text]) => text.includes("'"))
      .map(([key]) => key);
    expect(straight).toEqual([]);
  });

  test("no emoji in any string", () => {
    // The copyright sign of the map's credit ("© OpenStreetMap") is in Unicode's pictographic set; it is not an emoji.
    const emoji = [...Object.entries(en), ...Object.entries(fr)].filter(([, text]) => /\p{Extended_Pictographic}/u.test(text.replace(/©/g, ""))).map(([key]) => key);
    expect(emoji).toEqual([]);
  });

  test("never the word safe (DESIGN-LOCK hard rule), in English or French", () => {
    const safe = [...Object.entries(en), ...Object.entries(fr)].filter(([, text]) => !text.startsWith("http") && /safe|sécuri/i.test(text)).map(([key]) => key);
    expect(safe).toEqual([]);
  });

  test("never tells people not to call 911, in any wording", () => {
    const dont = /(do not|don’t|never|no need to) call|ne (pas|jamais) appeler|n’appelez (pas|jamais)|9-1-1 for updates/i;
    const found = [...Object.entries(en), ...Object.entries(fr)].filter(([, text]) => dont.test(text)).map(([key]) => key);
    expect(found).toEqual([]);
  });

  test("missing French falls back to English, and values are filled in", async () => {
    // Every string has French now, so one is marked missing here.
    vi.doMock("./fr.json", () => ({ default: { ...fr, "q1.title": TODO } }));
    vi.resetModules();
    const { translate } = await import("./index");
    vi.doUnmock("./fr.json");
    expect([translate("fr", "q1.title"), translate("fr", "banner.replayTown", { town: "Dieppe" })]).toEqual([
      "Do you see flames?",
      "Reprise · Dieppe · 25 août 2025 ·",
    ]);
  });
});

// The three questions before the trace (Q1 flames, Q2 sky, Q3 nearby). A key that is missing reads as "".
describe("the three questions", () => {
  const BOTH: Record<string, Record<string, string>> = { en, fr };
  const LANGS = ["en", "fr"];
  const text = (lang: string, key: string) => BOTH[lang][key] ?? "";

  test("Q2: each picture’s caption is four words at most", () => {
    for (const lang of LANGS) {
      for (const key of ["q2.column", "q2.haze", "q2.smell"]) {
        const words = text(lang, key).trim().split(/\s+/).filter(Boolean).length;
        expect(words, `${lang} ${key}`).toBeGreaterThanOrEqual(1);
        expect(words, `${lang} ${key}`).toBeLessThanOrEqual(4);
      }
    }
  });

  test("Q2: each picture has a description of 80 characters at most, which does not repeat its caption", () => {
    for (const lang of LANGS) {
      for (const key of ["q2.column", "q2.haze", "q2.smell"]) {
        const alt = text(lang, `${key}.alt`).trim();
        const caption = text(lang, key).trim();
        expect(alt, `${lang} ${key}.alt`).not.toBe("");
        expect(alt.length, `${lang} ${key}.alt`).toBeLessThanOrEqual(80);
        // A screen reader says the description, then the caption: never the same words twice in a row.
        expect(caption, `${lang} ${key}`).not.toBe("");
        expect(alt.toLowerCase(), `${lang} ${key}.alt`).not.toBe(caption.toLowerCase());
        expect(alt.toLowerCase().endsWith(caption.toLowerCase()), `${lang} ${key}.alt ends with its caption`).toBe(false);
      }
    }
  });

  test("Q3: the six answers and Not sure have a label, in English and French", () => {
    const keys = ["q3.firePit", "q3.mulch", "q3.people", "q3.other", "q3.nothing", "look.notSure"];
    expect(LANGS.flatMap((lang) => keys.filter((key) => text(lang, key).trim() === "" || text(lang, key) === TODO).map((key) => `${lang} ${key}`))).toEqual([]);
  });

  test("About these questions: the source is the same page in both languages", () => {
    expect(LANGS.map((lang) => text(lang, "look.about.source.url"))).toEqual(["https://yourgreatermoncton.ca/128945-2/", "https://yourgreatermoncton.ca/128945-2/"]);
  });

  test("the old single question’s hint and sub-labels are gone", () => {
    expect(LANGS.flatMap((lang) => ["q1.hint", "q1.yesSub", "q1.noSub"].filter((key) => key in BOTH[lang]).map((key) => `${lang} ${key}`))).toEqual([]);
  });

  test("About these questions says where they come from, and the deputy chief’s sentence is quoted nowhere", () => {
    // Whose questions and when; then the credit: the site, the reporter, the date.
    expect(LANGS.filter((lang) => !["Moncton", "2025"].every((part) => text(lang, "look.about.body").includes(part)))).toEqual([]);
    expect(LANGS.filter((lang) => !["yourgreatermoncton.ca", "Tara Clow", "2025"].every((part) => text(lang, "look.about.source").includes(part)))).toEqual([]);
    const quoted = [...Object.entries(en), ...Object.entries(fr)].filter(([, value]) => /not saying/i.test(value)).map(([key]) => key);
    expect(quoted).toEqual([]);
  });

  test("Nearby fire: the second line says when to call 911", () => {
    expect(LANGS.filter((lang) => !text(lang, "nearby.sub").includes("911"))).toEqual([]);
  });

  test("Nearby fire: the link on to the trace, in English and French", () => {
    expect([text("en", "nearby.check"), text("fr", "nearby.check")]).toEqual(["Check the drifting smoke anyway", "Vérifier la fumée qui dérive"]);
  });
});
