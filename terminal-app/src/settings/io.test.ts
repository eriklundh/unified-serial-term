import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { exportSettings, importSettings, requestPersistentStorage } from './io'

describe('settings io', () => {
  beforeEach(() => localStorage.clear())

  it('exports only settings.* and appearance.* keys', () => {
    localStorage.setItem('settings.baudRate', '9600')
    localStorage.setItem('appearance.themeId', 'nord')
    localStorage.setItem('unrelated.key', 'nope')
    const bundle = JSON.parse(exportSettings())
    expect(bundle.version).toBe(1)
    expect(bundle.values['settings.baudRate']).toBe('9600')
    expect(bundle.values['appearance.themeId']).toBe('nord')
    expect(bundle.values['unrelated.key']).toBeUndefined()
  })

  it('round-trips export -> clear -> import', () => {
    localStorage.setItem('settings.baudRate', '57600')
    localStorage.setItem('appearance.fontSize', '18')
    const json = exportSettings()
    localStorage.clear()
    const applied = importSettings(json)
    expect(applied).toBe(2)
    expect(localStorage.getItem('settings.baudRate')).toBe('57600')
    expect(localStorage.getItem('appearance.fontSize')).toBe('18')
  })

  it('import ignores foreign keys', () => {
    const json = JSON.stringify({
      version: 1,
      values: { 'appearance.themeId': 'light', 'evil.key': 'x' },
    })
    const applied = importSettings(json)
    expect(applied).toBe(1)
    expect(localStorage.getItem('appearance.themeId')).toBe('light')
    expect(localStorage.getItem('evil.key')).toBeNull()
  })

  it('import throws on invalid JSON', () => {
    expect(() => importSettings('{not json')).toThrow()
  })

  it('import throws when "values" is missing', () => {
    expect(() => importSettings('{"version":1}')).toThrow()
  })

  describe('requestPersistentStorage', () => {
    let original: PropertyDescriptor | undefined
    beforeEach(() => {
      original = Object.getOwnPropertyDescriptor(navigator, 'storage')
    })
    afterEach(() => {
      if (original) Object.defineProperty(navigator, 'storage', original)
      else delete (navigator as unknown as { storage?: unknown }).storage
    })

    it('resolves false when the Storage API is unavailable', async () => {
      Object.defineProperty(navigator, 'storage', { value: {}, configurable: true })
      expect(await requestPersistentStorage()).toBe(false)
    })

    it('resolves true when persist() grants it', async () => {
      Object.defineProperty(navigator, 'storage', {
        value: { persist: async () => true, persisted: async () => false },
        configurable: true,
      })
      expect(await requestPersistentStorage()).toBe(true)
    })

    it('short-circuits true when already persisted', async () => {
      Object.defineProperty(navigator, 'storage', {
        value: { persist: async () => false, persisted: async () => true },
        configurable: true,
      })
      expect(await requestPersistentStorage()).toBe(true)
    })
  })
})
