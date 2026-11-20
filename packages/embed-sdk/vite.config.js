// Builds the SDK as one self-contained script: dist/hx-embed.js (IIFE, @hx/core bundled in).
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
export default defineConfig({
  build: {
    target: 'es2020',
    lib: { entry: resolve(__dirname, 'src/index.ts'), name: 'hxEmbed', formats: ['iife'], fileName: () => 'hx-embed.js' }
  }
})
