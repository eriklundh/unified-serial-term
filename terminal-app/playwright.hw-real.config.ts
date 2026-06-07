import { defineConfig } from '@playwright/test'

// Headed hardware test config — runs e2e/hw-real.spec.ts against real USB devices.
// Browser launches with DISPLAY=:0 (X11 on Pi5 desktop) and a persistent profile
// so Web Serial / WebUSB permissions survive across runs.
//
// First run: approve the port/device picker manually in the browser window.
// Subsequent runs: previously-granted devices appear in the paired-device dropdown
// and connect without a picker.
//
// Run: npm run test:hw-real
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/hw-real.spec.ts',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
