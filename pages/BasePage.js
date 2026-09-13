import { expect } from '@playwright/test';
import { groupByLabel, waitForToast, loginAsAdmin } from '../utils/helpers.js';
import { getBaseUrl } from '../utils/config.js';
import { step } from '../utils/stepUtil.js';

export class BasePage {
  constructor(page) {
    this.page = page;
    this.baseUrl = getBaseUrl();
  }

  step(title, body) {
    return step(title, body);
  }

  async navigate(path) {
    return this.step(`Navigate to ${path}`, async () => {
      const url = `${this.baseUrl}${path}`;
      const maxAttempts = 4;
      let lastError;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
          const response = await this.page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 45000,
          });
          const status = response?.status() ?? 0;
          if (status >= 400 && status < 600) {
            throw new Error(`HTTP ${status} for ${url}`);
          }
          if (!path.includes('auth/login') && this.page.url().includes('auth/login')) {
            await loginAsAdmin(this.page);
            continue;
          }
          await this.waitForSpinner();
          return;
        } catch (err) {
          lastError = err;
          if (attempt < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, 2500 * (attempt + 1)));
          }
        }
      }

      throw lastError;
    });
  }

  async waitForToast(expectedText) {
    return waitForToast(this.page, expectedText);
  }

  async assertSuccessToast() {
    const toast = this.page.locator('.oxd-toast.oxd-toast--success').first();
    await expect(toast).toBeVisible({ timeout: 15000 });
  }

  async assertErrorToast() {
    const toast = this.page.locator('.oxd-toast.oxd-toast--error, .oxd-toast.oxd-toast--warn').first();
    await expect(toast).toBeVisible({ timeout: 15000 });
  }

  async waitForSpinner() {
    const blockers = this.page.locator('.oxd-loading-spinner, .oxd-form-loader, .oxd-overlay');
    const count = await blockers.count();
    for (let i = 0; i < count; i += 1) {
      await blockers
        .nth(i)
        .waitFor({ state: 'hidden', timeout: 30000 })
        .catch(() => blockers.nth(i).waitFor({ state: 'detached', timeout: 30000 }).catch(() => {}));
    }
  }

  async getTableRows() {
    return this.page.locator('.oxd-table-body .oxd-table-card, .oxd-table-body .oxd-table-row');
  }

  async getTableRowByText(text) {
    return this.page.locator('.oxd-table-body .oxd-table-card, .oxd-table-body .oxd-table-row').filter({
      hasText: text,
    });
  }

  async clickButtonByText(text) {
    await this.resilientClick([
      () => this.page.getByRole('button', { name: text }),
      () => this.page.locator(`button:has-text("${text}")`),
    ]);
  }

  async confirmDialog() {
    const dialog = this.page.getByRole('dialog');
    if (await dialog.isVisible({ timeout: 5000 }).catch(() => false)) {
      const confirm = dialog.getByRole('button', { name: /^(Yes|Confirm|Ok|Save)$/i }).first();
      if (await confirm.isVisible().catch(() => false)) {
        await confirm.click();
      } else {
        await dialog.locator('button').last().click();
      }
      await dialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    }
  }

  async assertValidationError(fieldLabel, expectedMsg = 'Required') {
    const group = groupByLabel(this.page, fieldLabel);
    await expect(group.locator('.oxd-input-field-error-message').first()).toContainText(expectedMsg);
  }

  async scrollToBottom() {
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  }

  async resilientClick(strategies) {
    const errors = [];
    for (const strategy of strategies) {
      try {
        const locator = strategy();
        if (await locator.isVisible({ timeout: 2000 }).catch(() => false)) {
          await locator.click();
          return;
        }
      } catch (e) {
        errors.push(e.message);
      }
    }
    throw new Error(`resilientClick: no strategy matched. Tried: ${errors.join(' | ')}`);
  }

  async resilientFill(label, value) {
    const strategies = [
      () => this.page.getByLabel(label, { exact: false }),
      () => groupByLabel(this.page, label).locator('input, textarea').first(),
      () => this.page.getByPlaceholder(label),
      () => this.page.locator(`[name="${label.replace(/\s+/g, '').toLowerCase()}"]`),
    ];
    for (const strategy of strategies) {
      const locator = strategy();
      if (await locator.isVisible({ timeout: 2000 }).catch(() => false)) {
        await locator.click();
        await locator.press('ControlOrMeta+a');
        await locator.press('Delete');
        await locator.fill(String(value));
        return;
      }
    }
    throw new Error(`resilientFill: could not fill field "${label}"`);
  }

  async waitForStable(locator, timeout = 5000) {
    const loc = typeof locator === 'function' ? locator() : locator;
    const deadline = Date.now() + timeout;
    let prev = '';
    let stable = 0;
    while (Date.now() < deadline) {
      const current = (await loc.innerText().catch(() => '')).trim();
      if (current === prev) {
        stable += 1;
        if (stable >= 2) return current;
      } else {
        stable = 0;
        prev = current;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return prev;
  }
}
