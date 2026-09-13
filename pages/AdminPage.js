import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { pickAutocomplete, pickSelect, setInput, waitForToast } from '../utils/helpers.js';

export class AdminPage extends BasePage {
  async navigateToUserList() {
    return this.step('Navigate to System Users list', async () => {
      await this.navigate('/web/index.php/admin/viewSystemUsers');
      await this.waitForSpinner();
    });
  }

  async addUser({ employeeName, username, password, role, status }) {
    return this.step(`Add system user "${username}" with role ${role}`, async () => {
      await this.step('Open Add User form', async () => {
        await this.navigate('/web/index.php/admin/saveSystemUser');
      });
      await this.step('Fill user details', async () => {
        await pickSelect(this.page, 'User Role', role);
        await pickSelect(this.page, 'Status', status);
        await pickAutocomplete(this.page, 'Employee Name', employeeName);
        await this.page.keyboard.press('Escape');
        await setInput(this.page, 'Username', username);
        await setInput(this.page, 'Password', password);
        await setInput(this.page, 'Confirm Password', password);
      });
      await this.step('Save new user', async () => {
        await this.resilientClick([() => this.page.getByRole('button', { name: 'Save' })]);
        await waitForToast(this.page, /Successfully (Saved|Updated)/i);
        await this.waitForSpinner();
      });
    });
  }

  async openUserFilter() {
    return this.step('Open user list filter panel', async () => {
      const filterToggle = this.page.locator('.oxd-table-filter').first();
      if (await filterToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
        await filterToggle.click();
      }
    });
  }

  async resetUserFilter() {
    return this.step('Reset user list filters', async () => {
      const resetBtn = this.page.getByRole('button', { name: 'Reset' });
      if (await resetBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await resetBtn.click();
        await this.waitForSpinner();
      }
      await this.openUserFilter();
    });
  }

  async findUserRow(username) {
    return this.step(`Search for user "${username}"`, async () => {
      await this.navigateToUserList();
      await this.openUserFilter();
      await this.resetUserFilter();
      await setInput(this.page, 'Username', username);
      await this.resilientClick([() => this.page.getByRole('button', { name: 'Search' })]);
      await this.waitForSpinner();
      return this.page.locator('.oxd-table-body .oxd-table-card').filter({ hasText: username });
    });
  }

  async searchUser(username) {
    return this.step(`Wait until user "${username}" appears in list`, async () => {
      await expect
        .poll(
          async () => {
            const row = await this.findUserRow(username);
            return (await row.count()) > 0;
          },
          { timeout: 35000, intervals: [1000, 2000, 3000] }
        )
        .toBe(true);
    });
  }

  async editUserRole(username, newRole) {
    return this.step(`Edit user "${username}" role to ${newRole}`, async () => {
      await this.searchUser(username);
      await this.step('Open user edit form', async () => {
        const row = this.page
          .locator('.oxd-table-body .oxd-table-card')
          .filter({ hasText: username })
          .first();
        await row.locator('.bi-pencil-fill, .oxd-table-cell-action i').first().click();
        await this.waitForSpinner();
      });
      await this.step('Update role and save', async () => {
        await pickSelect(this.page, 'User Role', newRole);
        await this.resilientClick([() => this.page.getByRole('button', { name: 'Save' })]);
        await waitForToast(this.page, /Successfully (Saved|Updated)/i);
        await this.waitForSpinner();
      });
      const updatedRow = await this.findUserRow(username);
      await expect(updatedRow.first()).toContainText(new RegExp(newRole, 'i'), { timeout: 15000 });
    });
  }

  async deleteUser(username) {
    return this.step(`Delete user "${username}"`, async () => {
      await this.searchUser(username);
      await this.step('Confirm user deletion', async () => {
        const row = this.page
          .locator('.oxd-table-body .oxd-table-card')
          .filter({ hasText: username })
          .first();
        const rowTrash = row.locator('.oxd-table-cell-action .bi-trash, .bi-trash').first();
        if (await rowTrash.isVisible({ timeout: 3000 }).catch(() => false)) {
          await rowTrash.click();
        } else {
          await row.locator('.oxd-table-card-cell-checkbox input[type="checkbox"]').click();
          await this.page.locator('.oxd-table-header .bi-trash').first().click();
        }
        await this.confirmDialog();
        await waitForToast(this.page, /Successfully Deleted|Deleted/i);
      });
    });
  }

  async assertUserInList(username) {
    return this.step(`Verify user "${username}" is in system users list`, async () => {
      await this.searchUser(username);
      await expect(
        this.page.locator('.oxd-table-body .oxd-table-card').filter({ hasText: username }).first()
      ).toBeVisible();
    });
  }

  async assertUserNotInList(username) {
    return this.step(`Verify user "${username}" is not in system users list`, async () => {
      await expect
        .poll(
          async () => {
            await this.navigateToUserList();
            const filterToggle = this.page.locator('.oxd-table-filter').first();
            if (await filterToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
              await filterToggle.click();
            }
            const resetBtn = this.page.getByRole('button', { name: 'Reset' });
            if (await resetBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await resetBtn.click();
              await this.waitForSpinner();
            }
            await setInput(this.page, 'Username', username);
            await this.resilientClick([() => this.page.getByRole('button', { name: 'Search' })]);
            await this.waitForSpinner();
            const noRecords = await this.page
              .locator('.oxd-table-body')
              .getByText('No Records Found')
              .isVisible()
              .catch(() => false);
            if (noRecords) return true;
            const cards = this.page.locator('.oxd-table-body .oxd-table-card');
            if ((await cards.count()) === 0) return true;
            const text = await cards.first().innerText().catch(() => '');
            return !text.includes(username);
          },
          { timeout: 20000 }
        )
        .toBe(true);
    });
  }
}
