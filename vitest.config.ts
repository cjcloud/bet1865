import { defineConfig } from "vitest/config";
import path from "path";

// Phase 7 unit tests (SPEC.md/BUILD_TEST_DEPLOY_PLAN.md) — pure logic only
// (src/lib), so a plain node environment is enough; no DOM/jsdom needed.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
