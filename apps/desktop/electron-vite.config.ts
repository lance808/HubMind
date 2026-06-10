import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['pdf-parse', 'mammoth', 'xlsx', 'jszip'],
      },
    },
    resolve: {
      alias: {
        '@hubmind/core': resolve(__dirname, '../../packages/core/src'),
        '@hubmind/shared': resolve(__dirname, '../../packages/shared/src'),
      },
    },
  },

  preload: {
    plugins: [externalizeDepsPlugin()],
  },

  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@hubmind/core': resolve(__dirname, '../../packages/core/src'),
        '@hubmind/shared': resolve(__dirname, '../../packages/shared/src'),
        '@hubmind/ui': resolve(__dirname, '../../packages/ui/src'),
        '@': resolve(__dirname, 'src/renderer'),
      },
    },
  },
})
