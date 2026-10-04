// The host's settings (public/vercel.json), where the map depends on them.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const host = JSON.parse(readFileSync(new URL("../../public/vercel.json", import.meta.url), "utf8")) as { rewrites: { source: string; destination: string }[]; headers: { source: string; headers: { key: string; value: string }[] }[] };

test("every address is the app's own page, except its files: a tiles, vendor or assets file that is missing is not found", () => {
  expect(host.rewrites).toHaveLength(1);
  const app = new RegExp(`^${host.rewrites[0].source}$`);
  expect(["/", "/verdict", "/location", "/how-it-works", "/leave"].filter((path) => !app.test(path))).toEqual([]);
  // Served as the app's page, a missing tiles file would be kept by the browser for a year under the rule below.
  expect(["/tiles/maritimes-20260928.pmtiles", "/vendor/maplibre-gl-6.12.0/maplibre-gl.mjs", "/assets/Verdict-abc.js"].filter((path) => app.test(path))).toEqual([]);
});

test("the basemap file and the map library are kept by the browser for good: their names carry their versions", () => {
  const kept = Object.fromEntries(host.headers.map((rule) => [rule.source, rule.headers.find((h) => h.key === "Cache-Control")?.value]));
  expect(kept).toEqual({ "/tiles/(.*)": "public, max-age=31536000, immutable", "/vendor/(.*)": "public, max-age=31536000, immutable" });
});
