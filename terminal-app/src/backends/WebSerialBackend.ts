import type { BackendId, SerialBackend, SerialBackendFactory, SerialOptions } from './SerialBackend'
import { deviceLabel } from './usbVendors'

// ---------------------------------------------------------------------------
// Minimal local types for the Web Serial API.
// The browser provides these at runtime; we declare just what we use.
// ---------------------------------------------------------------------------
interface WsSerialInfo {
  usbVendorId?: number
  usbProductId?: number
}

interface WsSerialPort {
  readonly readable: ReadableStream<Uint8Array> | null
  readonly writable: WritableStream<Uint8Array> | null
  getInfo?(): WsSerialInfo
  open(options: Record<string, unknown>): Promise<void>
  close(): Promise<void>
}

interface WsSerial {
  requestPort(): Promise<WsSerialPort>
  getPorts(): Promise<WsSerialPort[]>
}

// ---------------------------------------------------------------------------
// WebSerialBackend
// ---------------------------------------------------------------------------
// Wraps a native Web Serial API SerialPort. The backend owns a pump task that
// continuously reads from port.readable and re-emits chunks on the public
// `readable` stream. This lets close() cancel the pump (releasing
// port.readable's lock) before calling port.close(), avoiding the
// "port is busy" footgun.
//
// The writable side mirrors this: the public `writable` is a backend-owned
// stream whose sink forwards to a single internal writer on port.writable.
// The consumer (Terminal.vue) locks *this* stream, never port.writable
// directly, so close() can release the port-side writer before port.close().
// Exposing port.writable raw would let the consumer's long-lived writer lock
// outlive disconnect — port.close() then rejects ("Cannot cancel a locked
// stream"), the OS fd leaks, and the next open() on the same SerialPort fails.
// ---------------------------------------------------------------------------

export class WebSerialBackend implements SerialBackend {
  readonly id: BackendId = 'web-serial'
  readonly label: string

  private _port: WsSerialPort
  private _isOpen = false
  private _portReader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private _portWriter: WritableStreamDefaultWriter<Uint8Array> | null = null
  private _pumpDone: Promise<void> | null = null
  private _readController!: ReadableStreamDefaultController<Uint8Array>
  private _readableDone = false
  private _cancelledByClose = false

  readonly readable: ReadableStream<Uint8Array>
  readonly writable: WritableStream<Uint8Array>

  constructor(port: WsSerialPort) {
    this._port = port
    const info = port.getInfo?.() ?? {}
    this.label = deviceLabel(info.usbVendorId, info.usbProductId)
    this.readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this._readController = controller
      },
    })
    this.writable = new WritableStream<Uint8Array>({
      write: async (chunk) => {
        // Dropped silently if not open; the consumer only writes while
        // connected. The real writer is acquired in open().
        if (this._portWriter) await this._portWriter.write(chunk)
      },
    })
  }

  get isOpen(): boolean {
    return this._isOpen
  }

  async open(options: SerialOptions): Promise<void> {
    await this._port.open(options as unknown as Record<string, unknown>)
    this._isOpen = true
    // port.writable is non-null only after open(); own its single writer so
    // close() can release it before port.close().
    this._portWriter = (this._port.writable as WritableStream<Uint8Array>).getWriter()
    this._pumpDone = this._pump()
  }

  private async _pump(): Promise<void> {
    const portReadable = this._port.readable
    if (!portReadable) return
    this._portReader = portReadable.getReader()
    try {
      while (true) {
        const { value, done } = await this._portReader.read()
        if (done) break
        this._readController.enqueue(value)
      }
    } catch (err) {
      if (!this._cancelledByClose && !this._readableDone) {
        this._readableDone = true
        this._readController.error(err)
      }
    } finally {
      this._portReader.releaseLock()
      this._portReader = null
    }
  }

  async reconfigure(options: SerialOptions): Promise<void> {
    // Stop the pump: cancel() causes the pending read() to resolve {done:true},
    // so the pump breaks out cleanly without erroring the frontend readable.
    if (this._portReader) {
      await this._portReader.cancel()
      await this._pumpDone
      this._pumpDone = null
    }
    if (this._portWriter) {
      this._portWriter.releaseLock()
      this._portWriter = null
    }
    // Soft close+reopen on the same port object with new settings.
    // The real Web Serial API provides fresh readable/writable after open().
    await this._port.close()
    await this._port.open(options as unknown as Record<string, unknown>)
    this._portWriter = (this._port.writable as WritableStream<Uint8Array>).getWriter()
    this._pumpDone = this._pump()
  }

  async close(): Promise<void> {
    this._cancelledByClose = true
    if (this._portReader) {
      await this._portReader.cancel()
      await this._pumpDone
      this._pumpDone = null
    }
    if (this._portWriter) {
      // Release the lock on port.writable (not close()) so port.close() does
      // the actual flush/teardown, symmetric with the reader's cancel().
      this._portWriter.releaseLock()
      this._portWriter = null
    }
    await this._port.close()
    if (!this._readableDone) {
      this._readableDone = true
      this._readController.close()
    }
    this._isOpen = false
  }
}

// ---------------------------------------------------------------------------
// WebSerialFactory
// ---------------------------------------------------------------------------

export class WebSerialFactory implements SerialBackendFactory {
  readonly id: BackendId = 'web-serial'
  readonly displayName = 'Web Serial'

  isAvailable(): boolean {
    return !!(navigator as Navigator & { serial?: unknown }).serial
  }

  async pickDevice(): Promise<SerialBackend> {
    const serial = (navigator as Navigator & { serial: WsSerial }).serial
    const port = await serial.requestPort()
    return new WebSerialBackend(port)
  }

  async listPaired(): Promise<SerialBackend[]> {
    const serial = (navigator as Navigator & { serial: WsSerial }).serial
    const ports = await serial.getPorts()
    return ports.map((port) => new WebSerialBackend(port))
  }
}
