import { test, expect } from './fixtures'
import { installMockSerial } from './helpers/mockSerial'
import { installMockUsb } from './helpers/mockUsb'

test.describe('auto-reconnect', () => {
  test('auto-reconnects on mount when a paired device exists', async ({ pairedPage }) => {
    await expect(pairedPage.locator('[data-testid="status-msg"]')).toContainText(
      /auto-reconnected/i,
    )
    await expect(pairedPage.getByRole('button', { name: /disconnect/i })).toBeVisible()
  })

  test('saved settings applied during auto-reconnect', async ({ page }) => {
    // First load: change baud rate and store it
    await installMockSerial(page)
    await installMockUsb(page)
    await page.goto('/')
    await page.locator('[data-testid="settings-btn"]').click() // serial settings live in the drawer now
    await page.locator('[data-testid="baud-select"]').selectOption('9600')

    // Second load: paired device triggers auto-reconnect with saved settings
    await installMockSerial(page, { paired: true })
    await installMockUsb(page, { paired: true })
    await page.reload()

    await expect(page.locator('[data-testid="status-msg"]')).toContainText(/auto-reconnected/i)
    const opts = await page.evaluate(() =>
      (
        window as Window & { __getLastOpenOptions: () => Record<string, unknown> }
      ).__getLastOpenOptions(),
    )
    expect((opts as { baudRate?: number }).baudRate).toBe(9600)
  })

  test('no status message when no paired device found', async ({ mockedPage }) => {
    // Default mockedPage has paired: false — listPaired returns []
    await expect(mockedPage.locator('[data-testid="status-msg"]')).not.toBeVisible()
    await expect(mockedPage.getByRole('button', { name: /connect/i })).toBeVisible()
  })
})
