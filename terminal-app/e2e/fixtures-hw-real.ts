import { test as base, chromium } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Persistent Chromium profile — Web Serial and WebUSB permissions written here
// survive between test runs so the user only has to approve the picker once.
export const HW_PROFILE_DIR = path.join(__dirname, '..', '.playwright-hw-profile')

const test = base.extend<{ hwPage: Page }, { hwContext: BrowserContext }>({
  // Worker-scoped so all tests in a run share one browser window.
  hwContext: [
    async ({}, use) => {
      const ctx = await chromium.launchPersistentContext(HW_PROFILE_DIR, {
        headless: false,
        args: ['--no-sandbox'],
        env: { ...process.env, DISPLAY: ':0' },
        baseURL: 'http://localhost:5173',
      })
      await use(ctx)
      await ctx.close()
    },
    { scope: 'worker' },
  ],

  hwPage: async ({ hwContext }, use) => {
    const page = await hwContext.newPage()
    await use(page)
    await page.close()
  },
})

export { test }
export { expect } from '@playwright/test'
