// All visible text, EN and FR. A French value of "TODO" is missing French: English is shown instead.
import en from "./en.json";
import fr from "./fr.json";

export type Lang = "en" | "fr";
export type StringKey = keyof typeof en;
export type Vars = Record<string, string | number>;

const tables: Record<Lang, Record<string, string>> = { en, fr };

export const TODO = "TODO";

export function translate(lang: Lang, key: StringKey, vars?: Vars): string {
  const local = tables[lang][key];
  const text = local && local !== TODO ? local : en[key];
  return vars ? text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match)) : text;
}
