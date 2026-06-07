import { describe, it, expect } from 'vitest'
import { deviceLabel } from './usbVendors'

describe('deviceLabel', () => {
  it('names a known vendor + device', () => {
    expect(deviceLabel(0x0403, 0x6015)).toBe('FTDI FT-X')
  })

  it('names a known vendor with an unknown device by hex PID', () => {
    expect(deviceLabel(0x0403, 0x9999)).toBe('FTDI 0x9999')
  })

  it('falls back to hex VID:PID for an unknown vendor', () => {
    expect(deviceLabel(0x1234, 0x5678)).toBe('0x1234 0x5678')
  })

  it('uses the vendor alias alone when no PID is given', () => {
    expect(deviceLabel(0x0403)).toBe('FTDI')
  })

  it('returns a generic label when there is no VID', () => {
    expect(deviceLabel(undefined, undefined)).toBe('Serial device')
  })
})
