// What "Listen" reads: only strings already on screen, in the app's language.
import { describe, expect, test } from "vitest";
import halifax from "../../../data/demo/halifax.json";
import miramichi from "../../../data/demo/miramichi.json";
import moncton from "../../../data/demo/moncton.json";
import type { VerdictJson } from "../verdict/types";
import { verdictView } from "../verdict/view";
import { afterColon, call911Speech, emergencySpeech, pickVoice, q1Speech, sentence, sentenceCase, verdictSpeech } from "./speech";

const json = (data: unknown) => data as VerdictJson;
const NBSP = String.fromCharCode(0xa0);

describe("Q1", () => {
  test("the question, then each answer, in English", () => {
    expect(q1Speech("en")).toEqual(["Do you see flames?", "Yes: I see flames.", "No: no flames in sight."]);
  });
  test("and in French", () => {
    expect(q1Speech("fr")).toEqual([`Voyez-vous des flammes${NBSP}?`, `Oui${NBSP}: je vois des flammes.`, `Non${NBSP}: aucune flamme en vue.`]);
  });
});

describe("Verdict", () => {
  test("Moncton replay (7a): label, headline, subline, confidence, the first What to do line, then the 911 bar", () => {
    expect(verdictSpeech(verdictView(json(moncton), "en"), "en")).toEqual([
      "Drifting smoke.",
      "Likely from the Long Lake fire.",
      "Smoke drifting from Nova Scotia, about 159 km south-southwest of you.",
      "We traced the air at three heights above the ground, and they don’t agree.",
      "Reduce or reschedule strenuous activities outdoors, especially if you experience symptoms such as coughing and throat irritation.",
      "Call 911 if you see: flames, smoke column, or dark smoke.",
    ]);
  });

  test("and in French", () => {
    expect(verdictSpeech(verdictView(json(moncton), "fr"), "fr")).toEqual([
      "Fumée qui dérive.",
      "Elle vient probablement du feu de Long Lake.",
      "Fumée venue de la Nouvelle-Écosse, à environ 159 km au sud-sud-ouest de chez vous.",
      "Nous avons retracé l’air à trois hauteurs au-dessus du sol, et elles ne concordent pas.",
      "Réduisez ou réorganisez les activités exténuantes en plein air, particulièrement si vous éprouvez des symptômes comme la toux et une irritation de la gorge.",
      `Appelez le 911 si${NBSP}: flammes, panache ou fumée noire.`,
    ]);
  });

  test("reads each screen's own strings: the unexplained (Halifax) and unclear (Miramichi) screens, and no AQHI reading", () => {
    for (const data of [halifax, miramichi, { ...moncton, aqhi: null }]) {
      for (const lang of ["en", "fr"] as const) {
        const view = verdictView(json(data), lang);
        const shown = [view.band.label, view.band.headline, view.band.sub, view.confidence.text, view.todo.general];
        const read = verdictSpeech(view, lang);
        // Each part is the string on screen, ending as a sentence; the label is read in sentence case, not in capitals.
        expect(read.slice(0, 5)).toEqual(shown.map((text, i) => sentence(i === 0 ? sentenceCase(text, lang) : text)));
        expect(read[5]).toBe(call911Speech(lang));
      }
    }
    expect(verdictSpeech(verdictView({ ...json(moncton), aqhi: null }, "en"), "en")[4]).toBe("No air quality reading from the last 2 hours.");
  });
});

describe("Emergency", () => {
  test("Call 911 now, the subline, then Tell the dispatcher and its four items, in English", () => {
    expect(emergencySpeech("en")).toEqual([
      "Call 911 now.",
      "Flames or a smoke column can mean a fire near you.",
      "Tell the dispatcher:",
      "Where you are: address or nearest road and town.",
      "What you see: flames, a smoke column, or dark smoke.",
      "Which way it’s moving, if you can tell.",
      "If anyone is in danger or needs help.",
    ]);
  });
  test("and in French", () => {
    expect(emergencySpeech("fr")).toEqual([
      "Appelez le 911 maintenant.",
      "Des flammes ou une colonne de fumée peuvent signaler un feu près de vous.",
      `Dites au répartiteur${NBSP}:`,
      `Où vous êtes${NBSP}: adresse, ou route et ville les plus proches.`,
      `Ce que vous voyez${NBSP}: des flammes, une colonne de fumée ou de la fumée noire.`,
      "Dans quelle direction ça se déplace, si vous pouvez le dire.",
      "Si quelqu’un est en danger ou a besoin d’aide.",
    ]);
  });
});

// The leave screen's reading is checked the same way in the browser tests (e2e/listen.spec.ts).
test("never the word safe, and never anything against calling 911, in what Q1, Emergency and the verdicts read", () => {
  const all = (["en", "fr"] as const).flatMap((lang) => [
    ...q1Speech(lang),
    ...emergencySpeech(lang),
    ...[moncton, halifax, miramichi].flatMap((data) => verdictSpeech(verdictView(json(data), lang), lang)),
  ]);
  expect(all.filter((text) => /safe|sécuri/i.test(text))).toEqual([]);
  // The same wording strings.test.ts bans in every string.
  expect(all.filter((text) => /(do not|don’t|never|no need to) call|ne (pas|jamais) appeler|n’appelez (pas|jamais)|9-1-1 for updates/i.test(text))).toEqual([]);
});

test("helpers: a sentence ends with punctuation; after a colon, a word starts in lower case but I stays", () => {
  expect([sentence("Keys"), sentence("Where are you?"), afterColon("No flames in sight", "en"), afterColon("I see flames", "en"), sentenceCase("FUMÉE QUI DÉRIVE", "fr")]).toEqual([
    "Keys.",
    "Where are you?",
    "no flames in sight",
    "I see flames",
    "Fumée qui dérive",
  ]);
});

test("the voice: Canadian English or French if the device has one, else any voice in the language, else none", () => {
  const voices = [{ lang: "en-US" }, { lang: "fr_FR" }, { lang: "en-CA" }, { lang: "de-DE" }];
  expect([pickVoice(voices, "en"), pickVoice(voices, "fr"), pickVoice([{ lang: "fr-CA" }], "fr"), pickVoice([{ lang: "de-DE" }], "fr")]).toEqual([
    { lang: "en-CA" },
    { lang: "fr_FR" },
    { lang: "fr-CA" },
    null,
  ]);
});
