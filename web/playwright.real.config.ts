import { defineConfig } from "@playwright/test";

// Live mode through a deployed site and the real engine: no stand-ins. Run on demand, it needs the network:
//   npm run e2e:real                         (SITE_URL=https://… to check another deployment)
export default defineConfig({
  testDir: "e2e",
  testMatch: /real-engine\.spec\.ts/,
  outputDir: "test-results",
  timeout: 150_000, // a sleeping free Render service takes about a minute to wake
  use: { baseURL: process.env.SITE_URL ?? "https://smoke-or-fire.vercel.app", viewport: { width: 390, height: 844 } },
});
