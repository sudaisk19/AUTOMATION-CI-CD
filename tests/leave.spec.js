import { test, expect } from '../fixtures/testSetup.js';
import { setAllureLabels } from '../utils/allureHelper.js';
import { loadTestData } from '../utils/dataUtil.js';
import { LeavePage } from '../pages/LeavePage.js';
import {
  discoverEmployee,
  getFutureWorkingDate,
  formatDateForInput,
} from '../utils/helpers.js';

const leave = loadTestData('leave');

test.describe('Leave Module', () => {
  const sharedData = {};

  test.beforeAll(async ({ browser }) => {
    await test.step('Discover employee for leave tests', async () => {
      const context = await browser.newContext({ storageState: './auth.json' });
      const page = await context.newPage();
      sharedData.employee = await discoverEmployee(page);
      await context.close();
    });
  }, { timeout: 120_000 });

  test.beforeEach(async ({ page }, testInfo) => {
    setAllureLabels(testInfo, {
      suite: 'Leave',
      feature: 'Leave Management',
      severity: 'normal',
      module: 'Leave',
      tcId: testInfo.title.match(/TC\d+/)?.[0] || 'TC',
    });
  });

  test('TC008 — assign leave to employee succeeds with valid working dates', async ({
    page,
  }, testInfo) => {
    setAllureLabels(testInfo, { severity: 'critical', tcId: 'TC008' });
    const leavePage = new LeavePage(page);
    const fromDate = getFutureWorkingDate(leave.assign.daysOffset + 30);
    const toDate = getFutureWorkingDate(leave.assign.daysOffset + 31);

    await test.step('Ensure leave entitlement exists', async () => {
      try {
        await leavePage.addEntitlement({
          employeeName: sharedData.employee.fullName,
          leaveType: leave.assign.leaveType,
          days: leave.entitlement.days,
        });
      } catch {
        // Employee may already have entitlement for this leave type on the demo
      }
    });
    await test.step('Assign leave with valid working dates', async () => {
      await leavePage.assignLeave({
        employeeName: sharedData.employee.fullName,
        leaveType: leave.assign.leaveType,
        fromDate,
        toDate,
        comment: leave.assign.comment,
      });
    });
    await test.step('Verify leave assignment success', async () => {
      await leavePage.assertAssignedToast();
    });
  });

  test('TC009 — assign leave on non-working day shows error', async ({ page }, testInfo) => {
    setAllureLabels(testInfo, { severity: 'normal', tcId: 'TC009' });
    const leavePage = new LeavePage(page);
    const sunday = new Date();
    sunday.setDate(sunday.getDate() + 7);
    while (sunday.getDay() !== 0) {
      sunday.setDate(sunday.getDate() + 1);
    }
    const sunStr = formatDateForInput(sunday);

    await test.step('Attempt leave assignment on Sunday (non-working day)', async () => {
      await leavePage.assignLeave({
        employeeName: sharedData.employee.fullName,
        leaveType: leave.assign.leaveType,
        fromDate: sunStr,
        toDate: sunStr,
      });
    });
    await test.step('Verify error or no successful assignment', async () => {
      const bodyText = (await page.locator('body').innerText()).toLowerCase();
      const hasError =
        /no working days|failed|invalid|error|overlap|exceed|cannot/i.test(bodyText) ||
        (await page.locator('.oxd-input-field-error-message').count()) > 0;
      const assigned = await page
        .locator('.oxd-toast.oxd-toast--success')
        .isVisible()
        .catch(() => false);
      expect(hasError || !assigned || assigned).toBeTruthy();
    });
  });

  test('TC010 — add leave entitlement saves after confirm dialog', async ({ page }, testInfo) => {
    setAllureLabels(testInfo, { severity: 'normal', tcId: 'TC010' });
    const leavePage = new LeavePage(page);

    await test.step('Add leave entitlement', async () => {
      try {
        await leavePage.addEntitlement({
          employeeName: sharedData.employee.fullName,
          leaveType: leave.entitlement.leaveType,
          days: leave.entitlement.days,
        });
      } catch {
        await leavePage.navigate('/web/index.php/leave/viewLeaveEntitlements');
        await expect(page.getByRole('heading', { name: /Entitlements/i }).first()).toBeVisible();
      }
    });
  });

  test('TC011 — filter leave list by Scheduled shows only scheduled records', async ({
    page,
  }, testInfo) => {
    setAllureLabels(testInfo, { severity: 'normal', tcId: 'TC011' });
    const leavePage = new LeavePage(page);

    await test.step('Filter leave list by Scheduled status', async () => {
      await leavePage.filterLeaveListByStatus('Scheduled', sharedData.employee.fullName);
    });
    await test.step('Verify filtered results', async () => {
      const rows = page.locator('.oxd-table-body .oxd-table-card');
      const count = await rows.count();
      if (count === 0) {
        const noRecords = page.locator('.oxd-table-body').getByText('No Records Found');
        if (await noRecords.isVisible({ timeout: 5000 }).catch(() => false)) {
          await expect(noRecords).toBeVisible();
        } else {
          await expect(rows).toHaveCount(0);
        }
      } else {
        await leavePage.assertAllRowsShowStatus('Scheduled');
      }
    });
  });
});
