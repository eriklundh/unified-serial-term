// Quick smoke test: capture console errors and a screenshot on load.
// Run with: xvfb-run npm run test:smoke-xvfb
import { test, expect } from '@playwright/test'

test('app loads without console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: '/tmp/hw-smoke.png', fullPage: true })

  if (errors.length > 0) {
    console.log('Console errors:')
    errors.forEach((e) => console.log(' ', e))
  }
  expect(errors, 'console errors on load').toHaveLength(0)
})
