// "Listen", the guided voice: what each screen says aloud. The scripts are the voice.* strings (spoken, separate from
// the on-screen text); their {…} values come from the screen. Pure: no React, no DOM.
import { translate, type Lang, type StringKey, type Vars } from "../i18n";

/** The voice's language: Canadian English or French. */
export const LOCALE: Record<Lang, string> = { en: "en-CA", fr: "fr-CA" };

// Voices that sound like a person: the good ones say so in their names.
const NATURAL = /enhanced|premium|natural|neural|google/i;
// macOS novelty voices, never used to read a warning.
const NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|junior|organ|pipe organ|ralph|superstar|trinoids|whisper|wobble|zarvox)\b/i;

/** `localService`: true for a voice that works on the device, false for a voice service (the words go to a server). */
type Voice = { lang: string; name: string; default?: boolean; localService?: boolean };

/**
 * The installed voice to use. A natural voice is one whose name says so ("Enhanced", "Premium", "Natural", "Neural",
 * "Google"). English: the most natural first, whatever the locale, then en-CA. French: a natural fr-CA voice first,
 * then any fr-CA, then a natural French one. Ties go to the device's default voice.
 */
export function pickVoice<V extends Voice>(voices: V[], lang: Lang): V | null {
  const tag = (v: V) => v.lang.replace("_", "-").toLowerCase();
  const natural = (v: V) => NATURAL.test(v.name);
  const canadian = (v: V) => tag(v) === LOCALE[lang].toLowerCase();
  const rank = (v: V) =>
    (lang === "en" ? (natural(v) ? 4 : 0) + (canadian(v) ? 2 : 0) : (canadian(v) ? 4 : 0) + (natural(v) ? 2 : 0)) + (v.default ? 1 : 0);
  const candidates = voices.filter((v) => tag(v).split("-")[0] === lang && !NOVELTY.test(v.name));
  return candidates.reduce<V | null>((best, v) => (best === null || rank(v) > rank(best) ? v : best), null);
}

/**
 * The voice a reading uses, and whether it is a voice service. A voice that works on the device comes first, however
 * natural a service sounds: what is read aloud then stays on the device. Among the device's voices, and among the
 * services when there is nothing else, the order is pickVoice's. `online` is true only for a voice that says it is a
 * service; with no voice listed for the language the browser chooses (voice null), and nothing is claimed about it.
 * `onDeviceOnly`: a reading that must stay on the device gets the device's voice or null, never a service.
 */
export function voiceFor<V extends Voice>(voices: V[], lang: Lang, onDeviceOnly = false): { voice: V | null; online: boolean } | null {
  const own = pickVoice(voices.filter((v) => v.localService === true), lang);
  if (own) return { voice: own, online: false };
  if (onDeviceOnly) return null;
  const other = pickVoice(voices, lang);
  return { voice: other, online: other?.localService === false };
}

/** Sentences: split after . ? or ! followed by a space. */
const sentences = (text: string) => text.split(/(?<=[.?!])\s+(?=\S)/).filter((s) => s.trim() !== "");

/**
 * Words written for the eye, as the voice says them, one sentence per item: "within 500 km" is said "within 500
 * kilometres". For what a screen shows and also reads aloud (the map's summary).
 */
export const aloud = (lang: Lang, text: string) => sentences(text.replace(/(\d+)\s*km\b/g, (_, km: string) => spokenKm(Number(km), lang)));
const fill = (text: string, vars: Vars) => text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));

/**
 * A script as sentences, one per utterance. The template is split before its values are filled in, so a value never
 * splits a sentence: an address ("295 Commercial St., Middleton") or a label with a question mark ("Told to leave your
 * home? What to do").
 */
export function script(lang: Lang, key: StringKey, vars: Vars = {}): string[] {
  return sentences(translate(lang, key)).map((sentence) => fill(sentence, vars));
}

/** "159 kilometres", "one kilometre", "less than one kilometre". */
export const spokenKm = (km: number, lang: Lang) => (km < 1 ? translate(lang, "voice.km.under") : km === 1 ? translate(lang, "voice.km.one") : translate(lang, "voice.km", { km }));

/** Inside a sentence, a label starts in lower case ("Very high risk" → "very high risk"); "I" and "ID" stay. */
export const lowerFirst = (text: string, lang: Lang) => (/^\p{Lu}\p{Ll}/u.test(text) ? text.charAt(0).toLocaleLowerCase(lang) + text.slice(1) : text);

/** `install`: the Add to home screen link is shown (not when the app is open from the home screen). */
export const checkVoice = (lang: Lang, replay: boolean, install: boolean) => [
  ...(replay ? script(lang, "voice.check.replay") : []),
  ...script(lang, "voice.check"),
  ...(install ? script(lang, "voice.check.install", { add: translate(lang, "keep.add") }) : []),
];
// The three questions name each answer as it is written on the screen.
const notSure = (lang: Lang) => translate(lang, "look.notSure");
export const q1Voice = (lang: Lang) => script(lang, "voice.q1", { yes: translate(lang, "q1.yes"), no: translate(lang, "q1.no"), notSure: notSure(lang) });
export const q2Voice = (lang: Lang) =>
  script(lang, "voice.q2", { column: translate(lang, "q2.column"), haze: translate(lang, "q2.haze"), smell: translate(lang, "q2.smell"), notSure: notSure(lang) });
export const q3Voice = (lang: Lang) =>
  script(lang, "voice.q3", {
    firePit: translate(lang, "q3.firePit"),
    mulch: translate(lang, "q3.mulch"),
    people: translate(lang, "q3.people"),
    other: translate(lang, "q3.other"),
    nothing: translate(lang, "q3.nothing"),
    notSure: notSure(lang),
  });
export const nearbyFireVoice = (lang: Lang) => script(lang, "voice.nearby", { check: translate(lang, "nearby.check") });
/** Said once, before the first reading by a voice service: the person is told where the words go. */
export const onlineVoiceNotice = (lang: Lang) => script(lang, "voice.online");
export const locationVoice = (lang: Lang) => script(lang, "voice.location");
/** `waking`: the engine has not answered yet, and the screen says it is waking up. */
export const loadingVoice = (lang: Lang, waking = false) => [...script(lang, "voice.loading"), ...(waking ? script(lang, "voice.loading.waking") : [])];
export const emergencyVoice = (lang: Lang) => script(lang, "voice.emergency", { leave: translate(lang, "leave.entry") });
export const howVoice = (lang: Lang) => script(lang, "voice.how");
export const locationOffVoice = (lang: Lang) => script(lang, "voice.locationOff");
export const noDataVoice = (lang: Lang) => script(lang, "voice.noData");

/** What the leave screen shows: no place yet; the centres near the event; the event far away; or no event (live). */
export type LeaveState =
  | { kind: "where" }
  | { kind: "near"; name: string; address: string }
  | { kind: "far"; fire: string; km: number; town: string; ofTown: string; links: boolean; call211: boolean }
  | { kind: "none"; links: boolean; call211: boolean };

export function leaveVoice(lang: Lang, state: LeaveState): string[] {
  if (state.kind === "where") return script(lang, "voice.leave.where");
  if (state.kind === "near") return script(lang, "voice.leave.near", { name: state.name, address: state.address });
  if (state.kind === "far") {
    const far = script(lang, "voice.leave.far", { fire: translate(lang, "fire.the.named", { name: state.fire }), distance: spokenKm(state.km, lang), town: state.town, ofTown: state.ofTown });
    return [...far, ...(state.links ? script(lang, "voice.leave.far.links") : []), ...(state.call211 ? script(lang, "voice.leave.far.211") : [])];
  }
  return [...script(lang, "voice.leave.intro"), ...(state.links ? script(lang, "voice.leave.none.links") : []), ...(state.call211 ? script(lang, "voice.leave.211") : [])];
}
