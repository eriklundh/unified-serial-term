import { test, expect } from './fixtures'
import { installMockSerial } from './helpers/mockSerial'
import { installMockUsb } from './helpers/mockUsb'

test.describe('connection selector', () => {
  test('both backends shown when both mocks installed', async ({ mockedPage }) => {
    const options = await mockedPage
      .locator('#connection-select option')
      .evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value))
    expect(options).toContain('web-serial')
    expect(options).toContain('webusb-ftdi')
  })

  test('only Web Serial shown when WebUSB is unavailable', async ({ page }) => {
    await installMockSerial(page)
    await installMockUsb(page, { available: false })
    await page.goto('/')
    const options = await page
      .locator('#connection-select option')
      .evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value))
    expect(options).toContain('web-serial')
    expect(options).not.toContain('webusb-ftdi')
  })

  test('no-backend message when both unavailable', async ({ page }) => {
    await installMockSerial(page, { available: false })
    await installMockUsb(page, { available: false })
    await page.goto('/')
    await expect(page.locator('[data-testid="no-backend-msg"]')).toBeVisible()
    await expect(page.locator('[data-testid="no-backend-msg"]')).toContainText(/chromium/i)
  })

  test('WebUSB selection persists across reload', async ({ mockedPage }) => {
    await mockedPage.getByRole('combobox', { name: /serial connect/i }).selectOption('webusb-ftdi')
    await mockedPage.reload()
    await expect(mockedPage.getByRole('combobox', { name: /serial connect/i })).toHaveValue('webusb-ftdi')
  })

  test('selector disabled while connected', async ({ mockedPage }) => {
    await mockedPage.getByTestId('connect-btn').click()
    await expect(mockedPage.getByRole('combobox', { name: /serial connect/i })).toBeDisabled()
  })
})
