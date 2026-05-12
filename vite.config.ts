import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, mkdirSync } from 'fs'

export default defineConfig({
  plugins: [
    react(),
    {
      // Copy manifest.json and popup.html into dist after build
      name: 'copy-extension-files',
      closeBundle() {
        mkdirSync('dist', { recursive: true })
        copyFileSync('manifest.json', 'dist/manifest.json')
        copyFileSync('popup.html',    'dist/popup.html')
      },
    },
  ],
  build: {
    outDir:   'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.ts'),
        content:    resolve(__dirname, 'src/content.ts'),
        popup:      resolve(__dirname, 'src/popup.tsx'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
