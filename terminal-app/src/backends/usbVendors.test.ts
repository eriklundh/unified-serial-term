import { describe, it, expect } from 'vitest'
import { deviceLabel } from './usbVendors'

describe('deviceLabel — VID/PID table fallback', () => {
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

describe('deviceLabel — USB string descriptors', () => {
  it('prefers productName over the VID:PID table', () => {
    expect(deviceLabel(0x0403, 0x6015, { productName: 'FT231X USB UART' })).toBe('FT231X USB UART')
  })

  it('appends serialNumber in brackets when both are present', () => {
    expect(
      deviceLabel(0x0403, 0x6015, { productName: 'FT231X USB UART', serialNumber: 'AB12CD34' }),
    ).toBe('FT231X USB UART [AB12CD34]')
  })

  it('uses productName without brackets when serialNumber is absent', () => {
    expect(deviceLabel(undefined, undefined, { productName: 'My Device' })).toBe('My Device')
  })

  it('falls back to VID:PID table when descriptors object is empty', () => {
    expect(deviceLabel(0x0403, 0x6015, {})).toBe('FTDI FT-X')
  })

  it('ignores serialNumber alone (no productName) and falls back to VID:PID', () => {
    expect(deviceLabel(0x0403, 0x6015, { serialNumber: 'AB12CD34' })).toBe('FTDI FT-X')
  })
})
