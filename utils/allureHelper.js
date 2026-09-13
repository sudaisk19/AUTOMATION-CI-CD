import * as allure from 'allure-js-commons';

export function setAllureLabels(testInfo, { suite, feature, story, severity, module, tcId }) {
  if (suite) allure.suite(suite);
  if (feature) allure.feature(feature);
  if (story) allure.story(story);
  if (severity) allure.severity(severity);
  if (module) allure.label('module', module);
  if (tcId) allure.label('testId', tcId);
  allure.label('framework', 'Playwright');
}

export async function attachScreenshot(page, testInfo, label = 'screenshot') {
  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach(label, { body: screenshot, contentType: 'image/png' });
}

export async function attachErrorDetails(testInfo) {
  if (testInfo.error) {
    await testInfo.attach('error-message', {
      body: testInfo.error.message || '',
      contentType: 'text/plain',
    });
    await testInfo.attach('error-stack', {
      body: testInfo.error.stack || '',
      contentType: 'text/plain',
    });
  }
}

export async function attachTestData(testInfo, data, label = 'test-data') {
  await testInfo.attach(label, {
    body: JSON.stringify(data, null, 2),
    contentType: 'application/json',
  });
}

/** @deprecated Use attachTestData */
export async function attachFixtureData(testInfo, data, label = 'test-data') {
  return attachTestData(testInfo, data, label);
}

export async function addAllureStep(name, fn) {
  return allure.step(name, fn);
}
