import { defineConfig } from "@playwright/test";

// Live mode through a deployed site and the real engine: no stand-ins. Run on demand, it needs the network:
//   npm run e2e:real                         (SITE_URL=https://… to check another deployment)
export default defineConfig({
  testDir: "e2e",
  testMatch: /real-engine\.spec\.ts/,
  outputDir: "test-results",
  // A sleeping engine can take about three minutes to wake, and the app keeps asking it for 180 s: a test is given
  // that, and time for the screens before and after.
  timeout: 240_000,
  use: { baseURL: process.env.SITE_URL ?? "https://smoke-or-fire.vercel.app", viewport: { width: 390, height: 844 } },
});
