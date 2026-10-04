import { describe, expect, test } from "vitest";
import moncton from "../../../data/demo/moncton.json";
import halifax from "../../../data/demo/halifax.json";
import en from "../i18n/en.json";
import fr from "../i18n/fr.json";
import type { Burn, BurnState, VerdictJson } from "../verdict/types";
import { BURN_LOOK, burnView, type BurnContext } from "./view";

const NBSP = String.fromCharCode(0xa0);
const NBH = String.fromCharCode(0x2011);
const LANGS = ["en", "fr"] as const;
const STATES: BurnState[] = ["no_burn", "restricted", "permitted", "season_closed", "not_checked"];
const NOT_ALLOWED = { en: "That does not mean burning is allowed", fr: "Cela ne veut pas dire que le brûlage est permis" };

/** A live answer for Moncton, checked on Oct 4, 2026 at 9:15 a.m. Atlantic, with the province's answer. */
const live = (burn: Partial<Burn> | null | undefined, time = "2026-10-04T12:15:00Z"): VerdictJson =>
  ({
    ...moncton,
    mode: "live",
    time,
    burn: burn && { state: "permitted", county: "Westmorland", validUntil: "2026-10-04T17:00:00Z", checkedAt: "2026-10-04T12:07:30Z", source: "gnb_burn_categories", reason: null, ...burn },
  }) as unknown as VerdictJson; // the recorded answer, as JSON gives it: its map key holds plain arrays
const notChecked = (reason: string, county: string | null = "Westmorland") => ({ state: "not_checked" as const, county, validUntil: null, checkedAt: null, reason });
/** One of each state, as the engine gives it. */
const each = (state: BurnState) => live(state === "not_checked" ? notChecked("unavailable") : state === "season_closed" ? { state, validUntil: null } : { state });
const view = (json: VerdictJson, lang: "en" | "fr" = "en", context?: BurnContext) => burnView(json, lang, context)!;

describe("the burn card", () => {
  test("is not shown outside New Brunswick, or with an older engine that says nothing", () => {
    const older = { ...moncton } as Record<string, unknown>;
    delete older.burn;
    expect([burnView(halifax as unknown as VerdictJson, "en"), burnView(live(null), "en"), burnView(older as unknown as VerdictJson, "en")]).toEqual([null, null, null]);
  });

  test("each state has its own word, in English and in French", () => {
    const words = (lang: "en" | "fr") => STATES.map((state) => view(each(state), lang).word);
    expect(words("en")).toEqual(["No burning", `Burning only from 8${NBSP}p.m. to 8${NBSP}a.m.`, "Burning permitted", "Fire season closed", "Not checked"]);
    expect(words("fr")).toEqual(["Pas de brûlage", `Brûlage seulement de 20${NBSP}h à 8${NBSP}h`, "Brûlage permis", "Hors saison des feux de forêt", "Non vérifié"]);
  });

  test("each state has its own shape, and its own colour or outline: never colour alone", () => {
    expect(STATES.map((state) => BURN_LOOK[state].shape)).toEqual(["octagon", "triangle", "circle", "square", "ring"]);
    expect(new Set(STATES.map((state) => `${BURN_LOOK[state].fill} ${BURN_LOOK[state].border}`)).size).toBe(5);
    // Red and amber are the app's own; green is used here only, for the province's "burn permitted".
    expect([BURN_LOOK.no_burn.accent, BURN_LOOK.restricted.accent, BURN_LOOK.permitted.accent]).toEqual(["#D92D20", "#F79009", "#1E7B3A"]);
    // Permitted is quiet: green outlines the block and is never its fill. Not checked is dashed, as on the source badges.
    expect([BURN_LOOK.permitted.fill, BURN_LOOK.not_checked.border, BURN_LOOK.season_closed.border]).toEqual(["#FFFFFF", "2px dashed #1B2A4A", "2px solid #1B2A4A"]);
  });

  test("green is permitted’s alone: its outline, its flame and its word, never a fill", () => {
    const green = "#1E7B3A";
    expect([BURN_LOOK.permitted.border, BURN_LOOK.permitted.accent, BURN_LOOK.permitted.ink]).toEqual([`2px solid ${green}`, green, green]);
    for (const state of STATES) {
      expect(BURN_LOOK[state].fill).not.toBe(green);
      if (state !== "permitted") expect(Object.values(BURN_LOOK[state]).join(" ")).not.toContain(green);
    }
  });

  test("the county is named, as the province's answer is for a county", () => {
    expect(LANGS.map((lang) => view(live({}), lang).county)).toEqual(["Westmorland County", "Comté de Westmorland"]);
    expect(LANGS.map((lang) => view(live({ county: "Saint John" }), lang).county)).toEqual(["Saint John County", "Comté de Saint John"]);
    // French elides before a vowel, and not before York.
    expect(["Albert", "York"].map((county) => view(live({ county }), "fr").county)).toEqual(["Comté d’Albert", "Comté de York"]);
    expect(view(live(notChecked("no_county", null))).county).toBeNull();
  });

  test("before the province’s update, a category says until when it is valid and to check again for the evening", () => {
    // Checked at 9:15 a.m.; valid until 2 p.m. the same day: tonight's category is not known yet.
    expect(LANGS.map((lang) => view(live({ state: "restricted" }), lang).until)).toEqual([
      `Valid until 2${NBSP}p.m. today. For this evening, check again after 2${NBSP}p.m.`,
      `Valide jusqu’à 14${NBSP}h aujourd’hui. Pour ce soir, vérifiez de nouveau après 14${NBSP}h.`,
    ]);
  });

  test("after the province’s update, a category is valid until tomorrow’s, and says when it is updated", () => {
    // Checked at 3:10 p.m.; valid until 2 p.m. the next day.
    expect(LANGS.map((lang) => view(live({ state: "restricted", validUntil: "2026-10-05T17:00:00Z" }, "2026-10-04T18:10:00Z"), lang).until)).toEqual([
      `Valid until 2${NBSP}p.m. tomorrow. The province updates them every day at 2${NBSP}p.m.`,
      `Valide jusqu’à 14${NBSP}h demain. La province les met à jour chaque jour à 14${NBSP}h.`,
    ]);
  });

  test("the end of validity is named by its day and its hour, in Atlantic time; minutes only when there are some", () => {
    const until = (validUntil: string, lang: "en" | "fr" = "en") => view(live({ validUntil }), lang).until!.split(/(?<=\.) (?=[A-Z])/)[0];
    expect([until("2026-10-05T17:00:00Z"), until("2026-10-04T12:30:00Z"), until("2026-10-06T17:30:00Z"), until("2026-10-05T02:59:00Z"), until("2026-10-05T03:00:00Z")]).toEqual([
      `Valid until 2${NBSP}p.m. tomorrow.`,
      `Valid until 9:30${NBSP}a.m. today.`,
      `Valid until 2:30${NBSP}p.m. on 2026${NBH}10${NBH}06.`,
      `Valid until 11:59${NBSP}p.m. today.`, // 02:59 UTC is still Oct 4 in New Brunswick
      `Valid until 12${NBSP}a.m. tomorrow.`,
    ]);
    expect([until("2026-10-05T17:00:00Z", "fr"), until("2026-10-06T17:30:00Z", "fr")]).toEqual([`Valide jusqu’à 14${NBSP}h demain.`, `Valide jusqu’à 14${NBSP}h${NBSP}30 le 2026${NBH}10${NBH}06.`]);
  });

  test("a category whose validity has ended says so: today’s update is due", () => {
    // Checked at 3:10 p.m.: the 2 p.m. update has not come. The engine shows it for 2 hours more, never longer.
    expect(LANGS.map((lang) => view(live({ state: "permitted" }, "2026-10-04T18:10:00Z"), lang).until)).toEqual([
      `This was valid until 2${NBSP}p.m. today. Today’s update is due.`,
      `C’était valide jusqu’à 14${NBSP}h aujourd’hui. La mise à jour d’aujourd’hui est attendue.`,
    ]);
  });

  test("a screen left open follows the phone’s clock: tomorrow becomes today, then due, then not checked", () => {
    // Checked Sunday at 3:05 p.m.: permitted until Monday 2 p.m.
    const json = live({ state: "permitted", validUntil: "2026-10-05T17:00:00Z" }, "2026-10-04T18:05:00Z");
    const at = (now: string) => { const v = view(json, "en", { now: Date.parse(now) }); return [v.state, v.reason, v.until]; };
    expect(at("2026-10-04T18:05:00Z")).toEqual(["permitted", null, `Valid until 2${NBSP}p.m. tomorrow. The province updates them every day at 2${NBSP}p.m.`]);
    expect(at("2026-10-05T13:00:00Z")).toEqual(["permitted", null, `Valid until 2${NBSP}p.m. today. For this evening, check again after 2${NBSP}p.m.`]);
    expect(at("2026-10-05T17:30:00Z")).toEqual(["permitted", null, `This was valid until 2${NBSP}p.m. today. Today’s update is due.`]);
    // Monday 6 p.m.: over 26 hours old. Nothing of the old category is left on the card.
    expect(at("2026-10-05T21:00:00Z")).toEqual(["not_checked", "expired", null]);
    const expired = view(json, "en", { now: Date.parse("2026-10-05T21:00:00Z") });
    expect([expired.word, expired.detail, expired.county]).toEqual(["Not checked", "The burn conditions shown here earlier are out of date. Start a new check to see today’s. That does not mean burning is allowed.", "Westmorland County"]);
    expect(expired.sources.lines.some((line) => line.includes("Checked with the province"))).toBe(false);
  });

  test("a phone’s clock that runs behind the check is not believed", () => {
    const json = live({ state: "permitted" }, "2026-10-04T18:10:00Z");
    expect(view(json, "en", { now: Date.parse("2020-01-01T00:00:00Z") }).until).toBe(`This was valid until 2${NBSP}p.m. today. Today’s update is due.`);
  });

  test("a phone’s location too coarse to tell a county: not checked, no county named, whatever the province says", () => {
    const coarse = view(live({ state: "permitted" }), "en", { accuracy: 2500 });
    expect([coarse.state, coarse.reason, coarse.county, coarse.until]).toEqual(["not_checked", "imprecise", null, null]);
    expect(coarse.detail).toBe("Your phone’s location is not precise enough to tell your county. Check Fire Watch for your county. That does not mean burning is allowed.");
    // Within a kilometre, or a town picked from the search (no accuracy): the county stands.
    expect([view(live({ state: "permitted" }), "en", { accuracy: 1000 }).state, view(live({ state: "permitted" }), "en", { accuracy: null }).state, view(live({ state: "permitted" })).state]).toEqual(["permitted", "permitted", "permitted"]);
    // The season being closed is true of every county.
    expect(view(live({ state: "season_closed", validUntil: null }), "en", { accuracy: 2500 }).state).toBe("season_closed");
  });

  test("no end of validity without a category", () => {
    expect([view(live(notChecked("stale"))).until, view(live({ state: "season_closed", validUntil: null })).until]).toEqual([null, null]);
  });

  test("each category says what the province allows: small fires only, and a permit for bigger ones", () => {
    const details = (lang: "en" | "fr") => (["no_burn", "restricted", "permitted"] as const).map((state) => view(live({ state }), lang).detail);
    expect(details("en")).toEqual([
      "The province allows no campfire or other wood fire outdoors in this county today.",
      "The province allows campfires and small wood fires in this county only at night. Bigger fires need a permit.",
      "The province allows campfires and small wood fires in this county today. Bigger fires need a permit.",
    ]);
    expect(details("fr")).toEqual([
      "La province ne permet aucun feu de camp ni autre feu de bois à l’extérieur dans ce comté aujourd’hui.",
      "La province permet les feux de camp et les petits feux de bois dans ce comté seulement la nuit. Les plus gros feux exigent un permis.",
      "La province permet les feux de camp et les petits feux de bois dans ce comté aujourd’hui. Les plus gros feux exigent un permis.",
    ]);
  });

  test("season closed says what the province lists, the usual season, that burning is not thereby allowed, and whom to call", () => {
    const closed = view(live({ state: "season_closed", validUntil: null }));
    expect(closed.detail).toBe(
      "The province lists no burn category for this county now. Its fire season usually runs from the third Monday of April to October 31. That does not mean burning is allowed: outside the season, the province says to call Environment and Local Government, 506-453-2690.",
    );
    expect(view(live({ state: "season_closed", validUntil: null }), "fr").detail).toContain(`Cela ne veut pas dire que le brûlage est permis${NBSP}: hors saison, la province demande d’appeler Environnement et Gouvernements locaux, au 506-453-2690.`);
  });

  test("not checked says why, in words that are true of the reason", () => {
    const detail = (reason: string) => view(live(notChecked(reason))).detail;
    const unavailable = "The province’s burn conditions are not available right now. That does not mean burning is allowed.";
    expect(["unavailable", "unreadable", "stale", "no_category"].map(detail)).toEqual([unavailable, unavailable, unavailable, unavailable]);
    expect(detail("county_line")).toBe("You are near a county line, and the two counties have different burn conditions today. Check Fire Watch for your county. That does not mean burning is allowed.");
    expect(detail("no_county")).toBe("Your county could not be told from this spot. Check Fire Watch for your county. That does not mean burning is allowed.");
  });

  test("whenever there is no category, the card says that does not mean burning is allowed (but in the replay, which is about a past day)", () => {
    for (const lang of LANGS) {
      const cases = [
        ...["unavailable", "unreadable", "stale", "no_category", "county_line", "no_county"].map((reason) => view(live(notChecked(reason)), lang)),
        view(live({ state: "season_closed", validUntil: null }), lang),
        view(live({ state: "permitted" }), lang, { accuracy: 5000 }),
        view(live({ state: "permitted" }), lang, { now: Date.parse("2026-10-06T00:00:00Z") }),
      ];
      expect(cases.filter((v) => !v.detail.includes(NOT_ALLOWED[lang])).map((v) => v.reason ?? v.state), lang).toEqual([]);
      expect(cases.filter((v) => !v.voice.some((sentence) => sentence.includes(NOT_ALLOWED[lang]))).map((v) => v.reason ?? v.state), lang).toEqual([]);
    }
  });

  test("the replay is not checked, and says why: the province keeps no past conditions", () => {
    const replay = view(moncton as unknown as VerdictJson);
    expect([replay.state, replay.word, replay.county, replay.detail, replay.until]).toEqual([
      "not_checked",
      "Not checked",
      "Westmorland County",
      "The province keeps no past burn conditions, so none are shown for the replay day.",
      null,
    ]);
    expect(view(moncton as unknown as VerdictJson, "fr").detail).toBe(`La province ne conserve pas les conditions de brûlage passées${NBSP}: aucune n’est affichée pour le jour de la reprise.`);
    expect(replay.sources.lines[0]).toBe("Burn conditions: Government of New Brunswick, by county. It keeps no past conditions, and no archive holds a copy.");
    // The replay day is long past: the phone's clock changes nothing.
    expect(view(moncton as unknown as VerdictJson, "en", { now: Date.now() }).detail).toBe(replay.detail);
  });

  test("the town’s rules: one line and one link, a search for the town’s own by-law", () => {
    const moncton_ = view(live({}), "en", { town: "Moncton" });
    expect([moncton_.town.text, moncton_.town.link.label, moncton_.town.link.host, moncton_.town.link.url]).toEqual([
      "Your town may ban fires at all times.",
      "Check your town’s rules",
      "google.com",
      "https://www.google.com/search?q=Moncton%20open%20air%20burning%20by-law",
    ]);
    // New Brunswick's municipal by-laws are "arrêtés" in French.
    expect(view(live({}), "fr", { town: "Dieppe" }).town.link.url).toBe("https://www.google.com/search?q=Dieppe%20arr%C3%AAt%C3%A9%20feux%20en%20plein%20air");
    // Without a picked town, the engine's name for the spot.
    expect(view(live({})).town.link.url).toContain(encodeURIComponent(moncton.location.name));
  });

  test("three tips, each with its own icon; the first is today’s rule where there is one", () => {
    const tips = (state: BurnState) => view(each(state)).tips;
    for (const state of STATES) expect(tips(state).map((tip) => tip.icon), state).toEqual(["fire", "drop", "butt"]);
    expect(STATES.map((state) => tips(state)[0].text)).toEqual([
      "No backyard fire while burning is banned.",
      `No backyard fire before 8${NBSP}p.m. or after 8${NBSP}a.m.`,
      "No backyard fire when burning is banned.",
      "No backyard fire when burning is banned.",
      "No backyard fire when burning is banned.",
    ]);
    expect(tips("permitted").slice(1).map((tip) => tip.text)).toEqual(["Keep mulch damp. Mulch can catch fire by itself.", "Never drop a cigarette butt in mulch."]);
    expect(view(each("restricted"), "fr").tips.map((tip) => tip.text)).toEqual([
      `Pas de feu dans la cour avant 20${NBSP}h ni après 8${NBSP}h.`,
      "Gardez le paillis humide. Le paillis peut s’enflammer tout seul.",
      "Ne jetez jamais de mégot dans le paillis.",
    ]);
  });

  test("Fire Watch is linked in the page’s own language", () => {
    expect(LANGS.map((lang) => view(live({}), lang).fireWatch.url)).toEqual(["https://www.gnb.ca/en/emergency/fire-watch.html", "https://www.gnb.ca/fr/urgence/indice-des-feux.html"]);
  });

  test("sources: who gives the conditions, when the province was asked, and where each tip comes from", () => {
    const sources = view(live({ state: "restricted" })).sources;
    expect(sources.lines).toEqual([
      `Burn conditions: Government of New Brunswick, by county. Updated every day at 2${NBSP}p.m. during the fire season.`,
      `Checked with the province: 2026${NBH}10${NBH}04, 09:07 (Atlantic time).`,
      "Tips: Moncton Fire’s deputy chief, reported by Tara Clow on Aug 25, 2025; the Government of New Brunswick; and, for damp mulch, Halifax Regional Fire and Emergency, Aug 21, 2008.",
    ]);
    expect(sources.links.map((link) => link.url)).toEqual([
      "https://yourgreatermoncton.ca/128945-2/",
      "https://www.gnb.ca/en/topic/laws-safety/emergency-preparedness-alerts/wildfires/fire-prevention.html",
      "https://www.gnb.ca/en/topic/laws-safety/emergency-preparedness-alerts/wildfires/wildfire-season.html",
      "https://legacycontent.halifax.ca/mediaroom/pressrelease/pr2008/080821LandscapingMulch.php",
    ]);
    // The French links carry the pages' own titles.
    expect(view(live({}), "fr").sources.links.slice(1, 3).map((link) => link.label)).toEqual(["Conseils pour la prévention des feux de forêt", "Brûlage pendant la saison des feux de forêt"]);
  });

  test("“Checked with the province” is never said under “Not checked”", () => {
    // The province was asked at 9:07 a.m., and its answer could not be used: no time is given.
    for (const reason of ["stale", "no_category", "county_line", "unreadable"]) {
      const lines = view(live({ ...notChecked(reason), checkedAt: "2026-10-04T12:07:30Z" })).sources.lines;
      expect(lines.filter((line) => line.includes("Checked with the province")), reason).toEqual([]);
    }
    expect(view(live({ state: "season_closed", validUntil: null })).sources.lines[1]).toBe(`Checked with the province: 2026${NBH}10${NBH}04, 09:07 (Atlantic time).`);
  });

  test("the article is the page the three questions already credit", () => {
    expect([en["burn.source.link.article.url"], fr["burn.source.link.article.url"]]).toEqual([en["look.about.source.url"], en["look.about.source.url"]]);
  });

  test("Listen: the question, the answer for the county, when to check again, the town’s rules, the tips, then Fire Watch", () => {
    expect(view(live({ state: "no_burn" })).voice).toEqual([
      "Is burning allowed today?",
      "In Westmorland County, the province allows no burning today.",
      "No campfire, and no backyard fire.",
      "This is valid until the province’s update at two in the afternoon.",
      "For this evening, please check again after that.",
      "Your town may ban fires at all times.",
      "Please check your town’s rules first.",
      "Three ways to prevent a fire.",
      "No backyard fire when burning is banned.",
      "Keep mulch damp.",
      "And never drop a cigarette butt in mulch.",
      "For more, tap the Fire Watch link.",
    ]);
    // After the day's update: when the province updates it.
    expect(view(live({ state: "restricted", county: "Albert", validUntil: "2026-10-05T17:00:00Z" }, "2026-10-04T18:10:00Z"), "fr").voice.slice(0, 4)).toEqual([
      `Le brûlage est-il permis aujourd’hui${NBSP}?`,
      "Dans le comté d’Albert, la province permet les feux de camp et les petits feux de bois seulement la nuit, de vingt heures à huit heures.",
      "Les plus gros feux exigent un permis.",
      "La province met ces conditions à jour chaque jour à quatorze heures.",
    ]);
  });

  test("Listen: not checked says why, and in the replay that no past conditions are kept; neither says when it is updated", () => {
    expect(view(live(notChecked("unavailable"))).voice.slice(0, 4)).toEqual([
      "Is burning allowed today?",
      "The province’s burn conditions are not available right now.",
      "That does not mean burning is allowed.",
      "Your town may ban fires at all times.",
    ]);
    expect(view(live(notChecked("county_line"))).voice.slice(1, 3)).toEqual(["You are near a county line, and the two counties have different burn conditions today.", "Please check Fire Watch for your county."]);
    expect(view(moncton as unknown as VerdictJson).voice.slice(0, 3)).toEqual([
      "Is burning allowed today?",
      "The province keeps no past burn conditions, so I have none for the replay day.",
      "Your town may ban fires at all times.",
    ]);
  });

  test("no spoken sentence ends with two punctuation marks, and none is empty", () => {
    for (const lang of LANGS) {
      for (const json of [...STATES.map(each), live(notChecked("county_line")), live(notChecked("no_county", null)), moncton as unknown as VerdictJson]) {
        const voice = view(json, lang).voice;
        expect(voice.filter((sentence) => sentence.trim() === "" || /[.?!:;,]\s*[.?!]$/.test(sentence)), lang).toEqual([]);
      }
    }
  });

  test("nothing on the card or in its voice says safe, or discourages calling 911", () => {
    const banned = /safe|sécuri|(do not|don’t|never|no need to) call|ne (pas|jamais) appeler|n’appelez (pas|jamais)|911|9-1-1/i;
    for (const lang of LANGS) {
      for (const json of [...STATES.map(each), live(notChecked("county_line")), live(notChecked("no_county", null)), moncton as unknown as VerdictJson]) {
        const v = view(json, lang);
        const said = [v.title, v.county, v.word, v.detail, v.until, v.town.text, v.town.link.label, ...v.tips.map((tip) => tip.text), v.fireWatch.label, ...v.sources.lines, ...v.voice];
        expect(said.filter((text) => text && banned.test(text)), lang).toEqual([]);
      }
    }
  });
});
