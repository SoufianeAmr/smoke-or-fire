// What "Listen" reads on each screen: only strings already on that screen, in the app's language. The only glue added
// is punctuation, so each part ends as a sentence and the voice pauses between parts. Pure: no React, no DOM.
import { translate, type Lang, type StringKey } from "../i18n";
import type { VerdictView } from "../verdict/view";

const NBSP = String.fromCharCode(0xa0);

/** The voice's language: Canadian English or French. */
export const LOCALE: Record<Lang, string> = { en: "en-CA", fr: "fr-CA" };

/** A Canadian voice for the language if the device has one (en-CA, fr-CA), else any English or French voice. */
export function pickVoice<V extends { lang: string }>(voices: V[], lang: Lang): V | null {
  const tag = (v: V) => v.lang.replace("_", "-").toLowerCase();
  return voices.find((v) => tag(v) === LOCALE[lang].toLowerCase()) ?? voices.find((v) => tag(v).split("-")[0] === lang) ?? null;
}

/** ": " in English, " : " with a no-break space in French. */
export const colon = (lang: Lang) => (lang === "fr" ? `${NBSP}: ` : ": ");

/** A part ends with punctuation, so the voice pauses: "Likely from the Long Lake fire" → "…fire.". */
export const sentence = (text: string) => (/[.?!:]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

/** After a colon, a word starts in lower case ("No flames in sight" → "no flames in sight"); "I see flames" keeps its "I". */
export const afterColon = (text: string, lang: Lang) => (/^\p{Lu}\p{Ll}/u.test(text) ? text.charAt(0).toLocaleLowerCase(lang) + text.slice(1) : text);

/** A label in capitals is read as words, not letters: "DRIFTING SMOKE" → "Drifting smoke". */
export const sentenceCase = (text: string, lang: Lang) => {
  const lower = text.toLocaleLowerCase(lang);
  return lower.charAt(0).toLocaleUpperCase(lang) + lower.slice(1);
};

/** Q1: the question, then each answer as "Yes: I see flames." */
export function q1Speech(lang: Lang): string[] {
  const t = (key: StringKey) => translate(lang, key);
  const answer = (word: StringKey, sub: StringKey) => sentence(`${t(word)}${colon(lang)}${afterColon(t(sub), lang)}`);
  return [t("q1.title"), answer("q1.yes", "q1.yesSub"), answer("q1.no", "q1.noSub")];
}

/** The 911 bar as it's written: "Call 911 if you see: flames, smoke column, or dark smoke." */
export function call911Speech(lang: Lang): string {
  const t = (key: StringKey) => translate(lang, key);
  const tiles = (["sticky.flames", "sticky.column", "sticky.dark"] as const).map((key) => afterColon(t(key), lang));
  return sentence(`${t("sticky.title")} ${new Intl.ListFormat(lang, { style: "long", type: "disjunction" }).format(tiles)}`);
}

/** Verdict (7a–7d): label, headline, subline, the confidence sentence, the first What to do line, then the 911 bar. */
export function verdictSpeech(view: VerdictView, lang: Lang): string[] {
  return [
    sentence(sentenceCase(view.band.label, lang)),
    sentence(view.band.headline),
    sentence(view.band.sub),
    sentence(view.confidence.text),
    sentence(view.todo.general),
    call911Speech(lang),
  ];
}

/** Emergency: "Call 911 now", the subline, then "Tell the dispatcher:" and its four items. */
export function emergencySpeech(lang: Lang): string[] {
  const t = (key: StringKey) => translate(lang, key);
  const items = ([1, 2, 3, 4] as const).map((n) => sentence(`${t(`emergency.tell${n}.lead`)} ${t(`emergency.tell${n}`)}`));
  return [sentence(t("emergency.title")), sentence(t("emergency.sub")), `${t("emergency.tell")}${colon(lang).trimEnd()}`, ...items];
}
