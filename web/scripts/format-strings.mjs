// Rewrite src/i18n/*.json with invisible characters as visible escapes (  no-break space,
// ‑ no-break hyphen,   narrow no-break space), so French spacing can be reviewed.
//   node scripts/format-strings.mjs
import { readFileSync, writeFileSync } from "node:fs";

for (const name of ["en", "fr"]) {
  const url = new URL(`../src/i18n/${name}.json`, import.meta.url);
  const strings = JSON.parse(readFileSync(url, "utf8"));
  const text = JSON.stringify(strings, null, 2).replace(/[ ‑ ]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
  writeFileSync(url, text + "\n", "utf8");
}
