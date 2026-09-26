import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const dataDir = fileURLToPath(new URL("../data", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Replay files and place data live in the repo's data/ folder and are bundled into the app.
    alias: { "@data": dataDir },
  },
  server: { fs: { allow: [".", dataDir] } },
  test: { include: ["src/**/*.test.ts"] },
});
