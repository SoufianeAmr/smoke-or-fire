import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const dataDir = fileURLToPath(new URL("../data", import.meta.url));
// MapLibre's own modules are served from here, as they are (scripts/vendor-map.mjs copies them): the folder carries
// the version the lock file pins.
const maplibre = JSON.parse(readFileSync(new URL("./node_modules/maplibre-gl/package.json", import.meta.url), "utf8")).version;

export default defineConfig({
  plugins: [react()],
  define: { __MAPLIBRE_DIR__: JSON.stringify(`vendor/maplibre-gl-${maplibre}`) },
  resolve: {
    // Replay files and place data live in the repo's data/ folder and are bundled into the app.
    alias: { "@data": dataDir },
  },
  // One stylesheet for the whole app, loaded with the first screen. Split by screen, the bundler makes the first
  // request for a screen's file wait for that screen's stylesheet before it even starts: one small stylesheet that
  // does not arrive then holds the whole check on "Tracing the air…", with the answer already in hand
  // (e2e/loading.spec.ts). The styles are small; the code stays split by screen.
  build: { cssCodeSplit: false },
  server: { fs: { allow: [".", dataDir] } },
  test: { include: ["src/**/*.test.ts"] },
});
