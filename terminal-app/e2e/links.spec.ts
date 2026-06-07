import { test, expect } from '@playwright/test'

/**
 * 11A — Clickable URLs
 *
 * Unit tests in src/utils/links.test.ts cover openLink() exhaustively.
 * These e2e tests verify the handler is actually wired into the terminal at
 * runtime (i.e. Terminal.vue passes openLink to WebLinksAddon) by calling
 * the handler through the window.__testOpenLink hook exposed in dev builds.
 */

test.beforeEach(async ({ page }) => {
  // Intercept window.open before the page loads.
  await page.addInitScript(() => {
    window.__openedUrls = []
    const orig = window.open.bind(window)
    window.open = (url?: string | URL, target?: string, features?: string) => {
      window.__openedUrls.push({ url: String(url ?? ''), target, features })
      return orig(url, target, features)
    }
  })
  await page.goto('/')
  // Wait for Terminal.vue to mount and expose the test hook.
  await page.waitForFunction(() => typeof window.__testOpenLink === 'function')
})

test('openLink handler is wired: http(s) URL calls window.open with noopener,noreferrer', async ({ page }) => {
  await page.evaluate((url) => {
    window.__testOpenLink!(new MouseEvent('click'), url)
  }, 'https://example.com/path?q=1')

  const opened: { url: string; target?: string; features?: string }[] =
    await page.evaluate(() => window.__openedUrls)

  expect(opened).toHaveLength(1)
  expect(opened[0].url).toBe('https://example.com/path?q=1')
  expect(opened[0].target).toBe('_blank')
  expect(opened[0].features).toBe('noopener,noreferrer')
})

test('openLink handler is wired: non-http(s) scheme is blocked', async ({ page }) => {
  await page.evaluate(() => {
    window.__testOpenLink!(new MouseEvent('click'), 'javascript:alert(1)')
    window.__testOpenLink!(new MouseEvent('click'), 'file:///etc/passwd')
  })

  const opened: { url: string }[] = await page.evaluate(() => window.__openedUrls)
  expect(opened).toHaveLength(0)
})

// Type augmentation for test helpers set by Terminal.vue (DEV builds only).
declare global {
  interface Window {
    __openedUrls: { url: string; target?: string; features?: string }[]
    __testOpenLink?: (event: MouseEvent, url: string) => void
  }
}
