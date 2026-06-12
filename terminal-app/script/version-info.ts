import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * Build-time version/date injection for Vite and Vitest `define`.
 *
 * Both values come from files that already record them — package.json
 * (the version) and CHANGELOG.md (the release date in that version's
 * heading, e.g. "## [1.4.0] — 2026-06-12") — so there is no second
 * place to keep up to date. An unreleased version (no CHANGELOG heading
 * yet) gets today's date, which is what a dev build effectively is.
 */
export function versionDefine(): Record<string, string> {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
  const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
  const escaped = pkg.version.replace(/\./g, '\\.')
  const heading = changelog.match(new RegExp(`^## \\[${escaped}\\][ \\t]+[—–-][ \\t]+(\\d{4}-\\d{2}-\\d{2})`, 'm'))
  const date = heading?.[1] ?? new Date().toISOString().slice(0, 10)
  return {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_RELEASE_DATE__: JSON.stringify(date),
  }
}
