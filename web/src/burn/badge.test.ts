// The burn status as the fourth source badge of the verdict, in New Brunswick: a pill in the badge row, "Burning: No
// burn", with its shape, its source and its link on a tap, like the other three.
import { describe, expect, test } from "vitest";
import halifax from "../../../data/demo/halifax.json";
import moncton from "../../../data/demo/moncton.json";
import type { Burn, BurnState, VerdictJson } from "../verdict/types";
import { verdictView } from "../verdict/view";
import { burnBadge, withBurnBadge } from "./badge";
import { burnView } from "./view";

const NBSP = String.fromCharCode(0xa0);
const plain = (text: string) => text.replace(/\s/g, " ");
/** A live answer for Moncton, checked on Oct 4, 2026 at 9:15 a.m. Atlantic, with the province's answer. */
const live = (burn: Partial<Burn>): VerdictJson =>
  ({
    ...moncton,
    mode: "live",
    time: "2026-10-04T12:15:00Z",
    burn: { state: "permitted", county: "Westmorland", validUntil: "2026-10-04T17:00:00Z", checkedAt: "2026-10-04T12:07:30Z", source: "gnb_burn_categories", reason: null, ...burn },
  }) as unknown as VerdictJson;
const badge = (json: VerdictJson, lang: "en" | "fr" = "en", now?: number) => burnBadge(burnView(json, lang, { town: "Moncton", now })!, lang);
const of = (state: BurnState, lang: "en" | "fr" = "en") => badge(live(state === "not_checked" ? { state, validUntil: null, checkedAt: null, reason: "unavailable" } : state === "season_closed" ? { state, validUntil: null } : { state }), lang);

describe("the burn badge", () => {
  test("five states, each with its own outline and its own word, in English and French", () => {
    const rows = (lang: "en" | "fr") => (["no_burn", "restricted", "permitted", "season_closed", "not_checked"] as const).map((state) => { const b = of(state, lang); return [b.id, b.burn, b.tone, b.short, plain(b.label)]; });
    expect(rows("en")).toEqual([
      ["burn", "no_burn", "noBurn", "No burn", "Burning: No burn"],
      ["burn", "restricted", "restricted", "Restricted", "Burning: Restricted"],
      ["burn", "permitted", "permitted", "Permitted", "Burning: Permitted"],
      ["burn", "season_closed", "none", "Season closed", "Burning: Season closed"],
      ["burn", "not_checked", "notChecked", "Not checked", "Burning: Not checked"],
    ]);
    expect(rows("fr")).toEqual([
      ["burn", "no_burn", "noBurn", "Interdit", "Brûlage : interdit"],
      ["burn", "restricted", "restricted", "Restreint", "Brûlage : restreint"],
      ["burn", "permitted", "permitted", "Permis", "Brûlage : permis"],
      ["burn", "season_closed", "none", "Hors saison", "Brûlage : hors saison"],
      ["burn", "not_checked", "notChecked", "Non vérifié", "Brûlage : non vérifié"],
    ]);
    // French keeps its no-break space before the colon.
    expect(of("no_burn", "fr").label).toContain(`Brûlage${NBSP}:`);
  });

  test("its short word is in its name, which is what a screen reader says", () => {
    for (const lang of ["en", "fr"] as const) {
      for (const state of ["no_burn", "restricted", "permitted", "season_closed", "not_checked"] as const) {
        const b = of(state, lang);
        expect(b.label.toLocaleLowerCase(lang)).toContain(b.short.toLocaleLowerCase(lang));
      }
    }
  });

  test("a tap shows what the card says: the status in full, the county, what the province allows, until when, then the source and its link", () => {
    const json = live({ state: "restricted" });
    const view = burnView(json, "en", { town: "Moncton" })!;
    const b = badge(json);
    expect(b.lines.slice(0, 4)).toEqual([view.word, view.county, view.detail, view.until]);
    expect(b.lines[0]).toContain("8"); // "Burning only from 8 p.m. to 8 a.m."
    // The last lines say who was asked, and when.
    expect(b.lines.slice(4)).toEqual(view.sources.lines.slice(0, -1));
    expect(b.lines.at(-1)).toMatch(/Atlantic time/);
    expect(b.links).toEqual([view.fireWatch]);
    expect(b.links[0].url).toMatch(/^https:\/\//);
  });

  test("the replay has no burn status recorded: dashed, Not checked, and it says why", () => {
    const b = badge(moncton as unknown as VerdictJson);
    expect([b.tone, b.short]).toEqual(["notChecked", "Not checked"]);
    expect(b.lines.join(" ")).toMatch(/keeps no past/);
  });

  test("a screen left open past the category’s time: the pill turns to Not checked, as the card does", () => {
    const json = live({ state: "no_burn" });
    expect(badge(json).tone).toBe("noBurn");
    expect(badge(json, "en", Date.parse("2026-10-06T12:00:00Z")).tone).toBe("notChecked");
  });

  test("outside New Brunswick there is no burn status, and no badge", () => {
    expect(burnView(halifax as unknown as VerdictJson, "en")).toBeNull();
  });
  test("Listen at the sheet’s half height names the burn badge after the other three, in English and French", () => {
    for (const lang of ["en", "fr"] as const) {
      const json = live({ state: "no_burn" });
      const view = verdictView(json, lang, "Moncton");
      const burn = badge(json, lang);
      const said = withBurnBadge(view.card.voice, view.badges, burn);
      // One sentence more, the badge's name, right after the alert badge's; nothing else moved.
      const at = said.indexOf(`${burn.label}.`);
      expect(said).toHaveLength(view.card.voice.length + 1);
      expect(said[at - 1]).toContain(view.badges[2].label);
      expect([...said.slice(0, at), ...said.slice(at + 1)]).toEqual(view.card.voice);
      expect(plain(said[at])).toBe(lang === "en" ? "Burning: No burn." : "Brûlage : interdit.");
    }
  });

  test("a script that does not name the badges is left as it is", () => {
    const view = verdictView(moncton as unknown as VerdictJson, "en", "Moncton");
    expect(withBurnBadge(["One sentence."], view.badges, badge(live({})))).toEqual(["One sentence."]);
  });
});
