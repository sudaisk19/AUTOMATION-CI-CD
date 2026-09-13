import * as allure from 'allure-js-commons';

function isFailedTest(testInfo) {
  return (
    testInfo.status === 'failed' ||
    testInfo.status === 'timedOut' ||
    testInfo.status === 'interrupted' ||
    Boolean(testInfo.error)
  );
}

function isSkippedTest(testInfo) {
  return testInfo.status === 'skipped';
}

/**
 * Captures a full-page screenshot after every test (pass or fail) for Allure + Playwright reports.
 */
export async function captureAfterEach(page, testInfo) {
  if (isSkippedTest(testInfo)) return;
  if (!page || page.isClosed()) {
    console.warn(`[screenshotUtil] Skip screenshot — page closed: ${testInfo.title}`);
    return;
  }

  const failed = isFailedTest(testInfo);
  const allureName = failed ? 'Screenshot (failed)' : 'Screenshot (passed)';
  const fileName = failed ? 'screenshot-failed.png' : 'screenshot-passed.png';

  try {
    const screenshot = await page.screenshot({ fullPage: true });

    await testInfo.attach(fileName, {
      body: screenshot,
      contentType: 'image/png',
    });

    await allure.attachment(allureName, screenshot, {
      contentType: 'image/png',
      fileExtension: 'png',
    });
  } catch (e) {
    console.warn('[screenshotUtil] Could not capture screenshot:', e.message);
  }
}

/** @deprecated Use captureAfterEach */
export async function captureOnFailure(page, testInfo) {
  return captureAfterEach(page, testInfo);
}

export async function captureNamed(page, testInfo, name) {
  try {
    const screenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach(name, { body: screenshot, contentType: 'image/png' });
    await allure.attachment(name, screenshot, {
      contentType: 'image/png',
      fileExtension: 'png',
    });
  } catch (e) {
    console.warn('[screenshotUtil] Could not capture named screenshot:', e.message);
  }
}
