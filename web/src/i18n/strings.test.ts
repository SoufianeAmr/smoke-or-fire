import { describe, expect, test, vi } from "vitest";
import en from "./en.json";
import fr from "./fr.json";
import { TODO } from "./index";

// A ? ! : or ; not preceded by a no-break space (U+00A0) or narrow no-break space (U+202F).
const NO_SPACE_BEFORE_PUNCTUATION = new RegExp(`[^${String.fromCharCode(0xa0, 0x202f)}][?!:;]`);

describe("strings", () => {
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
    const emoji = [...Object.entries(en), ...Object.entries(fr)].filter(([, text]) => /\p{Extended_Pictographic}/u.test(text)).map(([key]) => key);
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
      "Do you see flames or a smoke column?",
      "Reprise · Dieppe · 25 août 2025 ·",
    ]);
  });
});
