import { test, expect } from '@playwright/test'

test('app loads with terminal and controls visible', async ({ page }) => {
  // Must navigate to localhost (not about:blank) so Web Serial / WebUSB
  // APIs are in a secure context. See docs/PLAYWRIGHT.md §3.
  await page.goto('/')

  await expect(page).toHaveTitle(/serial/i)

  // Connection selector and Connect button are present
  await expect(page.getByRole('combobox', { name: /serial connect/i })).toBeVisible()
  await expect(page.getByTestId('connect-btn')).toBeVisible()

  // Both Web Serial and WebUSB are present in headless Chromium on localhost
  // (see docs/PLAYWRIGHT.md §4), so at least one backend is available and
  // the Connect button is enabled.
  await expect(page.getByTestId('connect-btn')).toBeEnabled()

  // Terminal pane is rendered and has a non-trivial size
  const box = await page.locator('.terminal-container').boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThan(100)
  expect(box!.height).toBeGreaterThan(50)
})
