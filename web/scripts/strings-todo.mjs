// List every string that still needs French:  npm run strings:todo
import { readFileSync } from "node:fs";

const en = JSON.parse(readFileSync(new URL("../src/i18n/en.json", import.meta.url), "utf8"));
const fr = JSON.parse(readFileSync(new URL("../src/i18n/fr.json", import.meta.url), "utf8"));
const todo = Object.keys(en).filter((key) => fr[key] === "TODO");
for (const key of todo) console.log(`${key}\n  EN: ${en[key]}\n`);
console.log(`${todo.length} of ${Object.keys(en).length} strings need French.`);
