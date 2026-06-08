// Friendly names for common USB-serial vendors/devices, used to label paired
// devices in the connection dropdown.
//
// VID/PID values are public facts assigned by USB-IF (https://www.usb.org).
// Primary sources: vendor datasheets, https://usb-ids.gowdy.us/usb.ids
// (the community-maintained database powering lsusb), and vendor-specific
// repositories (e.g. https://github.com/raspberrypi/usb-pid).

interface VendorEntry {
  alias: string
  devices?: Record<number, string> // productId -> friendly name
}

const VENDORS: Record<number, VendorEntry> = {
  // FTDI — datasheets + FT_PROG default-PID list
  0x0403: {
    alias: 'FTDI',
    devices: { 0x6001: 'FT232R', 0x6010: 'FT2232', 0x6011: 'FT4232', 0x6014: 'FT232H', 0x6015: 'FT-X' },
  },
  // Prolific Technology — PL2303 is the dominant chip in cheap USB-serial cables
  0x067b: {
    alias: 'Prolific',
    devices: { 0x2303: 'PL2303', 0xaaa2: 'PL2303', 0xaaa3: 'PL2303x' },
  },
  // Silicon Labs — CP210x family is ubiquitous in IoT dev boards
  0x10c4: {
    alias: 'Silicon Labs',
    devices: {
      0xea60: 'CP210x', 0xea61: 'CP210x', 0xea63: 'CP210x',
      0xea70: 'CP2105', 0xea71: 'CP2108',
    },
  },
  // QinHeng Electronics — CH340/CH341 common on low-cost Arduino clones
  0x1a86: {
    alias: 'QinHeng',
    devices: { 0x5523: 'CH341', 0x7522: 'CH340', 0x7523: 'CH340' },
  },
  0x2341: { alias: 'Arduino' },
  0x2a03: { alias: 'Arduino' },
  // Raspberry Pi — PIDs from https://github.com/raspberrypi/usb-pid
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
