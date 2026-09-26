import { defineConfig } from "@playwright/test";

// Browser tests run against the production build (what gets deployed), at the screen files' 390 × 844.
export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  use: { baseURL: "http://localhost:4173", viewport: { width: 390, height: 844 } },
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    { name: "flow", testMatch: /flow\.spec\.ts/ },
    // Every screen at 375 × 667 and 390 × 844: main action and 911 bar visible without scrolling.
    { name: "small-screens", testMatch: /small-screens\.spec\.ts/ },
    // Compared with design/screens with a small tolerance; reported, never blocking.
    { name: "pixels", testMatch: /pixels\.spec\.ts/ },
  ],
});
