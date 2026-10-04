import { defineConfig } from "@playwright/test";
import { TEST_ENGINE_URL } from "./e2e/engine";

// The port the build is served on. A second checkout running its tests at the same time takes another:
// E2E_PORT=4176 npm run e2e.
const PORT = process.env.E2E_PORT ?? "4173";

// Browser tests run against a production build, at the screen files' 390 × 844. It goes to dist-e2e/,
// built with a stand-in engine URL, so the deployable dist/ never carries it.
export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 390, height: 844 } },
  webServer: {
    command: `npm run build -- --outDir dist-e2e && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    env: { VITE_ENGINE_URL: TEST_ENGINE_URL },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    { name: "flow", testMatch: /(flow|live|leave|listen|keep|glance|protect|look[\w-]*)\.spec\.ts/ },
    // Every screen at 375 × 667 and 390 × 844: main action and 911 bar visible without scrolling.
    { name: "small-screens", testMatch: /small-screens\.spec\.ts/ },
    // Compared with design/screens with a small tolerance; reported, never blocking.
    { name: "pixels", testMatch: /pixels\.spec\.ts/ },
    // Pictures of the question screens and of every verdict state, in English and French, written to screenshots/:
    // run with `npm run e2e:shots`.
    { name: "screenshots", testMatch: /screenshots\.spec\.ts/ },
  ],
});
