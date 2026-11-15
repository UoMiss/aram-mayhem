import { fileURLToPath, URL } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { host: '127.0.0.1', port: 1420, strictPort: true },
  test: {
    exclude: [
      ...configDefaults.exclude,
      '**/.local-archive/**',
      '**/.local-demo/**',
      '**/.pnpm-store/**',
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep the complete, rarely changing portrait catalog separately cacheable.
          if (id.includes('/src/shared/lib/champions.ts')) return 'champion-assets'
        },
      },
    },
  },
})
