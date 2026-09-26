import { describe, expect, test } from "vitest";
import en from "./en.json";
import fr from "./fr.json";
import { TODO, translate } from "./index";

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

  test("apostrophes are curly (’), never straight", () => {
    const straight = [...Object.entries(en), ...Object.entries(fr)]
      .filter(([, text]) => text.includes("'"))
      .map(([key]) => key);
    expect(straight).toEqual([]);
  });

  test("missing French falls back to English, and values are filled in", () => {
    expect([translate("fr", "q1.title"), translate("fr", "banner.replayTown", { town: "Dieppe" })]).toEqual([
      "Do you see flames?",
      "Reprise · Dieppe · 25 août 2025 ·",
    ]);
  });
});
