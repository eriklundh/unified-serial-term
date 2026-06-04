import type { BackendId, SerialBackend, SerialBackendFactory, SerialOptions } from './SerialBackend'

// ---------------------------------------------------------------------------
// Minimal local types for the Web Serial API.
// The browser provides these at runtime; we declare just what we use.
// ---------------------------------------------------------------------------
interface WsSerialPort {
  readonly readable: ReadableStream<Uint8Array> | null
  readonly writable: WritableStream<Uint8Array> | null
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
// ---------------------------------------------------------------------------

export class WebSerialBackend implements SerialBackend {
  readonly id: BackendId = 'web-serial'
  readonly label = 'Web Serial'

  private _port: WsSerialPort
  private _isOpen = false
  private _portReader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private _pumpDone: Promise<void> | null = null
  private _readController!: ReadableStreamDefaultController<Uint8Array>
  private _readableDone = false
  private _cancelledByClose = false

  readonly readable: ReadableStream<Uint8Array>

  get writable(): WritableStream<Uint8Array> {
    // writable is non-null while the port is open
    return this._port.writable as WritableStream<Uint8Array>
  }

  constructor(port: WsSerialPort) {
    this._port = port
    this.readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this._readController = controller
      },
    })
  }

  get isOpen(): boolean {
    return this._isOpen
  }

  async open(options: SerialOptions): Promise<void> {
    await this._port.open(options as unknown as Record<string, unknown>)
    this._isOpen = true
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

  async close(): Promise<void> {
    this._cancelledByClose = true
    if (this._portReader) {
      await this._portReader.cancel()
      await this._pumpDone
      this._pumpDone = null
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
