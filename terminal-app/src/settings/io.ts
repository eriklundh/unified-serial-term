/**
 * Settings export/import and durable-storage request.
 *
 * All app settings live under these localStorage prefixes; export/import operate
 * over exactly those keys so a settings file is portable across machines and
 * survives a browser reset or a reimaged lab PC.
 */
const SETTINGS_PREFIXES = ['settings.', 'appearance.'] as const

export interface SettingsBundle {
  version: 1
  exportedAt: string
  values: Record<string, string>
}

function isSettingsKey(key: string): boolean {
  return SETTINGS_PREFIXES.some((p) => key.startsWith(p))
}

/** Serialize all app settings to a pretty JSON string (for download). */
export function exportSettings(): string {
  const values: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && isSettingsKey(key)) {
      const v = localStorage.getItem(key)
      if (v !== null) values[key] = v
    }
  }
  const bundle: SettingsBundle = {
    version: 1,
    exportedAt: new Date().toISOString(),
    values,
  }
  return JSON.stringify(bundle, null, 2)
}

/**
 * Restore settings from a previously exported JSON string. Only known settings
 * keys are written (foreign keys are ignored). Returns how many were applied.
 * Throws on malformed input.
 */
export function importSettings(json: string): number {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('Not a valid settings file (invalid JSON).')
  }
  const values = (data as Partial<SettingsBundle> | null)?.values
  if (!values || typeof values !== 'object') {
    throw new Error('Not a valid settings file (missing "values").')
  }
  let applied = 0
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== 'string' || !isSettingsKey(key)) continue
    localStorage.setItem(key, value)
    applied++
  }
  return applied
}

/**
 * Ask the browser to keep this origin's storage persistent (not evicted under
 * storage pressure). Best-effort: resolves false when unsupported or denied.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined
  if (!storage || typeof storage.persist !== 'function') return false
  try {
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return true
    return await storage.persist()
  } catch {
    return false
  }
}
