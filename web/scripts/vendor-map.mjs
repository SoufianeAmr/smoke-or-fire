// Copy MapLibre GL JS's own ES modules into public/vendor/, where the app loads them from at run time.
//   node scripts/vendor-map.mjs     (runs before `npm run dev` and `npm run build`)
//
// MapLibre 6 ships as three modules: the map, its worker, and a third that both import. Served side by side as they
// are, that shared module is downloaded once. Bundled, the worker would get its own copy (about 150 KB gzip more).
// The folder carries the version, so a new version is a new address and the files can be cached for good.
// Never committed (.gitignore): the lock file pins the version.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";

const FILES = ["maplibre-gl.mjs", "maplibre-gl-shared.mjs", "maplibre-gl-worker.mjs"];
const source = new URL("../node_modules/maplibre-gl/", import.meta.url);
const { version } = JSON.parse(readFileSync(new URL("package.json", source), "utf8"));
const vendor = new URL("../public/vendor/", import.meta.url);
const target = new URL(`maplibre-gl-${version}/`, vendor);

// Another version's folder is left over from before an upgrade.
if (existsSync(vendor)) {
  for (const name of readdirSync(vendor)) {
    if (name.startsWith("maplibre-gl-") && name !== `maplibre-gl-${version}`) rmSync(new URL(`${name}/`, vendor), { recursive: true, force: true });
  }
}
mkdirSync(target, { recursive: true });
for (const file of FILES) copyFileSync(new URL(`dist/${file}`, source), new URL(file, target));
copyFileSync(new URL("LICENSE.txt", source), new URL("LICENSE.txt", target));
console.log(`public/vendor/maplibre-gl-${version}/`);
