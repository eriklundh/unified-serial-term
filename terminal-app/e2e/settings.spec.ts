import { test, expect } from './fixtures'

const BAUD_RATES = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]
const DEFAULT_BAUD = '115200'

test.describe('settings panel', () => {
  test('all 6 controls are visible', async ({ mockedPage }) => {
    await expect(mockedPage.locator('[data-testid="baud-select"]')).toBeVisible()
    await expect(mockedPage.locator('[data-testid="databits-select"]')).toBeVisible()
    await expect(mockedPage.locator('[data-testid="parity-select"]')).toBeVisible()
    await expect(mockedPage.locator('[data-testid="stopbits-select"]')).toBeVisible()
    await expect(mockedPage.locator('[data-testid="flowcontrol-select"]')).toBeVisible()
    await expect(mockedPage.locator('[data-testid="echo-checkbox"]')).toBeVisible()
  })

  test('baud select has all 12 standard baud rates', async ({ mockedPage }) => {
    const options = await mockedPage
      .locator('[data-testid="baud-select"] option')
      .evaluateAll((els) => els.map((el) => Number((el as HTMLOptionElement).value)))
    expect(options).toEqual(BAUD_RATES)
  })

  test('baud change persists across reload', async ({ mockedPage }) => {
    await mockedPage.locator('[data-testid="baud-select"]').selectOption('9600')
    await mockedPage.reload()
    await expect(mockedPage.locator('[data-testid="baud-select"]')).toHaveValue('9600')
  })

  test('parity change persists across reload', async ({ mockedPage }) => {
    await mockedPage.locator('[data-testid="parity-select"]').selectOption('odd')
    await mockedPage.reload()
    await expect(mockedPage.locator('[data-testid="parity-select"]')).toHaveValue('odd')
  })

  test('flow control change persists across reload', async ({ mockedPage }) => {
    await mockedPage.locator('[data-testid="flowcontrol-select"]').selectOption('hardware')
    await mockedPage.reload()
    await expect(mockedPage.locator('[data-testid="flowcontrol-select"]')).toHaveValue('hardware')
  })

  test('echo toggle persists across reload', async ({ mockedPage }) => {
    await mockedPage.locator('[data-testid="echo-checkbox"]').check()
    await mockedPage.reload()
    await expect(mockedPage.locator('[data-testid="echo-checkbox"]')).toBeChecked()
  })

  test('Reset button restores all defaults', async ({ mockedPage }) => {
    await mockedPage.locator('[data-testid="baud-select"]').selectOption('9600')
    await mockedPage.locator('[data-testid="parity-select"]').selectOption('odd')
    await mockedPage.locator('[data-testid="flowcontrol-select"]').selectOption('hardware')
    await mockedPage.locator('[data-testid="echo-checkbox"]').check()
    await mockedPage.locator('[data-testid="reset-btn"]').click()
    await expect(mockedPage.locator('[data-testid="baud-select"]')).toHaveValue(DEFAULT_BAUD)
    await expect(mockedPage.locator('[data-testid="parity-select"]')).toHaveValue('none')
    await expect(mockedPage.locator('[data-testid="flowcontrol-select"]')).toHaveValue('none')
    await expect(mockedPage.locator('[data-testid="echo-checkbox"]')).not.toBeChecked()
  })

  test('all controls disabled while connected', async ({ mockedPage }) => {
    await mockedPage.getByRole('button', { name: /connect/i }).click()
    await expect(mockedPage.locator('[data-testid="baud-select"]')).toBeDisabled()
    await expect(mockedPage.locator('[data-testid="databits-select"]')).toBeDisabled()
    await expect(mockedPage.locator('[data-testid="parity-select"]')).toBeDisabled()
    await expect(mockedPage.locator('[data-testid="stopbits-select"]')).toBeDisabled()
    await expect(mockedPage.locator('[data-testid="flowcontrol-select"]')).toBeDisabled()
    await expect(mockedPage.locator('[data-testid="echo-checkbox"]')).toBeDisabled()
    await expect(mockedPage.locator('[data-testid="reset-btn"]')).toBeDisabled()
  })

  test('controls re-enabled after disconnect', async ({ mockedPage }) => {
    await mockedPage.getByRole('button', { name: /connect/i }).click()
    await mockedPage.getByRole('button', { name: /disconnect/i }).click()
    await expect(mockedPage.locator('[data-testid="baud-select"]')).toBeEnabled()
    await expect(mockedPage.locator('[data-testid="echo-checkbox"]')).toBeEnabled()
  })

  test('drawer scrolls when content exceeds a short viewport', async ({ mockedPage }) => {
    // Short viewport so Connection + Appearance + Storage overflow the drawer.
    await mockedPage.setViewportSize({ width: 520, height: 360 })
    const drawer = mockedPage.locator('[data-testid="settings-drawer"]')
    await expect(drawer).toBeVisible()

    const viewport = mockedPage.viewportSize()!

    // The dialog must clamp to the viewport. The UA `height: fit-content`
    // would let it grow past the bottom, hiding the lower controls with no
    // way to reach them.
    const box = await drawer.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1)

    // And it must be genuinely scrollable — a real vertical scrollbar.
    const { scrollHeight, clientHeight } = await drawer.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }))
    expect(scrollHeight).toBeGreaterThan(clientHeight)

    // The bottom-most control is reachable by scrolling within the drawer.
    const persist = mockedPage.locator('[data-testid="persist-btn"]')
    await persist.scrollIntoViewIfNeeded()
    await expect(persist).toBeVisible()
  })
})
