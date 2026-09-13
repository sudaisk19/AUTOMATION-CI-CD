import { test, expect } from '../fixtures/testSetup.js';
import { setAllureLabels } from '../utils/allureHelper.js';
import { loadTestData } from '../utils/dataUtil.js';
import { AdminPage } from '../pages/AdminPage.js';
import { discoverEmployee, getTimestamp } from '../utils/helpers.js';

const users = loadTestData('users');

test.describe.serial('Admin / User Management Module', () => {
  const sharedData = {};

  test.beforeAll(async ({ browser }) => {
    await test.step('Discover employee without system user', async () => {
      const context = await browser.newContext({ storageState: './auth.json' });
      const page = await context.newPage();
      sharedData.employee = await discoverEmployee(page, {
        withoutSystemUser: true,
        pickLast: true,
      });
      await context.close();
    });
  }, { timeout: 120_000 });

  test.beforeEach(async ({ page }, testInfo) => {
    setAllureLabels(testInfo, {
      suite: 'Admin',
      feature: 'User Management',
      severity: 'normal',
      module: 'Admin',
      tcId: testInfo.title.match(/TC\d+/)?.[0] || 'TC',
    });
  });

  test('TC012 — add system user with ESS role saves successfully', async ({ page }, testInfo) => {
    setAllureLabels(testInfo, { severity: 'critical', tcId: 'TC012' });
    const adminPage = new AdminPage(page);
    const username = `${users.newUser.username}_${getTimestamp()}`;

    await test.step('Create system user with ESS role', async () => {
      await adminPage.addUser({
        employeeName: sharedData.employee.fullName,
        username,
        password: users.newUser.password,
        role: users.newUser.role,
        status: users.newUser.status,
      });
    });
    await test.step('Verify user appears in system users list', async () => {
      await adminPage.assertUserInList(username);
      sharedData.createdUsername = username;
    });
  });

  test('TC013 — edit system user role to Admin saves successfully', async ({ page }, testInfo) => {
    setAllureLabels(testInfo, { severity: 'normal', tcId: 'TC013' });
    const adminPage = new AdminPage(page);

    await test.step('Edit user role to Admin', async () => {
      await adminPage.editUserRole(sharedData.createdUsername, users.editTarget.newRole);
    });
    await test.step('Verify user role is updated to Admin', async () => {
      await adminPage.assertUserInList(sharedData.createdUsername);
      await expect(
        page
          .locator('.oxd-table-body .oxd-table-card')
          .filter({ hasText: sharedData.createdUsername })
          .first()
      ).toContainText(/Admin/i);
    });
  });

  test('TC014 — delete system user removes from user list', async ({ page }, testInfo) => {
    setAllureLabels(testInfo, { severity: 'normal', tcId: 'TC014' });
    const adminPage = new AdminPage(page);

    await test.step('Delete system user', async () => {
      await adminPage.deleteUser(sharedData.createdUsername);
    });
    await test.step('Verify user is removed from list', async () => {
      await adminPage.assertUserNotInList(sharedData.createdUsername);
    });
  });
});
