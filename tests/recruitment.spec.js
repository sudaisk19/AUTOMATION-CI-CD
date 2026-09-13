import { test, expect } from '../fixtures/testSetup.js';
import { setAllureLabels } from '../utils/allureHelper.js';
import { loadTestData } from '../utils/dataUtil.js';
import { RecruitmentPage } from '../pages/RecruitmentPage.js';
import { discoverEmployee, getTimestamp } from '../utils/helpers.js';

const recruitment = loadTestData('recruitment');

test.describe.serial('Recruitment Module', () => {
  const sharedData = {};

  test.beforeAll(async ({ browser }) => {
    await test.step('Discover hiring manager employee', async () => {
      const context = await browser.newContext({ storageState: './auth.json' });
      const page = await context.newPage();
      sharedData.employee = await discoverEmployee(page);
      await context.close();
    });
  });

  test.beforeEach(async ({ page }, testInfo) => {
    setAllureLabels(testInfo, {
      suite: 'Recruitment',
      feature: 'Hiring',
      severity: 'normal',
      module: 'Recruitment',
      tcId: testInfo.title.match(/TC\d+/)?.[0] || 'TC',
    });
  });

  test('TC015 — create vacancy with title and hiring manager appears in list', async ({
    page,
  }, testInfo) => {
    setAllureLabels(testInfo, { severity: 'normal', tcId: 'TC015' });
    const recruitmentPage = new RecruitmentPage(page);
    sharedData.vacancyTitle = `${recruitment.vacancy.titlePrefix}${getTimestamp()}`;

    await test.step('Create job vacancy', async () => {
      await recruitmentPage.addVacancy({
        title: sharedData.vacancyTitle,
        hiringManager: sharedData.employee.fullName,
        numPositions: recruitment.vacancy.numPositions,
      });
    });
    await test.step('Verify vacancy appears in list', async () => {
      await recruitmentPage.assertVacancyInList(sharedData.vacancyTitle);
    });
  });

  test('TC016 — add candidate to vacancy creates application record', async ({ page }, testInfo) => {
    setAllureLabels(testInfo, { severity: 'normal', tcId: 'TC016' });
    const recruitmentPage = new RecruitmentPage(page);
    const lastName = `TC016${getTimestamp().slice(-4)}`;

    await test.step('Add candidate to vacancy', async () => {
      sharedData.candidateId = await recruitmentPage.addCandidate({
        firstName: recruitment.candidate.firstName,
        lastName,
        vacancy: sharedData.vacancyTitle,
        email: `${recruitment.candidate.emailPrefix}.${getTimestamp()}@example.com`,
      });
    });
    await test.step('Store candidate details for next test', async () => {
      sharedData.candidateLastName = lastName;
      sharedData.candidateName = new RegExp(
        `${recruitment.candidate.firstName}.*${lastName}`,
        'i'
      );
      expect(sharedData.candidateId).toBeTruthy();
    });
  });

  test('TC017 — shortlisting a candidate updates their stage status', async ({ page }, testInfo) => {
    setAllureLabels(testInfo, { severity: 'normal', tcId: 'TC017' });
    const recruitmentPage = new RecruitmentPage(page);

    await test.step('Shortlist candidate', async () => {
      await recruitmentPage.shortlistCandidate(sharedData.candidateId);
    });
    await test.step('Verify candidate status is Shortlisted', async () => {
      await recruitmentPage.assertCandidateStatus(
        sharedData.candidateName,
        'Shortlisted',
        sharedData.candidateId
      );
    });
  });
});
