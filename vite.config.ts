import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, cpSync } from 'fs'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-extension-files',
      closeBundle() {
        mkdirSync('dist', { recursive: true })
        // Copy manifest and popup
        copyFileSync('manifest.json', 'dist/manifest.json')
        copyFileSync('popup.html',    'dist/popup.html')
        // Copy entire icons folder into dist/icons/
        cpSync('icons', 'dist/icons', { recursive: true })
        console.log('✓ manifest.json, popup.html, icons/ copied to dist/')
      },
    },
  ],
  build: {
    outDir:      'dist',
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
