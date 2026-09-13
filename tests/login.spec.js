import { test, expect } from '../fixtures/testSetup.js';
import { setAllureLabels } from '../utils/allureHelper.js';
import { loadTestData } from '../utils/dataUtil.js';
import { getAdminCredentials } from '../utils/config.js';
import { LoginPage } from '../pages/LoginPage.js';

const users = loadTestData('users');

test.describe('Login Module', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    setAllureLabels(testInfo, {
      suite: 'Login',
      feature: 'Authentication',
      severity: 'critical',
      module: 'Login',
      tcId: testInfo.title.match(/TC\d+/)?.[0] || 'TC',
    });
    await test.step('Open login page', async () => {
      await page.goto('/web/index.php/auth/login', { waitUntil: 'domcontentloaded' });
    });
  });

  test('TC001 — valid admin login redirects to dashboard', async ({ page }, testInfo) => {
    setAllureLabels(testInfo, {
      suite: 'Login',
      feature: 'Authentication',
      story: 'Valid credentials',
      severity: 'critical',
      module: 'Login',
      tcId: 'TC001',
    });

    const { username, password } = getAdminCredentials();
    const loginPage = new LoginPage(page);

    await test.step('Login with valid admin credentials', async () => {
      await loginPage.login(username, password);
    });
    await test.step('Verify dashboard is loaded', async () => {
      await loginPage.assertDashboardLoaded();
      await expect(page.locator('.oxd-topbar-header')).toBeVisible();
    });
  });

  test('TC002 — invalid credentials shows error alert', async ({ page }, testInfo) => {
    setAllureLabels(testInfo, {
      suite: 'Login',
      feature: 'Authentication',
      story: 'Invalid password',
      severity: 'critical',
      module: 'Login',
      tcId: 'TC002',
    });

    const loginPage = new LoginPage(page);

    await test.step('Login with invalid password', async () => {
      await loginPage.login(users.invalid.username, users.invalid.password);
    });
    await test.step('Verify error alert and remain on login page', async () => {
      await loginPage.assertInvalidCredentialsError();
      await expect(page).toHaveURL(/auth\/login/);
    });
  });

  test('TC003 — empty form submission shows two required field errors', async ({ page }, testInfo) => {
    setAllureLabels(testInfo, {
      suite: 'Login',
      feature: 'Authentication',
      story: 'Empty fields',
      severity: 'normal',
      module: 'Login',
      tcId: 'TC003',
    });

    const loginPage = new LoginPage(page);

    await test.step('Submit login form without credentials', async () => {
      await page.getByRole('button', { name: 'Login' }).click();
    });
    await test.step('Verify required field validation errors', async () => {
      await loginPage.assertRequiredErrors();
    });
  });

  test('TC004 — logout returns user to login page', async ({ page }, testInfo) => {
    setAllureLabels(testInfo, {
      suite: 'Login',
      feature: 'Authentication',
      story: 'Logout',
      severity: 'critical',
      module: 'Login',
      tcId: 'TC004',
    });

    const { username, password } = getAdminCredentials();
    const loginPage = new LoginPage(page);

    await test.step('Login with valid admin credentials', async () => {
      await loginPage.login(username, password);
      await loginPage.assertDashboardLoaded();
    });
    await test.step('Logout and verify login page', async () => {
      await loginPage.logout();
    });
  });
});
