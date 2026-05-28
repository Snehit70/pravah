import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    pool: "threads",
    include: ["src/test/**/*.test.{ts,tsx}", "src/test/**/*.spec.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
