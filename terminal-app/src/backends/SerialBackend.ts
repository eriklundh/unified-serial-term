export type BackendId = 'web-serial' | 'webusb-ftdi'

export interface SerialOptions {
  baudRate: number
  dataBits?: 7 | 8
  parity?: 'none' | 'even' | 'odd'
  stopBits?: 1 | 2
  flowControl?: 'none' | 'hardware'
  // XON/XOFF deliberately omitted — Web Serial doesn't expose it.
  // ftdi-webusb-driver supports it; can be added later if needed.
}

export interface SerialBackend {
  readonly id: BackendId
  readonly label: string
  readonly isOpen: boolean
  readonly readable: ReadableStream<Uint8Array>
  readonly writable: WritableStream<Uint8Array>
  open(options: SerialOptions): Promise<void>
  close(): Promise<void>
  /** Apply new settings to an already-open port without disconnecting. */
  reconfigure(options: SerialOptions): Promise<void>
  /** Remove the browser's permission grant for this device/port. */
  forget?(): Promise<void>
}

export interface SerialBackendFactory {
  readonly id: BackendId
  readonly displayName: string
  isAvailable(): boolean
  pickDevice(): Promise<SerialBackend>
  listPaired(): Promise<SerialBackend[]>
}
