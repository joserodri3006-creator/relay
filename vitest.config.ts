import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: ".",
    environment: "node",
    include: ["src/server/**/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 15000
  }
});
