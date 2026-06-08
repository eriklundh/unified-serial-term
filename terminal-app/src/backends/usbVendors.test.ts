import { describe, it, expect } from 'vitest'
import { deviceLabel } from './usbVendors'

describe('deviceLabel — VID/PID table fallback', () => {
  it('names a known vendor + device and appends VID:PID', () => {
    expect(deviceLabel(0x0403, 0x6015)).toBe('FTDI FT-X (0403:6015)')
  })

  it('names a known vendor with unknown device — shows vendor + VID:PID only', () => {
    expect(deviceLabel(0x0403, 0x9999)).toBe('FTDI (0403:9999)')
  })

  it('unknown vendor: label is just VID:PID', () => {
    expect(deviceLabel(0x1234, 0x5678)).toBe('(1234:5678)')
  })

  it('uses the vendor alias alone when no PID is given (no VID:PID suffix)', () => {
    expect(deviceLabel(0x0403)).toBe('FTDI')
  })

  it('returns a generic label when there is no VID', () => {
    expect(deviceLabel(undefined, undefined)).toBe('Serial device')
  })
})

describe('deviceLabel — USB string descriptors', () => {
  it('prefers productName and appends VID:PID', () => {
    expect(deviceLabel(0x0403, 0x6015, { productName: 'FT231X USB UART' })).toBe(
      'FT231X USB UART (0403:6015)',
    )
  })

  it('appends serialNumber in brackets then VID:PID when both descriptors present', () => {
    expect(
      deviceLabel(0x0403, 0x6015, { productName: 'FT231X USB UART', serialNumber: 'AB12CD34' }),
    ).toBe('FT231X USB UART [AB12CD34] (0403:6015)')
  })

  it('uses productName without VID:PID when VID/PID are absent', () => {
    expect(deviceLabel(undefined, undefined, { productName: 'My Device' })).toBe('My Device')
  })

  it('falls back to VID:PID table + suffix when descriptors object is empty', () => {
    expect(deviceLabel(0x0403, 0x6015, {})).toBe('FTDI FT-X (0403:6015)')
  })

  it('ignores serialNumber alone (no productName) and falls back to VID:PID table', () => {
    expect(deviceLabel(0x0403, 0x6015, { serialNumber: 'AB12CD34' })).toBe('FTDI FT-X (0403:6015)')
  })
})
