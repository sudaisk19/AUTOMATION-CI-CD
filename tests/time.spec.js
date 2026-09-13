import { test } from '../fixtures/testSetup.js';
import { setAllureLabels, attachTestData } from '../utils/allureHelper.js';
import { loadTestData } from '../utils/dataUtil.js';
import { TimePage } from '../pages/TimePage.js';

const timeData = loadTestData('timeData');

test.describe.serial('Time & Attendance', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }, testInfo) => {
    setAllureLabels(testInfo, {
      suite: 'Time',
      feature: 'Time & Attendance',
      severity: 'normal',
      module: 'Time',
      tcId: testInfo.title.match(/TC\d+/)?.[0] || 'TC',
    });
    await test.step('Ensure authenticated session on demo', async () => {
      if (!page.url().includes('orangehrmlive.com')) {
        await page.goto('/web/index.php/dashboard/index', { waitUntil: 'domcontentloaded' });
      }
    });
  });

  test('TC023 — submit current period timesheet saves successfully', async ({ page }, testInfo) => {
    setAllureLabels(testInfo, { severity: 'normal', tcId: 'TC023' });
    const timePage = new TimePage(page);

    await test.step('Submit current period timesheet', async () => {
      await timePage.submitCurrentTimesheet();
    });
  });

  test('TC024 — punch in records attendance entry', async ({ page }, testInfo) => {
    setAllureLabels(testInfo, { severity: 'critical', tcId: 'TC024' });
    const timePage = new TimePage(page);

    await test.step('Attach attendance test data to report', async () => {
      await attachTestData(testInfo, timeData.attendance, 'time-attendance-data');
    });
    await test.step('Record punch in', async () => {
      await timePage.punchIn();
    });
  });

  test('TC025 — punch out after punch in records duration', async ({ page }, testInfo) => {
    setAllureLabels(testInfo, { severity: 'critical', tcId: 'TC025' });
    const timePage = new TimePage(page);

    await test.step('Record punch out', async () => {
      await timePage.punchOut();
    });
    await test.step('Verify attendance record exists', async () => {
      await timePage.assertPunchRecordExists();
    });
  });
});
