import { test, expect } from '@playwright/test'
import { installMockSerial } from './helpers/mockSerial'
import { installMockUsb } from './helpers/mockUsb'

/**
 * 11D — Splash screen
 *
 * The splash overlay appears over the terminal pane on load and is dismissed
 * by the first terminal activity: either a keystroke (xterm onData) or a
 * received byte from the device (readLoop chunk).
 */

test('splash overlay is visible on load', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('splash-overlay')).toBeVisible()
})

test('splash disappears after a keystroke', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('splash-overlay')).toBeVisible()

  // Focus xterm's internal input directly (the overlay covers the terminal div,
  // so clicking it would hit the splash instead of focusing xterm).
  // The xterm helper textarea is visibility:hidden, so use 'attached' not 'visible'.
  await page.waitForSelector('.xterm-helper-textarea', { state: 'attached' })
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('.xterm-helper-textarea')?.focus()
  })
  await page.keyboard.press('a')

  await expect(page.getByTestId('splash-overlay')).not.toBeVisible()
})

test('splash disappears after a byte received from device', async ({ page }) => {
  await installMockSerial(page)
  await installMockUsb(page)
  await page.goto('/')
  await expect(page.getByTestId('splash-overlay')).toBeVisible()

  // Connect to the mock serial device so __pushFromDevice has an active stream controller
  await page.getByTestId('connect-btn').click()

  // Push one byte from the "device" side
  await page.evaluate((bytes: number[]) => {
    ;(window as Window & { __pushFromDevice: (b: number[]) => void }).__pushFromDevice(bytes)
  }, [0x41])

  await expect(page.getByTestId('splash-overlay')).not.toBeVisible()
})

test('splash does not appear when "Don\'t show again" was previously checked', async ({ page }) => {
  // Simulate prior check: set the flag before the page loads
  await page.addInitScript(() => {
    localStorage.setItem('splash-dismissed', 'true')
  })
  await page.goto('/')
  await expect(page.getByTestId('splash-overlay')).not.toBeVisible()
})

test('splash hides when a connection is established (no data needed)', async ({ page }) => {
  await installMockSerial(page)
  await installMockUsb(page)
  await page.goto('/')
  await expect(page.getByTestId('splash-overlay')).toBeVisible()

  // Connect only — no byte is pushed; hiding is driven by the isConnected watcher.
  await page.getByTestId('connect-btn').click()

  await expect(page.getByTestId('splash-overlay')).not.toBeVisible()
})

test('"Show splash screen" setting restores a dismissed splash', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('splash-dismissed', 'true')
  })
  await page.goto('/')
  await expect(page.getByTestId('splash-overlay')).not.toBeVisible()

  await page.getByTestId('settings-btn').click()
  await page.getByTestId('show-splash').check()

  await expect(page.getByTestId('splash-overlay')).toBeVisible()
  // The persisted dismissal flag is cleared, so it also shows on next load.
  expect(await page.evaluate(() => localStorage.getItem('splash-dismissed'))).toBeNull()
})
