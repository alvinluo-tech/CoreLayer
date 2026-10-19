import { defineConfig } from "vitest/config";

// Live integration tests that need real credentials. Kept out of the default
// `vitest run` so `pnpm test` stays hermetic.
export default defineConfig({
  test: {
    include: ["src/**/*.e2e.test.ts"],
    setupFiles: ["src/test/setup.ts"],
    testTimeout: 240000,
    hookTimeout: 60000,
  },
});
