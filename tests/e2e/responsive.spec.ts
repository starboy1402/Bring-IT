// @ts-nocheck
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 667 } }); // Mobile viewport (iPhone SE)

test('Mobile responsive smoke test', async ({ page }) => {
  await page.goto('/');
  // Basic smoke check for responsive rendering (no horizontal scroll or hidden main elements)
  await expect(page.locator('body')).toBeVisible();
  
  // Depending on the app's initial state (e.g. login page)
  const isLoginPage = await page.getByRole('heading', { name: /Log In|Sign In/i }).isVisible().catch(() => false);
  if (isLoginPage) {
    await expect(page.getByRole('button', { name: /Sign In|Log In/i })).toBeVisible();
  }

  // Ensure no horizontal scroll by checking layout
  const bodyWidth = await page.evaluate(() => (document as any).body.scrollWidth);
  const windowWidth = await page.evaluate(() => (window as any).innerWidth);
  expect(bodyWidth).toBeLessThanOrEqual(windowWidth);
});
