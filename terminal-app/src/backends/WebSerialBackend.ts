import type { BackendId, SerialBackend, SerialBackendFactory, SerialOptions } from './SerialBackend'

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

  private _port: SerialPort
  private _isOpen = false
  private _portReader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private _pumpDone: Promise<void> | null = null
  private _readController!: ReadableStreamDefaultController<Uint8Array>
  private _readableClosed = false

  readonly readable: ReadableStream<Uint8Array>

  get writable(): WritableStream<Uint8Array> {
    return this._port.writable!
  }

  constructor(port: SerialPort) {
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
    await this._port.open(options as SerialOptions & Record<string, unknown>)
    this._isOpen = true
    this._pumpDone = this._pump()
  }

  private async _pump(): Promise<void> {
    this._portReader = this._port.readable!.getReader()
    try {
      while (true) {
        const { value, done } = await this._portReader.read()
        if (done) break
        this._readController.enqueue(value)
      }
    } catch {
      // pump cancelled by close()
    } finally {
      this._portReader.releaseLock()
      this._portReader = null
    }
  }

  async close(): Promise<void> {
    if (this._portReader) {
      await this._portReader.cancel()
      await this._pumpDone
      this._pumpDone = null
    }
    await this._port.close()
    if (!this._readableClosed) {
      this._readController.close()
      this._readableClosed = true
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
    return 'serial' in navigator
  }

  async pickDevice(): Promise<SerialBackend> {
    const port = await (navigator as Navigator & { serial: Serial }).serial.requestPort()
    return new WebSerialBackend(port)
  }

  async listPaired(): Promise<SerialBackend[]> {
    const ports = await (navigator as Navigator & { serial: Serial }).serial.getPorts()
    return ports.map((port) => new WebSerialBackend(port))
  }
}
