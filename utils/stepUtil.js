import { test } from '@playwright/test';

/** Wraps Playwright test.step for use in page objects and helpers. */
export async function step(title, body) {
  return test.step(title, body);
}
