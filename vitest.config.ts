import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const svgTestStubId = "\0pravah-test-svg-stub";

export default mergeConfig(
  viteConfig,
  defineConfig({
    resolve: {
      alias: [
        {
          find: "react-native-svg",
          replacement: path.resolve(__dirname, "apps/mobile/src/test/mocks/react-native-svg.tsx"),
        },
      ],
    },
    plugins: [
      {
        name: "pravah-test-svg-stub",
        enforce: "pre",
        resolveId(source: string) {
          if (source.endsWith(".svg")) return svgTestStubId;
          return null;
        },
        load(id: string) {
          if (id !== svgTestStubId) return null;
          return 'import React from "react"; export default function SvgAsset(props) { return React.createElement("svg", props); }';
        },
      },
    ],
    test: {
      globals: true,
      environment: "node",
      pool: "threads",
      include: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.spec.{ts,tsx}",
        "apps/*/src/**/*.test.{ts,tsx}",
        "apps/*/src/**/*.spec.{ts,tsx}",
      ],
      setupFiles: ["./src/test/setup.ts"],
    },
  }),
);
