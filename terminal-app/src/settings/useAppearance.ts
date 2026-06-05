import { ref, watch } from 'vue'
import { DEFAULT_DARK_ID } from '../themes'

export interface Appearance {
  themeId: string
  /** CSS font-family stack for the terminal. */
  fontFamily: string
  fontSize: number
  /** Hotkey that clears the terminal, e.g. `Ctrl+Shift+K`. Empty string = off. */
  clearHotkey: string
}

/** Zero-download default: the platform's native monospace stack. */
export const SYSTEM_MONO =
  "ui-monospace, SFMono-Regular, 'Cascadia Mono', 'Segoe UI Mono', Consolas, 'Liberation Mono', Menlo, monospace"

export const DEFAULT_CLEAR_HOTKEY = 'Ctrl+Shift+K'

function defaults(): Appearance {
  return {
    themeId: DEFAULT_DARK_ID,
    fontFamily: SYSTEM_MONO,
    fontSize: 14,
    clearHotkey: DEFAULT_CLEAR_HOTKEY,
  }
}

const STORAGE_KEYS = {
  themeId: 'appearance.themeId',
  fontFamily: 'appearance.fontFamily',
  fontSize: 'appearance.fontSize',
  clearHotkey: 'appearance.clearHotkey',
} as const

function load(): Appearance {
  const d = defaults()
  const size = Number(localStorage.getItem(STORAGE_KEYS.fontSize))
  const hotkey = localStorage.getItem(STORAGE_KEYS.clearHotkey)
  return {
    themeId: localStorage.getItem(STORAGE_KEYS.themeId) || d.themeId,
    fontFamily: localStorage.getItem(STORAGE_KEYS.fontFamily) || d.fontFamily,
    fontSize: size >= 8 && size <= 32 ? size : d.fontSize,
    // '' (explicitly off) is a valid stored value; only a missing key falls back.
    clearHotkey: hotkey === null ? d.clearHotkey : hotkey,
  }
}

function save(a: Appearance): void {
  localStorage.setItem(STORAGE_KEYS.themeId, a.themeId)
  localStorage.setItem(STORAGE_KEYS.fontFamily, a.fontFamily)
  localStorage.setItem(STORAGE_KEYS.fontSize, String(a.fontSize))
  localStorage.setItem(STORAGE_KEYS.clearHotkey, a.clearHotkey)
}

function clearStorage(): void {
  for (const key of Object.values(STORAGE_KEYS)) localStorage.removeItem(key)
}

export function useAppearance() {
  const appearance = ref<Appearance>(load())

  let skipNextSave = false
  watch(
    appearance,
    (a) => {
      if (skipNextSave) {
        skipNextSave = false
        return
      }
      save(a)
    },
    { deep: true },
  )

  function reset() {
    clearStorage()
    skipNextSave = true
    appearance.value = defaults()
  }

  /** Re-read from localStorage (e.g. after importing a settings file). */
  function reload() {
    skipNextSave = true
    appearance.value = load()
  }

  return { appearance, reset, reload }
}
