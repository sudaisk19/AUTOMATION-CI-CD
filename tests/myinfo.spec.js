import { test, expect } from '../fixtures/testSetup.js';
import { setAllureLabels } from '../utils/allureHelper.js';
import { loadTestData } from '../utils/dataUtil.js';
import { MyInfoPage } from '../pages/MyInfoPage.js';
import { getTimestamp } from '../utils/helpers.js';

const myinfo = loadTestData('myinfo');

test.describe('My Info Module', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    setAllureLabels(testInfo, {
      suite: 'My Info',
      feature: 'Self Service',
      severity: 'normal',
      module: 'MyInfo',
      tcId: testInfo.title.match(/TC\d+/)?.[0] || 'TC',
    });
    await test.step('Open My Info page', async () => {
      await page.goto('/web/index.php/pim/viewMyDetails', { waitUntil: 'domcontentloaded' });
    });
  });

  test('TC018 — update personal info nickname field saves successfully', async ({
    page,
  }, testInfo) => {
    setAllureLabels(testInfo, { severity: 'normal', tcId: 'TC018' });
    const myInfo = new MyInfoPage(page);

    await test.step('Update nickname field', async () => {
      await myInfo.updateNickname(`${myinfo.nicknamePrefix}${getTimestamp()}`);
    });
  });

  test('TC019 — add emergency contact with name, relationship, phone saves successfully', async ({
    page,
  }, testInfo) => {
    setAllureLabels(testInfo, { severity: 'normal', tcId: 'TC019' });
    const ts = getTimestamp();
    const myInfo = new MyInfoPage(page);
    const contactName = `${myinfo.emergencyContact.namePrefix}${ts}`;

    await test.step('Add emergency contact', async () => {
      await myInfo.addEmergencyContact({
        name: contactName,
        relationship: myinfo.emergencyContact.relationship,
        homeTelephone: myinfo.emergencyContact.homeTelephone,
      });
    });
    await test.step('Verify contact name is visible', async () => {
      await expect(page.getByText(contactName)).toBeVisible();
    });
  });

  test('TC020 — update contact details street and city saves successfully', async ({
    page,
  }, testInfo) => {
    setAllureLabels(testInfo, { severity: 'normal', tcId: 'TC020' });
    const ts = getTimestamp();
    const myInfo = new MyInfoPage(page);

    await test.step('Update contact details', async () => {
      await myInfo.updateContactDetails({
        street1: `${myinfo.contactDetails.street1Prefix} ${ts}`,
        city: myinfo.contactDetails.city,
      });
    });
  });
});
