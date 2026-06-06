import { describe, it, expect, beforeEach } from 'vitest'
import {
  isAutoReconnectSuppressed,
  suppressAutoReconnect,
  allowAutoReconnect,
} from './reconnect'

describe('auto-reconnect suppression', () => {
  beforeEach(() => localStorage.clear())

  it('is not suppressed by default', () => {
    expect(isAutoReconnectSuppressed()).toBe(false)
  })

  it('suppressAutoReconnect() sets the flag', () => {
    suppressAutoReconnect()
    expect(isAutoReconnectSuppressed()).toBe(true)
  })

  it('allowAutoReconnect() clears the flag', () => {
    suppressAutoReconnect()
    allowAutoReconnect()
    expect(isAutoReconnectSuppressed()).toBe(false)
  })

  it('persists in localStorage so it survives a reload', () => {
    suppressAutoReconnect()
    // A fresh page load only has localStorage to go on.
    expect(localStorage.getItem('connection.autoReconnectSuppressed')).toBe('1')
    expect(isAutoReconnectSuppressed()).toBe(true)
  })
})
