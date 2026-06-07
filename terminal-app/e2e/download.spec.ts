import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

async function push(page: Page, bytes: number[]): Promise<void> {
  await page.evaluate((b: number[]) => {
    ;(window as Window & { __pushFromDevice: (bytes: number[]) => void }).__pushFromDevice(b)
  }, bytes)
}

test.describe('Download button', () => {
  test('button is visible in the toolbar', async ({ mockedPage }) => {
    await expect(mockedPage.getByTestId('download-btn')).toBeVisible()
  })

  test('clicking Download triggers a file download with the expected filename pattern', async ({ mockedPage }) => {
    await mockedPage.getByTestId('connect-btn').click()
    const enc = new TextEncoder()
    await push(mockedPage, Array.from(enc.encode('HELLO WORLD\r\n')))

    const [download] = await Promise.all([
      mockedPage.waitForEvent('download'),
      mockedPage.getByTestId('download-btn').click(),
    ])

    expect(download.suggestedFilename()).toMatch(/^console-\d{8}-\d{6}\.txt$/)
  })

  test('downloaded file contains the terminal content', async ({ mockedPage }) => {
    await mockedPage.getByTestId('connect-btn').click()
    const enc = new TextEncoder()
    await push(mockedPage, Array.from(enc.encode('DOWNLOAD_TEST\r\n')))

    const [download] = await Promise.all([
      mockedPage.waitForEvent('download'),
      mockedPage.getByTestId('download-btn').click(),
    ])

    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer)
    }
    const content = Buffer.concat(chunks).toString('utf8')
    expect(content).toContain('DOWNLOAD_TEST')
  })

  test('focus returns to terminal after Download', async ({ mockedPage }) => {
    await mockedPage.getByTestId('connect-btn').click()
    await mockedPage.locator('.terminal-container').click()

    const [download] = await Promise.all([
      mockedPage.waitForEvent('download'),
      mockedPage.getByTestId('download-btn').click(),
    ])
    await download.cancel()

    // After the download, keystrokes should reach the terminal (xterm canvas is focused)
    const focused = await mockedPage.evaluate(() => document.activeElement?.closest('.terminal-container') !== null)
    expect(focused).toBe(true)
  })
})
