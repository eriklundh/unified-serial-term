import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { driverNeedsBuild } from './lib/driver-build.mjs'

// Unit tests for the pure predicate that decides whether the sibling
// ftdi-webusb-driver must be (re)built before terminal-app can build.

let dir

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'drv-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** Create a file under the temp driver dir and (optionally) set its mtime. */
function touch(rel, mtimeSeconds) {
  const full = join(dir, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, 'x')
  if (mtimeSeconds !== undefined) utimesSync(full, mtimeSeconds, mtimeSeconds)
}

describe('driverNeedsBuild', () => {
  it('returns true when built types (dist/index.d.ts) are missing', () => {
    touch('src/index.ts', 1000)
    expect(driverNeedsBuild(dir)).toBe(true)
  })

  it('returns true when a source file is newer than the built types', () => {
    touch('dist/index.d.ts', 1000)
    touch('src/index.ts', 2000)
    expect(driverNeedsBuild(dir)).toBe(true)
  })

  it('returns true when a nested source file is newer than the built types', () => {
    touch('dist/index.d.ts', 1000)
    touch('src/transport/webusb.ts', 3000)
    expect(driverNeedsBuild(dir)).toBe(true)
  })

  it('returns false when dist is present and all sources are older', () => {
    touch('src/index.ts', 1000)
    touch('dist/index.d.ts', 2000)
    expect(driverNeedsBuild(dir)).toBe(false)
  })

  it('returns false when dist is present and there is no src dir', () => {
    touch('dist/index.d.ts', 1000)
    expect(driverNeedsBuild(dir)).toBe(false)
  })
})
