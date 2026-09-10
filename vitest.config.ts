import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // Tests never need Next.js; run plain TS via vite.
    include: ["src/tests/**/*.test.ts"],
    // Point @/* at ./src/* to match the app's tsconfig alias.
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // The AI factory reads process.env; keep it defaulting to mock in tests.
    env: {
      AI_PROVIDER: "mock",
    },
  },
});
