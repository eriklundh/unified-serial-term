import { test, expect } from './fixtures'
import { openSerialSettings } from './fixtures'

const BAUD_RATES = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]
const DEFAULT_BAUD = '115200'

test.describe('toolbar controls', () => {
  test('baud select lives in the toolbar — not inside the settings panel', async ({
    mockedPage,
  }) => {
    // baud is a frequently-changed setting that should be reachable without
    // opening the settings drawer (Phase 10C).
    const drawerBaud = mockedPage.locator(
      '[data-testid="settings-drawer"] [data-testid="baud-select"]',
    )
    await expect(drawerBaud).toHaveCount(0)
  })
})

test.describe('settings panel', () => {
  test('all 5 port-config controls are visible in serial settings', async ({ mockedPage }) => {
    await openSerialSettings(mockedPage)
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
    await openSerialSettings(mockedPage)
    await mockedPage.locator('[data-testid="parity-select"]').selectOption('odd')
    await mockedPage.reload()
    await openSerialSettings(mockedPage)
    await expect(mockedPage.locator('[data-testid="parity-select"]')).toHaveValue('odd')
  })

  test('flow control change persists across reload', async ({ mockedPage }) => {
    await openSerialSettings(mockedPage)
    await mockedPage.locator('[data-testid="flowcontrol-select"]').selectOption('hardware')
    await mockedPage.reload()
    await openSerialSettings(mockedPage)
    await expect(mockedPage.locator('[data-testid="flowcontrol-select"]')).toHaveValue('hardware')
  })

  test('echo toggle persists across reload', async ({ mockedPage }) => {
    await openSerialSettings(mockedPage)
    await mockedPage.locator('[data-testid="echo-checkbox"]').check()
    await mockedPage.reload()
    await openSerialSettings(mockedPage)
    await expect(mockedPage.locator('[data-testid="echo-checkbox"]')).toBeChecked()
  })

  test('Reset button restores all defaults', async ({ mockedPage }) => {
    await mockedPage.locator('[data-testid="baud-select"]').selectOption('9600')
    await openSerialSettings(mockedPage)
    await mockedPage.locator('[data-testid="parity-select"]').selectOption('odd')
    await mockedPage.locator('[data-testid="flowcontrol-select"]').selectOption('hardware')
    await mockedPage.locator('[data-testid="echo-checkbox"]').check()
    await mockedPage.locator('[data-testid="reset-btn"]').click()
    await expect(mockedPage.locator('[data-testid="baud-select"]')).toHaveValue(DEFAULT_BAUD)
    await expect(mockedPage.locator('[data-testid="parity-select"]')).toHaveValue('none')
    await expect(mockedPage.locator('[data-testid="flowcontrol-select"]')).toHaveValue('none')
    await expect(mockedPage.locator('[data-testid="echo-checkbox"]')).not.toBeChecked()
  })

  test('port-config controls stay live while connected; only Reset is disabled', async ({ mockedPage }) => {
    await mockedPage.getByTestId('connect-btn').click()
    await openSerialSettings(mockedPage)
    // Port-config controls are live for in-session reconfigure (Phase 10F).
    await expect(mockedPage.locator('[data-testid="baud-select"]')).toBeEnabled()
    await expect(mockedPage.locator('[data-testid="databits-select"]')).toBeEnabled()
    await expect(mockedPage.locator('[data-testid="parity-select"]')).toBeEnabled()
    await expect(mockedPage.locator('[data-testid="stopbits-select"]')).toBeEnabled()
    await expect(mockedPage.locator('[data-testid="flowcontrol-select"]')).toBeEnabled()
    // Reset is still disabled while connected — it would clobber the live session.
    await expect(mockedPage.locator('[data-testid="reset-btn"]')).toBeDisabled()
    await expect(mockedPage.locator('[data-testid="echo-checkbox"]')).toBeEnabled()
  })

  test('Reset button re-enabled after disconnect', async ({ mockedPage }) => {
    await mockedPage.getByTestId('connect-btn').click()
    await mockedPage.getByRole('button', { name: /disconnect/i }).click()
    await openSerialSettings(mockedPage)
    await expect(mockedPage.locator('[data-testid="reset-btn"]')).toBeEnabled()
    await expect(mockedPage.locator('[data-testid="baud-select"]')).toBeEnabled()
    await expect(mockedPage.locator('[data-testid="echo-checkbox"]')).toBeEnabled()
  })

  test('drawer scrolls when content exceeds a short viewport', async ({ mockedPage }) => {
    // Short viewport so Appearance + Storage overflow the drawer.
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
