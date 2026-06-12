import type { Page } from '@playwright/test'

export interface MockSerialPortSpec {
  /** Reported by getInfo() — drives the device label in the dropdown. */
  vendorId?: number
  productId?: number
  /** Dead ports reject open() with NetworkError, as an unplugged device does. */
  dead?: boolean
}

export interface MockSerialOptions {
  paired?: boolean
  rejectPicker?: boolean
  available?: boolean
  /**
   * Explicit list of pre-granted ports (overrides `paired`). Lets tests
   * exercise dead-port pruning and duplicate-label numbering. Calls to
   * forget() are recorded in window.__forgottenPorts (by spec index).
   */
  ports?: MockSerialPortSpec[]
}

/**
 * Installs a fake navigator.serial via addInitScript.
 *
 * Exposes window globals:
 *   __pushFromDevice(bytes: number[]) — enqueue incoming bytes into the mock port
 *   __getDeviceWrites()               — return all bytes the app wrote to the port
 *   __getLastOpenOptions()            — return the SerialOptions passed to port.open()
 */
export async function installMockSerial(page: Page, opts: MockSerialOptions = {}): Promise<void> {
  const { paired = false, rejectPicker = false, available = true, ports = null } = opts
  await page.addInitScript(
    (params) => {
      const { paired, rejectPicker, available, ports } = params

      // Shared I/O infrastructure — idempotent (mockUsb may initialise it first)
      if (!window.__mockIO) {
        window.__mockIO = { controllers: [], written: [], lastOpenOptions: null }
        window.__pushFromDevice = (bytes: number[]) => {
          const ua = new Uint8Array(bytes)
          for (const ctrl of window.__mockIO.controllers) {
            try {
              ctrl.enqueue(ua.slice())
            } catch {
              // stream was cancelled on disconnect — ignore
            }
          }
        }
        window.__getDeviceWrites = () =>
          window.__mockIO.written.map((c: Uint8Array) => Array.from(c))
        window.__getLastOpenOptions = () => window.__mockIO.lastOpenOptions
      }

      if (!available) {
        // Remove navigator.serial so WebSerialFactory.isAvailable() returns false
        Object.defineProperty(navigator, 'serial', { configurable: true, value: undefined })
        return
      }

      const readable = new ReadableStream({
        start(ctrl) {
          window.__mockIO.controllers.push(ctrl)
        },
      })
      const writable = new WritableStream({
        write(chunk: Uint8Array) {
          window.__mockIO.written.push(chunk)
        },
      })

      const port = {
        open: (options: unknown) => {
          window.__mockIO.lastOpenOptions = options
          return Promise.resolve()
        },
        close: () => Promise.resolve(),
        readable,
        writable,
      }

      // Explicit port list: build one mock port per spec. Live ports get
      // their own streams (wired into the shared __mockIO controllers so
      // __pushFromDevice still works); dead ports reject open() the way an
      // unplugged device does and record forget() calls.
      window.__forgottenPorts = []
      const specPorts = (ports ?? []).map((spec: { vendorId?: number; productId?: number; dead?: boolean }, i: number) => ({
        getInfo: () => ({ usbVendorId: spec.vendorId, usbProductId: spec.productId }),
        open: (options: unknown) => {
          if (spec.dead) {
            return Promise.reject(new DOMException('The device has been lost.', 'NetworkError'))
          }
          window.__mockIO.lastOpenOptions = options
          return Promise.resolve()
        },
        close: () => Promise.resolve(),
        forget: () => {
          window.__forgottenPorts.push(i)
          return Promise.resolve()
        },
        readable: new ReadableStream({
          start(ctrl) {
            window.__mockIO.controllers.push(ctrl)
          },
        }),
        writable: new WritableStream({
          write(chunk: Uint8Array) {
            window.__mockIO.written.push(chunk)
          },
        }),
      }))

      Object.defineProperty(navigator, 'serial', {
        configurable: true,
        value: {
          requestPort: () => {
            if (rejectPicker) return Promise.reject(new DOMException('User cancelled', 'AbortError'))
            return Promise.resolve(port)
          },
          getPorts: () => Promise.resolve(ports ? specPorts : paired ? [port] : []),
          addEventListener: () => {},
          removeEventListener: () => {},
        },
      })
    },
    { paired, rejectPicker, available, ports },
  )
}

declare global {
  interface Window {
    __mockIO: {
      controllers: ReadableStreamDefaultController[]
      written: Uint8Array[]
      lastOpenOptions: unknown
    }
    __pushFromDevice: (bytes: number[]) => void
    __getDeviceWrites: () => number[][]
    __getLastOpenOptions: () => unknown
    __webusbFactory: unknown
    __forgottenPorts: number[]
  }
}
