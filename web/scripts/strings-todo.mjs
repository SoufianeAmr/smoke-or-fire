// List every string that still needs French:  npm run strings:todo
import { readFileSync } from "node:fs";

// The shared tables, and the words that ship with a later screen's own files.
const read = (lang) => Object.assign({}, ...[`i18n/${lang}.json`, `airout/strings.${lang}.json`].map((file) => JSON.parse(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"))));
const en = read("en");
const fr = read("fr");
const todo = Object.keys(en).filter((key) => fr[key] === "TODO");
for (const key of todo) console.log(`${key}\n  EN: ${en[key]}\n`);
console.log(`${todo.length} of ${Object.keys(en).length} strings need French.`);
