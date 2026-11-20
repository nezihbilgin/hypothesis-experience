import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
export default defineConfig({
  base: './',
  // MediaPipe wasm + model are shared with the spikes (apps/spikes/public/mediapipe).
  publicDir: '../spikes/public',
  plugins: [react()],
  worker: { format: 'es' },
  build: { target: 'es2022' },
  server: { port: 5180 }
})
