import { describe, it, expect, beforeEach } from 'vitest'
import {
  readPreference,
  writePreference,
  clearPreference,
  resolveFactory,
} from './backendPreference'
import type { BackendId, SerialBackendFactory } from '../backends/SerialBackend'

function makeFactory(id: BackendId, name: string, available: boolean): SerialBackendFactory {
  return {
    id,
    displayName: name,
    isAvailable: () => available,
    async pickDevice(): Promise<never> {
      throw new Error('not needed')
    },
    async listPaired() {
      return []
    },
  }
}

describe('backendPreference', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('readPreference', () => {
    it('returns null when nothing stored', () => {
      expect(readPreference()).toBeNull()
    })

    it('returns stored id', () => {
      localStorage.setItem('backend.preferredId', 'web-serial')
      expect(readPreference()).toBe('web-serial')
    })
  })

  describe('writePreference', () => {
    it('persists the id to localStorage', () => {
      writePreference('webusb-ftdi')
      expect(localStorage.getItem('backend.preferredId')).toBe('webusb-ftdi')
    })
  })

  describe('clearPreference', () => {
    it('removes the stored id', () => {
      localStorage.setItem('backend.preferredId', 'web-serial')
      clearPreference()
      expect(localStorage.getItem('backend.preferredId')).toBeNull()
    })
  })

  describe('resolveFactory', () => {
    it('returns null when no factories are available', () => {
      const f = makeFactory('web-serial', 'Web Serial', false)
      expect(resolveFactory([f])).toBeNull()
    })

    it('returns null when factory list is empty', () => {
      expect(resolveFactory([])).toBeNull()
    })

    it('returns first available when no preference is stored', () => {
      const ws = makeFactory('web-serial', 'Web Serial', true)
      const usb = makeFactory('webusb-ftdi', 'WebUSB (FTDI)', true)
      expect(resolveFactory([ws, usb])).toBe(ws)
    })

    it('returns preferred factory when it is available', () => {
      writePreference('webusb-ftdi')
      const ws = makeFactory('web-serial', 'Web Serial', true)
      const usb = makeFactory('webusb-ftdi', 'WebUSB (FTDI)', true)
      expect(resolveFactory([ws, usb])).toBe(usb)
    })

    it('falls back to first available when preferred is not available', () => {
      writePreference('webusb-ftdi')
      const ws = makeFactory('web-serial', 'Web Serial', true)
      const usb = makeFactory('webusb-ftdi', 'WebUSB (FTDI)', false)
      expect(resolveFactory([ws, usb])).toBe(ws)
    })

    it('falls back to first available when preferred id is not in list', () => {
      writePreference('webusb-ftdi')
      const ws = makeFactory('web-serial', 'Web Serial', true)
      expect(resolveFactory([ws])).toBe(ws)
    })
  })
})
