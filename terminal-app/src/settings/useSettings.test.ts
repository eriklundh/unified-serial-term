import { describe, it, expect, beforeEach } from 'vitest'
import { useSettings } from './useSettings'
import { nextTick } from 'vue'

describe('useSettings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns default baudRate when nothing is stored', () => {
    const { settings } = useSettings()
    expect(settings.value.baudRate).toBe(115200)
  })

  it('returns default dataBits when nothing is stored', () => {
    const { settings } = useSettings()
    expect(settings.value.dataBits).toBe(8)
  })

  it('returns default parity when nothing is stored', () => {
    const { settings } = useSettings()
    expect(settings.value.parity).toBe('none')
  })

  it('returns default stopBits when nothing is stored', () => {
    const { settings } = useSettings()
    expect(settings.value.stopBits).toBe(1)
  })

  it('returns default flowControl when nothing is stored', () => {
    const { settings } = useSettings()
    expect(settings.value.flowControl).toBe('none')
  })

  it('returns default localEcho (false) when nothing is stored', () => {
    const { settings } = useSettings()
    expect(settings.value.localEcho).toBe(false)
  })

  it('persists baudRate change to localStorage', async () => {
    const { settings } = useSettings()
    settings.value.baudRate = 9600
    await nextTick()
    expect(localStorage.getItem('settings.baudRate')).toBe('9600')
  })

  it('persists dataBits change to localStorage', async () => {
    const { settings } = useSettings()
    settings.value.dataBits = 7
    await nextTick()
    expect(localStorage.getItem('settings.dataBits')).toBe('7')
  })

  it('persists parity change to localStorage', async () => {
    const { settings } = useSettings()
    settings.value.parity = 'even'
    await nextTick()
    expect(localStorage.getItem('settings.parity')).toBe('even')
  })

  it('persists stopBits change to localStorage', async () => {
    const { settings } = useSettings()
    settings.value.stopBits = 2
    await nextTick()
    expect(localStorage.getItem('settings.stopBits')).toBe('2')
  })

  it('persists flowControl change to localStorage', async () => {
    const { settings } = useSettings()
    settings.value.flowControl = 'hardware'
    await nextTick()
    expect(localStorage.getItem('settings.flowControl')).toBe('hardware')
  })

  it('persists localEcho change to localStorage', async () => {
    const { settings } = useSettings()
    settings.value.localEcho = true
    await nextTick()
    expect(localStorage.getItem('settings.localEcho')).toBe('true')
  })

  it('reads a previously stored baudRate', () => {
    localStorage.setItem('settings.baudRate', '9600')
    const { settings } = useSettings()
    expect(settings.value.baudRate).toBe(9600)
  })

  it('reads a previously stored parity', () => {
    localStorage.setItem('settings.parity', 'odd')
    const { settings } = useSettings()
    expect(settings.value.parity).toBe('odd')
  })

  it('reads a previously stored localEcho true', () => {
    localStorage.setItem('settings.localEcho', 'true')
    const { settings } = useSettings()
    expect(settings.value.localEcho).toBe(true)
  })

  it('reset() reverts all settings to defaults', async () => {
    const { settings, reset } = useSettings()
    settings.value.baudRate = 9600
    settings.value.parity = 'even'
    settings.value.localEcho = true
    await nextTick()
    reset()
    expect(settings.value.baudRate).toBe(115200)
    expect(settings.value.parity).toBe('none')
    expect(settings.value.localEcho).toBe(false)
  })

  it('reset() clears localStorage entries', async () => {
    const { settings, reset } = useSettings()
    settings.value.baudRate = 9600
    await nextTick()
    reset()
    await nextTick()
    expect(localStorage.getItem('settings.baudRate')).toBeNull()
  })
})
