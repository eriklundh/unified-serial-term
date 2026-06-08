import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SerialOptions } from './SerialBackend'
import { WebSerialFactory, WebSerialBackend } from './WebSerialBackend'

// ---------------------------------------------------------------------------
// FakeSerialPort — a minimal in-memory stand-in for the Web Serial SerialPort
// ---------------------------------------------------------------------------
class FakeSerialPort {
  private _readController!: ReadableStreamDefaultController<Uint8Array>
  private _readable!: ReadableStream<Uint8Array>
  private _writable!: WritableStream<Uint8Array>
  readonly written: Uint8Array[] = []
  openCalled = false
  closeCalled = false
  openOptions: SerialOptions | null = null
  onClose: (() => void) | null = null

  get readable(): ReadableStream<Uint8Array> {
    return this._readable
  }

  get writable(): WritableStream<Uint8Array> {
    return this._writable
  }

  constructor() {
    this._makeStreams()
  }

  private _makeStreams(): void {
    this._readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this._readController = controller
      },
    })
    this._writable = new WritableStream<Uint8Array>({
      write: (chunk) => {
        this.written.push(chunk)
      },
    })
  }

  async open(options: SerialOptions): Promise<void> {
    this.openCalled = true
    this.openOptions = options
    // Real Web Serial provides fresh readable/writable after each open().
    this._makeStreams()
  }

  async close(): Promise<void> {
    // Faithful to Chrome: SerialPort.close() rejects if readable or writable
    // still has an active reader/writer lock. The owner must release first.
    if (this._readable.locked || this._writable.locked) {
      throw new DOMException('Cannot cancel a locked stream', 'InvalidStateError')
    }
    this.onClose?.()
    this.closeCalled = true
  }

  simulateReceive(data: Uint8Array): void {
    this._readController.enqueue(data)
  }

  simulateDeviceUnplug(): void {
    this._readController.error(new DOMException('Device disconnected', 'NetworkError'))
  }
}

// ---------------------------------------------------------------------------
// WebSerialFactory tests
// ---------------------------------------------------------------------------
describe('WebSerialFactory', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('isAvailable() returns false when navigator.serial is absent', () => {
    const factory = new WebSerialFactory()
    // jsdom does not include navigator.serial
    expect(factory.isAvailable()).toBe(false)
  })

  it('isAvailable() returns true when navigator.serial is present', () => {
    vi.stubGlobal('navigator', { ...navigator, serial: {} })
    const factory = new WebSerialFactory()
    expect(factory.isAvailable()).toBe(true)
  })

  it('pickDevice() calls navigator.serial.requestPort and wraps result', async () => {
    const fakePort = new FakeSerialPort()
    const requestPort = vi.fn().mockResolvedValue(fakePort)
    vi.stubGlobal('navigator', {
      ...navigator,
      serial: { requestPort, getPorts: vi.fn().mockResolvedValue([]) },
    })

    const factory = new WebSerialFactory()
    const backend = await factory.pickDevice()

    expect(requestPort).toHaveBeenCalledOnce()
    expect(backend).toBeInstanceOf(WebSerialBackend)
  })

  it('listPaired() calls navigator.serial.getPorts and wraps results', async () => {
    const port1 = new FakeSerialPort()
    const port2 = new FakeSerialPort()
    const getPorts = vi.fn().mockResolvedValue([port1, port2])
    vi.stubGlobal('navigator', {
      ...navigator,
      serial: { requestPort: vi.fn(), getPorts },
    })

    const factory = new WebSerialFactory()
    const backends = await factory.listPaired()

    expect(getPorts).toHaveBeenCalledOnce()
    expect(backends).toHaveLength(2)
    expect(backends[0]).toBeInstanceOf(WebSerialBackend)
    expect(backends[1]).toBeInstanceOf(WebSerialBackend)
  })

  describe('listPaired() dead-port pruning', () => {
    it('probes each port with a transient open/close and includes live ports', async () => {
      const port = new FakeSerialPort()
      vi.stubGlobal('navigator', {
        ...navigator,
        serial: { requestPort: vi.fn(), getPorts: vi.fn().mockResolvedValue([port]) },
      })

      const backends = await new WebSerialFactory().listPaired()

      expect(backends).toHaveLength(1)
      expect(port.openCalled).toBe(true)
      expect(port.closeCalled).toBe(true)
    })

    it('includes a port that is already open (InvalidStateError) without forgetting it', async () => {
      const port = new FakeSerialPort()
      port.open = vi.fn().mockRejectedValue(new DOMException('already open', 'InvalidStateError'))
      const forget = vi.fn()
      port.forget = forget
      vi.stubGlobal('navigator', {
        ...navigator,
        serial: { requestPort: vi.fn(), getPorts: vi.fn().mockResolvedValue([port]) },
      })

      const backends = await new WebSerialFactory().listPaired()

      expect(backends).toHaveLength(1)
      expect(forget).not.toHaveBeenCalled()
    })

    it('excludes and forgets a port that throws NetworkError (device unplugged)', async () => {
      const port = new FakeSerialPort()
      port.open = vi.fn().mockRejectedValue(new DOMException('device gone', 'NetworkError'))
      const forget = vi.fn().mockResolvedValue(undefined)
      port.forget = forget
      vi.stubGlobal('navigator', {
        ...navigator,
        serial: { requestPort: vi.fn(), getPorts: vi.fn().mockResolvedValue([port]) },
      })

      const backends = await new WebSerialFactory().listPaired()

      expect(backends).toHaveLength(0)
      expect(forget).toHaveBeenCalledOnce()
    })

    it('returns live ports even when another port in the list is dead', async () => {
      const live = new FakeSerialPort()
      const dead = new FakeSerialPort()
      dead.open = vi.fn().mockRejectedValue(new DOMException('gone', 'NetworkError'))
      dead.forget = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', {
        ...navigator,
        serial: { requestPort: vi.fn(), getPorts: vi.fn().mockResolvedValue([live, dead]) },
      })

      const backends = await new WebSerialFactory().listPaired()

      expect(backends).toHaveLength(1)
    })
  })
})

// ---------------------------------------------------------------------------
// WebSerialBackend tests
// ---------------------------------------------------------------------------
describe('WebSerialBackend', () => {
  let fakePort: FakeSerialPort
  let backend: WebSerialBackend

  beforeEach(() => {
    fakePort = new FakeSerialPort()
    backend = new WebSerialBackend(fakePort as unknown as SerialPort)
  })

  afterEach(async () => {
    // Clean up any open backend to avoid test leakage
    if (backend.isOpen) {
      await backend.close()
    }
  })

  it('starts closed', () => {
    expect(backend.isOpen).toBe(false)
  })

  it('labels the device from getInfo() VID:PID, including VID:PID suffix', () => {
    const port = { getInfo: () => ({ usbVendorId: 0x0403, usbProductId: 0x6015 }) }
    expect(new WebSerialBackend(port as unknown as SerialPort).label).toBe('FTDI FT-X (0403:6015)')
  })

  it('falls back to a generic label when the port exposes no IDs', () => {
    // fakePort has no getInfo() — e.g. a non-USB CDC port.
    expect(backend.label).toBe('Serial device')
  })

  it('id is web-serial', () => {
    expect(backend.id).toBe('web-serial')
  })

  it('open() calls port.open with the given options', async () => {
    const options: SerialOptions = {
      baudRate: 115200,
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
      flowControl: 'none',
    }
    await backend.open(options)
    expect(fakePort.openCalled).toBe(true)
    expect(fakePort.openOptions).toEqual(options)
    await backend.close()
  })

  it('open() sets isOpen to true', async () => {
    await backend.open({ baudRate: 9600 })
    expect(backend.isOpen).toBe(true)
    await backend.close()
  })

  it('close() calls port.close', async () => {
    await backend.open({ baudRate: 9600 })
    await backend.close()
    expect(fakePort.closeCalled).toBe(true)
  })

  it('close() sets isOpen to false', async () => {
    await backend.open({ baudRate: 9600 })
    await backend.close()
    expect(backend.isOpen).toBe(false)
  })

  it('forwards bytes from port.readable to backend.readable', async () => {
    await backend.open({ baudRate: 9600 })

    const reader = backend.readable.getReader()
    fakePort.simulateReceive(new Uint8Array([0x41, 0x42, 0x43]))
    const { value, done } = await reader.read()
    reader.releaseLock()

    expect(done).toBe(false)
    expect(value).toEqual(new Uint8Array([0x41, 0x42, 0x43]))

    await backend.close()
  })

  it('writable forwards writes to port.writable', async () => {
    await backend.open({ baudRate: 9600 })
    const writer = backend.writable.getWriter()
    await writer.write(new Uint8Array([0x48, 0x69]))
    writer.releaseLock()
    expect(fakePort.written).toEqual([new Uint8Array([0x48, 0x69])])
    await backend.close()
  })

  it('close() succeeds while a consumer still holds a writer on backend.writable', async () => {
    // Models Terminal.vue, which acquires a writer on the exposed writable for
    // the whole session and only releases it reactively *after* disconnect.
    await backend.open({ baudRate: 9600 })
    const writer = backend.writable.getWriter()
    await writer.write(new Uint8Array([0x41]))

    let portWritableLockedAtClose = true
    fakePort.onClose = () => {
      portWritableLockedAtClose = fakePort.writable.locked
    }

    // Must not reject even though `writer` is still held by the consumer.
    await backend.close()

    expect(fakePort.closeCalled).toBe(true)
    expect(portWritableLockedAtClose).toBe(false) // backend released port.writable first
    writer.releaseLock()
  })

  it('allows a fresh open() on the same port after a held-writer disconnect', async () => {
    // Chrome hands back the *same* SerialPort object on reconnect; a writer
    // lock leaked from the previous session makes the next open() fail.
    await backend.open({ baudRate: 9600 })
    const writer = backend.writable.getWriter()
    await backend.close()
    writer.releaseLock()

    const reconnected = new WebSerialBackend(fakePort as unknown as SerialPort)
    await expect(reconnected.open({ baudRate: 9600 })).resolves.toBeUndefined()
    await reconnected.close()
  })

  it('close() releases the port reader lock before calling port.close', async () => {
    await backend.open({ baudRate: 9600 })
    expect(fakePort.readable.locked).toBe(true) // pump holds the lock

    let portReadableLockedAtClose = true
    fakePort.onClose = () => {
      portReadableLockedAtClose = fakePort.readable.locked
    }

    await backend.close()
    expect(portReadableLockedAtClose).toBe(false)
    expect(fakePort.closeCalled).toBe(true)
  })

  it('errors backend.readable when the device is unexpectedly unplugged', async () => {
    await backend.open({ baudRate: 9600 })

    const reader = backend.readable.getReader()
    fakePort.simulateDeviceUnplug()

    await expect(reader.read()).rejects.toThrow()
  })

  it('clean close() does not error backend.readable', async () => {
    await backend.open({ baudRate: 9600 })

    const reader = backend.readable.getReader()
    const readPromise = reader.read()

    await backend.close()

    const { done } = await readPromise
    expect(done).toBe(true)
  })

  it('reconfigure() calls port.close then port.open with new options', async () => {
    await backend.open({ baudRate: 9600 })
    fakePort.closeCalled = false

    await backend.reconfigure({ baudRate: 115200, parity: 'even' })

    expect(fakePort.closeCalled).toBe(true)
    expect(fakePort.openOptions).toEqual({ baudRate: 115200, parity: 'even' })
  })

  it('reconfigure() leaves isOpen true', async () => {
    await backend.open({ baudRate: 9600 })
    await backend.reconfigure({ baudRate: 115200 })
    expect(backend.isOpen).toBe(true)
  })

  it('reconfigure() does not close or error backend.readable', async () => {
    // A pending consumer read should survive a reconfigure: the data arrives
    // after the port restarts, but done stays false (stream not closed/errored).
    await backend.open({ baudRate: 9600 })

    const reader = backend.readable.getReader()
    const pendingRead = reader.read()

    await backend.reconfigure({ baudRate: 115200 })
    fakePort.simulateReceive(new Uint8Array([0x01]))

    const { done } = await pendingRead
    reader.releaseLock()

    expect(done).toBe(false)
  })

  it('reconfigure() allows data to flow from the new port streams', async () => {
    await backend.open({ baudRate: 9600 })
    await backend.reconfigure({ baudRate: 115200 })

    const reader = backend.readable.getReader()
    fakePort.simulateReceive(new Uint8Array([0xDE, 0xAD]))
    const { value } = await reader.read()
    reader.releaseLock()

    expect(value).toEqual(new Uint8Array([0xDE, 0xAD]))
  })

  it('reconfigure() allows writes to reach the new port writable', async () => {
    await backend.open({ baudRate: 9600 })
    fakePort.written.length = 0
    await backend.reconfigure({ baudRate: 115200 })

    const writer = backend.writable.getWriter()
    await writer.write(new Uint8Array([0xBE, 0xEF]))
    writer.releaseLock()

    expect(fakePort.written).toContainEqual(new Uint8Array([0xBE, 0xEF]))
  })
})

describe('WebSerialBackend.forget()', () => {
  it('calls port.forget() when available', async () => {
    const forgotPort = new FakeSerialPort() as unknown as FakeSerialPort & { forgetCalled: boolean; forget(): Promise<void> }
    forgotPort.forgetCalled = false
    forgotPort.forget = async () => { forgotPort.forgetCalled = true }

    const b = new WebSerialBackend(forgotPort as unknown as SerialPort)
    await b.forget()
    expect(forgotPort.forgetCalled).toBe(true)
  })

  it('forget() is a no-op when port has no forget method', async () => {
    const b = new WebSerialBackend(new FakeSerialPort() as unknown as SerialPort)
    await expect(b.forget()).resolves.toBeUndefined()
  })
})
