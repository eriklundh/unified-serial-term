import { test, expect } from '@playwright/test';
test('page loads', async ({ page }) => {
  await page.goto('about:blank');
  expect(await page.title()).toBe('');
});
