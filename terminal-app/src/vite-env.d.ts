/// <reference types="vite/client" />

// Injected at build time via `define` in vite.config.ts / vitest.config.ts
// (see script/version-info.ts — sourced from package.json + CHANGELOG.md).
declare const __APP_VERSION__: string
declare const __APP_RELEASE_DATE__: string
