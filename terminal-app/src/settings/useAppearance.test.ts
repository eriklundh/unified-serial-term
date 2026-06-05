import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { useAppearance, SYSTEM_MONO, DEFAULT_CLEAR_HOTKEY } from './useAppearance'
import { THEMES } from '../themes'

describe('useAppearance', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to system monospace, size 14, default hotkey, and a known theme', () => {
    const { appearance } = useAppearance()
    expect(appearance.value.fontFamily).toBe(SYSTEM_MONO)
    expect(appearance.value.fontSize).toBe(14)
    expect(appearance.value.clearHotkey).toBe(DEFAULT_CLEAR_HOTKEY)
    expect(THEMES.map((t) => t.id)).toContain(appearance.value.themeId)
  })

  it('persists a fontSize change to localStorage', async () => {
    const { appearance } = useAppearance()
    appearance.value.fontSize = 18
    await nextTick()
    expect(localStorage.getItem('appearance.fontSize')).toBe('18')
    // a fresh instance reads it back
    expect(useAppearance().appearance.value.fontSize).toBe(18)
  })

  it('persists a theme change', async () => {
    const { appearance } = useAppearance()
    appearance.value.themeId = 'nord'
    await nextTick()
    expect(localStorage.getItem('appearance.themeId')).toBe('nord')
    expect(useAppearance().appearance.value.themeId).toBe('nord')
  })

  it('treats an empty clearHotkey ("off") as a valid, persisted value', async () => {
    const { appearance } = useAppearance()
    appearance.value.clearHotkey = ''
    await nextTick()
    expect(localStorage.getItem('appearance.clearHotkey')).toBe('')
    expect(useAppearance().appearance.value.clearHotkey).toBe('')
  })

  it('ignores an out-of-range stored fontSize and uses the default', () => {
    localStorage.setItem('appearance.fontSize', '999')
    expect(useAppearance().appearance.value.fontSize).toBe(14)
  })

  it('reset() clears storage and restores defaults', async () => {
    const { appearance, reset } = useAppearance()
    appearance.value.fontSize = 20
    appearance.value.themeId = 'nord'
    await nextTick()
    reset()
    await nextTick()
    expect(appearance.value.fontSize).toBe(14)
    expect(localStorage.getItem('appearance.fontSize')).toBeNull()
  })
})
