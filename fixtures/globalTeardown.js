import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { getBaseUrl } from '../utils/config.js';
import logger, { shutdownLogger } from '../utils/logger.js';

const CLEANUP_PREFIXES = ['tc_ess_user_AUTO', 'AutoTest', 'TempDel', 'TC016', 'AutoNick', 'AutoContact'];

async function cleanupTestRecords() {
  const authPath = path.resolve('auth.json');
  if (!fs.existsSync(authPath)) {
    logger.warn('[globalTeardown] auth.json missing — skipping API cleanup');
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: getBaseUrl(),
    storageState: authPath,
  });
  const page = await context.newPage();

  try {
    await page.goto('/web/index.php/dashboard/index', { waitUntil: 'domcontentloaded' });

    const deleted = await page.evaluate(
      async ({ base, prefixes }) => {
        const headers = { Accept: 'application/json' };
        let count = 0;

        const usersResp = await fetch(`${base}/web/index.php/api/v2/admin/users?limit=200&offset=0`, {
          headers,
        });
        if (usersResp.ok) {
          const users = ((await usersResp.json()).data) || [];
          for (const user of users) {
            const name = user.userName || user.username || '';
            if (prefixes.some((p) => name.startsWith(p))) {
              const del = await fetch(`${base}/web/index.php/api/v2/admin/users/${user.id}`, {
                method: 'DELETE',
                headers,
              });
              if (del.ok) count += 1;
            }
          }
        }

        const empResp = await fetch(`${base}/web/index.php/api/v2/pim/employees?limit=200&offset=0`, {
          headers,
        });
        if (empResp.ok) {
          const employees = ((await empResp.json()).data) || [];
          for (const emp of employees) {
            const full = `${emp.firstName || ''}${emp.lastName || ''}`;
            if (prefixes.some((p) => full.includes(p) || (emp.employeeId || '').startsWith('TC'))) {
              const del = await fetch(
                `${base}/web/index.php/api/v2/pim/employees/${emp.empNumber}`,
                { method: 'DELETE', headers }
              );
              if (del.ok) count += 1;
            }
          }
        }

        return count;
      },
      { base: getBaseUrl(), prefixes: CLEANUP_PREFIXES }
    );

    logger.info(`[globalTeardown] API cleanup removed ${deleted} test record(s)`);
  } catch (err) {
    logger.warn('[globalTeardown] API cleanup failed (non-fatal)', { error: err.message });
  } finally {
    await browser.close();
  }
}

function writeRunSummary() {
  const logFile = logger.getLogFile();
  const summaryPath = path.resolve('logs', 'run-summary.txt');
  const logDir = path.dirname(summaryPath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const lines = logger.getBuffer();
  const summary = [
    '=== OrangeHRM E2E Run Summary ===',
    `Completed: ${new Date().toISOString()}`,
    `Log entries: ${lines.length}`,
    `Full log: ${logFile}`,
    '',
    ...lines.slice(-20),
  ].join('\n');

  fs.writeFileSync(summaryPath, summary, 'utf8');
  logger.info('[globalTeardown] Run summary written to logs/run-summary.txt');
}

export default async function globalTeardown() {
  writeRunSummary();
  await cleanupTestRecords();
  logger.info('[globalTeardown] Teardown complete.');
  await shutdownLogger();
}
