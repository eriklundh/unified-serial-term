import { test, expect, openSerialSettings } from './fixtures'

test.describe('local echo', () => {
  test('echo off (default) — keystroke absent until device echoes back', async ({
    mockedPage,
  }) => {
    await mockedPage.getByTestId('connect-btn').click()
    await mockedPage.locator('.terminal-container').click()
    await mockedPage.keyboard.type('X')
    // With echo off, X should not appear in xterm yet
    await expect(mockedPage.locator('.xterm-rows')).not.toContainText('X')
    // Device echoes X back
    await mockedPage.evaluate(() => {
      ;(window as Window & { __pushFromDevice: (b: number[]) => void }).__pushFromDevice([0x58])
    })
    await expect(mockedPage.locator('.xterm-rows')).toContainText('X')
  })

  test('echo on — keystroke appears immediately in xterm', async ({ mockedPage }) => {
    // Enable echo before connecting
    await openSerialSettings(mockedPage)
    await mockedPage.locator('[data-testid="echo-checkbox"]').check()
    await mockedPage.getByTestId('connect-btn').click()
    await mockedPage.locator('.terminal-container').click()
    await mockedPage.keyboard.type('X')
    // With echo on, X should appear immediately without a device push
    await expect(mockedPage.locator('.xterm-rows')).toContainText('X')
  })

  test('echo on — keystroke still sent to device', async ({ mockedPage }) => {
    await openSerialSettings(mockedPage)
    await mockedPage.locator('[data-testid="echo-checkbox"]').check()
    await mockedPage.getByTestId('connect-btn').click()
    await mockedPage.locator('.terminal-container').click()
    await mockedPage.keyboard.type('X')
    const writes = await mockedPage.evaluate(() =>
      (window as Window & { __getDeviceWrites: () => number[][] }).__getDeviceWrites(),
    )
    expect(writes.flat()).toContain(0x58) // 'X'
  })

  test('echo off — keystroke still sent to device', async ({ mockedPage }) => {
    // Echo is off by default
    await mockedPage.getByTestId('connect-btn').click()
    await mockedPage.locator('.terminal-container').click()
    await mockedPage.keyboard.type('X')
    const writes = await mockedPage.evaluate(() =>
      (window as Window & { __getDeviceWrites: () => number[][] }).__getDeviceWrites(),
    )
    expect(writes.flat()).toContain(0x58) // 'X' still forwarded
  })
})
