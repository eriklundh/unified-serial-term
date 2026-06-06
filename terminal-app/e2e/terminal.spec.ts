import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// Helper — push bytes from "device" into the active backend's stream
async function push(page: Page, bytes: number[]): Promise<void> {
  await page.evaluate((b: number[]) => {
    ;(window as Window & { __pushFromDevice: (bytes: number[]) => void }).__pushFromDevice(b)
  }, bytes)
}

test.describe('terminal rendering and input', () => {
  test.beforeEach(async ({ mockedPage }) => {
    // Connect the default (Web Serial) backend
    await mockedPage.getByTestId('connect-btn').click()
    // Focus the terminal so keyboard events land in xterm
    await mockedPage.locator('.terminal-container').click()
  })

  test('device bytes appear in xterm', async ({ mockedPage }) => {
    await push(mockedPage, [72, 69, 76, 76, 79, 13, 10]) // HELLO\r\n
    await expect(mockedPage.locator('.xterm-rows')).toContainText('HELLO')
  })

  test('ANSI bold sequence — text still visible', async ({ mockedPage }) => {
    // ESC[1m ABC ESC[0m
    const seq = [0x1b, 0x5b, 0x31, 0x6d, 65, 66, 67, 0x1b, 0x5b, 0x30, 0x6d, 13, 10]
    await push(mockedPage, seq)
    await expect(mockedPage.locator('.xterm-rows')).toContainText('ABC')
  })

  test('ANSI colour sequence — text still visible', async ({ mockedPage }) => {
    // ESC[32m GREEN ESC[0m
    const enc = new TextEncoder()
    const seq = [
      ...([0x1b, 0x5b, 0x33, 0x32, 0x6d]),
      ...Array.from(enc.encode('GREEN')),
      ...([0x1b, 0x5b, 0x30, 0x6d]),
      13,
      10,
    ]
    await push(mockedPage, seq)
    await expect(mockedPage.locator('.xterm-rows')).toContainText('GREEN')
  })

  test('URL text rendered by WebLinksAddon', async ({ mockedPage }) => {
    const text = 'See https://example.com here\r\n'
    const bytes = Array.from(new TextEncoder().encode(text))
    await push(mockedPage, bytes)
    await expect(mockedPage.locator('.xterm-rows')).toContainText('example.com')
  })

  test('Ctrl+C sends 0x03 to device', async ({ mockedPage }) => {
    await mockedPage.keyboard.press('Control+C')
    const writes = await mockedPage.evaluate(() =>
      (window as Window & { __getDeviceWrites: () => number[][] }).__getDeviceWrites(),
    )
    expect(writes.flat()).toContain(0x03)
  })

  test('Ctrl+D sends 0x04 to device', async ({ mockedPage }) => {
    await mockedPage.keyboard.press('Control+D')
    const writes = await mockedPage.evaluate(() =>
      (window as Window & { __getDeviceWrites: () => number[][] }).__getDeviceWrites(),
    )
    expect(writes.flat()).toContain(0x04)
  })

  test('ArrowUp sends ESC[A to device', async ({ mockedPage }) => {
    await mockedPage.keyboard.press('ArrowUp')
    const writes = await mockedPage.evaluate(() =>
      (window as Window & { __getDeviceWrites: () => number[][] }).__getDeviceWrites(),
    )
    const flat = writes.flat()
    // ESC [ A = 0x1b 0x5b 0x41
    const idx = flat.indexOf(0x1b)
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(flat[idx + 1]).toBe(0x5b)
    expect(flat[idx + 2]).toBe(0x41)
  })

  test('Enter sends CR (0x0d) to device', async ({ mockedPage }) => {
    await mockedPage.keyboard.press('Enter')
    const writes = await mockedPage.evaluate(() =>
      (window as Window & { __getDeviceWrites: () => number[][] }).__getDeviceWrites(),
    )
    expect(writes.flat()).toContain(0x0d)
  })

  test('scrollback — many lines do not crash terminal', async ({ mockedPage }) => {
    const line = Array.from(new TextEncoder().encode('A'.repeat(40) + '\r\n'))
    for (let i = 0; i < 100; i++) {
      await push(mockedPage, line)
    }
    // Scroll up with Shift+PageUp — terminal should still be stable
    await mockedPage.keyboard.down('Shift')
    await mockedPage.keyboard.press('PageUp')
    await mockedPage.keyboard.up('Shift')
    await expect(mockedPage.locator('.terminal-container')).toBeVisible()
  })
})

test.describe('copy / paste', () => {
  test('Ctrl+Shift+V pastes clipboard text to device', async ({ mockedPage, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await mockedPage.getByTestId('connect-btn').click()
    await mockedPage.locator('.terminal-container').click()
    // Pre-load clipboard with "HI"
    await mockedPage.evaluate(() => navigator.clipboard.writeText('HI'))
    await mockedPage.keyboard.press('Control+Shift+V')
    const writes = await mockedPage.evaluate(() =>
      (window as Window & { __getDeviceWrites: () => number[][] }).__getDeviceWrites(),
    )
    // Pasted bytes should contain H (0x48) and I (0x49)
    const flat = writes.flat()
    expect(flat).toContain(0x48)
    expect(flat).toContain(0x49)
  })
})

test.describe('@hardware extended scenarios', () => {
  test('@hardware 100 k byte data volume — terminal remains stable', async ({ mockedPage }) => {
    await mockedPage.getByTestId('connect-btn').click()
    // Push 100 chunks of 1000 printable ASCII bytes each
    const chunk = Array.from({ length: 1000 }, (_, i) => (i % 95) + 32)
    chunk.push(13, 10) // end each chunk with CRLF
    for (let i = 0; i < 100; i++) {
      await mockedPage.evaluate((b: number[]) => {
        ;(window as Window & { __pushFromDevice: (bytes: number[]) => void }).__pushFromDevice(b)
      }, chunk)
    }
    await expect(mockedPage.locator('.terminal-container')).toBeVisible()
    await expect(mockedPage.locator('.xterm-rows')).not.toBeEmpty()
  })
})
