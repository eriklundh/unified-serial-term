#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { driverNeedsBuild } from './lib/driver-build.mjs'

// Build-time guard, run as terminal-app's `prebuild` hook. terminal-app imports
// the sibling `file:../ftdi-webusb-driver`, whose entry points resolve to its
// built dist/. If that build is missing or stale, build it on demand so a fresh
// checkout (or a pulled driver change) Just Works — no manual step, no cryptic
// vue-tsc "cannot find module" failure. This makes the build self-healing for
// contributors; the deploy host gets the same behaviour for free.

const here = dirname(fileURLToPath(import.meta.url))
// script/ -> terminal-app/ -> collection root -> ftdi-webusb-driver/
const driverDir = resolve(here, '..', '..', 'ftdi-webusb-driver')

if (!existsSync(driverDir)) {
  // Sibling absent (e.g. CI building against a published registry version).
  // Nothing to build here; let normal dependency resolution take over.
  console.log('[ensure-driver] ../ftdi-webusb-driver not present — skipping')
  process.exit(0)
}

if (!driverNeedsBuild(driverDir)) {
  process.exit(0)
}

console.log(`[ensure-driver] building ftdi-webusb-driver (dist missing or stale): ${driverDir}`)
try {
  execSync('npm ci && npm run build', { cwd: driverDir, stdio: 'inherit' })
} catch (err) {
  console.error('[ensure-driver] driver build failed — terminal-app cannot build without it')
  process.exit(err.status ?? 1)
}
console.log('[ensure-driver] ftdi-webusb-driver build complete')
