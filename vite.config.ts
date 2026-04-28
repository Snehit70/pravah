/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
