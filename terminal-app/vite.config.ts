import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { versionDefine } from './script/version-info'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: './',
  define: versionDefine(),
})
