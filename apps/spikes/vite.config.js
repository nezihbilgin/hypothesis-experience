import { resolve } from 'node:path'
import { defineConfig } from 'vite'
export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        figma: resolve(__dirname, 'figma.html'),
        face: resolve(__dirname, 'face.html'),
        record: resolve(__dirname, 'record.html')
      }
    }
  }
})
