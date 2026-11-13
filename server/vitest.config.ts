import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup-env.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/generated/**", "src/dev.ts"],
      reporter: ["text", "html"],
    },
  },
});
