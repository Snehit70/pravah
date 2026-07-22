import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      react: path.resolve(__dirname, "../../node_modules/react"),
      "react-dom": path.resolve(__dirname, "../../node_modules/react-dom"),
      "react-native-svg": path.resolve(__dirname, "src/test/mocks/react-native-svg.tsx"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    pool: "threads",
    include: ["src/test/**/*.test.{ts,tsx}", "src/test/**/*.spec.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
