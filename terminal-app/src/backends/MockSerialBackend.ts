import type { BackendId, SerialBackend, SerialOptions } from './SerialBackend'

export class MockSerialBackend implements SerialBackend {
  readonly id: BackendId = 'web-serial'
  readonly label = 'Mock Serial'

  private _isOpen = false
  private _readController: ReadableStreamDefaultController<Uint8Array> | null = null
  readonly readable: ReadableStream<Uint8Array>
  readonly writable: WritableStream<Uint8Array>
  readonly written: Uint8Array[] = []
  lastOptions: SerialOptions | null = null
  lastReconfigureOptions: SerialOptions | null = null

  constructor() {
    this.readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this._readController = controller
      },
    })

    this.writable = new WritableStream<Uint8Array>({
      write: (chunk) => {
        this.written.push(chunk)
      },
    })
  }

  get isOpen(): boolean {
    return this._isOpen
  }

  async open(options: SerialOptions): Promise<void> {
    this.lastOptions = options
    this._isOpen = true
  }

  async close(): Promise<void> {
    this._isOpen = false
  }

  async reconfigure(options: SerialOptions): Promise<void> {
    this.lastReconfigureOptions = options
  }

  async forget(): Promise<void> {
    // no-op stub; spy on this in tests that need to verify revocation
  }

  simulateReceive(data: Uint8Array): void {
    this._readController?.enqueue(data)
  }
}
