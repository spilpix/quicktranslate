import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Three renderer entries — floating translator, settings, selection popup.
// Main + preload keep node deps external (electron-store, uiohook-napi) so the
// native module and CJS packages are `require`d at runtime, not bundled.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') }
    },
    build: {
      rollupOptions: {
        input: {
          translator: resolve(__dirname, 'src/renderer/translator.html'),
          settings: resolve(__dirname, 'src/renderer/settings.html'),
          popup: resolve(__dirname, 'src/renderer/popup.html')
        }
      }
    },
    plugins: [react()]
  }
})
