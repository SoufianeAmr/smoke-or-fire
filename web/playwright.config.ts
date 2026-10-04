import { defineConfig } from "@playwright/test";
import { TEST_ENGINE_URL } from "./e2e/engine";

// The port the test build is served on: 4173, or E2E_PORT when another run on this machine already holds it.
const PORT = Number(process.env.E2E_PORT ?? 4173);
const SITE = `http://localhost:${PORT}`;
// The screens' own tests run in a browser with no WebGL: the verdict's map is then the outline map, with the same
// overlay, and nothing those tests check (the card, the sheet, the words, the 911 bar) depends on which basemap is
// drawn. They need no graphics card and stay quick. The detailed map has its own project, "map".
const NO_WEBGL = { launchOptions: { args: ["--disable-3d-apis"] } };

// Browser tests run against a production build, at the screen files' 390 × 844. It goes to dist-e2e/,
// built with a stand-in engine URL, so the deployable dist/ never carries it. The basemap is fetched first if it is
// not there (scripts/fetch-tiles.mjs): the map's tests draw the real tiles.
export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  // Fewer browsers at once on a busy machine: E2E_WORKERS=2.
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : undefined,
  use: { baseURL: SITE, viewport: { width: 390, height: 844 } },
  webServer: {
    command: `node scripts/fetch-tiles.mjs && npm run build -- --outDir dist-e2e && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    env: { VITE_ENGINE_URL: TEST_ENGINE_URL },
    url: SITE,
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    { name: "flow", testMatch: /(flow|live|leave|listen|keep|glance|loading|protect|burn|airout|dispatch|look[\w-]*)\.spec\.ts/, use: NO_WEBGL },
    // Every screen at 375 × 667 and 390 × 844: main action and 911 bar visible without scrolling.
    { name: "small-screens", testMatch: /small-screens\.spec\.ts/, use: NO_WEBGL },
    // The verdict's map: the sheet, the frame, the overlay, the legend, each way it falls back, the budgets. WebGL on.
    { name: "map", testMatch: /map[\w-]*\.spec\.ts/ },
    // Compared with design/screens with a small tolerance; reported, never blocking.
    { name: "pixels", testMatch: /pixels\.spec\.ts/ },
    // Pictures of the question screens and of every verdict state, in English and French, written to screenshots/:
    // run with `npm run e2e:shots`.
    { name: "screenshots", testMatch: /screenshots\.spec\.ts/ },
    // How long the map takes on a slowed-down phone, and how it moves: numbers, written to test-results/. Run with
    // `npm run e2e:perf`; never part of `npm run e2e` (a timing is not a pass or a fail on a shared machine).
    // Drawn by the machine's graphics card, as a phone draws it (a headless browser otherwise draws WebGL in software,
    // many times slower): PERF_GL=software measures that case instead.
    { name: "perf", testMatch: /perf\.spec\.ts/, use: process.env.PERF_GL === "software" ? {} : { launchOptions: { args: [`--use-angle=${process.platform === "win32" ? "d3d11" : "default"}`, "--ignore-gpu-blocklist", "--enable-gpu"] } } },
  ],
});
