import { defineConfig, devices } from '@playwright/test';

const HW_TEST = !!process.env.TERMINAL_HW_TEST;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // Exclude @hardware-tagged tests unless TERMINAL_HW_TEST=1 is set (e.g. a CI
  // variable on a USB-equipped runner). `grep*` are top-level config options —
  // placing them under `use` is a silent no-op. Tag: test('@hardware …', ...).
  ...(!HW_TEST && { grepInvert: /@hardware/ }),
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
