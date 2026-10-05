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
const NEAR = { kind: "near", name: "NSCC Annapolis Valley Campus", address: "295 Commercial St., Middleton" } as const;
const noFires = { ...json(halifax), noFiresInRange: true, nearestFire: null, closestApproach: null } as VerdictJson;
// Low confidence because the wind shifted overnight, the three heights agreeing.
const unsteady = json({ ...miramichi, heights: { ...miramichi.heights, agree: true }, wind: { ...miramichi.wind, steady: false, biggestShift: null } });
const VERDICTS = [moncton, bridgetown, westDalhousie, miramichi, charlottetown, halifax, noFires, unsteady, { ...moncton, aqhi: null }].map(json);

/** Everything the app can say, in both languages, across screens and states. Gathered when a test asks for it: a
 *  screen with no script fails the tests that listen to everything, not every test in this file. */
const everythingSaid = () => LANGS.flatMap((lang) => [
  ...voice.checkVoice(lang, true, true), ...voice.checkVoice(lang, false, false), ...voice.q1Voice(lang), ...voice.q2Voice(lang), ...voice.q3Voice(lang),
  ...voice.nearbyFireVoice(lang), ...voice.locationVoice(lang),
  ...voice.onlineVoiceNotice(lang),
  ...voice.loadingVoice(lang), ...voice.emergencyVoice(lang), ...voice.howVoice(lang), ...voice.locationOffVoice(lang), ...voice.noDataVoice(lang),
  ...VERDICTS.flatMap((d) => verdictView(d, lang).voice),
  ...VERDICTS.flatMap((d) => verdictView(d, lang).card.voice),
  ...voice.leaveVoice(lang, { kind: "where" }),
  ...voice.leaveVoice(lang, NEAR),
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
    const everything = everythingSaid();
    expect(everything.filter((sentence) => /\b(911|811|211)\b/.test(sentence))).toEqual([]);
    const all = everything.join(" ");
    expect(["nine-one-one", "eight-one-one", "two-one-one", "neuf-un-un", "huit-un-un", "deux-un-un"].filter((word) => !all.includes(word))).toEqual([]);
  });

  test("no sentence ends with two punctuation marks (a button’s name is said without its own “?”)", () => {
    expect(everythingSaid().filter((s) => /[.?!…]\s*[.?!]$/.test(s))).toEqual([]);
  });

  test("never the word safe, never anything against calling 911, and no {placeholder} left unfilled", () => {
    const everything = everythingSaid();
    expect(everything.filter((s) => /safe|sécuri/i.test(s))).toEqual([]);
    // The wording src/i18n/strings.test.ts bans in every string.
    expect(everything.filter((s) => /(do not|don’t|never|no need to) call|ne (pas|jamais) appeler|n’appelez (pas|jamais)|9-1-1 for updates/i.test(s))).toEqual([]);
    expect(everything.filter((s) => /[{}]/.test(s))).toEqual([]);
  });

  test("a value never splits a sentence: an address with “St.”, a label with a question mark", () => {
    expect(voice.leaveVoice("en", NEAR)).toContain("Here’s where to go: the reception centre is NSCC Annapolis Valley Campus, at 295 Commercial St., Middleton.");
    expect(voice.emergencyVoice("en").at(-1)).toBe("If officials told you to leave, tap: Told to leave your home? What to do.");
    expect(voice.emergencyVoice("fr").at(-1)).toBe(`Si les autorités vous ont demandé de partir, touchez${NBSP}: On vous demande de partir${NBSP}? Que faire.`);
  });
});

describe("screens", () => {
  test("Check: no sentence about leaving home (that button is on Emergency and the near-fire notice)", () => {
    for (const lang of LANGS) {
      const text = voice.checkVoice(lang, true, true).join(" ");
      expect(text).not.toContain(translate(lang, "leave.entry"));
      expect(text).not.toMatch(lang === "en" ? /leave your home/ : /quitter votre maison/);
    }
  });

  test("Check: the app speaks as “I”; the replay line comes first, only in replay", () => {
    expect(voice.checkVoice("en", true, true)).toEqual([
      "Right now, I’m showing you a replay of August 25, 2025.",
      "Hi.",
      "I’m here to help you figure out where the smoke is coming from.",
      "A few quick questions first.",
      "If you smell smoke, tap the big blue button: I smell smoke.",
      "And if you ever see flames, call nine-one-one right away.",
      "To keep me on your phone, tap: Add to home screen.",
    ]);
    expect(voice.checkVoice("en", false, true)[0]).toBe("Hi.");
    expect(voice.checkVoice("fr", true, false)).toEqual([
      "En ce moment, je vous montre une reprise du 25 août 2025.",
      "Bonjour.",
      "Je suis là pour vous aider à savoir d’où vient la fumée.",
      "D’abord quelques questions rapides.",
      `Si vous sentez de la fumée, touchez le grand bouton bleu${NBSP}: Je sens de la fumée.`,
      "Et si vous voyez des flammes, appelez le neuf-un-un tout de suite.",
    ]);
  });

  test("Check ends with Add to home screen, naming the link as on screen; not when the link is hidden", () => {
    expect(voice.checkVoice("en", false, true).at(-1)).toBe("To keep me on your phone, tap: Add to home screen.");
    expect(voice.checkVoice("fr", true, true).at(-1)).toBe(`Pour me garder sur votre téléphone, touchez${NBSP}: Ajouter à l’écran d’accueil.`);
    for (const lang of LANGS) {
      for (const replay of [true, false]) {
        const hidden = voice.checkVoice(lang, replay, false);
        expect(hidden.at(-1)).toBe(voice.script(lang, "voice.check").at(-1)); // the 911 line
        expect(voice.checkVoice(lang, replay, true)).toEqual([...hidden, ...voice.script(lang, "voice.check.install", { add: translate(lang, "keep.add") })]);
      }
    }
  });

  test("Q1, flames: one sentence per utterance, the three answers named as on screen, in English and French", () => {
    expect(voice.q1Voice("en")).toEqual([
      "Let’s start.",
      "Take a look outside, toward the smell.",
      "Do you see flames?",
      "If you do, tap the red Yes button.",
      "If you don’t, tap No.",
      "If you can’t tell, tap Not sure.",
    ]);
    expect(voice.q1Voice("fr")).toEqual([
      "On commence.",
      "Regardez dehors, du côté de l’odeur.",
      `Voyez-vous des flammes${NBSP}?`,
      "Si oui, touchez le bouton rouge Oui.",
      "Sinon, touchez Non.",
      "Si vous ne pouvez pas le dire, touchez Je ne sais pas.",
    ]);
  });

  test("Q2, the sky: what each picture shows, then its caption as on screen; the third is for no smoke to see, or the dark", () => {
    expect(voice.q2Voice("en")).toEqual([
      "Now look at the sky.",
      "Which picture looks like your sky?",
      "The first picture is dark smoke rising from one spot: Rising column.",
      "The second is grey haze hanging everywhere: Grey haze.",
      "The third is for when you can’t see any smoke, or it’s dark out: I only smell it.",
      "If you can’t tell, tap Not sure.",
    ]);
    expect(voice.q2Voice("fr")).toEqual([
      "Maintenant, regardez le ciel.",
      `Quelle image ressemble à votre ciel${NBSP}?`,
      `La première image montre de la fumée sombre qui monte d’un seul endroit${NBSP}: Colonne de fumée.`,
      `La deuxième montre un voile de fumée grise partout${NBSP}: Voile de fumée.`,
      `La troisième, c’est quand vous ne voyez pas de fumée, ou qu’il fait noir${NBSP}: Je la sens seulement.`,
      "Si vous ne pouvez pas le dire, touchez Je ne sais pas.",
    ]);
  });

  test("Q3, nearby: the six answers in the order they are shown, each one its own utterance", () => {
    expect(voice.q3Voice("en")).toEqual([
      "Last question.",
      "Is anything burning nearby?",
      "Tap what you see.",
      "Neighbour’s fire pit or bonfire.",
      "Smouldering mulch or brush.",
      "People outside who could be in danger.",
      "Something else burning.",
      "If nothing is burning, tap Nothing.",
      "If you can’t tell, tap Not sure.",
    ]);
    expect(voice.q3Voice("fr")).toEqual([
      "Dernière question.",
      `Est-ce que quelque chose brûle près de vous${NBSP}?`,
      "Touchez ce que vous voyez.",
      "Foyer ou feu de camp d’un voisin.",
      "Paillis ou broussailles qui fument.",
      "Des gens dehors, peut-être en danger.",
      "Autre chose qui brûle.",
      "Si rien ne brûle, touchez Rien.",
      "Si vous ne pouvez pas le dire, touchez Je ne sais pas.",
    ]);
  });

  test("Nearby fire: it may explain the smell; out of control, or burning banned, the big red button calls nine-one-one; then the link on to the trace, named as on screen", () => {
    expect(voice.nearbyFireVoice("en")).toEqual([
      "Okay.",
      "A neighbour’s fire pit or bonfire may explain the smell.",
      "If it’s out of control, or if burning is banned right now, tap the big red button to call nine-one-one.",
      "To check the drifting smoke anyway, tap: Check the drifting smoke anyway.",
    ]);
    expect(voice.nearbyFireVoice("fr")).toEqual([
      "D’accord.",
      "Le foyer ou le feu de camp d’un voisin peut expliquer l’odeur.",
      "S’il est hors de contrôle, ou si les feux sont interdits en ce moment, touchez le grand bouton rouge pour appeler le neuf-un-un.",
      `Pour vérifier quand même la fumée qui dérive, touchez${NBSP}: Vérifier la fumée qui dérive.`,
    ]);
  });

  test("Location and Loading", () => {
    expect(voice.locationVoice("en")).toEqual([
      "Now, where are you?",
      "The easiest way is to tap the blue button, Use my location, and say yes when your phone asks.",
      "Or type your town in the box, and tap it in the list.",
    ]);
    expect(voice.locationVoice("fr")).toEqual([
      `Maintenant, où êtes-vous${NBSP}?`,
      "Le plus simple, c’est de toucher le bouton bleu, Utiliser ma position, puis de dire oui quand votre téléphone le demande.",
      "Ou tapez le nom de votre ville dans la case, et touchez-le dans la liste.",
    ]);
    expect(voice.loadingVoice("en")).toEqual(["Thanks.", "This usually takes a few seconds.", "I’m following the wind backward, hour by hour, to see where your air came from."]);
    expect(voice.loadingVoice("fr")).toEqual(["Merci.", "Cela prend habituellement quelques secondes.", "Je suis le vent à rebours, heure par heure, pour voir d’où vient votre air."]);
  });

  test("Loading while the engine wakes up: the same, then that it is waking and can take a few minutes", () => {
    expect(voice.loadingVoice("en", true)).toEqual([...voice.loadingVoice("en"), "The smoke engine is waking up.", "This can take a few minutes."]);
    expect(voice.loadingVoice("fr", true)).toEqual([...voice.loadingVoice("fr"), "Le moteur de fumée se réveille.", "Cela peut prendre quelques minutes."]);
    expect(voice.loadingVoice("en", false)).toEqual(voice.loadingVoice("en"));
  });

  test("Emergency: call nine-one-one now, whatever led here, the big white button, what to tell them, the location on screen, then told to leave, named as on screen", () => {
    expect(voice.emergencyVoice("en")).toEqual([
      "Okay.",
      "Let’s call nine-one-one now.",
      "Tap the big white button at the bottom.",
      "When they answer, tell them where you are, what you see, which way it’s moving if you can tell, and if anyone needs help.",
      "If the screen shows your location, you can read it to them.",
      "Stay on the line, and if the fire is close, move away while you talk.",
      "You’re doing the right thing.",
      "If officials told you to leave, tap: Told to leave your home? What to do.",
    ]);
    expect(voice.emergencyVoice("fr")).toEqual([
      "D’accord.",
      "Appelons le neuf-un-un maintenant.",
      "Touchez le grand bouton blanc, en bas.",
      "Quand on vous répond, dites où vous êtes, ce que vous voyez, dans quelle direction ça se déplace si vous pouvez le dire, et si quelqu’un a besoin d’aide.",
      "Si l’écran affiche votre position, vous pouvez la lire au répartiteur.",
      "Restez en ligne, et si le feu est proche, éloignez-vous pendant l’appel.",
      "Vous faites ce qu’il faut.",
      `Si les autorités vous ont demandé de partir, touchez${NBSP}: On vous demande de partir${NBSP}? Que faire.`,
    ]);
  });
});

describe("verdicts", () => {
  test("drifting (Moncton replay): the fire, how far and which way, from far away, how sure, then what to do and which button does it", () => {
    expect(verdictView(json(moncton), "en").voice).toEqual([
      "Okay, here’s what I found.",
      "The smoke you’re smelling is most likely drifting from the Long Lake fire, about 159 kilometres south-southwest of you.",
      "So it’s most likely smoke carried by the wind from far away.",
      "I’m not completely sure, because the air at different heights took different paths.",
      "Air quality right now: very high risk.",
      "Here’s the official advice: Reduce or reschedule strenuous activities outdoors, especially if you experience symptoms such as coughing and throat irritation.",
      "If the air inside gets uncomfortable, a library or community centre with filtered air can help.",
      "Tap: Find a library near me.",
      "If you feel unwell but it’s not an emergency, you can call eight-one-one to talk to a nurse.",
      "And if you ever see flames or a smoke column, tap the red button at the bottom to call nine-one-one.",
    ]);
  });

  test("and in French, with the French article: « vient probablement du feu de Long Lake »", () => {
    expect(verdictView(json(moncton), "fr").voice).toEqual([
      "Voici ce que j’ai trouvé.",
      "La fumée que vous sentez vient probablement du feu de Long Lake, à environ 159 kilomètres au sud-sud-ouest de vous.",
      "C’est donc très probablement de la fumée transportée par le vent, de loin.",
      "Ce n’est pas tout à fait certain, parce que l’air a pris des chemins différents selon la hauteur.",
      `Qualité de l’air en ce moment${NBSP}: risque très élevé.`,
      `Voici le conseil officiel${NBSP}: Réduisez ou réorganisez les activités exténuantes en plein air, particulièrement si vous éprouvez des symptômes comme la toux et une irritation de la gorge.`,
      "Si l’air devient inconfortable chez vous, une bibliothèque ou un centre communautaire à l’air filtré peut aider.",
      `Touchez${NBSP}: Trouver une bibliothèque près de moi.`,
      "Si vous vous sentez mal mais que ce n’est pas une urgence, vous pouvez appeler le huit-un-un pour parler à du personnel infirmier.",
      "Et si vous voyez des flammes ou une colonne de fumée, touchez le bouton rouge en bas pour appeler le neuf-un-un.",
    ]);
  });

  test("near the fire (Bridgetown): never “from far away”; the notice after how sure, naming its link as on screen", () => {
    expect(verdictView(json(bridgetown), "en").voice).toEqual([
      "Okay, here’s what I found.",
      "The smoke you’re smelling is most likely drifting from the Long Lake fire, about 17 kilometres south-southeast of you.",
      "I’m quite confident about this.",
      "The fire is close to you.",
      "Please follow official instructions.",
      "If you’ve been told to leave, tap: Told to leave your home? What to do.",
      "Air quality right now: low risk.",
      "Here’s the official advice: Ideal air quality for outdoor activities.",
      "If you feel unwell but it’s not an emergency, you can call eight-one-one to talk to a nurse.",
      "And if you ever see flames or a smoke column, tap the red button at the bottom to call nine-one-one.",
    ]);
    expect(verdictView(json(bridgetown), "fr").voice.slice(3, 6)).toEqual(["Le feu est près de vous.", "Suivez les consignes des autorités.", `Si on vous a demandé de partir, touchez${NBSP}: On vous demande de partir${NBSP}? Que faire.`]);
    expect(verdictView(json(moncton), "en").voice.join(" ")).not.toContain("The fire is close to you.");
  });

  test("how sure, on every verdict: high, medium, or low with its reason (the heights disagree, or the wind shifted)", () => {
    const levels = ["high", "medium", "low"].map((level) => `voice.verdict.confidence.${level}` as StringKey);
    const sure = (d: unknown, lang: "en" | "fr") => verdictView(json(d), lang).voice.find((s) => levels.some((key) => s.startsWith(voice.script(lang, key)[0].split("{")[0])));
    expect([bridgetown, halifax, miramichi, unsteady].map((d) => sure(d, "en"))).toEqual([
      "I’m quite confident about this.",
      "I’m fairly confident, but not completely.",
      "I’m not completely sure, because the air at different heights took different paths.",
      "I’m not completely sure, because the wind shifted overnight.",
    ]);
    expect([bridgetown, halifax, miramichi, unsteady].map((d) => sure(d, "fr"))).toEqual([
      "C’est assez certain.",
      "C’est assez probable, mais pas certain.",
      "Ce n’est pas tout à fait certain, parce que l’air a pris des chemins différents selon la hauteur.",
      "Ce n’est pas tout à fait certain, parce que le vent a changé pendant la nuit.",
    ]);
  });

  test("in this order: the answer, how sure, the notice, air quality, Health Canada, 811, then 911", () => {
    for (const lang of LANGS) {
      for (const d of VERDICTS) {
        const said = verdictView(d, lang).voice;
        // Where a script's first sentence is said (up to its first {value}); -1 when it isn't.
        const at = (...keys: StringKey[]) => Math.max(...keys.map((key) => said.findIndex((s) => s.startsWith(voice.script(lang, key)[0].split("{")[0]))));
        const sure = at("voice.verdict.confidence.high", "voice.verdict.confidence.medium", "voice.verdict.confidence.low");
        const air = at("voice.verdict.aq", "voice.verdict.aq.none");
        const order = [sure, at("voice.verdict.notice"), air, at("voice.verdict.break"), at("voice.verdict.nurse"), at("voice.verdict.call")].filter((i) => i >= 0);
        expect([sure > 0, air > 0], `${lang} ${d.location.name}`).toEqual([true, true]);
        expect(order, `${lang} ${d.location.name}`).toEqual([...order].sort((a, b) => a - b));
        expect(said.at(-2)).toBe(voice.script(lang, "voice.verdict.nurse")[0]);
        expect(said.at(-1)).toBe(voice.script(lang, "voice.verdict.call")[0]);
      }
    }
  });

  test("the Health Canada line only when its block is shown (Moncton, AQHI 10+), not at a low AQHI (Bridgetown)", () => {
    const says = (d: unknown) => verdictView(json(d), "en").voice.some((s) => s.includes("Find a library near me"));
    expect([says(moncton), says(bridgetown)]).toEqual([true, false]);
  });

  test("unclear (Miramichi): an unnamed fire with its article, and how far the air passed", () => {
    expect(verdictView(json(miramichi), "en").voice.slice(0, 4)).toEqual([
      "Okay, here’s what I found.",
      "It could be smoke drifting from a fire near Fontaine, but the air passed 42 kilometres from it, so I can’t be sure.",
      "It might also be something close by.",
      "Please take a look outside.",
    ]);
    expect(verdictView(json(miramichi), "fr").voice[1]).toBe("Ce pourrait être de la fumée qui vient d’un feu près de Fontaine, mais l’air est passé à 42 kilomètres de ce feu, alors ce n’est pas certain.");
  });

  test("unclear because the wind shifted: says so, rather than that the air wasn’t close enough", () => {
    const close = json({ ...miramichi, closestApproach: { ...miramichi.closestApproach, km: 12 } });
    expect(verdictView(close, "en").voice.slice(1, 3)).toEqual(["It could be smoke drifting from a fire near Fontaine.", "The air passed 12 kilometres from it, but the wind shifted, so I can’t be sure."]);
    expect(verdictView(close, "fr").voice.slice(1, 3)).toEqual(["Ce pourrait être de la fumée qui vient d’un feu près de Fontaine.", "L’air est passé à 12 kilomètres de ce feu, mais le vent a changé, alors ce n’est pas certain."]);
  });

  test("distances: one kilometre, and less than one kilometre with no direction; a fire that close is never “far away”", () => {
    const at = (km: number) => json({ ...westDalhousie, closestApproach: { ...westDalhousie.closestApproach, fire: { ...westDalhousie.closestApproach!.fire, km } } });
    expect(verdictView(at(1), "en").voice[1]).toBe("The smoke you’re smelling is most likely drifting from the Long Lake fire, about one kilometre southeast of you.");
    expect(verdictView(at(0), "en").voice[1]).toBe("The smoke you’re smelling is most likely drifting from the Long Lake fire, less than one kilometre from you.");
    expect(verdictView(at(0), "fr").voice[1]).toBe("La fumée que vous sentez vient probablement du feu de Long Lake, à moins d’un kilomètre de vous.");
    for (const km of [0, 1, 24]) expect(verdictView(at(km), "en").voice[2]).toBe("I’m quite confident about this.");
    expect(verdictView(at(25), "en").voice[2]).toBe("So it’s most likely smoke carried by the wind from far away.");
  });

  test("unexplained (Halifax) and no fires in range: the same answer; with no AQHI reading, where to find the official advice", () => {
    const answer = [
      "Okay, here’s what I found.",
      "I didn’t find a known fire where your air came from.",
      "That doesn’t mean there’s no fire.",
      "It could be something close by, like a new fire, a brush pile, or wood smoke.",
      "Please take a look outside.",
    ];
    expect([verdictView(json(halifax), "en").voice.slice(0, 5), verdictView(noFires, "en").voice.slice(0, 5)]).toEqual([answer, answer]);
    expect(verdictView(json(halifax), "fr").voice.slice(1, 3)).toEqual(["Je n’ai trouvé aucun feu connu là d’où vient votre air.", "Ça ne veut pas dire qu’il n’y a pas de feu."]);
    const none = verdictView({ ...json(moncton), aqhi: null }, "en").voice;
    expect(none.slice(4, 6)).toEqual(["I don’t have an air quality reading from the last two hours.", "For the official advice, tap: Check official air quality."]);
    expect(none.join(" ")).not.toContain("Air quality right now");
  });
});

describe("the leave screen", () => {
  test("near the event: where to go, register, directions, what to take, then tell family", () => {
    expect(voice.leaveVoice("en", NEAR)).toEqual([
      "I’m here to help you leave.",
      "Please leave right away when officials tell you to, and keep listening to emergency alerts and local radio.",
      "Here’s where to go: the reception centre is NSCC Annapolis Valley Campus, at 295 Commercial St., Middleton.",
      "When you get there, register first, so officials know you’re accounted for.",
      "Tap: Get directions, and your phone’s map will guide you.",
      "If you have time, take your medication, wallet and ID, keys, phone and charger, glasses, and your pets.",
      "Don’t delay for anything else.",
      "Once you’re on your way, tap: Tell family you’re OK, and I’ll help you send them a message with your location.",
    ]);
    expect(voice.leaveVoice("fr", NEAR)).toEqual([
      "Je suis là pour vous aider à partir.",
      "Partez tout de suite quand les autorités vous le demandent, et continuez d’écouter les alertes d’urgence et la radio locale.",
      `Voici où aller${NBSP}: le centre d’accueil est NSCC Annapolis Valley Campus, au 295 Commercial St., Middleton.`,
      "En arrivant, inscrivez-vous d’abord, pour que les autorités sachent où vous êtes.",
      `Touchez${NBSP}: Itinéraire, et la carte de votre téléphone vous guidera.`,
      "Si vous avez le temps, prenez vos médicaments, votre portefeuille et vos pièces d’identité, vos clés, votre téléphone et son chargeur, vos lunettes, et vos animaux.",
      "Ne tardez pas pour le reste.",
      `Une fois en route, touchez${NBSP}: Dites à vos proches que vous allez bien, et je vous aide à leur envoyer un message avec votre position.`,
    ]);
  });

  test("far: doesn’t apply, the links and 211 only when shown; French elides “de” (d’Edmundston)", () => {
    const far = { kind: "far", fire: "Long Lake", km: 159, town: "Moncton", ofTown: "de Moncton", links: true, call211: true } as const;
    expect(voice.leaveVoice("en", far)).toEqual([
      "This evacuation was for people near the Long Lake fire, 159 kilometres from Moncton, so it doesn’t apply to you.",
      "If officials ever ask you to leave, they’ll announce where to go on the links below.",
      "You can also call two-one-one for help.",
    ]);
    // P.E.I.: no provincial page, so no links sentence.
    expect(voice.leaveVoice("en", { ...far, town: "Charlottetown", links: false })).not.toContain("If officials ever ask you to leave, they’ll announce where to go on the links below.");
    expect(voice.leaveVoice("en", { ...far, call211: false }).join(" ")).not.toContain("two-one-one");
    expect(voice.leaveVoice("fr", { ...far, town: "Edmundston", ofTown: "d’Edmundston" })).toEqual([
      "Cette évacuation visait les personnes près du feu de Long Lake, à 159 kilomètres d’Edmundston, alors elle ne s’applique pas à vous.",
      "Si les autorités vous demandent un jour de partir, elles annonceront où aller dans les liens ci-dessous.",
      "Vous pouvez aussi appeler le deux-un-un pour de l’aide.",
    ]);
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

describe("the voice", () => {
  const v = (name: string, lang: string, isDefault = false) => ({ name, lang, default: isDefault });

  test("English: the most natural voice first, whatever the locale, then en-CA; ties to the device's default", () => {
    const linda = v("Microsoft Linda - English (Canada)", "en-CA");
    // A natural voice beats a plain Canadian one…
    expect(voice.pickVoice([linda, v("Google US English", "en-US")], "en")?.name).toBe("Google US English");
    expect(voice.pickVoice([linda, v("Samantha (Enhanced)", "en_US")], "en")?.name).toBe("Samantha (Enhanced)");
    // …a natural Canadian voice beats a natural one elsewhere…
    expect(voice.pickVoice([v("Google US English", "en-US"), v("Microsoft Clara Online (Natural) - English (Canada)", "en-CA")], "en")?.name).toBe("Microsoft Clara Online (Natural) - English (Canada)");
    // …and with no natural voice, en-CA comes first, then the device's default.
    expect(voice.pickVoice([v("Daniel", "en-GB", true), linda], "en")?.name).toBe("Microsoft Linda - English (Canada)");
    expect(voice.pickVoice([v("Karen", "en-AU"), v("Daniel", "en-GB", true)], "en")?.name).toBe("Daniel");
  });

  test("French: a natural fr-CA voice first, then any fr-CA, then a natural French one", () => {
    const amelie = v("Amélie", "fr-CA");
    const google = v("Google français", "fr-FR");
    expect(voice.pickVoice([google, amelie, v("Amélie (Enhanced)", "fr-CA")], "fr")?.name).toBe("Amélie (Enhanced)");
    expect(voice.pickVoice([google, amelie], "fr")?.name).toBe("Amélie"); // any fr-CA before a natural fr-FR
    expect(voice.pickVoice([v("Thomas", "fr_FR", true), google], "fr")?.name).toBe("Google français");
    expect(voice.pickVoice([v("Thomas", "fr_FR")], "fr")?.name).toBe("Thomas");
  });

  test("never a novelty voice, and nothing when the language has no voice", () => {
    expect(voice.pickVoice([v("Albert", "en-US"), v("Zarvox", "en-US")], "en")).toBeNull();
    expect(voice.pickVoice([v("Google US English", "en-US")], "fr")).toBeNull();
  });
});

// Some of a browser's voices are voice services: the words go to a server to be spoken. A voice that works on the
// device itself comes first, on every screen; a service is used only when the language has nothing else, and Listen
// then says so, once.
describe("the voice: on the device first", () => {
  const device = (name: string, lang: string, isDefault = false) => ({ name, lang, default: isDefault, localService: true });
  const service = (name: string, lang: string) => ({ name, lang, default: false, localService: false });
  const plain = (name: string, lang: string) => ({ name, lang, default: false }); // says nothing of where it works
  const david = device("Microsoft David - English (United States)", "en-US");
  const googleUs = service("Google US English", "en-US");
  const clara = service("Microsoft Clara Online (Natural) - English (Canada)", "en-CA");
  const named = (plan: ReturnType<typeof voice.voiceFor>) => plan && { voice: plan.voice?.name ?? null, online: plan.online };

  test("a voice that works on the device comes first, however natural or Canadian a voice service is", () => {
    expect(named(voice.voiceFor([googleUs, david], "en"))).toEqual({ voice: david.name, online: false });
    expect(named(voice.voiceFor([clara, david], "en"))).toEqual({ voice: david.name, online: false });
    expect(named(voice.voiceFor([service("Microsoft Sylvie Online (Natural) - French (Canada)", "fr-CA"), device("Thomas", "fr_FR")], "fr"))).toEqual({ voice: "Thomas", online: false });
    expect(named(voice.voiceFor([service("Google français", "fr-FR"), device("Amélie", "fr-CA")], "fr"))).toEqual({ voice: "Amélie", online: false });
  });

  test("among the device’s own voices, the order is the same as before: natural first in English, Canadian first in French", () => {
    expect(named(voice.voiceFor([device("Microsoft Linda - English (Canada)", "en-CA"), device("Samantha (Enhanced)", "en_US"), googleUs], "en"))?.voice).toBe("Samantha (Enhanced)");
    expect(named(voice.voiceFor([device("Thomas", "fr_FR"), device("Amélie", "fr-CA"), service("Microsoft Sylvie Online (Natural) - French (Canada)", "fr-CA")], "fr"))?.voice).toBe("Amélie");
  });

  test("only voice services for the language: the best of them, and it is known to be online", () => {
    expect(named(voice.voiceFor([googleUs, clara], "en"))).toEqual({ voice: clara.name, online: true });
    // English has a voice on the device; French has only a service: French is online.
    expect(named(voice.voiceFor([david, service("Google français", "fr-FR")], "fr"))).toEqual({ voice: "Google français", online: true });
  });

  test("a voice that does not say where it works is neither the device’s own nor called online", () => {
    const linda = plain("Microsoft Linda - English (Canada)", "en-CA");
    expect(named(voice.voiceFor([linda], "en"))).toEqual({ voice: linda.name, online: false });
    expect(named(voice.voiceFor([linda, david], "en"))).toEqual({ voice: david.name, online: false });
  });

  test("no voice listed for the language: the browser’s own choice, and nothing is claimed about it", () => {
    expect(voice.voiceFor([], "en")).toEqual({ voice: null, online: false });
    expect(voice.voiceFor([david], "fr")).toEqual({ voice: null, online: false });
  });

  test("a novelty voice is never the device’s voice", () => {
    expect(named(voice.voiceFor([device("Albert", "en-US"), googleUs], "en"))).toEqual({ voice: googleUs.name, online: true });
  });

  test("a button that reads only on the device: the device’s voice, or nothing at all", () => {
    expect(named(voice.voiceFor([david, googleUs], "en", true))).toEqual({ voice: david.name, online: false });
    for (const voices of [[googleUs], [plain("Microsoft Linda - English (Canada)", "en-CA")], [], [device("Albert", "en-US")]]) {
      expect(voice.voiceFor(voices, "en", true)).toBeNull();
    }
  });

  test("only on the device, in French too, and never with the other language’s voice", () => {
    const [amelie, googleFr] = [device("Amélie", "fr-CA"), service("Google français", "fr-FR")];
    expect(named(voice.voiceFor([amelie, googleFr], "fr", true))).toEqual({ voice: "Amélie", online: false });
    expect(voice.voiceFor([david, googleFr], "fr", true)).toBeNull();
    expect(voice.voiceFor([amelie], "en", true)).toBeNull();
    expect(named(voice.voiceFor([clara, david], "en", true))).toEqual({ voice: david.name, online: false });
  });

  // A button that is off when it has no voice on the device must know which it is before it is tapped. A browser
  // may list no voice at all for its first moments: that is "not known yet", not "none".
  test("whether the language has a voice on the device: found, none, or not known yet", () => {
    const amelie = device("Amélie", "fr-CA");
    expect([voice.deviceVoice([david, googleUs], "en", false), voice.deviceVoice([googleUs, david], "en", true)]).toEqual(["found", "found"]);
    // Voices are listed, and none of this language works on the device: a service, one that does not say, a novelty
    // voice, the other language's.
    for (const voices of [[googleUs], [clara], [plain("Microsoft Linda - English (Canada)", "en-CA")], [device("Albert", "en-US")], [amelie]]) {
      expect([voice.deviceVoice(voices, "en", false), voice.deviceVoice(voices, "en", true)]).toEqual(["none", "none"]);
    }
    expect([voice.deviceVoice([david], "fr", false), voice.deviceVoice([david, amelie], "fr", false)]).toEqual(["none", "found"]);
    // No voice listed: not known until the browser has said its list is whole (or was given the time to).
    expect([voice.deviceVoice([], "en", false), voice.deviceVoice([], "en", true)]).toEqual(["unknown", "none"]);
  });

  test("“found” is exactly when a tap would be read: the two never disagree", () => {
    const amelie = device("Amélie", "fr-CA");
    for (const voices of [[], [david], [googleUs], [clara, david], [amelie], [device("Albert", "en-US")], [plain("Linda", "en-CA")], [amelie, david, googleUs]]) {
      for (const lang of ["en", "fr"] as const) {
        for (const listed of [false, true]) expect(voice.deviceVoice(voices, lang, listed) === "found").toBe(voice.voiceFor(voices, lang, true) !== null);
      }
    }
  });

  test("what Listen says first when the voice is a service: one sentence, in English and French", () => {
    expect(voice.onlineVoiceNotice("en")).toEqual(["This voice works over the internet, so what I read is sent to a voice service."]);
    expect(voice.onlineVoiceNotice("fr")).toEqual(["Cette voix fonctionne par Internet, alors ce que je lis est envoyé à un service vocal."]);
  });
});
