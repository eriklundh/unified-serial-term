import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FtdiUart } from 'ftdi-webusb-driver'
import { MockUsbTransport } from 'ftdi-webusb-driver/testing'
import type { SerialOptions } from './SerialBackend'
import { WebUsbFtdiFactory, WebUsbFtdiBackend } from './WebUsbFtdiBackend'

const FTDI_VID = 0x0403
const FTDI_PID = 0x6015

// ---------------------------------------------------------------------------
// WebUsbFtdiFactory tests
// ---------------------------------------------------------------------------
describe('WebUsbFtdiFactory', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('isAvailable() returns false when navigator.usb is absent', () => {
    const factory = new WebUsbFtdiFactory()
    // jsdom does not include navigator.usb
    expect(factory.isAvailable()).toBe(false)
  })

  it('isAvailable() returns true when navigator.usb is present', () => {
    vi.stubGlobal('navigator', { ...navigator, usb: {} })
    const factory = new WebUsbFtdiFactory()
    expect(factory.isAvailable()).toBe(true)
  })

  it('pickDevice() calls requestDevice with FTDI VID/PID filter', async () => {
    const fakeDevice = { vendorId: FTDI_VID, productId: FTDI_PID }
    const requestDevice = vi.fn().mockResolvedValue(fakeDevice)
    vi.stubGlobal('navigator', {
      ...navigator,
      usb: { requestDevice, getDevices: vi.fn().mockResolvedValue([]) },
    })

    const factory = new WebUsbFtdiFactory()
    const backend = await factory.pickDevice()

    expect(requestDevice).toHaveBeenCalledWith({
      filters: [{ vendorId: FTDI_VID, productId: FTDI_PID }],
    })
    expect(backend).toBeInstanceOf(WebUsbFtdiBackend)
  })

  it('listPaired() calls getDevices and filters to FTDI VID', async () => {
    const ftdiDevice = { vendorId: FTDI_VID }
    const otherDevice = { vendorId: 0x1234 }
    const getDevices = vi.fn().mockResolvedValue([ftdiDevice, otherDevice])
    vi.stubGlobal('navigator', {
      ...navigator,
      usb: { requestDevice: vi.fn(), getDevices },
    })

    const factory = new WebUsbFtdiFactory()
    const backends = await factory.listPaired()

    expect(getDevices).toHaveBeenCalledOnce()
    expect(backends).toHaveLength(1)
    expect(backends[0]).toBeInstanceOf(WebUsbFtdiBackend)
  })
})

// ---------------------------------------------------------------------------
// WebUsbFtdiBackend tests
// ---------------------------------------------------------------------------
describe('WebUsbFtdiBackend', () => {
  let transport: MockUsbTransport
  let ftdi: FtdiUart
  let backend: WebUsbFtdiBackend

  beforeEach(() => {
    transport = new MockUsbTransport()
    ftdi = new FtdiUart(transport)
    backend = new WebUsbFtdiBackend(ftdi)
  })

  afterEach(async () => {
    if (backend.isOpen) {
      await backend.close()
    }
  })

  it('id is webusb-ftdi', () => {
    expect(backend.id).toBe('webusb-ftdi')
  })

  it('starts closed', () => {
    expect(backend.isOpen).toBe(false)
  })

  it('open() calls ftdi.open and ftdi.configure', async () => {
    const openSpy = vi.spyOn(ftdi, 'open')
    const configureSpy = vi.spyOn(ftdi, 'configure')

    const options: SerialOptions = { baudRate: 115200 }
    await backend.open(options)

    expect(openSpy).toHaveBeenCalledOnce()
    expect(configureSpy).toHaveBeenCalledOnce()
  })

  it('open() sets isOpen to true', async () => {
    await backend.open({ baudRate: 9600 })
    expect(backend.isOpen).toBe(true)
  })

  it('translates baudRate → baud in configure call', async () => {
    const configureSpy = vi.spyOn(ftdi, 'configure')
    await backend.open({ baudRate: 57600 })
    expect(configureSpy).toHaveBeenCalledWith(expect.objectContaining({ baud: 57600 }))
  })

  it('translates flowControl "hardware" → "rtscts"', async () => {
    const configureSpy = vi.spyOn(ftdi, 'configure')
    await backend.open({ baudRate: 9600, flowControl: 'hardware' })
    expect(configureSpy).toHaveBeenCalledWith(
      expect.objectContaining({ flowControl: 'rtscts' }),
    )
  })

  it('translates flowControl "none" → "none"', async () => {
    const configureSpy = vi.spyOn(ftdi, 'configure')
    await backend.open({ baudRate: 9600, flowControl: 'none' })
    expect(configureSpy).toHaveBeenCalledWith(
      expect.objectContaining({ flowControl: 'none' }),
    )
  })

  it('sets dtr and rts true by default in configure call', async () => {
    const configureSpy = vi.spyOn(ftdi, 'configure')
    await backend.open({ baudRate: 9600 })
    expect(configureSpy).toHaveBeenCalledWith(
      expect.objectContaining({ dtr: true, rts: true }),
    )
  })

  it('readable is ftdi.readable', () => {
    expect(backend.readable).toBe(ftdi.readable)
  })

  it('writable is ftdi.writable', () => {
    expect(backend.writable).toBe(ftdi.writable)
  })

  it('close() calls ftdi.close', async () => {
    await backend.open({ baudRate: 9600 })
    const closeSpy = vi.spyOn(ftdi, 'close')
    await backend.close()
    expect(closeSpy).toHaveBeenCalledOnce()
  })

  it('close() sets isOpen to false', async () => {
    await backend.open({ baudRate: 9600 })
    await backend.close()
    expect(backend.isOpen).toBe(false)
  })
})
