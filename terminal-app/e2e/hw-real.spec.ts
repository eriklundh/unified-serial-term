import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { test, expect } from './fixtures-hw-real'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const FTDI_UNBIND = path.resolve(__dirname, '../../../ftdi-unbind/macos-linux/ftdi-unbind')
const FTDI_BIND   = path.resolve(__dirname, '../../../ftdi-unbind/macos-linux/ftdi-bind')
const FTDI_VID_PID = '0403:6015'

// How long to wait for the user to approve a browser picker on first run.
const PICKER_TIMEOUT = 60_000

/**
 * Focus the ConnectionSelect dropdown (triggers getPorts/getDevices refresh),
 * then return the value of the first paired option matching backendPrefix,
 * or null if none are present.
 */
async function firstPairedValue(page: import('@playwright/test').Page, backendPrefix: string) {
  await page.locator('[data-testid="connection-select"]').click()
  await page.waitForTimeout(400)
  const opt = page.locator(
    `[data-testid="connection-select"] option[value^="paired:${backendPrefix}"]`,
  ).first()
  if ((await opt.count()) === 0) return null
  return opt.getAttribute('value')
}

// ── Web Serial — Pico CDC /dev/ttyACM0 ───────────────────────────────────────

test.describe('Web Serial — Pico CDC', () => {
  test('Connect and Disconnect', async ({ hwPage }) => {
    await hwPage.goto('/')

    const paired = await firstPairedValue(hwPage, 'web-serial')
    if (paired) {
      console.log(`  Paired port found: ${paired}`)
      await hwPage.locator('[data-testid="connection-select"]').selectOption(paired)
    } else {
      console.log('  No paired port — approve the Web Serial picker in the browser window.')
      await hwPage.locator('[data-testid="connection-select"]').selectOption('web-serial')
    }

    await hwPage.getByTestId('connect-btn').click()
    await expect(hwPage.getByRole('button', { name: /disconnect/i })).toBeVisible({
      timeout: PICKER_TIMEOUT,
    })
    console.log('  PASS: Connected via Web Serial.')

    await hwPage.getByRole('button', { name: /disconnect/i }).click()
    await expect(hwPage.getByTestId('connect-btn')).toBeVisible()
    console.log('  PASS: Disconnected cleanly.')
  })
})

// ── WebUSB — FTDI 0403:6015 ───────────────────────────────────────────────────

test.describe('WebUSB — FTDI 0403:6015', () => {
  test.beforeAll(() => {
    console.log('  Unbinding ftdi_sio so WebUSB can claim the device...')
    execSync(`sudo ${FTDI_UNBIND} ${FTDI_VID_PID}`, { stdio: 'inherit' })
  })

  test.afterAll(() => {
    console.log('  Rebinding ftdi_sio...')
    execSync(`sudo ${FTDI_BIND} ${FTDI_VID_PID}`, { stdio: 'inherit' })
  })

  test('Connect and Disconnect', async ({ hwPage }) => {
    await hwPage.goto('/')

    const paired = await firstPairedValue(hwPage, 'webusb-ftdi')
    if (paired) {
      console.log(`  Paired device found: ${paired}`)
      await hwPage.locator('[data-testid="connection-select"]').selectOption(paired)
    } else {
      console.log('  No paired device — approve the WebUSB picker in the browser window.')
      await hwPage.locator('[data-testid="connection-select"]').selectOption('webusb-ftdi')
    }

    await hwPage.getByTestId('connect-btn').click()
    await expect(hwPage.getByRole('button', { name: /disconnect/i })).toBeVisible({
      timeout: PICKER_TIMEOUT,
    })
    console.log('  PASS: Connected via WebUSB.')

    await hwPage.getByRole('button', { name: /disconnect/i }).click()
    await expect(hwPage.getByTestId('connect-btn')).toBeVisible()
    console.log('  PASS: Disconnected cleanly.')
  })
})
