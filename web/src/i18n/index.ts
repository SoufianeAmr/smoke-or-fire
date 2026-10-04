// All visible text, EN and FR. A French value of "TODO" is missing French: English is shown instead.
import en from "./en.json";
import fr from "./fr.json";

export type Lang = "en" | "fr";
// The words of a later screen ship with that screen's own files, so the first screens stay light: such a file adds
// its words with addStrings() as it loads (airout/strings.ts). Here only their keys are known, as a type.
type LaterKey = keyof typeof import("../airout/strings.en.json");
export type StringKey = keyof typeof en | LaterKey;
export type Vars = Record<string, string | number>;

const tables: Record<Lang, Record<string, string>> = { en: { ...en }, fr: { ...fr } };

/** Add the words of a later screen, in both languages, when that screen's file loads. */
export function addStrings(more: Record<Lang, Record<string, string>>): void {
  Object.assign(tables.en, more.en);
  Object.assign(tables.fr, more.fr);
}

export const TODO = "TODO";

export function translate(lang: Lang, key: StringKey, vars?: Vars): string {
  const local = tables[lang][key];
  const text = local && local !== TODO ? local : tables.en[key];
  return vars ? text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match)) : text;
}
