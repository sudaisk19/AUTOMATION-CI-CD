import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    [
      'allure-playwright',
      {
        outputFolder: 'allure-results',
        detail: true,
        suiteTitle: 'OrangeHRM E2E Suite',
        environmentInfo: {
          App: 'OrangeHRM OS Demo',
          URL: 'https://opensource-demo.orangehrmlive.com',
          Framework: 'Playwright',
          Language: 'JavaScript',
          Node: process.version,
        },
      },
    ],
    ['list'],
  ],

  use: {
    baseURL: 'https://opensource-demo.orangehrmlive.com',
    // Screenshots are taken in afterEach via captureAfterEach() (pass + fail)
    screenshot: 'off',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    locale: 'en-US',
    timezoneId: 'Asia/Karachi',
  },

  globalSetup: './fixtures/globalSetup.js',
  globalTeardown: './fixtures/globalTeardown.js',

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: './auth.json',
      },
      testIgnore: ['**/login.spec.js', '**/time.spec.js'],
    },
    {
      name: 'login-tests',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['**/login.spec.js'],
    },
    {
      name: 'time-serial',
      use: {
        ...devices['Desktop Chrome'],
        storageState: './auth.json',
      },
      testMatch: ['**/time.spec.js'],
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: './auth.json',
      },
      testIgnore: ['**/login.spec.js', '**/time.spec.js'],
    },
  ],
});
