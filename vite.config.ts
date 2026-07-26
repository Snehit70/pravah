import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
})
