#!/usr/bin/env node
import { existsSync, cpSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { driverNeedsBuild } from './lib/driver-build.mjs'

// Build-time guard, run as terminal-app's `prebuild` hook. terminal-app imports
// the sibling `file:../ftdi-driver`, whose entry points resolve to its
// built dist/. If that build is missing or stale, build it on demand so a fresh
// checkout (or a pulled driver change) Just Works — no manual step, no cryptic
// vue-tsc "cannot find module" failure. This makes the build self-healing for
// contributors; the deploy host gets the same behaviour for free.

const here = dirname(fileURLToPath(import.meta.url))
// script/ -> terminal-app/ -> repo root -> ftdi-driver/
const driverDir = resolve(here, '..', '..', 'ftdi-driver')

if (!existsSync(driverDir)) {
  // Sibling absent (e.g. CI building against a published registry version).
  // Nothing to build here; let normal dependency resolution take over.
  console.log('[ensure-driver] ../ftdi-driver not present — skipping')
  process.exit(0)
}

// npm ci copies file: deps at install time — before dist/ exists on a fresh
// checkout. Always sync dist/ into the node_modules copy so Vite can resolve
// the package even when the build ran after npm ci.
const distSrc = resolve(driverDir, 'dist')
const distDst = resolve(here, '..', 'node_modules', 'ftdi-webusb-driver', 'dist')

if (!driverNeedsBuild(driverDir)) {
  // Driver is up to date, but node_modules copy might still be missing dist/
  // (e.g. fresh npm ci on a machine where the driver was already built).
  if (existsSync(distSrc) && !existsSync(distDst)) {
    cpSync(distSrc, distDst, { recursive: true })
    console.log('[ensure-driver] synced existing dist/ into node_modules copy')
  }
  process.exit(0)
}

console.log(`[ensure-driver] building ftdi-driver (dist missing or stale): ${driverDir}`)
try {
  execSync('npm ci && npm run build', { cwd: driverDir, stdio: 'inherit' })
} catch (err) {
  console.error('[ensure-driver] driver build failed — terminal-app cannot build without it')
  process.exit(err.status ?? 1)
}

// Sync freshly-built dist/ into the node_modules copy.
if (existsSync(distSrc)) {
  cpSync(distSrc, distDst, { recursive: true })
}
console.log('[ensure-driver] ftdi-driver build complete')
