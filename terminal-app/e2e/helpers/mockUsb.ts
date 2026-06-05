import type { Page } from '@playwright/test'

export interface MockUsbOptions {
  paired?: boolean
  rejectPicker?: boolean
  available?: boolean
}

/**
 * Installs a mock WebUSB factory via addInitScript (Approach B from PLAYWRIGHT.md).
 *
 * Sets window.__webusbFactory before Vue mounts, so main.ts picks it up instead
 * of WebUsbFtdiFactory. The mock backend bypasses FtdiUart entirely and exposes
 * simple ReadableStream / WritableStream streams.
 *
 * Shares the same window.__pushFromDevice / __getDeviceWrites globals as
 * mockSerial.ts so tests can drive whichever backend is active.
 */
export async function installMockUsb(page: Page, opts: MockUsbOptions = {}): Promise<void> {
  const { paired = false, rejectPicker = false, available = true } = opts
  await page.addInitScript(
    (params) => {
      const { paired, rejectPicker, available } = params

      // Shared I/O infrastructure — idempotent (mockSerial may initialise it first)
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

      const mockBackend = {
        id: 'webusb-ftdi',
        label: 'WebUSB (FTDI)',
        isOpen: false,
        get readable() {
          return readable
        },
        get writable() {
          return writable
        },
        open: (options: unknown) => {
          window.__mockIO.lastOpenOptions = options
          mockBackend.isOpen = true
          return Promise.resolve()
        },
        close: () => {
          mockBackend.isOpen = false
          return Promise.resolve()
        },
      }

      window.__webusbFactory = {
        id: 'webusb-ftdi',
        displayName: 'WebUSB (FTDI)',
        isAvailable: () => available,
        pickDevice: () => {
          if (rejectPicker) return Promise.reject(new Error('User cancelled'))
          return Promise.resolve(mockBackend)
        },
        listPaired: () => Promise.resolve(paired ? [mockBackend] : []),
      }
    },
    { paired, rejectPicker, available },
  )
}
