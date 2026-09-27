// The home-screen icons in public/icons/: the navy tile from Check (src/screens/Check.tsx), two smoke lines on navy.
// Drawn by the Chromium that Playwright installs, so each PNG is the SVG at that size. Run after changing the tile:
//   npm run icons
//
// - icon-192.png, icon-512.png: the tile as on Check, rounded, transparent corners (manifest purpose "any", favicon).
// - maskable-192.png, maskable-512.png: full-bleed navy, which Android crops to its own shape (purpose "maskable"). The
//   smoke lines already sit inside the safe zone, the centre circle of 80% of the width.
// - apple-touch-icon.png, 180 px: full-bleed, as iOS rounds the corners itself and would fill transparent ones black.
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const OUT = fileURLToPath(new URL("../public/icons/", import.meta.url));
const NAVY = "#1B2A4A";
// Path data copied from the tile on Check (viewBox 0 0 64 64).
const LINES = `
  <path d="M25 50c-5-5 5-9 0-15s5-9 0-15" fill="none" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" />
  <path d="M38 50c-5-5 5-9 0-15s5-9 0-15" fill="none" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" opacity="0.6" />`;
const tile = (rounded) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="${rounded ? 18 : 0}" fill="${NAVY}" />${LINES}</svg>`;

const ICONS = [
  { file: "icon-192.png", size: 192, rounded: true },
  { file: "icon-512.png", size: 512, rounded: true },
  { file: "maskable-192.png", size: 192, rounded: false },
  { file: "maskable-512.png", size: 512, rounded: false },
  { file: "apple-touch-icon.png", size: 180, rounded: false },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const { file, size, rounded } of ICONS) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${tile(rounded)}`);
  await page.screenshot({ path: `${OUT}${file}`, omitBackground: true });
  await page.close();
  console.log(`public/icons/${file}: ${size} × ${size}`);
}
await browser.close();
