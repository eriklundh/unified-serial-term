import type { Page } from '@playwright/test'

export interface MockSerialOptions {
  paired?: boolean
  rejectPicker?: boolean
  available?: boolean
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
  const { paired = false, rejectPicker = false, available = true } = opts
  await page.addInitScript(
    (params) => {
      const { paired, rejectPicker, available } = params

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

      Object.defineProperty(navigator, 'serial', {
        configurable: true,
        value: {
          requestPort: () => {
            if (rejectPicker) return Promise.reject(new DOMException('User cancelled', 'AbortError'))
            return Promise.resolve(port)
          },
          getPorts: () => Promise.resolve(paired ? [port] : []),
          addEventListener: () => {},
          removeEventListener: () => {},
        },
      })
    },
    { paired, rejectPicker, available },
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
  }
}
