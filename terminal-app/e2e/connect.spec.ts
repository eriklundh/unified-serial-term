import { test, expect } from './fixtures'
import { installMockSerial } from './helpers/mockSerial'
import { installMockUsb } from './helpers/mockUsb'

test.describe('connect / disconnect', () => {
  test('Web Serial — connect shows Disconnect; device selector locked, port-config stays live', async ({ mockedPage }) => {
    await mockedPage.getByRole('combobox', { name: /serial connect/i }).selectOption('web-serial')
    await mockedPage.getByTestId('connect-btn').click()
    await expect(mockedPage.getByRole('button', { name: /disconnect/i })).toBeVisible()
    // Device selector is locked while connected — can't switch backend mid-session.
    await expect(mockedPage.locator('[data-testid="connection-select"]')).toBeDisabled()
    // Port-config controls stay live for in-session reconfigure (Phase 10F).
    await expect(mockedPage.locator('[data-testid="baud-select"]')).toBeEnabled()
    await expect(mockedPage.locator('[data-testid="echo-checkbox"]')).toBeEnabled()
  })

  test('WebUSB — connect shows Disconnect; device selector locked, port-config stays live', async ({ mockedPage }) => {
    await mockedPage.getByRole('combobox', { name: /serial connect/i }).selectOption('webusb-ftdi')
    await mockedPage.getByTestId('connect-btn').click()
    await expect(mockedPage.getByRole('button', { name: /disconnect/i })).toBeVisible()
    await expect(mockedPage.locator('[data-testid="connection-select"]')).toBeDisabled()
    await expect(mockedPage.locator('[data-testid="baud-select"]')).toBeEnabled()
    await expect(mockedPage.locator('[data-testid="echo-checkbox"]')).toBeEnabled()
  })

  test('Disconnect cleans up — Connect visible, device selector re-enabled', async ({
    mockedPage,
  }) => {
    await mockedPage.getByTestId('connect-btn').click()
    await mockedPage.getByRole('button', { name: /disconnect/i }).click()
    await expect(mockedPage.getByTestId('connect-btn')).toBeVisible()
    await expect(mockedPage.locator('[data-testid="connection-select"]')).toBeEnabled()
    await expect(mockedPage.locator('[data-testid="baud-select"]')).toBeEnabled()
  })

  test('Picker cancelled leaves app functional', async ({ page }) => {
    await installMockSerial(page, { rejectPicker: true })
    await installMockUsb(page, { rejectPicker: true })
    await page.goto('/')
    await page.getByTestId('connect-btn').click()
    // Button stays as Connect after a cancelled picker
    await expect(page.getByTestId('connect-btn')).toBeVisible()
    await expect(page.getByRole('button', { name: /disconnect/i })).not.toBeVisible()
  })

  test('Status message cleared on disconnect', async ({ pairedPage }) => {
    // Auto-reconnect fires on mount with a paired device — status msg appears
    await expect(pairedPage.locator('[data-testid="status-msg"]')).toContainText(
      /auto-reconnected/i,
    )
    await pairedPage.getByRole('button', { name: /disconnect/i }).click()
    await expect(pairedPage.locator('[data-testid="status-msg"]')).not.toBeVisible()
  })

  test('@hardware large data volume — terminal stable after 100 k bytes', async ({
    mockedPage,
  }) => {
    await mockedPage.getByTestId('connect-btn').click()
    const CHUNK = 1000
    const TOTAL = 100
    for (let i = 0; i < TOTAL; i++) {
      await mockedPage.evaluate((bytes) => {
        ;(window as Window & { __pushFromDevice: (b: number[]) => void }).__pushFromDevice(bytes)
      }, Array.from({ length: CHUNK }, (_, j) => (j % 95) + 32))
    }
    // Terminal is still visible and has rendered content
    await expect(mockedPage.locator('.terminal-container')).toBeVisible()
    await expect(mockedPage.locator('.xterm-rows')).not.toBeEmpty()
  })

  test('@hardware disconnect mid-stream — no errors, Connect visible', async ({ mockedPage }) => {
    await mockedPage.getByTestId('connect-btn').click()
    // Start a rapid push loop, then disconnect while it runs
    await mockedPage.evaluate(() => {
      let i = 0
      const iv = setInterval(() => {
        ;(window as Window & { __pushFromDevice: (b: number[]) => void }).__pushFromDevice([
          65 + (i++ % 26),
        ])
      }, 5)
      ;(window as Window & { __stopPush?: () => void }).__stopPush = () => clearInterval(iv)
    })
    await mockedPage.waitForTimeout(50)
    await mockedPage.getByRole('button', { name: /disconnect/i }).click()
    await mockedPage.evaluate(() => {
      ;(window as Window & { __stopPush?: () => void }).__stopPush?.()
    })
    await expect(mockedPage.getByTestId('connect-btn')).toBeVisible()
    const errors = await mockedPage.evaluate(
      () => (window as Window & { __consoleErrors?: string[] }).__consoleErrors,
    )
    expect(errors ?? []).toHaveLength(0)
  })

  test('@hardware immediate reconnect — second connect succeeds', async ({ mockedPage }) => {
    await mockedPage.getByTestId('connect-btn').click()
    await mockedPage.getByRole('button', { name: /disconnect/i }).click()
    await mockedPage.getByTestId('connect-btn').click()
    await expect(mockedPage.getByRole('button', { name: /disconnect/i })).toBeVisible()
  })
})

test.describe('focus return after toolbar actions', () => {
  test('Clear returns focus to the terminal', async ({ mockedPage }) => {
    await mockedPage.getByTestId('clear-btn').click()
    await expect(mockedPage.locator('textarea.xterm-helper-textarea')).toBeFocused()
  })

  test('closing the settings drawer returns focus to the terminal', async ({ mockedPage }) => {
    // mockedPage fixture opens the settings drawer — close it and verify focus lands
    // on the terminal, not on whatever drawer control had it last.
    await mockedPage.getByTestId('drawer-close').click()
    await expect(mockedPage.locator('textarea.xterm-helper-textarea')).toBeFocused()
  })

  test('closing the serial settings popover returns focus to the terminal (Phase 10D)', async ({ mockedPage }) => {
    await mockedPage.getByTestId('serial-settings-btn').click()
    await mockedPage.getByTestId('serial-settings-close').click()
    await expect(mockedPage.locator('textarea.xterm-helper-textarea')).toBeFocused()
  })
})
