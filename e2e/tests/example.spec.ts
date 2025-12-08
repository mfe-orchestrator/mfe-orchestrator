import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('should load successfully', async ({ page }) => {
    await page.goto('/');

    // Wait for the page to be fully loaded
    await page.waitForLoadState('networkidle');

    // Check that we're on the right page
    await expect(page).toHaveURL(/.*localhost.*/);
  });

  test('should have a title', async ({ page }) => {
    await page.goto('/');

    // Wait for the page to be fully loaded
    await page.waitForLoadState('networkidle');

    // Check that the page has a title
    await expect(page).toHaveTitle(/.+/);
  });
});
