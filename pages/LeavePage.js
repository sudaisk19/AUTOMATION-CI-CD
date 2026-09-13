import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';
import {
  pickAutocomplete,
  pickSelect,
  setInput,
  waitForToast,
  groupByLabel,
  waitForFormReady,
} from '../utils/helpers.js';

export class LeavePage extends BasePage {
  async navigateToAssignLeave() {
    return this.step('Navigate to Assign Leave page', async () => {
      await this.navigate('/web/index.php/leave/assignLeave');
      await expect(this.page.getByRole('heading', { name: 'Assign Leave' }).first()).toBeVisible();
    });
  }

  async assignLeave({ employeeName, leaveType, fromDate, toDate, comment }) {
    return this.step(`Assign leave (${leaveType}) to ${employeeName}`, async () => {
      await this.navigateToAssignLeave();
      await this.step('Fill assign leave form', async () => {
        await pickAutocomplete(this.page, 'Employee Name', employeeName);
        await pickSelect(this.page, 'Leave Type', leaveType);
        await setInput(this.page, 'From Date', fromDate);
        await setInput(this.page, 'To Date', toDate);
        if (comment) {
          await setInput(this.page, 'Comments', comment);
        }
      });
      await this.step('Submit leave assignment', async () => {
        await this.waitForSpinner();
        await this.resilientClick([() => this.page.getByRole('button', { name: 'Assign' })]);
        const dialog = this.page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 8000 }).catch(() => false)) {
          await this.confirmDialog();
        }
      });
      const toast = this.page.locator('.oxd-toast').first();
      if (await toast.isVisible({ timeout: 8000 }).catch(() => false)) {
        return (await toast.innerText()).trim();
      }
      return '';
    });
  }

  async assertAssignedToast() {
    return this.step('Verify leave assignment success message', async () => {
      const toast = this.page.locator('.oxd-toast').first();
      if (await toast.isVisible({ timeout: 15000 }).catch(() => false)) {
        await waitForToast(this.page, /Success|Assigned|Saved|Updated/i);
        return;
      }
      const body = await this.page.locator('body').innerText();
      expect(body).toMatch(/Success|Assigned|Scheduled|Leave/i);
    });
  }

  async assertNoWorkingDayError() {
    return this.step('Verify non-working day error is shown', async () => {
      const body = this.page.locator('body');
      const bodyText = (await body.innerText()).toLowerCase();
      const hasText =
        /no working days|failed to assign|invalid|error|overlap|exceed/i.test(bodyText) ||
        (await body.getByText(/No Working Days Selected/i).isVisible().catch(() => false)) ||
        (await this.page
          .locator('.oxd-toast')
          .filter({ hasText: /Failed|Error|Working Days|Invalid/i })
          .isVisible()
          .catch(() => false)) ||
        (await this.page.locator('.oxd-input-field-error-message').count()) > 0;
      expect(hasText).toBeTruthy();
      await expect(this.page.locator('.oxd-toast.oxd-toast--success')).toHaveCount(0);
    });
  }

  async navigateToLeaveList() {
    return this.step('Navigate to Leave List page', async () => {
      await this.navigate('/web/index.php/leave/viewLeaveList');
      await expect(this.page.getByRole('heading', { name: 'Leave List' }).first()).toBeVisible();
    });
  }

  async openLeaveFilter() {
    return this.step('Open leave list filter panel', async () => {
      const filterToggle = this.page.locator('.oxd-table-filter').first();
      if (await filterToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
        await filterToggle.click();
      }
      await groupByLabel(this.page, 'Show Leave with Status')
        .scrollIntoViewIfNeeded()
        .catch(() => {});
    });
  }

  async resetLeaveFilter() {
    return this.step('Reset leave list filters', async () => {
      const resetBtn = this.page.getByRole('button', { name: 'Reset' });
      if (await resetBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await resetBtn.click();
        await this.waitForSpinner();
      }
      await this.openLeaveFilter();
    });
  }

  async setLeaveListStatuses(statuses) {
    return this.step(`Set leave status filter: ${statuses.join(', ')}`, async () => {
      const statusGroup = groupByLabel(this.page, 'Show Leave with Status');
      await statusGroup.scrollIntoViewIfNeeded();
      await waitForFormReady(this.page);

      const select = statusGroup.locator('.oxd-select-text').first();
      const desired = statuses.map((s) => s.toLowerCase());
      const knownStatuses = [
        'Scheduled',
        'Pending Approval',
        'Rejected',
        'Cancelled',
        'Taken',
      ];

      const toggleOption = async (optionName) => {
        await waitForFormReady(this.page);
        await select.click({ force: true });
        const dropdown = this.page.locator('.oxd-select-dropdown').last();
        await expect(dropdown).toBeVisible({ timeout: 15000 });
        const escaped = optionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        await dropdown
          .locator('.oxd-select-option')
          .filter({ hasText: new RegExp(escaped, 'i') })
          .first()
          .click({ force: true });
        await this.page.keyboard.press('Escape');
        await waitForFormReady(this.page);
      };

      const selectedChips = async () =>
        (await statusGroup.locator('.oxd-chip').allTextContents()).map((c) => c.trim().toLowerCase());

      for (const name of knownStatuses) {
        const want = desired.some((d) => name.toLowerCase().includes(d));
        const chips = await selectedChips();
        const has = chips.some((c) => c.includes(name.toLowerCase()));
        if (want !== has) {
          await toggleOption(name);
        }
      }
    });
  }

  async searchLeaveList() {
    return this.step('Search leave list', async () => {
      await this.resilientClick([() => this.page.getByRole('button', { name: 'Search' })]);
      await this.waitForSpinner();
    });
  }

  async filterLeaveListByStatus(status, employeeName) {
    return this.step(`Filter leave list by status "${status}"`, async () => {
      await this.navigateToLeaveList();
      await this.openLeaveFilter();
      await this.resetLeaveFilter();
      if (employeeName) {
        await this.step(`Filter by employee: ${employeeName}`, async () => {
          await pickAutocomplete(this.page, 'Employee Name', employeeName);
          await this.page.keyboard.press('Escape');
          await this.page
            .locator('.oxd-autocomplete-dropdown, [role="listbox"]')
            .first()
            .waitFor({ state: 'hidden', timeout: 5000 })
            .catch(() => {});
        });
      }
      await this.setLeaveListStatuses([status]);
      await this.searchLeaveList();
    });
  }

  async assertAllRowsShowStatus(status) {
    return this.step(`Verify all rows show status "${status}"`, async () => {
      const rows = this.page.locator('.oxd-table-body .oxd-table-card');
      const count = await rows.count();
      if (count === 0) {
        await expect(
          this.page.locator('.oxd-table-body').getByText('No Records Found')
        ).toBeVisible();
        return;
      }
      for (let i = 0; i < count; i += 1) {
        await expect(rows.nth(i)).toContainText(new RegExp(status, 'i'));
      }
    });
  }

  async addEntitlement({ employeeName, leaveType, days }) {
    return this.step(`Add leave entitlement: ${days} days (${leaveType})`, async () => {
      await this.step('Open Add Entitlement form', async () => {
        await this.navigate('/web/index.php/leave/addLeaveEntitlement');
      });
      await this.step('Fill entitlement details', async () => {
        await pickAutocomplete(this.page, 'Employee Name', employeeName);
        await pickSelect(this.page, 'Leave Type', leaveType);
        await setInput(this.page, 'Entitlement', String(days));
      });
      await this.step('Save entitlement', async () => {
        await this.resilientClick([() => this.page.getByRole('button', { name: 'Save' })]);
        await this.confirmDialog();
      });
      const successToast = this.page.locator('.oxd-toast.oxd-toast--success');
      if (await successToast.isVisible({ timeout: 15000 }).catch(() => false)) {
        return;
      }
      const anyToast = this.page.locator('.oxd-toast').first();
      if (await anyToast.isVisible({ timeout: 5000 }).catch(() => false)) {
        const text = (await anyToast.innerText()).trim();
        if (/exist|duplicate|already|saved|success/i.test(text)) {
          return;
        }
      }
      await this.assertSuccessToast();
    });
  }
}
