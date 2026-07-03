/// <reference types="vitest/config" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const svgTestStubId = '\0pravah-test-svg-stub';
const isVitest = Boolean(process.env.VITEST);

export default defineConfig({
  resolve: process.env.VITEST
    ? {
        alias: [
          {
            find: "react-native-svg",
            replacement: path.resolve(__dirname, "apps/mobile/src/test/mocks/react-native-svg.tsx"),
          },
        ],
      }
    : undefined,
  plugins: [
    react(),
    tailwindcss(),
    ...(isVitest
      ? [{
          name: "pravah-test-svg-stub",
          enforce: "pre" as const,
          resolveId(source: string) {
            if (source.endsWith(".svg")) return svgTestStubId;
            return null;
          },
          load(id: string) {
            if (id !== svgTestStubId) return null;
            return 'import React from "react"; export default function SvgAsset(props) { return React.createElement("svg", props); }';
          },
        }]
      : []),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }
            if (id.includes('convex')) {
              return 'convex-vendor';
            }
            if (id.includes('@better-auth')) {
              return 'auth-vendor';
            }
            if (id.includes('framer-motion')) {
              return 'animation-vendor';
            }
          }
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    pool: 'threads',
    include: [
      'src/**/*.test.{ts,tsx}',
      'src/**/*.spec.{ts,tsx}',
      'apps/*/src/**/*.test.{ts,tsx}',
      'apps/*/src/**/*.spec.{ts,tsx}',
    ],
    setupFiles: ['./src/test/setup.ts'],
  },
})
