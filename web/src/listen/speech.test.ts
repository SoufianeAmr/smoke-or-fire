// "Listen", the guided voice: the voice.* scripts, split into sentences and filled from the screen.
import { describe, expect, test } from "vitest";
import bridgetown from "../../../data/demo/bridgetown.json";
import charlottetown from "../../../data/demo/charlottetown.json";
import halifax from "../../../data/demo/halifax.json";
import miramichi from "../../../data/demo/miramichi.json";
import moncton from "../../../data/demo/moncton.json";
import westDalhousie from "../../../data/demo/west-dalhousie.json";
import en from "../i18n/en.json";
import fr from "../i18n/fr.json";
import { translate, type StringKey } from "../i18n";
import type { VerdictJson } from "../verdict/types";
import { verdictView } from "../verdict/view";
import * as voice from "./speech";

const json = (data: unknown) => data as VerdictJson;
const NBSP = String.fromCharCode(0xa0);
const LANGS = ["en", "fr"] as const;
const VOICE_KEYS = Object.keys(en).filter((key) => key.startsWith("voice.")) as StringKey[];
const TAKE = {
  en: ["Medication", "Wallet and ID", "Keys", "Phone and charger", "Glasses and hearing aids", "Pets"],
  fr: ["Médicaments", "Portefeuille et pièces d’identité", "Clés", "Téléphone et chargeur", "Lunettes et appareils auditifs", "Animaux de compagnie"],
};
const noFires = { ...json(halifax), noFiresInRange: true, nearestFire: null, closestApproach: null } as VerdictJson;

/** Everything the app can say, in both languages, across screens and states. */
const everything = LANGS.flatMap((lang) => [
  ...voice.checkVoice(lang, true), ...voice.checkVoice(lang, false), ...voice.q1Voice(lang), ...voice.q2Voice(lang), ...voice.locationVoice(lang),
  ...voice.loadingVoice(lang), ...voice.emergencyVoice(lang), ...voice.howVoice(lang), ...voice.locationOffVoice(lang), ...voice.noDataVoice(lang),
  ...[moncton, bridgetown, westDalhousie, miramichi, charlottetown, halifax, noFires, { ...moncton, aqhi: null }].flatMap((d) => verdictView(json(d), lang).voice),
  ...voice.leaveVoice(lang, { kind: "where" }),
  ...voice.leaveVoice(lang, { kind: "near", name: "NSCC Annapolis Valley Campus", address: "295 Commercial St., Middleton", take: TAKE[lang] }),
  ...voice.leaveVoice(lang, { kind: "far", fire: "Long Lake", km: 159, town: "Moncton", ofTown: "de Moncton", links: true, call211: true }),
  ...voice.leaveVoice(lang, { kind: "none", links: true, call211: true }),
]);

describe("the scripts", () => {
  test("every voice.* script has English and French, and splitting into sentences keeps every word", () => {
    for (const lang of LANGS) {
      for (const key of VOICE_KEYS) expect(voice.script(lang, key).join(" "), `${lang} ${key}`).toBe(translate(lang, key));
    }
    expect(VOICE_KEYS.filter((key) => !(key in fr))).toEqual([]);
  });

  test("phone numbers are spelled out, so voices say them digit by digit", () => {
    expect(everything.filter((sentence) => /\b(911|811|211)\b/.test(sentence))).toEqual([]);
    const all = everything.join(" ");
    expect(["nine-one-one", "eight-one-one", "two-one-one", "neuf-un-un", "huit-un-un", "deux-un-un"].filter((word) => !all.includes(word))).toEqual([]);
  });

  test("never the word safe, never anything against calling 911, and no {placeholder} left unfilled", () => {
    expect(everything.filter((s) => /safe|sécuri/i.test(s))).toEqual([]);
    // The wording src/i18n/strings.test.ts bans in every string.
    expect(everything.filter((s) => /(do not|don’t|never|no need to) call|ne (pas|jamais) appeler|n’appelez (pas|jamais)|9-1-1 for updates/i.test(s))).toEqual([]);
    expect(everything.filter((s) => /[{}]/.test(s))).toEqual([]);
  });

  test("a value never splits a sentence: an address with “St.”, a label with a question mark", () => {
    const near = voice.leaveVoice("en", { kind: "near", name: "NSCC Annapolis Valley Campus", address: "295 Commercial St., Middleton", take: TAKE.en });
    expect(near).toContain("The reception centre is NSCC Annapolis Valley Campus, 295 Commercial St., Middleton.");
    expect(voice.checkVoice("en", false)).toContain("If officials told you to leave your home, tap the button further down that says: Told to leave your home? What to do.");
    expect(voice.checkVoice("fr", false)).toContain(`Si les autorités vous ont demandé de quitter votre maison, touchez le bouton plus bas${NBSP}: On vous demande de partir${NBSP}? Que faire.`);
  });
});

describe("screens", () => {
  test("Check: the replay line comes first, only in replay", () => {
    expect(voice.checkVoice("en", true).slice(0, 3)).toEqual(["Right now, the app is showing a replay of August 25, 2025.", "Hello.", "This app tells you, in about a minute, if the smoke you smell comes from a known fire."]);
    expect(voice.checkVoice("en", false)[0]).toBe("Hello.");
    expect(voice.checkVoice("fr", true)[0]).toBe("En ce moment, l’application montre une reprise du 25 août 2025.");
  });

  test("Q1, one sentence per utterance, in English and French", () => {
    expect(voice.q1Voice("en")).toEqual([
      "First question.",
      "Look outside, toward the smell.",
      "Do you see flames?",
      "If you do, tap the red button at the top: Yes, I see flames.",
      "If you don’t, tap the white button just below it: No.",
    ]);
    expect(voice.q1Voice("fr")).toEqual([
      "Première question.",
      "Regardez dehors, du côté de l’odeur.",
      `Voyez-vous des flammes${NBSP}?`,
      `Si oui, touchez le bouton rouge en haut${NBSP}: Oui, je vois des flammes.`,
      `Sinon, touchez le bouton blanc juste en dessous${NBSP}: Non.`,
    ]);
  });

  test("Emergency starts with Call nine-one-one now, and ends with moving away while you talk", () => {
    const [first, ...rest] = voice.emergencyVoice("en");
    expect([first, rest[1], rest[rest.length - 1]]).toEqual(["Call nine-one-one now.", "Tap the big white Call nine-one-one button at the bottom.", "If the fire is close to you, move away while you talk."]);
    expect(voice.emergencyVoice("fr")[0]).toBe("Appelez le neuf-un-un maintenant.");
  });
});

describe("verdicts", () => {
  test("drifting (Moncton replay): the fire, how far and which way, the confidence, then what to do and which button does it", () => {
    expect(verdictView(json(moncton), "en").voice).toEqual([
      "Here’s the answer.",
      "The smoke you smell most likely comes from the Long Lake fire, about 159 kilometres south-southwest of you.",
      "Our confidence is low.",
      "We traced the air at three heights above the ground, and they don’t agree.",
      "What to do: Reduce or reschedule strenuous activities outdoors, especially if you experience symptoms such as coughing and throat irritation.",
      "If you can’t keep the air clean at home, tap: Find a library near me, to see places with filtered air.",
      "If you feel unwell but it’s not an emergency, tap the eight-one-one line to talk to a nurse.",
      "And if you see flames, a smoke column, or dark smoke, tap the red Call nine-one-one button at the bottom of the screen.",
      "For the details, open: Why we think this.",
    ]);
  });

  test("and in French, with the French article: « vient probablement du feu de Long Lake »", () => {
    const fr = verdictView(json(moncton), "fr").voice;
    expect(fr.slice(0, 3)).toEqual(["Voici la réponse.", "La fumée que vous sentez vient probablement du feu de Long Lake, à environ 159 kilomètres au sud-sud-ouest de vous.", "Notre confiance est faible."]);
    expect(fr[fr.length - 1]).toBe(`Pour les détails, ouvrez${NBSP}: Pourquoi nous le pensons.`);
  });

  test("near the fire (Bridgetown): the notice, naming its link as on screen", () => {
    const view = verdictView(json(bridgetown), "en");
    expect(view.voice.slice(4, 7)).toEqual(["The fire is close to you.", "Follow official instructions.", "If you were told to leave, tap: Told to leave your home? What to do."]);
    expect(verdictView(json(moncton), "en").voice.join(" ")).not.toContain("The fire is close to you.");
  });

  test("the Health Canada line only when its block is shown (Moncton, AQHI 10+), not at a low AQHI (Bridgetown)", () => {
    const says = (d: unknown) => verdictView(json(d), "en").voice.some((s) => s.includes("Find a library near me"));
    expect([says(moncton), says(bridgetown)]).toEqual([true, false]);
  });

  test("unclear (Miramichi): an unnamed fire with its article, and how far the air passed", () => {
    expect(verdictView(json(miramichi), "en").voice.slice(0, 4)).toEqual([
      "Here’s the answer.",
      "It could be drifting smoke from a fire near Fontaine, or something new.",
      "The air passed 42 kilometres from it, which isn’t close enough to be sure.",
      "Please look outside.",
    ]);
    expect(verdictView(json(miramichi), "fr").voice[1]).toBe("Ce pourrait être de la fumée qui dérive d’un feu près de Fontaine, ou quelque chose de nouveau.");
  });

  test("unclear because the wind shifted: says so, rather than that the air wasn’t close enough", () => {
    const close = json({ ...miramichi, closestApproach: { ...miramichi.closestApproach, km: 12 } });
    expect(verdictView(close, "en").voice[2]).toBe("The air passed 12 kilometres from it, but the wind shifted, so we can’t be sure.");
    expect(verdictView(close, "fr").voice[2]).toBe("L’air est passé à 12 kilomètres de ce feu, mais le vent a changé, donc nous ne pouvons pas en être certains.");
  });

  test("distances: one kilometre, and less than one kilometre with no direction", () => {
    const at = (km: number) => json({ ...westDalhousie, closestApproach: { ...westDalhousie.closestApproach, fire: { ...westDalhousie.closestApproach!.fire, km } } });
    expect(verdictView(at(1), "en").voice[1]).toBe("The smoke you smell most likely comes from the Long Lake fire, about one kilometre southeast of you.");
    expect(verdictView(at(0), "en").voice[1]).toBe("The smoke you smell most likely comes from the Long Lake fire, less than one kilometre from you.");
    expect(verdictView(at(0), "fr").voice[1]).toBe("La fumée que vous sentez vient probablement du feu de Long Lake, à moins d’un kilomètre de vous.");
  });

  test("unexplained (Halifax) and no fires in range: the same answer; with no AQHI reading, What to do says so", () => {
    const answer = ["Here’s the answer.", "We didn’t find a known fire where your air came from.", "The smoke may come from something close by, like a new fire, a brush pile, or wood smoke.", "Please look outside."];
    expect([verdictView(json(halifax), "en").voice.slice(0, 4), verdictView(noFires, "en").voice.slice(0, 4)]).toEqual([answer, answer]);
    expect(verdictView({ ...json(moncton), aqhi: null }, "en").voice).toContain("What to do: No air quality reading from the last 2 hours.");
  });
});

describe("the leave screen", () => {
  test("near the event: leave, register, the reception centre, directions, the grab list, then tell family", () => {
    expect(voice.leaveVoice("en", { kind: "near", name: "NSCC Annapolis Valley Campus", address: "295 Commercial St., Middleton", take: TAKE.en })).toEqual([
      "If you’re told to leave, leave right away.",
      "Follow emergency alerts and local radio.",
      "First, register, at the centre or online.",
      "That’s how officials know you’re accounted for.",
      "The reception centre is NSCC Annapolis Valley Campus, 295 Commercial St., Middleton.",
      "Tap: Get directions, and your phone’s map will guide you.",
      "If you have time, take: medication, wallet and ID, keys, phone and charger, glasses and hearing aids, and pets.",
      "Do not delay for non-essential items.",
      "When you’re on your way, tap: Tell family you’re OK, to send them a message.",
    ]);
    expect(voice.leaveVoice("fr", { kind: "near", name: "NSCC", address: "295 Commercial St., Middleton", take: TAKE.fr })[6]).toBe(
      `Si vous avez le temps, prenez${NBSP}: médicaments, portefeuille et pièces d’identité, clés, téléphone et chargeur, lunettes et appareils auditifs et animaux de compagnie.`,
    );
  });

  test("far: doesn’t apply, the links and 211 only when shown; French elides “de” (d’Edmundston)", () => {
    const far = { kind: "far", fire: "Long Lake", km: 159, town: "Moncton", ofTown: "de Moncton", links: true, call211: true } as const;
    expect(voice.leaveVoice("en", far)).toEqual([
      "This evacuation was for people near the Long Lake fire, 159 kilometres from Moncton.",
      "It doesn’t apply to you.",
      "For your area, officials announce where to go on the links below.",
      "You can also call two-one-one for shelters and help.",
    ]);
    // P.E.I.: no provincial page, so no links sentence.
    expect(voice.leaveVoice("en", { ...far, town: "Charlottetown", links: false })).not.toContain("For your area, officials announce where to go on the links below.");
    expect(voice.leaveVoice("en", { ...far, call211: false }).join(" ")).not.toContain("two-one-one");
    expect(voice.leaveVoice("fr", { ...far, town: "Edmundston", ofTown: "d’Edmundston" })[0]).toBe("Cette évacuation visait les personnes près du feu de Long Lake, à 159 kilomètres d’Edmundston.");
  });

  test("no place yet, and no event (live)", () => {
    expect(voice.leaveVoice("en", { kind: "where" })).toEqual(["If officials told you to leave your home, first tell us where you are.", "Tap: Use my location, or type your town."]);
    expect(voice.leaveVoice("en", { kind: "none", links: true, call211: true })).toEqual([
      "If you’re told to leave, leave right away.",
      "Follow emergency alerts and local radio.",
      "For a fire happening now, officials announce where to go on the links below.",
      "You can also call two-one-one for shelters and help.",
    ]);
  });
});

test("the voice: Canadian first, then any in the language; within those a natural voice, then the device's default; never a novelty voice", () => {
  const v = (name: string, lang: string, isDefault = false) => ({ name, lang, default: isDefault });
  const voices = [v("Albert", "en-US"), v("Google US English", "en-US"), v("Microsoft Linda - English (Canada)", "en-CA"), v("Google English (Canada) Natural", "en-CA"), v("Thomas", "fr_FR", true), v("Amélie", "fr-CA")];
  expect(voice.pickVoice(voices, "en")?.name).toBe("Google English (Canada) Natural");
  expect(voice.pickVoice(voices.filter((x) => !x.name.includes("Natural")), "en")?.name).toBe("Microsoft Linda - English (Canada)");
  expect(voice.pickVoice([v("Albert", "en-US"), v("Samantha", "en-US"), v("Samantha (Enhanced)", "en-US")], "en")?.name).toBe("Samantha (Enhanced)");
  expect(voice.pickVoice([v("Albert", "en-US"), v("Daniel", "en-GB", true), v("Karen", "en-AU")], "en")?.name).toBe("Daniel");
  expect(voice.pickVoice([v("Albert", "en-US"), v("Zarvox", "en-US")], "en")).toBeNull();
  expect(voice.pickVoice(voices, "fr")?.name).toBe("Amélie");
  expect(voice.pickVoice([v("Thomas", "fr_FR"), v("Google français", "fr-FR")], "fr")?.name).toBe("Google français");
});
