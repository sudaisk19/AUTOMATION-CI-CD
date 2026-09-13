import { expect } from '@playwright/test';
import { getBaseUrl, getAdminCredentials } from './config.js';

/**
 * OrangeHRM demo date inputs use yyyy-dd-mm (year-day-month), not US MM/DD/YYYY.
 * formatDateForInput / getFutureDate emit that native format.
 */
function pad(n) {
  return String(n).padStart(2, '0');
}

export function formatDateForInput(jsDate) {
  const d = jsDate instanceof Date ? jsDate : new Date(jsDate);
  return `${d.getFullYear()}-${pad(d.getDate())}-${pad(d.getMonth() + 1)}`;
}

export function getTimestamp() {
  return String(Date.now());
}

export function getFutureDate(daysFromNow = 7) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return formatDateForInput(d);
}

export function getFutureWorkingDate(daysFromNow = 7) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return formatDateForInput(d);
}

export function groupByLabel(page, labelText) {
  return page.locator('.oxd-input-group').filter({ has: page.getByText(labelText, { exact: true }) });
}

export async function waitForFormReady(page) {
  const blockers = page.locator('.oxd-form-loader, .oxd-loading-spinner, .oxd-overlay');
  const count = await blockers.count();
  if (count === 0) return;
  for (let i = 0; i < count; i += 1) {
    await blockers
      .nth(i)
      .waitFor({ state: 'hidden', timeout: 30000 })
      .catch(() => blockers.nth(i).waitFor({ state: 'detached', timeout: 30000 }).catch(() => {}));
  }
}

export async function clearAndFill(page, locator, value) {
  await waitForFormReady(page);
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible({ timeout: 20000 });
  await expect(locator).toBeEnabled({ timeout: 20000 });

  const text = String(value);
  try {
    await locator.click({ timeout: 10000 });
    await locator.press('ControlOrMeta+a');
    await locator.press('Delete');
    await locator.fill(text);
  } catch {
    await locator.fill(text, { force: true });
  }
}

export async function setInput(page, labelText, value) {
  const input = groupByLabel(page, labelText).locator('input, textarea').first();
  await clearAndFill(page, input, value);
  const current = await input.inputValue().catch(() => '');
  if (!current && value) {
    await input.fill(String(value));
  }
}

async function autocompleteFieldHasError(group) {
  return group
    .locator('.oxd-input-field-error-message')
    .filter({ hasText: /invalid|required/i })
    .isVisible({ timeout: 500 })
    .catch(() => false);
}

export async function pickAutocomplete(page, labelText, optionText) {
  const group = groupByLabel(page, labelText);
  const input = group.locator('input').first();
  await group.scrollIntoViewIfNeeded().catch(() => {});
  await input.waitFor({ state: 'visible', timeout: 15000 });
  const text = String(optionText).trim();
  const queries = [...new Set([text, ...text.split(/\s+/).filter(Boolean)])];

  let lastAttempt = '';
  for (const query of queries) {
    await input.click();
    await input.click({ clickCount: 3 });
    await input.press('Delete');
    await input.pressSequentially(query, { delay: 80 });

    await page
      .locator('.oxd-autocomplete-dropdown, [role="listbox"]')
      .first()
      .waitFor({ state: 'visible', timeout: 8000 })
      .catch(() => null);

    await page
      .waitForFunction(
        () => {
          const opts = [...document.querySelectorAll('[role="option"]')];
          return opts.some((o) => {
            const t = (o.textContent || '').trim();
            return t.length > 0 && !/searching/i.test(t);
          });
        },
        { timeout: 10000 }
      )
      .catch(() => null);

    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let option = page.getByRole('option').filter({ hasText: new RegExp(escaped, 'i') }).first();
    if (!(await option.isVisible({ timeout: 2000 }).catch(() => false))) {
      option = page
        .getByRole('option')
        .filter({ hasNotText: /searching/i })
        .first();
    }
    if (await option.isVisible({ timeout: 5000 }).catch(() => false)) {
      await option.click();
    } else {
      await input.press('ArrowDown');
      await input.press('Enter');
    }

    await page.keyboard.press('Escape');
    await page
      .locator('.oxd-autocomplete-dropdown, [role="listbox"]')
      .first()
      .waitFor({ state: 'hidden', timeout: 5000 })
      .catch(() => {});

    const value = (await input.inputValue()).trim();
    const hasError = await autocompleteFieldHasError(group);
    lastAttempt = `query="${query}" value="${value}" hasError=${hasError}`;
    if (value.length > 0 && !hasError && !/invalid/i.test(value)) {
      return value;
    }
  }

  throw new Error(`pickAutocomplete: could not select "${text}" for "${labelText}". ${lastAttempt}`);
}

export async function pickSelect(page, labelText, optionText) {
  const wrapper = groupByLabel(page, labelText).locator('.oxd-select-wrapper, .oxd-select-text').first();
  await wrapper.click();
  const option = page.locator('.oxd-select-option').filter({ hasText: optionText }).first();
  if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
    await option.click();
  } else {
    const fallback = page.locator('.oxd-select-option span').filter({ hasText: optionText }).first();
    if (await fallback.isVisible({ timeout: 2000 }).catch(() => false)) {
      await fallback.click();
    } else {
      const any = page.locator('.oxd-select-option').nth(1);
      await any.click();
    }
  }
  await expect(wrapper).not.toContainText('-- Select --');
}

export async function loginAsAdmin(page) {
  const { username, password } = getAdminCredentials();
  await page.goto('/web/index.php/auth/login', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Username').fill(username);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL('**/dashboard**');
}

export async function discoverEmployee(page, options = {}) {
  const BASE = getBaseUrl();
  const maxAttempts = 4;
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      if (!page.url().startsWith(BASE)) {
        await page.goto(`${BASE}/web/index.php/dashboard/index`, {
          waitUntil: 'domcontentloaded',
        });
      }
      if (page.url().includes('auth/login')) {
        await loginAsAdmin(page);
      }

      const emp = await page.evaluate(
        async ({ base, withoutSystemUser, pickLast }) => {
          const headers = { Accept: 'application/json' };
          const empResp = await fetch(`${base}/web/index.php/api/v2/pim/employees?limit=100&offset=0`, {
            headers,
          });
          if (!empResp.ok) return null;
          const json = await empResp.json();
          let data = (json && json.data) || [];
          if (!data.length) return null;

          if (withoutSystemUser) {
            const usersResp = await fetch(`${base}/web/index.php/api/v2/admin/users?limit=200&offset=0`, {
              headers,
            });
            if (usersResp.ok) {
              const users = ((await usersResp.json()).data) || [];
              const linked = new Set(
                users.map((u) => u.employee?.empNumber ?? u.empNumber).filter(Boolean)
              );
              data = data.filter((e) => !linked.has(e.empNumber));
            }
          }

          const isHumanName = (e) =>
            e.firstName &&
            e.lastName &&
            e.firstName.length >= 3 &&
            /^[A-Za-z][A-Za-z\s'-]*$/.test(e.firstName) &&
            /^[A-Za-z][A-Za-z\s'-]*$/.test(e.lastName) &&
            !/\d/.test(`${e.firstName}${e.lastName}`) &&
            !/^[XYZ]+$/i.test(e.firstName);

          const pool =
            data.filter(isHumanName).length > 0
              ? data.filter(isHumanName)
              : data.filter((e) => e.firstName && e.lastName);
          if (!pool.length) return null;

          const pick = pickLast ? pool[pool.length - 1] : pool[0];
          const fullName = [pick.firstName, pick.middleName, pick.lastName]
            .filter(Boolean)
            .join(' ')
            .trim();

          return {
            firstName: pick.firstName,
            lastName: pick.lastName || '',
            middleName: pick.middleName || '',
            fullName,
            empNumber: pick.empNumber ?? pick.employeeId ?? pick.id,
          };
        },
        { base: BASE, withoutSystemUser: !!options.withoutSystemUser, pickLast: !!options.pickLast }
      );

      if (emp) return emp;
      lastError = new Error('PIM API returned no employees');
    } catch (err) {
      lastError = err;
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
    }
  }

  throw new Error(
    `discoverEmployee: PIM API returned no employees — demo may be empty or unreachable (${lastError?.message || 'unknown'})`
  );
}

export async function waitForToast(page, expectedText, options = {}) {
  const toast = page.locator('.oxd-toast').first();
  await toast.waitFor({ state: 'visible', timeout: 15000 });
  const text = (await toast.innerText()).trim();
  if (options.shouldFail) {
    await expect(toast).toHaveClass(/oxd-toast--error|oxd-toast--warn/);
  }
  if (expectedText) {
    await expect(toast).toContainText(expectedText);
  }
  return text;
}
