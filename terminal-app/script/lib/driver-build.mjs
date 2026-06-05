import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Pure helpers for deciding whether the sibling ftdi-driver needs
// (re)building. terminal-app imports the driver as a `file:` dependency whose
// package entry points resolve to its built dist/ (.js + .d.ts). If that build
// is missing or stale, terminal-app's own build fails with a "cannot find
// module" error — so we detect it up front and rebuild on demand.

/** Newest mtime (ms) among all files under `dir`, recursively. 0 if empty. */
function newestMtimeMs(dir) {
  let newest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    const mtime = entry.isDirectory() ? newestMtimeMs(full) : statSync(full).mtimeMs
    if (mtime > newest) newest = mtime
  }
  return newest
}

/**
 * Decide whether the driver at `driverDir` must be (re)built.
 *
 * Returns true when the built type declarations (`dist/index.d.ts`) are
 * missing, or when any file under `src/` is newer than them (a source change
 * the dist/ doesn't yet reflect). Returns false when dist/ is present and no
 * source is newer.
 */
export function driverNeedsBuild(driverDir) {
  const builtTypes = join(driverDir, 'dist', 'index.d.ts')
  if (!existsSync(builtTypes)) return true

  const srcDir = join(driverDir, 'src')
  if (!existsSync(srcDir)) return false

  return newestMtimeMs(srcDir) > statSync(builtTypes).mtimeMs
}
