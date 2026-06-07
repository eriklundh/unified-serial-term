import { FtdiUart, WebUsbTransport } from 'ftdi-webusb-driver'
import type { SerialOptions as FtdiSerialOptions } from 'ftdi-webusb-driver'
import type { BackendId, SerialBackend, SerialBackendFactory, SerialOptions } from './SerialBackend'
import { deviceLabel } from './usbVendors'

const FTDI_VID = 0x0403
const FTDI_PID = 0x6015 // FT231X / FT-X series

// ---------------------------------------------------------------------------
// Option translation
// ---------------------------------------------------------------------------

function translateOptions(opts: SerialOptions): FtdiSerialOptions {
  return {
    baud: opts.baudRate,
    dataBits: opts.dataBits,
    parity: opts.parity,
    stopBits: opts.stopBits,
    flowControl: opts.flowControl === 'hardware' ? 'rtscts' : 'none',
    dtr: true,
    rts: true,
  }
}

// ---------------------------------------------------------------------------
// WebUsbFtdiBackend
// ---------------------------------------------------------------------------

export class WebUsbFtdiBackend implements SerialBackend {
  readonly id: BackendId = 'webusb-ftdi'
  readonly label: string

  private _ftdi: FtdiUart
  private _isOpen = false

  get readable(): ReadableStream<Uint8Array> {
    return this._ftdi.readable
  }

  get writable(): WritableStream<Uint8Array> {
    return this._ftdi.writable
  }

  constructor(ftdi: FtdiUart, productId: number = FTDI_PID) {
    this._ftdi = ftdi
    this.label = deviceLabel(FTDI_VID, productId)
  }

  get isOpen(): boolean {
    return this._isOpen
  }

  async open(options: SerialOptions): Promise<void> {
    await this._ftdi.open()
    await this._ftdi.configure(translateOptions(options))
    this._isOpen = true
  }

  async close(): Promise<void> {
    await this._ftdi.close()
    this._isOpen = false
  }

  async reconfigure(options: SerialOptions): Promise<void> {
    await this._ftdi.configure(translateOptions(options))
  }
}

// ---------------------------------------------------------------------------
// Minimal WebUSB navigator types (the DOM lib doesn't include WebUSB)
// ---------------------------------------------------------------------------
interface WsUsbDeviceFilter {
  vendorId?: number
  productId?: number
}

interface WsUsbDevice {
  readonly vendorId: number
  readonly productId: number
}

interface WsUsb {
  requestDevice(opts: { filters: WsUsbDeviceFilter[] }): Promise<WsUsbDevice>
  getDevices(): Promise<WsUsbDevice[]>
}

// ---------------------------------------------------------------------------
// WebUsbFtdiFactory
// ---------------------------------------------------------------------------

export class WebUsbFtdiFactory implements SerialBackendFactory {
  readonly id: BackendId = 'webusb-ftdi'
  readonly displayName = 'WebUSB (FTDI)'

  isAvailable(): boolean {
    return 'usb' in navigator
  }

  async pickDevice(): Promise<SerialBackend> {
    const usb = (navigator as Navigator & { usb: WsUsb }).usb
    const device = await usb.requestDevice({
      filters: [{ vendorId: FTDI_VID, productId: FTDI_PID }],
    })
    const transport = new WebUsbTransport(device as unknown as USBDevice)
    return new WebUsbFtdiBackend(new FtdiUart(transport), device.productId)
  }

  async listPaired(): Promise<SerialBackend[]> {
    const usb = (navigator as Navigator & { usb: WsUsb }).usb
    const devices = await usb.getDevices()
    return devices
      .filter((d) => d.vendorId === FTDI_VID)
      .map((device) => {
        const transport = new WebUsbTransport(device as unknown as USBDevice)
        return new WebUsbFtdiBackend(new FtdiUart(transport), device.productId)
      })
  }
}
