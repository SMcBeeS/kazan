import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  build: {
    // Silence Vite's chunk-size warning for heavy media/player libraries.
    // (The warning is printed to stderr, which also makes Windows PowerShell
    // surface a spurious NativeCommandError even though the build succeeds.)
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Split heavy vendor dependencies out of the app bundle into their own
        // chunks: the HLS video engine and React / React Router, each grouped
        // so they are cached independently of the application code.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('hls.js')) return 'vendor-hls'
            if (id.includes('react-router-dom') || id.includes('react-dom') || id.includes('react')) {
              return 'vendor-react'
            }
          }
          return undefined
        },
      },
    },
  },
})
