import { describe, it, expect } from 'vitest'
import {
  THEMES,
  getTheme,
  defaultThemeId,
  applyThemeTokens,
  DEFAULT_DARK_ID,
  DEFAULT_LIGHT_ID,
} from './index'

describe('themes registry', () => {
  it('ships at least four themes', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(4)
  })

  it('every theme has an id, label, xterm bg/fg, and tokens', () => {
    for (const t of THEMES) {
      expect(t.id).toBeTruthy()
      expect(t.label).toBeTruthy()
      expect(t.xterm.background).toMatch(/^#[0-9a-f]{6}$/i)
      expect(t.xterm.foreground).toMatch(/^#[0-9a-f]{6}$/i)
      expect(Object.keys(t.tokens).length).toBeGreaterThan(0)
      // tokens are CSS custom properties
      for (const name of Object.keys(t.tokens)) expect(name.startsWith('--')).toBe(true)
    }
  })

  it('theme ids are unique', () => {
    const ids = THEMES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('getTheme returns the matching theme', () => {
    expect(getTheme('nord').id).toBe('nord')
  })

  it('getTheme falls back to the default dark theme for unknown ids', () => {
    expect(getTheme('does-not-exist').id).toBe(DEFAULT_DARK_ID)
  })

  it('defaultThemeId honours OS preference', () => {
    expect(defaultThemeId(true)).toBe(DEFAULT_DARK_ID)
    expect(defaultThemeId(false)).toBe(DEFAULT_LIGHT_ID)
  })

  it('applyThemeTokens writes tokens + color-scheme onto a root element', () => {
    const root = document.createElement('div')
    const dark = getTheme('dark')
    applyThemeTokens(dark, root)
    expect(root.style.getPropertyValue('--bg')).toBe(dark.tokens['--bg'])
    expect(root.style.getPropertyValue('--accent')).toBe(dark.tokens['--accent'])
    expect(root.style.getPropertyValue('color-scheme')).toBe('dark')

    applyThemeTokens(getTheme('light'), root)
    expect(root.style.getPropertyValue('color-scheme')).toBe('light')
  })
})
