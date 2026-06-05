import type { BackendId, SerialBackendFactory } from '../backends/SerialBackend'

const KEY = 'backend.preferredId'

export function readPreference(): BackendId | null {
  return localStorage.getItem(KEY) as BackendId | null
}

export function writePreference(id: BackendId): void {
  localStorage.setItem(KEY, id)
}

export function clearPreference(): void {
  localStorage.removeItem(KEY)
}

export function resolveFactory(
  factories: SerialBackendFactory[],
): SerialBackendFactory | null {
  const available = factories.filter((f) => f.isAvailable())
  if (available.length === 0) return null
  const preferred = readPreference()
  return available.find((f) => f.id === preferred) ?? available[0] ?? null
}
