// "Protect your home": saves the official pages its advice is quoted from, as text, with each page's address, its
// "date modified" and the day it was retrieved.   node scripts/protect-sources.mjs   (from web/; needs the network)
//
// Writes src/protect/sources/<id>.<lang>.txt (the page's main content, one block per line) and src/protect/sources.json
// (who, title, address and dates, which the screen cites). Run it again to see what a page has changed: a sentence the
// screen quotes that is no longer in its page fails src/protect/view.test.ts.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { Parser } from "htmlparser2";

const OUT = new URL("../src/protect/", import.meta.url);

const ECCC = { en: "Environment and Climate Change Canada", fr: "Environnement et Changement climatique Canada" };
const HC = { en: "Health Canada", fr: "Santé Canada" };
const PAGES = [
  {
    id: "eccc-aqhi-messages",
    publisher: ECCC,
    url: { en: "https://www.weather.gc.ca/airquality/healthmessage_e.html", fr: "https://www.meteo.gc.ca/airquality/healthmessage_f.html" },
  },
  {
    id: "hc-smoke-heat",
    publisher: HC,
    url: {
      en: "https://www.canada.ca/en/health-canada/services/publications/healthy-living/combine-wildfire-smoke-heat.html",
      fr: "https://www.canada.ca/fr/sante-canada/services/publications/vie-saine/effets-combines-fumee-feux-foret-chaleur.html",
    },
  },
  {
    id: "hc-air-cleaner",
    publisher: HC,
    url: {
      en: "https://www.canada.ca/en/health-canada/services/air-quality/indoor-air-contaminants/choosing-portable-purifier.html",
      fr: "https://www.canada.ca/fr/sante-canada/services/qualite-air/contaminants-air-interieur/choisir-purificateur-portatif.html",
    },
  },
];

/** The page as served. curl under its own name: canada.ca stalls a request that names a browser without being one. */
function download(url) {
  try {
    return execFileSync("curl", ["-sS", "-L", "--compressed", "--fail", "--max-time", "60", url], { maxBuffer: 16 * 1024 * 1024 }).toString("utf8");
  } catch (error) {
    throw new Error(`could not fetch ${url}: ${error.message}`);
  }
}

// Elements that sit inside a line of text; every other element starts and ends a block.
const INLINE = new Set(["a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "dfn", "em", "i", "kbd", "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr"]);
// Never page content: code, and what the site keeps hidden (its overlays, and text for screen readers only).
const SKIPPED = new Set(["script", "style", "noscript", "template", "svg", "iframe"]);
const hidden = (attribs) => /(^|\s)(overlay-def|wb-inv)(\s|$)/.test(attribs.class ?? "");

/**
 * The page's main content as text: one block (heading, paragraph, list item, table cell) per line, in page order,
 * spaces collapsed. Also its "date modified" and its title.
 */
function read(html) {
  const lines = [];
  let block = "";
  let main = 0; // inside <main>
  let skip = 0; // inside something skipped
  let modified = null;
  let title = null;
  let heading = null; // the <h1> being read
  const stack = [];
  const flush = () => {
    const text = block.replace(/[ \t\r\n\f]+/g, " ").trim();
    if (text) lines.push(text);
    block = "";
  };
  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (name === "meta" && attribs.name === "dcterms.modified") modified = attribs.content;
        const skipped = skip > 0 || SKIPPED.has(name) || hidden(attribs);
        stack.push({ name, skipped });
        if (skipped) skip++;
        if (name === "main") main++;
        if (!main || skip) return;
        if (name === "br") block += " ";
        else if (!INLINE.has(name)) flush();
        if (name === "h1" && title === null) heading = "";
      },
      ontext(text) {
        if (!main || skip) return;
        block += text;
        if (heading !== null) heading += text;
      },
      onclosetag(name) {
        const open = stack.pop();
        if (main && !skip && !INLINE.has(name)) flush();
        if (name === "h1" && heading !== null) {
          title = heading.replace(/\s+/g, " ").trim();
          heading = null;
        }
        if (open?.skipped) skip--;
        if (name === "main") main--;
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();
  flush();
  return { lines, modified, title };
}

const today = new Date().toISOString().slice(0, 10);
const index = {};
mkdirSync(new URL("sources/", OUT), { recursive: true });
for (const page of PAGES) {
  const entry = { publisher: page.publisher, title: {}, url: page.url, modified: {}, retrieved: {} };
  for (const lang of ["en", "fr"]) {
    const { lines, modified, title } = read(download(page.url[lang]));
    if (!modified || !title || lines.length < 5) throw new Error(`${page.url[lang]}: no date modified, no title or no text`);
    entry.title[lang] = title;
    entry.modified[lang] = modified;
    entry.retrieved[lang] = today;
    const header = [
      `Source: ${page.publisher[lang]}`,
      `Title: ${title}`,
      `URL: ${page.url[lang]}`,
      `Date modified: ${modified}`,
      `Retrieved: ${today}`,
      "Below: the text of the page's main content, one block (heading, paragraph, list item, table cell) per line.",
      "---",
    ];
    writeFileSync(new URL(`sources/${page.id}.${lang}.txt`, OUT), [...header, ...lines].join("\n") + "\n");
    console.log(`${page.id}.${lang}.txt  ${lines.length} lines, modified ${modified}: ${title}`);
  }
  index[page.id] = entry;
}
writeFileSync(new URL("sources.json", OUT), JSON.stringify(index, null, 2) + "\n");
console.log(`sources.json  ${Object.keys(index).length} sources, retrieved ${today}`);
