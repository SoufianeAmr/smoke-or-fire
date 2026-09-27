// The home-screen icon: the manifest, its icons and the page's <head>. The browser tests check that the built site
// serves them (e2e/keep.spec.ts).
import { readdirSync, readFileSync } from "node:fs";
import { parseDocument } from "htmlparser2";
import { PNG } from "pngjs";
import { describe, expect, test } from "vitest";

const WEB = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, WEB));
const manifest = JSON.parse(read("public/manifest.webmanifest").toString("utf8"));
const NAVY = [0x1b, 0x2a, 0x4a];
const NBSP = String.fromCharCode(0xa0);

/** The PNG at a path under public/, and the colour of a pixel as [r, g, b, a]. */
function png(src: string) {
  const image = PNG.sync.read(read(`public${src}`));
  const at = (x: number, y: number) => [...image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)];
  const white = Array.from({ length: image.width * image.height }, (_, i) => i).filter((i) => image.data[i * 4] === 255 && image.data[i * 4 + 1] === 255 && image.data[i * 4 + 2] === 255).length;
  return { width: image.width, height: image.height, at, white };
}

describe("manifest.webmanifest", () => {
  test("names, start, display and colours", () => {
    expect(manifest).toMatchObject({
      name: `Smoke or Fire? / Fumée ou feu${NBSP}?`,
      short_name: "Smoke or Fire",
      start_url: "/",
      display: "standalone",
      background_color: "#FAF6F0",
      theme_color: "#1B2A4A",
    });
  });

  test("icons at 192 and 512 px: the rounded navy tile, and a full-bleed one Android crops to its shape", () => {
    const icons = manifest.icons as { src: string; sizes: string; type: string; purpose: string }[];
    expect(icons.map(({ sizes, purpose }) => `${sizes} ${purpose}`)).toEqual(["192x192 any", "512x512 any", "192x192 maskable", "512x512 maskable"]);
    for (const icon of icons) {
      const size = Number(icon.sizes.split("x")[0]);
      const image = png(icon.src);
      expect(icon.type).toBe("image/png");
      expect([image.width, image.height]).toEqual([size, size]);
      // Navy at the centre-left, white smoke lines; corners transparent on the rounded tile, navy on the full-bleed one.
      expect(image.at(Math.round(size * 0.15), Math.round(size / 2))).toEqual([...NAVY, 255]);
      expect(image.white).toBeGreaterThan(size * size * 0.01);
      expect(image.at(0, 0)).toEqual(icon.purpose === "any" ? [0, 0, 0, 0] : [...NAVY, 255]);
    }
  });
});

describe("index.html", () => {
  const head = parseDocument(read("index.html").toString("utf8")).children.flatMap(function all(node): typeof node[] {
    return [node, ...("children" in node ? node.children.flatMap(all) : [])];
  });
  const find = (name: string, attr: string, value: string) =>
    head.find((n) => "name" in n && n.name === name && (n as unknown as { attribs: Record<string, string> }).attribs[attr] === value) as unknown as { attribs: Record<string, string> } | undefined;

  test("links the manifest, the 180 px icon for iPhone, and a tab icon", () => {
    expect(find("link", "rel", "manifest")?.attribs.href).toBe("/manifest.webmanifest");
    const apple = find("link", "rel", "apple-touch-icon")!;
    expect(apple.attribs.sizes).toBe("180x180");
    const image = png(apple.attribs.href);
    // iOS rounds the corners itself and fills transparent ones black: the icon is navy to the edges.
    expect([image.width, image.height, image.at(0, 0)]).toEqual([180, 180, [...NAVY, 255]]);
    expect(image.white).toBeGreaterThan(180 * 180 * 0.01);
    expect(png(find("link", "rel", "icon")!.attribs.href).width).toBe(192);
  });

  test("theme colour, home-screen app, and its name under the icon", () => {
    expect(find("meta", "name", "theme-color")?.attribs.content).toBe("#FAF6F0");
    expect(find("meta", "name", "apple-mobile-web-app-capable")?.attribs.content).toBe("yes");
    expect(find("meta", "name", "mobile-web-app-capable")?.attribs.content).toBe("yes");
    expect(find("meta", "name", "apple-mobile-web-app-title")?.attribs.content).toBe("Smoke or Fire");
  });

  test("no service worker: nothing registers one, nothing is cached for use offline", () => {
    const files = ["index.html", ...readdirSync(new URL("src", WEB), { recursive: true, encoding: "utf8" }).map((f) => `src/${f.replace(/\\/g, "/")}`)]
      .filter((f) => /\.(html|tsx?)$/.test(f) && !f.endsWith(".test.ts"));
    expect(files).toContain("src/main.tsx");
    expect(files.filter((f) => /serviceWorker|caches\.open|CacheStorage/.test(read(f).toString("utf8")))).toEqual([]);
    expect(readdirSync(new URL("public", WEB), { recursive: true, encoding: "utf8" }).filter((f) => /sw\.js|worker/i.test(f))).toEqual([]);
    // Nor a build plugin that would add one (vite-plugin-pwa, Workbox).
    expect(read("vite.config.ts").toString("utf8")).not.toMatch(/pwa|workbox|serviceWorker/i);
    const pkg = JSON.parse(read("package.json").toString("utf8"));
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((name) => /pwa|workbox/i.test(name))).toEqual([]);
  });
});
