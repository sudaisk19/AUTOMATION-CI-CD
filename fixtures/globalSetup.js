import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { getBaseUrl, getAdminCredentials } from '../utils/config.js';
import logger from '../utils/logger.js';

export default async function globalSetup() {
  const baseUrl = getBaseUrl();
  const { username, password } = getAdminCredentials();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: baseUrl });
  const page = await context.newPage();

  try {
    let lastErr;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await page.goto(`${baseUrl}/web/index.php/auth/login`, {
          waitUntil: 'commit',
          timeout: 60000,
        });
        await page.getByPlaceholder('Username').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByPlaceholder('Username').fill(username);
        await page.getByPlaceholder('Password').fill(password);
        await page.getByRole('button', { name: 'Login' }).click();
        await page.waitForURL('**/dashboard**', { timeout: 20000 });
        await context.storageState({ path: './auth.json' });
        logger.info('[globalSetup] auth.json saved — login successful');
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
        }
      }
    }
    if (lastErr) throw lastErr;
  } catch (err) {
    throw new Error(
      `[globalSetup] Login failed. Check demo is live: ${page.url()} — ${err.message}`
    );
  } finally {
    await browser.close();
  }

  const allureDir = path.resolve('allure-results');
  if (!fs.existsSync(allureDir)) {
    fs.mkdirSync(allureDir, { recursive: true });
  }
  const envProps = [
    'App=OrangeHRM OS Demo',
    `URL=${baseUrl}`,
    'Framework=Playwright',
    `Node=${process.version}`,
    `Env=${process.env.CI ? 'ci' : 'local'}`,
  ].join('\n');
  fs.writeFileSync(path.join(allureDir, 'environment.properties'), envProps, 'utf8');
}
