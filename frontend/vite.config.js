import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative base so Electron (and file-based packaging) can load assets.
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/analyze': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
        }
      }
    }
  }
})
