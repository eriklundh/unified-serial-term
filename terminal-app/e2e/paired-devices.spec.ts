import { test, expect } from '@playwright/test'
import { installMockSerial } from './helpers/mockSerial'
import { installMockUsb } from './helpers/mockUsb'

/**
 * Paired-device list behaviour in the connection dropdown:
 *
 *  - listPaired() probes each granted Web Serial port; ports whose open()
 *    fails (device unplugged → NetworkError) are pruned from the dropdown
 *    and their grant is revoked via forget().
 *  - Identical raw labels get " #1" / " #2" suffixes so two boards of the
 *    same model are distinguishable.
 *
 * Both were unit-tested only until now (FOLLOWUPS item: e2e coverage gaps).
 */

const PAIRED_OPTIONS = '[data-testid="connection-select"] optgroup[label="Paired devices"] option'

test('dead paired ports are pruned from the dropdown and forgotten', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('splash-dismissed', 'true')
    // Without this the app auto-reconnects to paired[0] on mount, disabling
    // the dropdown before the test can inspect it (state after an explicit
    // user Disconnect — see src/settings/reconnect.ts).
    localStorage.setItem('connection.autoReconnectSuppressed', '1')
  })
  await installMockSerial(page, {
    ports: [
      { vendorId: 0x0403, productId: 0x6015 }, // live FTDI
      { vendorId: 0x2e8a, productId: 0x000a, dead: true }, // unplugged Pico
    ],
  })
  await installMockUsb(page)
  await page.goto('/')

  // Focus triggers @refresh, so the list reflects a fresh listPaired() probe.
  await page.getByTestId('connection-select').focus()

  const options = page.locator(PAIRED_OPTIONS)
  await expect(options).toHaveCount(1)
  await expect(options.first()).toContainText('FTDI')

  // The dead port's grant was revoked.
  const forgotten = await page.evaluate(
    () => (window as Window & { __forgottenPorts: number[] }).__forgottenPorts,
  )
  expect(forgotten).toEqual([1])
})

test('duplicate device labels are numbered #1 / #2', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('splash-dismissed', 'true')
    // Without this the app auto-reconnects to paired[0] on mount, disabling
    // the dropdown before the test can inspect it (state after an explicit
    // user Disconnect — see src/settings/reconnect.ts).
    localStorage.setItem('connection.autoReconnectSuppressed', '1')
  })
  await installMockSerial(page, {
    ports: [
      { vendorId: 0x0403, productId: 0x6015 },
      { vendorId: 0x0403, productId: 0x6015 }, // same model, second board
    ],
  })
  await installMockUsb(page)
  await page.goto('/')

  await page.getByTestId('connection-select').focus()

  const options = page.locator(PAIRED_OPTIONS)
  await expect(options).toHaveCount(2)
  await expect(options.nth(0)).toContainText('#1')
  await expect(options.nth(1)).toContainText('#2')

  // Same base label on both — only the suffix differs.
  const labels = await options.allTextContents()
  expect(labels[0]?.replace('#1', '#2')).toBe(labels[1])
})
