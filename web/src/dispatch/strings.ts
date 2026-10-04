// The dispatch board's own text, EN and FR. Kept beside the board and loaded with it, so the public app never carries
// it. The board also says many of the public app's strings (../i18n), word for word. Same rules as there: a French
// value of "TODO" is missing French, and English is shown instead.
import { TODO, type Lang, type Vars } from "../i18n";
import en from "./en.json";
import fr from "./fr.json";

export type DispatchKey = keyof typeof en;

const tables: Record<Lang, Record<string, string>> = { en, fr };

export function dt(lang: Lang, key: DispatchKey, vars?: Vars): string {
  const local = tables[lang][key];
  const text = local && local !== TODO ? local : en[key];
  return vars ? text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match)) : text;
}
