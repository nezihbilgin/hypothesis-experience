import { resolve } from 'node:path'
import { defineConfig } from 'vite'
export default defineConfig({
  base: './',
  worker: { format: 'es' },
  // HX_ISOLATE=1: cross-origin isolation for the think-aloud spike (multi-threaded wasm). Off by default because it
  // blocks the Figma iframe on the other spike pages.
  server: process.env.HX_ISOLATE ? { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } } : {},
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        figma: resolve(__dirname, 'figma.html'),
        face: resolve(__dirname, 'face.html'),
        record: resolve(__dirname, 'record.html'),
        sensing: resolve(__dirname, 'sensing.html'),
        thinkaloud: resolve(__dirname, 'thinkaloud.html')
      }
    }
  }
})
