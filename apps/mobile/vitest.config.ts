import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    pool: "threads",
    include: ["src/test/**/*.test.{ts,tsx}", "src/test/**/*.spec.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/lib/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}", "src/screens/**/*.{ts,tsx}"],
      exclude: ["src/test/**"],
    },
  },
});
