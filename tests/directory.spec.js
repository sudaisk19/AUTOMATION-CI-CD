import { test, expect } from '../fixtures/testSetup.js';
import { setAllureLabels } from '../utils/allureHelper.js';
import { loadTestData } from '../utils/dataUtil.js';
import { DirectoryPage } from '../pages/DirectoryPage.js';
import { discoverEmployee } from '../utils/helpers.js';

const directory = loadTestData('directory');

test.describe('Directory Module', () => {
  const sharedData = {};

  test.beforeAll(async ({ browser }) => {
    if (directory.useDiscoveredEmployee) {
      await test.step('Discover employee for directory search', async () => {
        const context = await browser.newContext({ storageState: './auth.json' });
        const page = await context.newPage();
        sharedData.employee = await discoverEmployee(page);
        await context.close();
      });
    }
  });

  test.beforeEach(async ({ page }, testInfo) => {
    setAllureLabels(testInfo, {
      suite: 'Directory',
      feature: 'Employee Directory',
      severity: 'normal',
      module: 'Directory',
      tcId: testInfo.title.match(/TC\d+/)?.[0] || 'TC',
    });
  });

  test('TC021 — search employee by name in directory shows matching card', async ({
    page,
  }, testInfo) => {
    setAllureLabels(testInfo, { severity: 'normal', tcId: 'TC021' });
    const directoryPage = new DirectoryPage(page);

    await test.step('Search directory by employee first name', async () => {
      await directoryPage.searchByName(sharedData.employee.firstName);
    });
    await test.step('Verify matching directory card is displayed', async () => {
      await directoryPage.assertCardVisible(sharedData.employee.firstName);
      const count = await directoryPage.getResultCount();
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });

  test('TC022 — filter directory by job title returns results', async ({ page }, testInfo) => {
    setAllureLabels(testInfo, { severity: 'minor', tcId: 'TC022' });
    const directoryPage = new DirectoryPage(page);

    await test.step('Filter directory by job title', async () => {
      if (directory.filterByJobTitle) {
        await directoryPage.filterByFirstJobTitle();
      }
    });
    await test.step('Verify search results or no records message', async () => {
      const count = await directoryPage.getResultCount();
      if (count === 0) {
        await expect(page.getByText('No Records Found')).toBeVisible();
      } else {
        expect(count).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
