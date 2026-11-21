import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
export default defineConfig({
  base: './',
  // MediaPipe wasm + model are shared with the spikes (apps/spikes/public/mediapipe).
  publicDir: '../spikes/public',
  plugins: [react(), tailwindcss()],
  // Untitled UI React components (copied into src/uui, MIT) import from "@/...".
  resolve: { alias: { '@': resolve(__dirname, 'src/uui') } },
  worker: { format: 'es' },
  build: { target: 'es2022', rollupOptions: { input: { index: resolve(__dirname, 'index.html'), report: resolve(__dirname, 'report.html'), setup: resolve(__dirname, 'setup.html') } } },
  server: { port: 5180 }
})
