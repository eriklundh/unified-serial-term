import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { versionDefine } from './script/version-info'

export default defineConfig({
  plugins: [vue()],
  define: versionDefine(),
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
