// The dispatch board, from the real replay files in data/demo/ (2025-08-25 12:00 UTC) and from live answers made of
// them: the script's routing, the facts and their sources, the call notes, and the public message of surge mode.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import bathurst from "../../../data/demo/bathurst.json";
import bridgetown from "../../../data/demo/bridgetown.json";
import charlottetown from "../../../data/demo/charlottetown.json";
import dieppe from "../../../data/demo/dieppe.json";
import edmundston from "../../../data/demo/edmundston.json";
import fredericton from "../../../data/demo/fredericton.json";
import halifax from "../../../data/demo/halifax.json";
import miramichi from "../../../data/demo/miramichi.json";
import moncton from "../../../data/demo/moncton.json";
import sackville from "../../../data/demo/sackville.json";
import saintJohn from "../../../data/demo/saint-john.json";
import sussex from "../../../data/demo/sussex.json";
import truro from "../../../data/demo/truro.json";
import westDalhousie from "../../../data/demo/west-dalhousie.json";
import type { Lang } from "../i18n";
import { Q1_ANSWERS, Q2_ANSWERS, Q3_ANSWERS, outcome as appOutcome, type End } from "../look/routing";
import type { VerdictJson } from "../verdict/types";
import { board, callNotes, outcome, progress, publicMessage, questions, shareImage, surgeCheck, type Answer, type Answers } from "./board";
import { burnView } from "../burn/view";
import { boardBurn, pageFor, releaseFor } from "./burn";

const json = (data: unknown) => data as VerdictJson;
const NBSP = String.fromCharCode(0xa0);
const LANGS: Lang[] = ["en", "fr"];
// The replay towns, by the name the call taker picks them by (the engine names a spot after its nearest municipality:
// Sackville is in Tantramar, Bridgetown and West Dalhousie are near Lawrencetown).
const REPLAY: [unknown, string, string][] = [
  [moncton, "Moncton", "NB"], [dieppe, "Dieppe", "NB"], [sackville, "Sackville", "NB"], [sussex, "Sussex", "NB"], [saintJohn, "Saint John", "NB"], [fredericton, "Fredericton", "NB"],
  [miramichi, "Miramichi", "NB"], [bathurst, "Bathurst", "NB"], [edmundston, "Edmundston", "NB"], [charlottetown, "Charlottetown", "PE"], [truro, "Truro", "NS"], [halifax, "Halifax", "NS"],
  [bridgetown, "Bridgetown", "NS"], [westDalhousie, "West Dalhousie", "NS"],
];
const TOWNS = REPLAY.map(([data]) => json(data));
const spot = (data: VerdictJson) => `${data.location.lat},${data.location.lon}`;
const PLACES = new Map(REPLAY.map(([data, name, province]) => [spot(json(data)), { name, province }]));
/** The town as the call taker picked it: its name and province, from the list of places. */
const place = (data: VerdictJson) => PLACES.get(spot(data))!;
const ready = (data: unknown, lang: Lang = "en"): Answer => ({ status: "ready", board: board(json(data), lang, place(json(data))) });
/** The engine's burn field for a New Brunswick county today (Oct 4, 2026), as the province's service gave it. */
const burnOf = (state: string, county = "Westmorland") => ({
  state,
  county,
  validUntil: ["no_burn", "restricted", "permitted"].includes(state) ? "2026-10-04T17:00:00Z" : null,
  checkedAt: state === "not_checked" ? null : "2026-10-04T11:52:07Z",
  source: "gnb_burn_categories",
  reason: state === "not_checked" ? "unavailable" : null,
});
/** A live answer of today, with the engine's burn field (null: the engine has no status for the place). */
const live = (data: unknown, burn: object | null = null) => json({ ...json(data), mode: "live", time: "2026-10-04T12:00:00Z", burn } as unknown);

// Any wording that tells a call taker not to send anyone.
const NO_RESPONSE = /(do not|don’t|never|no need to) (respond|dispatch|send|go)|no response|stand down|ne (pas|jamais) (répondre|répartir|envoyer|intervenir)|n’(envoyez|intervenez|répartissez) (pas|jamais)|aucune intervention|inutile d/i;

describe("not linked from the public flow", () => {
  test("only the route itself names the board's address; no public screen or component does", () => {
    const src = fileURLToPath(new URL("..", import.meta.url));
    const files = (readdirSync(src, { recursive: true }) as string[]).map((f) => f.replace(/\\/g, "/")).filter((f) => /\.tsx?$/.test(f) && !/\.test\.ts$/.test(f));
    expect(files.length).toBeGreaterThan(40);
    const naming = files.filter((f) => /["'`/]dispatch\b/i.test(readFileSync(`${src}/${f}`, "utf8")));
    // The route (App.tsx), the board's screen, and the board's own folder.
    expect(naming.filter((f) => !f.startsWith("dispatch/")).sort()).toEqual(["App.tsx", "screens/Dispatch.tsx"]);
  });
});

describe("the three questions, as a script", () => {
  test("every answer path ends where the public app's routing ends it, and asks no question after a yes or a not sure", () => {
    for (const q1 of Q1_ANSWERS) {
      for (const q2 of Q2_ANSWERS) {
        for (const q3 of Q3_ANSWERS) {
          const end = appOutcome(q1, q2, q3);
          // Answer one question at a time, as the script asks them.
          const given: Answers = {};
          let asked = 0;
          for (let step = progress(given); step.ask !== null; step = progress(given)) {
            asked++;
            if (step.ask === 1) given.q1 = q1;
            if (step.ask === 2) given.q2 = q2;
            if (step.ask === 3) given.q3 = q3;
          }
          expect(progress(given).end, `${q1} ${q2} ${q3}`).toBe(end);
          expect(asked, `${q1} ${q2} ${q3}`).toBe(q1 !== "no" ? 1 : q2 === "column" || q2 === "notSure" ? 2 : 3);
        }
      }
    }
  });

  test("any yes or not sure is Dispatch, whatever the board knows of the place", () => {
    for (const answer of [{ status: "none" }, { status: "loading" }, { status: "error" }, ...TOWNS.map((town) => ready(town))] as Answer[]) {
      expect(outcome("/emergency", "en", answer)).toEqual({ kind: "dispatch", title: "Dispatch", text: "A yes or a not sure: there may be a fire near the caller." });
    }
    expect(outcome("/emergency", "fr", { status: "none" }).title).toBe("Envoyer une équipe");
  });

  test("a fire pit or bonfire is Dispatch where burning is banned; otherwise the public app's two conditions, with the status", () => {
    // The replay: the bans New Brunswick and Nova Scotia announced.
    expect(outcome("/nearby-fire", "en", ready(moncton))).toEqual({ kind: "dispatch", title: "Dispatch", text: "A fire pit or bonfire, and a burn ban is in effect in New Brunswick." });
    expect(outcome("/nearby-fire", "fr", ready(halifax, "fr")).text).toBe("Un foyer ou un feu de camp, et une interdiction de brûlage est en vigueur en Nouvelle-Écosse.");
    // Today: the engine's status for the county. "No burning" is Dispatch.
    expect(outcome("/nearby-fire", "en", ready(live(moncton, burnOf("no_burn"))))).toEqual({ kind: "dispatch", title: "Dispatch", text: "A fire pit or bonfire, and the province allows no burning there today (Westmorland County)." });
    expect(outcome("/nearby-fire", "fr", ready(live(moncton, burnOf("no_burn")), "fr"))).toEqual({
      kind: "dispatch",
      title: "Envoyer une équipe",
      text: "Un foyer ou un feu de camp, et la province ne permet aucun brûlage à cet endroit aujourd’hui (Comté de Westmorland).",
    });
    // Any other status leaves the two conditions, and is named: the call taker judges.
    const pit = (status: string) => ({ kind: "firePit", title: "Fire pit or bonfire nearby", text: `Dispatch if it is out of control, or if burning is banned. Burn status: ${status}.` });
    const said = (burn: object | null) => { const o = outcome("/nearby-fire", "en", ready(live(moncton, burn))); return { ...o, text: o.text.replace(/\s/g, " ") }; };
    expect(said(burnOf("restricted"))).toEqual(pit("burning only from 8 p.m. to 8 a.m"));
    expect(said(burnOf("permitted"))).toEqual(pit("burning permitted"));
    expect(said(burnOf("season_closed"))).toEqual(pit("fire season closed"));
    expect(said(burnOf("not_checked"))).toEqual(pit("not checked"));
    // No status from the engine (outside New Brunswick), no place typed yet, or the replay with no ban on record.
    expect(said(null)).toEqual(pit("not checked"));
    expect(outcome("/nearby-fire", "en", { status: "none" })).toEqual(pit("not checked"));
    expect(outcome("/nearby-fire", "en", ready(charlottetown))).toEqual(pit("not checked"));
    expect(outcome("/nearby-fire", "fr", ready(charlottetown, "fr")).text.replace(/\s/g, " ")).toBe("Envoyez une équipe s’il est hors de contrôle, ou si le brûlage est interdit. Statut : non vérifié.");
  });

  test("burning restricted to the night: the fire-pit result gives the hours, on the screen and in the notes, in English and French", () => {
    const restricted = (lang: Lang) => ready(live(moncton, burnOf("restricted")), lang);
    // Not Dispatch by itself: the call taker judges by the hour, so the hours are in the sentence.
    expect(outcome("/nearby-fire", "en", restricted("en"))).toEqual({
      kind: "firePit",
      title: "Fire pit or bonfire nearby",
      text: `Dispatch if it is out of control, or if burning is banned. Burn status: burning only from 8${NBSP}p.m. to 8${NBSP}a.m.`,
    });
    expect(outcome("/nearby-fire", "fr", restricted("fr"))).toEqual({
      kind: "firePit",
      title: "Foyer ou feu de camp à proximité",
      // ("Statut", not "Brûlage": the status begins with that word.)
      text: `Envoyez une équipe s’il est hors de contrôle, ou si le brûlage est interdit. Statut${NBSP}: brûlage seulement de 20${NBSP}h à 8${NBSP}h.`,
    });
    // The notes: the same sentence, and the hours again under the burn fact, in plain spaces.
    const noted = (lang: Lang) => {
      const answer = restricted(lang);
      const answers: Answers = { q1: "no", q2: "haze", q3: "firePit" };
      return callNotes(lang, (answer as Extract<Answer, { status: "ready" }>).board, answers, outcome(progress(answers).end!, lang, answer)).split("\n");
    };
    expect(noted("en")).toEqual(expect.arrayContaining([
      "Burning: Restricted",
      "- Burning only from 8 p.m. to 8 a.m.",
      "Result: Fire pit or bonfire nearby. Dispatch if it is out of control, or if burning is banned. Burn status: burning only from 8 p.m. to 8 a.m.",
    ]));
    expect(noted("fr")).toEqual(expect.arrayContaining([
      "Brûlage : restreint",
      "- Brûlage seulement de 20 h à 8 h",
      "Résultat : Foyer ou feu de camp à proximité. Envoyez une équipe s’il est hors de contrôle, ou si le brûlage est interdit. Statut : brûlage seulement de 20 h à 8 h.",
    ]));
  });

  test("no flames, haze or a smell, nothing burning: the trace's answer stands, in its own words", () => {
    const text = (answer: Answer, lang: Lang = "en") => outcome("/location", lang, answer);
    expect(text(ready(moncton))).toEqual({ kind: "noFire", title: "Caller reports no fire nearby", text: "This fits the known smoke from the Long Lake fire, 159 km away." });
    expect(text(ready(moncton, "fr"), "fr").text).toBe("Cela concorde avec la fumée connue du feu de Long Lake, à 159 km.");
    expect(text(ready(saintJohn)).text).toBe("The trace is unclear: it may be smoke from the Long Lake fire, or something close by.");
    expect(text(ready(fredericton)).text).toBe("No known fire explains this smoke. A new fire can take hours to show up in satellite data.");
    expect(text({ status: "none" }).text).toBe("Type the caller’s town to see if a known fire explains the smoke.");
    expect(text({ status: "error" }).text).toBe("The smoke’s source could not be checked. That does not mean there is no fire.");
  });

  test("no result ever says not to respond, in English or French", () => {
    const ends: End[] = ["/emergency", "/nearby-fire", "/location"];
    for (const lang of LANGS) {
      const answers: Answer[] = [{ status: "none" }, { status: "loading" }, { status: "error" }, ...TOWNS.flatMap((town) => [ready(town, lang), ready(live(town), lang)])];
      for (const answer of answers) {
        for (const end of ends) {
          const { title, text } = outcome(end, lang, answer);
          expect(`${title} ${text}`).not.toMatch(NO_RESPONSE);
        }
      }
    }
  });

  test("the script says the public app's questions and answers; the sky is asked in words", () => {
    const [q1, q2, q3] = questions("en");
    expect([q1.text, q3.text]).toEqual(["Do you see flames?", "Is anything burning nearby?"]);
    expect(q2.text).toBe("What does the sky look like: smoke rising from one spot, grey haze everywhere, or only a smell?");
    expect(q1.answers.map((a) => a.label)).toEqual(["Yes", "No", "Not sure"]);
    expect(q2.answers).toEqual([{ id: "column", label: "Thick smoke rising" }, { id: "haze", label: "Grey haze" }, { id: "smell", label: "I only smell it" }, { id: "notSure", label: "Not sure" }]);
    expect(q3.answers.map((a) => a.id)).toEqual(["firePit", "mulch", "people", "other", "nothing", "notSure"]);
    expect(questions("fr").map((q) => q.answers[q.answers.length - 1].label)).toEqual(["Je ne sais pas", "Je ne sais pas", "Je ne sais pas"]);
  });
});

describe("the answer for a place", () => {
  test("Moncton, Aug 25, 2025: the card's line, the place and when it was checked", () => {
    const b = board(json(moncton), "en", place(json(moncton)));
    expect(b.view.card.line).toBe(`Drifting smoke${NBSP}· Long Lake fire${NBSP}· 159 km SSW`);
    expect([b.place, b.checked, b.replay]).toEqual(["Moncton, NB", "2025-08-25, 09:00 (Atlantic time)", true]);
    expect(b.close).toBeNull();
    const fr = board(json(moncton), "fr", place(json(moncton)));
    expect([fr.place, fr.checked]).toEqual(["Moncton, N.-B.", "2025-08-25, 9 h 00 (heure de l’Atlantique)"]);
  });

  test("the facts, in order: fire and distance, ECCC's alert, burn status, the wind trace", () => {
    const b = board(json(moncton), "en", place(json(moncton)));
    expect(b.facts.map((f) => [f.id, f.tone, f.label])).toEqual([
      ["fire", "active", "Satellite fire detection"],
      ["alert", "active", "ECCC air quality alert: active"],
      ["burn", "active", "Burn status: ban in effect"],
      ["trace", "active", "Wind trace"],
    ]);
    const [fire, alert, burn] = b.facts;
    expect([fire.headline, fire.sub]).toEqual([`Long Lake fire${NBSP}· 159 km SSW of Moncton`, "West Dalhousie, N.S."]);
    expect(fire.lines).toEqual(["Terra saw it burning 10 hours ago.", "Detected: 2025-08-24, 22:43 (Atlantic time).", "Sources: NASA FIRMS and Natural Resources Canada (CWFIS)."]);
    // ECCC's alert in ECCC's words, then ECCC's reading, then the source line.
    expect(alert.lines).toEqual([
      "Special air quality statement",
      "Moncton and Southeast New Brunswick",
      "Issued 2025-08-25, 04:50 (Atlantic time).",
      "Valid until at least 2025-08-25, 20:50 (Atlantic time).",
      "Air quality reading (AQHI): 10+, very high risk. Station: Moncton. Observed: 2025-08-25, 08:00 (Atlantic time).",
      "Data source: Environment and Climate Change Canada. For the replay, converted from the copy of ECCC’s messages kept by the NAAD System archive.",
    ]);
    // The replay's burn status is the province's announcement, and says so: from its news release of that date, linked.
    expect(burn.lines).toEqual(["A burn ban is in effect in New Brunswick.", "From the province’s news release of 2025-08-25 (Government of New Brunswick)."]);
    expect(burn.links.map((l) => [l.label, l.host])).toEqual([["The province’s news release of 2025-08-25", "gnb.ca"], ["New Brunswick Fire Watch", "gnb.ca"]]);
  });

  test("in French: the fire and its distance from the town, with the right “de”", () => {
    const headline = (data: unknown) => board(json(data), "fr", place(json(data))).facts[0].headline;
    expect(headline(moncton)).toBe(`Feu de Long${NBSP}Lake${NBSP}· 159 km SSO de Moncton`);
    expect(headline(charlottetown)).toBe(`Feu de Long${NBSP}Lake${NBSP}· 235 km SO de Charlottetown`);
  });

  test("every fact of every town names its source: a line that says who, and a link", () => {
    for (const lang of LANGS) {
      for (const town of [...TOWNS, ...TOWNS.map((data) => live(data)), live(moncton, burnOf("no_burn"))]) {
        const b = board(town, lang, place(town));
        expect(b.facts.map((f) => f.id)).toEqual(["fire", "alert", "burn", "trace"]);
        for (const fact of b.facts) {
          expect(fact.lines.length, `${b.town} ${fact.id}`).toBeGreaterThan(0);
          expect(fact.links.length, `${b.town} ${fact.id}`).toBeGreaterThan(0);
          for (const link of fact.links) expect(link.url).toMatch(/^https:\/\//);
        }
      }
    }
  });

  test("a state is told by a word in the fact's name: active, none in effect, not checked", () => {
    const labels = (data: VerdictJson) => board(data, "en", place(data)).facts.map((f) => `${f.tone}: ${f.label}`);
    expect(labels(json(fredericton))).toEqual([
      "none: Fire detections: none near the air’s path",
      "none: ECCC air quality alert: none in effect",
      "active: Burn status: ban in effect",
      "active: Wind trace",
    ]);
    // An older engine says nothing of alerts or of burning: both read "not checked", never a guess.
    const { alerts: _alerts, burn: _burn, ...older } = live(moncton);
    expect(labels(json(older)).slice(1, 3)).toEqual(["notChecked: ECCC air quality alert: not checked", "notChecked: Burn status: not checked"]);
  });

  test("a fire under 25 km from the town is said to be close", () => {
    const close = (data: unknown, lang: Lang = "en") => board(json(data), lang, place(json(data))).close;
    expect(close(bridgetown)).toBe("This fire is close to the caller’s town: 17 km.");
    expect(close(westDalhousie, "fr")).toBe(`Ce feu est proche de la ville de la personne qui appelle${NBSP}: 3 km.`);
    expect(TOWNS.filter((town) => close(town) !== null).map((town) => place(town).name)).toEqual(["Bridgetown", "West Dalhousie"]);
  });

  test("Listen says the place, the answer, how sure, the alert and the burn status, then the banner", () => {
    expect(board(json(moncton), "en", place(json(moncton))).voice).toEqual([
      "Moncton. Drifting smoke, most likely from the Long Lake fire, about 159 kilometres away, to the south-southwest.",
      "Low confidence.",
      "ECCC air quality alert: active.",
      "Burn status: ban in effect.",
      "Decision support only. Your dispatch protocol governs.",
    ]);
    expect(board(json(moncton), "fr", place(json(moncton))).voice[0]).toBe("Moncton. De la fumée qui dérive, venue probablement du feu de Long Lake, à environ 159 kilomètres, au sud-sud-ouest.");
    expect(board(json(fredericton), "en", place(json(fredericton))).voice[0]).toBe("Fredericton. Unexplained smoke. No known fire explains it.");
  });
});

describe("burn status", () => {
  const AUG_25 = "2025-08-25T12:00:00Z";
  const burnFact = (data: VerdictJson, lang: Lang = "en") => board(data, lang, place(data)).facts[2];

  test("today: the engine's burn field, in the words of the public app's burn badge, never a news release", () => {
    const rows = (["no_burn", "restricted", "permitted", "season_closed", "not_checked"] as const).map((state) => {
      const fact = burnFact(live(moncton, burnOf(state)));
      return [fact.tone, fact.label.replace(/\s/g, " ")];
    });
    // Filled: a restriction in effect. Outlined: none. Dashed: not checked. The state is a word in the name too.
    expect(rows).toEqual([
      ["active", "Burning: No burn"],
      ["active", "Burning: Restricted"],
      ["none", "Burning: Permitted"],
      ["none", "Burning: Season closed"],
      ["notChecked", "Burning: Not checked"],
    ]);
    // One source of truth: what the fact says is what the public app's burn view says of the same answer.
    const answer = live(moncton, burnOf("no_burn"));
    const [fact, view] = [burnFact(answer), burnView(answer, "en", { town: "Moncton" })!];
    expect(fact.lines.slice(0, 4)).toEqual([view.word, view.county, view.detail, view.until]);
    expect(fact.lines.slice(0, 2)).toEqual(["No burning", "Westmorland County"]);
    expect(fact.links).toEqual([view.fireWatch]);
    expect(fact.lines.join(" ")).not.toMatch(/news release/);
    expect(burnFact(answer, "fr").label.replace(/\s/g, " ")).toBe("Brûlage : interdit");
    const b = board(answer, "en", place(answer)).burn;
    expect([b.source, b.ban, b.release]).toEqual(["engine", true, null]);
  });

  test("today, where the engine has no status (outside New Brunswick, or an older engine): not checked, with the province's own page", () => {
    const fact = burnFact(live(halifax));
    expect([fact.tone, fact.label, fact.lines]).toEqual(["notChecked", "Burn status: not checked", ["The board has no burn status for this place and day. That does not mean burning is allowed."]]);
    expect(fact.links.map((l) => l.url)).toEqual(["https://novascotia.ca/burnsafe/"]);
    expect(board(live(halifax), "en", place(json(halifax))).burn).toMatchObject({ source: "none", ban: false, view: null, release: null });
  });

  test("a news release is never shown for a live check, even on a day a record covers", () => {
    // Aug 25, 2025 as a live day: the record for it is the replay's alone.
    const thatDay = json({ ...json(moncton), mode: "live", burn: null } as unknown);
    expect(boardBurn(thatDay, "NB", "en", null)).toMatchObject({ source: "none", ban: false, release: null });
    expect(burnFact(thatDay).label).toBe("Burn status: not checked");
    // And the engine's status wins over nothing else: it is the only source for today.
    const withStatus = json({ ...json(moncton), mode: "live", burn: { ...burnOf("permitted"), validUntil: "2025-08-25T17:00:00Z", checkedAt: "2025-08-25T11:52:07Z" } } as unknown);
    expect(board(withStatus, "en", place(json(moncton))).burn).toMatchObject({ source: "engine", ban: false, release: null });
  });

  test("the replay of Aug 25, 2025: the ban New Brunswick and Nova Scotia announced, each from the province's news release of its date, with its link", () => {
    expect(releaseFor("NB", AUG_25, "en")).toEqual({
      authority: "Government of New Brunswick",
      published: "2025-08-25",
      url: "https://www.gnb.ca/en/news/n-b.2025.08.most-restrictions-on-crown-land-to-be-lifted-tonight.html",
      english: false,
    });
    expect(releaseFor("NB", AUG_25, "fr")).toMatchObject({ url: "https://www.gnb.ca/fr/nouvelles/n-b.2025.08.la-plupart-des-restrictions-relatives-aux-terres-de-la-couronne-seront-levees-ce-soir.html", english: false });
    expect(releaseFor("NS", AUG_25, "en")).toMatchObject({ authority: "Province of Nova Scotia", published: "2025-07-30", url: "https://news.novascotia.ca/en/2025/07/30/provincewide-burn-ban-effect" });
    // In the replay the engine's own field says only that nothing was recorded: the board shows the release, and says so.
    for (const [town, province, date] of [[moncton, "New Brunswick", "2025-08-25"], [halifax, "Nova Scotia", "2025-07-30"]] as const) {
      const b = board(json(town), "en", place(json(town)));
      expect([b.burn.source, b.burn.ban, b.burn.view]).toEqual(["release", true, null]);
      const fact = b.facts[2];
      expect([fact.tone, fact.label, fact.lines[0]]).toEqual(["active", "Burn status: ban in effect", `A burn ban is in effect in ${province}.`]);
      expect(fact.lines[1]).toMatch(new RegExp(`^From the province’s news release of ${date} \\(`));
      expect(fact.links[0]).toMatchObject({ label: `The province’s news release of ${date}`, url: releaseFor(place(json(town)).province, AUG_25, "en")!.url });
    }
    const fr = burnFact(json(moncton), "fr");
    expect([fr.lines[1], fr.links[0].label]).toEqual(["D’après le communiqué de la province du 2025-08-25 (Gouvernement du Nouveau-Brunswick).", "Le communiqué de la province du 2025-08-25"]);
  });

  test("Prince Edward Island has no record: its release is not confirmed, so the replay reads not checked there, never a guess", () => {
    expect(releaseFor("PE", AUG_25, "en")).toBeNull();
    const fact = burnFact(json(charlottetown));
    expect([fact.tone, fact.label]).toEqual(["notChecked", "Burn status: not checked"]);
    expect(fact.lines.join(" ")).toMatch(/That does not mean burning is allowed/);
    expect(board(json(charlottetown), "en", place(json(charlottetown))).burn).toMatchObject({ source: "none", ban: false, release: null });
  });

  test("a release or a page found only in English says so in French", () => {
    expect(releaseFor("NS", AUG_25, "fr")).toMatchObject({ url: "https://news.novascotia.ca/en/2025/07/30/provincewide-burn-ban-effect", english: true });
    expect(pageFor("NS", "fr")).toEqual({ label: "Restrictions de brûlage de la Nouvelle-Écosse", url: "https://novascotia.ca/burnsafe/fr/", english: false });
    expect(pageFor("PE", "fr")?.english).toBe(true);
    expect(burnFact(json(halifax), "fr").links.map((l) => l.label)).toEqual(["Le communiqué de la province du 2025-07-30 (en anglais)", "Restrictions de brûlage de la Nouvelle-Écosse"]);
    expect(burnFact(json(charlottetown), "fr").links.map((l) => l.label)).toEqual(["Prince Edward Island burning restrictions (en anglais)"]);
  });

  test("any day or province the records do not cover has no release, never a guess", () => {
    // The New Brunswick release supports its own day only.
    expect(releaseFor("NB", "2025-08-24T12:00:00Z", "en")).toBeNull();
    expect(releaseFor("NB", "2025-08-27T12:00:00Z", "en")).toBeNull();
    // The day is the Atlantic one: 02:00 UTC on Aug 26 is still the evening of Aug 25 there.
    expect(releaseFor("NB", "2025-08-26T02:00:00Z", "en")).not.toBeNull();
    expect(releaseFor("NS", "2025-09-26T12:00:00Z", "en")).toBeNull(); // lifted that evening, except in Annapolis County
    expect(releaseFor("NB", "2026-10-04T12:00:00Z", "en")).toBeNull();
    expect(pageFor("NB", "en")?.url).toBe("https://www.gnb.ca/en/emergency/fire-watch.html");
    expect([releaseFor("QC", AUG_25, "en"), pageFor("QC", "en"), releaseFor(null, AUG_25, "en"), pageFor(null, "en")]).toEqual([null, null, null, null]);
    // A replay of another day would show no ban: the record is gated by its dates as well as by the mode.
    const otherDay = json({ ...json(moncton), time: "2025-08-27T12:00:00Z" } as unknown);
    expect(boardBurn(otherDay, "NB", "en", null)).toMatchObject({ source: "none", ban: false });
  });
});
describe("copy for call notes", () => {
  const notes = (lang: Lang, answers: Answers = {}) => {
    const answer = ready(moncton, lang);
    const b = (answer as Extract<Answer, { status: "ready" }>).board;
    const { end } = progress(answers);
    return callNotes(lang, b, answers, end ? outcome(end, lang, answer) : null);
  };

  test("Moncton: the place, the time, the answer, every fact with its source, its time and its link, then the banner", () => {
    expect(notes("en")).toBe(
      [
        "Smoke check · Smoke or Fire?",
        "Place: Moncton, NB",
        "Checked: 2025-08-25, 09:00 (Atlantic time)",
        "Replay of Aug 25, 2025: recorded data, not today’s.",
        "Answer: Drifting smoke · Long Lake fire · 159 km SSW",
        "Low confidence. We traced the air at three heights above the ground, and they don’t agree.",
        "",
        "Satellite fire detection",
        "- Long Lake fire · 159 km SSW of Moncton",
        "- West Dalhousie, N.S.",
        "- Terra saw it burning 10 hours ago.",
        "- Detected: 2025-08-24, 22:43 (Atlantic time).",
        "- Sources: NASA FIRMS and Natural Resources Canada (CWFIS).",
        "- NASA fire map: https://firms.modaps.eosdis.nasa.gov/map/",
        "- Canada’s fire map: https://cwfis.cfs.nrcan.gc.ca/interactive-map",
        "",
        "ECCC air quality alert: active",
        "- Special air quality statement",
        "- Moncton and Southeast New Brunswick",
        "- Issued 2025-08-25, 04:50 (Atlantic time).",
        "- Valid until at least 2025-08-25, 20:50 (Atlantic time).",
        "- Air quality reading (AQHI): 10+, very high risk. Station: Moncton. Observed: 2025-08-25, 08:00 (Atlantic time).",
        "- Data source: Environment and Climate Change Canada. For the replay, converted from the copy of ECCC’s messages kept by the NAAD System archive.",
        "- The archived message: https://alertsarchive.pelmorex.com/archive/2025-08-25/2025-08-25T07_51_32_18Iurn%263oid%2632.49.0.1.124.3033216116.2025_001.xml",
        "",
        "Burn status: ban in effect",
        "- A burn ban is in effect in New Brunswick.",
        "- From the province’s news release of 2025-08-25 (Government of New Brunswick).",
        "- The province’s news release of 2025-08-25: https://www.gnb.ca/en/news/n-b.2025.08.most-restrictions-on-crown-land-to-be-lifted-tonight.html",
        "- New Brunswick Fire Watch: https://www.gnb.ca/en/emergency/fire-watch.html",
        "",
        "Wind trace",
        "- Hourly winds from the GFS weather model (NOAA), through Open-Meteo.",
        "- Recorded winds for the replay, downloaded 2026-09-26.",
        "- Traced back 20 hours from Moncton.",
        "- Open-Meteo: https://open-meteo.com/en/docs/gfs-api",
        "",
        "Decision support only. Your dispatch protocol governs.",
      ].join("\n"),
    );
  });

  test("the caller's answers and where they end are in the notes once a question is answered", () => {
    const text = notes("en", { q1: "no", q2: "haze", q3: "nothing" });
    expect(text).toContain(
      [
        "Caller’s answers",
        "- Do you see flames? No",
        "- What does the sky look like: smoke rising from one spot, grey haze everywhere, or only a smell? Grey haze",
        "- Is anything burning nearby? Nothing",
        "Result: Caller reports no fire nearby. This fits the known smoke from the Long Lake fire, 159 km away.",
      ].join("\n"),
    );
    expect(notes("en", { q1: "yes" })).toContain("- Do you see flames? Yes\nResult: Dispatch. A yes or a not sure: there may be a fire near the caller.");
    // One answer in, no result yet.
    expect(notes("en", { q1: "no" })).toContain("Caller’s answers\n- Do you see flames? No\n\nDecision support only.");
  });

  test("plain text: no no-break space or hyphen, in English or French, and the banner last", () => {
    for (const lang of LANGS) {
      for (const town of TOWNS) {
        const answer = ready(town, lang) as Extract<Answer, { status: "ready" }>;
        const text = callNotes(lang, answer.board, { q1: "no", q2: "smell", q3: "firePit" }, outcome("/nearby-fire", lang, answer));
        expect(text).not.toMatch(/[\u00a0\u202f\u2011]/);
        expect(text.split("\n").at(-1)).toBe(lang === "fr" ? "Aide à la décision seulement. Votre protocole de répartition prévaut." : "Decision support only. Your dispatch protocol governs.");
        expect(text).not.toMatch(NO_RESPONSE);
      }
    }
    expect(notes("fr")).toContain("Vérifié : 2025-08-25, 9 h 00 (heure de l’Atlantique)\nReprise du 25 août 2025 : données enregistrées, pas celles d’aujourd’hui.\nRéponse : Fumée qui dérive · Feu de Long Lake · 159 km SSO");
  });
});

describe("surge mode: a known smoke event", () => {
  const check = (data: unknown) => surgeCheck(board(json(data), "en", place(json(data))));

  test("a message is drafted only for drifting smoke from a fire that is not close", () => {
    expect(TOWNS.map((town) => [place(town).name, check(town)])).toEqual([
      ["Moncton", "ok"],
      ["Dieppe", "ok"],
      ["Sackville", "ok"],
      ["Sussex", "ok"],
      ["Saint John", "notDrifting"],
      ["Fredericton", "notDrifting"],
      ["Miramichi", "notDrifting"],
      ["Bathurst", "ok"],
      ["Edmundston", "notDrifting"],
      ["Charlottetown", "notDrifting"],
      ["Truro", "notDrifting"],
      ["Halifax", "notDrifting"],
      ["Bridgetown", "close"],
      ["West Dalhousie", "close"],
    ]);
  });

  test("Moncton: the message, in English and in French, then ECCC's alert in ECCC's words", () => {
    expect(publicMessage(json(moncton), "en", "Moncton")).toBe(
      "The smoke in Moncton today comes from the Long Lake fire in Nova Scotia, 159 km away. If you see flames or smoke from a building or vehicle, call 911. " +
        "Environment Canada: special air quality statement in effect for Moncton and Southeast New Brunswick.",
    );
    expect(publicMessage(json(moncton), "fr", "Moncton")).toBe(
      "La fumée à Moncton aujourd’hui vient du feu de Long Lake en Nouvelle-Écosse, à 159 km. Si vous voyez des flammes ou de la fumée qui sort d’un bâtiment ou d’un véhicule, appelez le 911. " +
        `Environnement Canada${NBSP}: bulletin spécial sur la qualité de l’air en vigueur pour Moncton et sud-est du Nouveau-Brunswick.`,
    );
  });

  test("with no alert in effect, or one not checked, the message says nothing of ECCC", () => {
    expect(publicMessage(json(bathurst), "en", "Bathurst")).toBe("The smoke in Bathurst today comes from a fire near Heath Steele in New Brunswick, 52 km away. If you see flames or smoke from a building or vehicle, call 911.");
    const { alerts: _alerts, ...older } = json(moncton);
    expect(publicMessage(json(older), "en", "Moncton")).toBe("The smoke in Moncton today comes from the Long Lake fire in Nova Scotia, 159 km away. If you see flames or smoke from a building or vehicle, call 911.");
  });

  test("a fire with no name and no community near it is placed by its province once", () => {
    const fire = { ...moncton.closestApproach.fire, name: null, nearCommunity: null };
    const unnamed = json({ ...moncton, closestApproach: { ...moncton.closestApproach, fire } });
    expect(publicMessage(unnamed, "en", "Moncton")).toContain("comes from a fire in Nova Scotia, 159 km away.");
    expect(publicMessage(unnamed, "fr", "Moncton")).toContain("vient d’un feu en Nouvelle-Écosse, à 159 km.");
  });

  test("every message a town can get says when to call 911, and never not to", () => {
    for (const town of TOWNS.filter((t) => check(t) === "ok")) {
      expect(publicMessage(town, "en", place(town).name)).toContain("If you see flames or smoke from a building or vehicle, call 911.");
      expect(publicMessage(town, "fr", place(town).name)).toContain("appelez le 911.");
      for (const lang of LANGS) expect(publicMessage(town, lang, place(town).name)).not.toMatch(/(do not|don’t|never|no need to) call|n’appelez (pas|jamais)/i);
    }
  });

  test("the share image: the card's line, the town and the day, the 911 sentence, a description and a file name", () => {
    const en = shareImage(json(moncton), "en", "Moncton");
    expect(en.parts).toEqual(["Drifting smoke", "Long Lake fire", "159 km SSW"]);
    expect([en.arrowDeg, en.where, en.townLabel, en.fireLabel]).toEqual([202.5, `Moncton${NBSP}· Aug 25, 2025`, "Moncton", "Long Lake fire"]);
    expect(en.call).toBe("If you see flames or smoke from a building or vehicle, call 911.");
    expect(en.alt).toBe(`Drifting smoke${NBSP}· Long Lake fire${NBSP}· 159 km SSW. A map shows the smoke’s path from the Long Lake fire to Moncton. If you see flames or smoke from a building or vehicle, call 911.`);
    expect(en.fileName).toBe("smoke-moncton-2025-08-25-en.png");
    const fr = shareImage(json(moncton), "fr", "Moncton");
    expect([fr.where, fr.fileName]).toEqual([`Moncton${NBSP}· 25 août 2025`, "fumee-moncton-2025-08-25-fr.png"]);
    expect(fr.alt).toContain("Une carte montre le trajet de la fumée depuis le feu de Long Lake jusqu’à Moncton.");
    expect(shareImage(json(bathurst), "en", "Bathurst").fileName).toBe("smoke-bathurst-2025-08-25-en.png");
  });
});
