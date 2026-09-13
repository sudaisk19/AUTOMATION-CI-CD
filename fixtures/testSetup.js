import { test as base, expect } from '@playwright/test';
import { captureAfterEach } from '../utils/screenshotUtil.js';
import { attachErrorDetails } from '../utils/allureHelper.js';
import { attachLogsToAllure, logger } from '../utils/logger.js';

export const test = base.extend({
  autoHooks: [
    async ({ page }, use, testInfo) => {
      testInfo.annotations.push({
        type: 'TC-ID',
        description: testInfo.title.match(/TC\d+/)?.[0] || '',
      });
      logger.info(`[START] ${testInfo.title}`);
      await use();
      await captureAfterEach(page, testInfo);
      await attachErrorDetails(testInfo);
      await attachLogsToAllure(testInfo);
      logger.info(`[${testInfo.status?.toUpperCase()}] ${testInfo.title} — ${testInfo.duration}ms`);
    },
    { auto: true },
  ],
});

export { expect, logger };
export { step } from '../utils/stepUtil.js';
