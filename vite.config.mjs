import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'

export default defineConfig({
  plugins: [
    react(),
    electron({
      entry: 'electron/main.cjs',
      onstart({ startup }) {
        const env = { ...process.env }
        delete env.ELECTRON_RUN_AS_NODE
        startup(['.'], { env })
      },
    }),
  ],
  base: './',
  build: {
    outDir: 'dist',
    rolldownOptions: {
      external: ['electron', 'better-sqlite3', 'path', 'fs', 'os']
    }
  },
  server: { 
    port: 5173,
    strictPort: true
  }
})
