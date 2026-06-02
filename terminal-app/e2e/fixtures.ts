import { test as base } from '@playwright/test'
import type { Page } from '@playwright/test'
import { installMockSerial } from './helpers/mockSerial'
import { installMockUsb } from './helpers/mockUsb'

type Fixtures = {
  /** Page with both serial and USB mocks installed, no paired devices. */
  mockedPage: Page
  /** Page with both mocks installed and one paired device per backend (triggers auto-reconnect). */
  pairedPage: Page
}

export const test = base.extend<Fixtures>({
  mockedPage: async ({ page }, use) => {
    await installMockSerial(page)
    await installMockUsb(page)
    await page.goto('/')
    await use(page)
  },

  pairedPage: async ({ page }, use) => {
    await installMockSerial(page, { paired: true })
    await installMockUsb(page, { paired: true })
    await page.goto('/')
    await use(page)
  },
})

export { expect } from '@playwright/test'
