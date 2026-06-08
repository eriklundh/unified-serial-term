// Friendly names for common USB-serial vendors/devices, used to label paired
// devices in the connection dropdown.
//
// The VID/PID values below are public facts: USB vendor IDs are assigned by
// USB-IF (https://www.usb.org) and the FTDI product IDs come straight from
// FTDI's own datasheets / the FT_PROG default-PID list. This table was written
// from those primary sources — it is NOT copied or adapted from any third-party
// project. (zaxbux/web-serial-console carries no licence and is referenced only
// for which *features* to build, never for code or data layout.) The table is
// deliberately small: just enough to make a paired device human-readable.

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
  // Raspberry Pi (VID assigned by USB-IF; PIDs from
  // https://github.com/raspberrypi/usb-pid)
  0x2e8a: {
    alias: 'Raspberry Pi',
    devices: {
      0x0003: 'RP2040 Boot',
      0x0004: 'PicoProbe',
      0x0005: 'Pico MicroPython',
      0x0009: 'Pico CDC UART',
      0x000a: 'Pico CDC UART',
      0x000b: 'Pico CircuitPython',
      0x000c: 'Debug Probe',
      0x000f: 'RP2350 Boot',
    },
  },
}

function hex(n: number): string {
  return '0x' + n.toString(16).padStart(4, '0')
}

function vidpid(vid: number, pid: number): string {
  return `(${vid.toString(16).padStart(4, '0')}:${pid.toString(16).padStart(4, '0')})`
}

interface UsbDescriptors {
  productName?: string | null
  serialNumber?: string | null
}

/**
 * A human-readable label for a USB serial device.
 *
 * Prefers USB string descriptors (productName, serialNumber) when available —
 * these come directly from the device and are more informative than table
 * lookups. Falls back to VID:PID table lookup, then to a generic label.
 * VID:PID is always appended in parentheses when both are known.
 */
export function deviceLabel(vendorId?: number, productId?: number, descriptors?: UsbDescriptors): string {
  const suffix = vendorId !== undefined && productId !== undefined
    ? ` ${vidpid(vendorId, productId)}`
    : ''

  if (descriptors?.productName) {
    const name = descriptors.serialNumber
      ? `${descriptors.productName} [${descriptors.serialNumber}]`
      : descriptors.productName
    return `${name}${suffix}`
  }

  if (vendorId === undefined) return 'Serial device'
  const vendor = VENDORS[vendorId]
  if (productId === undefined) return vendor?.alias ?? hex(vendorId)

  const dev = vendor?.devices?.[productId]
  if (dev) return `${vendor!.alias} ${dev}${suffix}`
  if (vendor?.alias) return `${vendor.alias}${suffix}`
  // Unknown vendor and device — VID:PID is the entire label.
  return suffix.trim() || `${hex(vendorId)} ${hex(productId)}`
}
