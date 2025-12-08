import { test as base } from '@playwright/test';

/**
 * Example of custom fixtures.
 * Fixtures are used to establish environment for each test.
 * You can use them to:
 * - Set up test data
 * - Create authenticated sessions
 * - Share common setup between tests
 * - Provide test-specific utilities
 */

type CustomFixtures = {
  // Add your custom fixtures here
  // Example: authenticatedPage: Page;
};

// Extend the base test with custom fixtures
export const test = base.extend<CustomFixtures>({
  // Define your fixtures here
  // Example:
  // authenticatedPage: async ({ page }, use) => {
  //   // Setup: login to the application
  //   await page.goto('/login');
  //   await page.fill('[name="email"]', 'test@example.com');
  //   await page.fill('[name="password"]', 'password');
  //   await page.click('[type="submit"]');
  //
  //   // Use the fixture
  //   await use(page);
  //
  //   // Teardown (optional)
  //   await page.context().clearCookies();
  // },
});

export { expect } from '@playwright/test';
