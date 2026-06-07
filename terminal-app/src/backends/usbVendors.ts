// Friendly names for common USB-serial vendors/devices, used to label paired
// devices in the connection dropdown. A compact subset ported from
// zaxbux/web-serial-console `src/utils/usb-devices.ts` (we don't need the full
// Arduino device map — just enough to make labels human-readable).

interface VendorEntry {
  alias: string
  devices?: Record<number, string> // productId -> friendly name
}

const VENDORS: Record<number, VendorEntry> = {
  0x0403: {
    alias: 'FTDI',
    devices: { 0x6001: 'FT232R', 0x6010: 'FT2232', 0x6011: 'FT4232', 0x6014: 'FT232H', 0x6015: 'FT-X' },
  },
  0x067b: { alias: 'Prolific' },
  0x10c4: { alias: 'Silicon Labs' },
  0x1a86: { alias: 'CH34x' },
  0x2341: { alias: 'Arduino' },
  0x2a03: { alias: 'Arduino' },
}

function hex(n: number): string {
  return '0x' + n.toString(16).padStart(4, '0')
}

/**
 * A human-readable label for a USB serial device from its VID/PID. Either may be
 * undefined (e.g. a non-USB CDC port exposes no IDs).
 */
export function deviceLabel(vendorId?: number, productId?: number): string {
  if (vendorId === undefined) return 'Serial device'
  const vendor = VENDORS[vendorId]
  const vidStr = vendor?.alias ?? hex(vendorId)
  if (productId === undefined) return vidStr
  const dev = vendor?.devices?.[productId]
  return dev ? `${vidStr} ${dev}` : `${vidStr} ${hex(productId)}`
}
