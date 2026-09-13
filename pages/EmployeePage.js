import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { setInput, waitForToast, clearAndFill } from '../utils/helpers.js';

export class EmployeePage extends BasePage {
  async navigateToPIM() {
    return this.step('Navigate to PIM employee list', async () => {
      await this.navigate('/web/index.php/pim/viewEmployeeList');
      await this.waitForSpinner();
    });
  }

  async findEmployeeViaApi(firstName, employeeId) {
    return this.step(`Find employee via API: ${firstName} (${employeeId})`, async () => {
      if (!this.page.url().includes('orangehrmlive.com')) {
        await this.navigate('/web/index.php/dashboard/index');
      }
      const match = await this.page.evaluate(
        async ({ base, firstName, employeeId }) => {
          const resp = await fetch(
            `${base}/web/index.php/api/v2/pim/employees?limit=200&offset=0&nameOrId=${encodeURIComponent(firstName)}`,
            { headers: { Accept: 'application/json' } }
          );
          if (!resp.ok) return null;
          const data = ((await resp.json()).data) || [];
          return (
            data.find(
              (e) =>
                e.firstName === firstName &&
                String(e.employeeId ?? e.employee?.employeeId ?? '') === String(employeeId)
            ) ?? null
          );
        },
        { base: this.baseUrl, firstName, employeeId }
      );
      return match;
    });
  }

  async addEmployee({ firstName, lastName, employeeId }) {
    return this.step(`Add employee: ${firstName} ${lastName}`, async () => {
      await this.step('Open Add Employee form', async () => {
        await this.navigate('/web/index.php/pim/addEmployee');
      });
      await this.step('Fill employee personal details', async () => {
        await clearAndFill(this.page, this.page.locator('input[name="firstName"]'), firstName);
        await clearAndFill(this.page, this.page.locator('input[name="lastName"]'), lastName);
        const empIdInput = this.page
          .locator('.oxd-input-group')
          .filter({ hasText: 'Employee Id' })
          .locator('input')
          .first();
        if (await empIdInput.isVisible().catch(() => false)) {
          await clearAndFill(this.page, empIdInput, employeeId);
        }
      });
      await this.step('Save new employee', async () => {
        await this.resilientClick([() => this.page.getByRole('button', { name: 'Save' })]);
        await waitForToast(this.page, /Successfully (Saved|Updated)/i);
      });
    });
  }

  async searchEmployee(nameQuery, employeeId) {
    return this.step(`Search employee: ${nameQuery}`, async () => {
      await this.navigateToPIM();
      const searchReady = await this.page
        .getByRole('button', { name: 'Search' })
        .isVisible({ timeout: 8000 })
        .catch(() => false);
      if (!searchReady) return 0;

      await this.step('Open and reset search filter', async () => {
        const filterToggle = this.page.locator('.oxd-table-filter').first();
        if (await filterToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
          await filterToggle.click();
        }
        const resetBtn = this.page.getByRole('button', { name: 'Reset' });
        if (await resetBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await resetBtn.click();
          await this.waitForSpinner();
          if (await filterToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
            await filterToggle.click();
          }
        }
      });

      const hintInput = this.page.getByPlaceholder(/Type for hints/i).first();
      const empIdInput = this.page
        .locator('.oxd-input-group')
        .filter({ hasText: /^Employee Id$/i })
        .locator('input')
        .first();

      await expect
        .poll(
          async () =>
            (await hintInput.isVisible().catch(() => false)) ||
            (await empIdInput.isVisible().catch(() => false)),
          { timeout: 15000 }
        )
        .toBe(true);

      await this.step('Enter search criteria', async () => {
        if (employeeId && (await empIdInput.isVisible().catch(() => false))) {
          await clearAndFill(this.page, empIdInput, String(employeeId));
        }
        if (await hintInput.isVisible().catch(() => false)) {
          const first = String(nameQuery).split(' ')[0];
          await hintInput.click();
          await hintInput.fill(first);
          await this.page.keyboard.press('ArrowDown');
          await this.page.keyboard.press('Enter');
          await this.page.keyboard.press('Escape');
        }
      });

      await this.step('Execute search', async () => {
        await this.resilientClick([() => this.page.getByRole('button', { name: 'Search' })]);
        await this.waitForSpinner();
      });
      return this.page.locator('.oxd-table-body .oxd-table-card').count();
    });
  }

  async getFirstResultName() {
    const row = this.page.locator('.oxd-table-body .oxd-table-card').first();
    return (await row.innerText()).trim();
  }

  async openEmployeePersonalDetailsForm(empNumber) {
    return this.step(`Open personal details for empNumber ${empNumber}`, async () => {
      const firstInput = this.page.locator('input[name="firstName"]');
      await this.navigate(`/web/index.php/pim/viewPersonalDetails/empNumber/${empNumber}`);

      const personalTab = this.page.getByRole('link', { name: /Personal Details/i });
      if (await personalTab.isVisible({ timeout: 5000 }).catch(() => false)) {
        await personalTab.click();
        await this.waitForSpinner();
      }

      if (await firstInput.isVisible({ timeout: 8000 }).catch(() => false)) {
        return;
      }

      const editIcon = this.page.locator('.bi-pencil-fill').first();
      if (await editIcon.isVisible({ timeout: 3000 }).catch(() => false)) {
        await editIcon.click();
        await this.page.waitForURL(/editEmployee|viewPersonalDetails/, { timeout: 15000 });
        await this.waitForSpinner();
      }

      await expect(firstInput).toBeVisible({ timeout: 20000 });
    });
  }

  async savePersonalDetailsForm() {
    return this.step('Save personal details form', async () => {
      const saveBtn = this.page
        .locator('.orangehrm-card-container, .orangehrm-employee-form, form')
        .getByRole('button', { name: 'Save' })
        .first();
      await saveBtn.scrollIntoViewIfNeeded();
      await this.resilientClick([() => saveBtn]);
      await waitForToast(this.page, /Successfully (Saved|Updated)/i);
    });
  }

  async resolveEmpNumber(firstName, employeeId, empNumber) {
    if (empNumber) return String(empNumber);
    return this.step(`Resolve empNumber for ${firstName}`, async () => {
      const first = String(firstName).split(' ')[0];
      const match = await this.findEmployeeViaApi(first, employeeId);
      if (match?.empNumber) return String(match.empNumber);

      let resolved;
      await expect
        .poll(
          async () => {
            const found = await this.findEmployeeViaApi(first, employeeId);
            resolved = found?.empNumber ? String(found.empNumber) : null;
            return resolved;
          },
          { timeout: 30000, intervals: [1000, 2000, 3000] }
        )
        .toBeTruthy();
      return resolved;
    });
  }

  async editEmployeeFirstName(currentName, newFirstName, employeeId, empNumber) {
    return this.step(`Edit employee first name to "${newFirstName}"`, async () => {
      const first = String(currentName).split(' ')[0];
      const num = await this.resolveEmpNumber(first, employeeId, empNumber);

      if (num) {
        await this.openEmployeePersonalDetailsForm(num);
        await this.step('Update first name field', async () => {
          await clearAndFill(this.page, this.page.locator('input[name="firstName"]'), newFirstName);
        });
        await this.savePersonalDetailsForm();
        return;
      }

      await this.navigateToPIM();
      const searchReady = await this.page
        .getByRole('button', { name: 'Search' })
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (searchReady) {
        await this.searchEmployee(currentName, employeeId);
        const row = this.page.locator('.oxd-table-body .oxd-table-card').filter({ hasText: first });
        if ((await row.count()) > 0) {
          await this.step('Open employee from search results', async () => {
            await row
              .first()
              .locator('.bi-pencil-fill, .oxd-table-cell-action .bi-pencil-fill')
              .first()
              .click();
            await this.page.waitForURL(/editEmployee/, { timeout: 15000 });
          });
          await this.step('Update first name field', async () => {
            await clearAndFill(this.page, this.page.locator('input[name="firstName"]'), newFirstName);
          });
          await this.savePersonalDetailsForm();
          return;
        }
      }

      throw new Error(`editEmployeeFirstName: could not locate employee "${currentName}"`);
    });
  }

  async deleteEmployeeViaApi(empNumber) {
    return this.step(`Delete employee via API (empNumber ${empNumber})`, async () => {
      const result = await this.page.evaluate(
        async ({ base, empNumber }) => {
          const resp = await fetch(`${base}/web/index.php/api/v2/pim/employees`, {
            method: 'DELETE',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [Number(empNumber)] }),
          });
          return { ok: resp.ok, status: resp.status };
        },
        { base: this.baseUrl, empNumber }
      );
      if (!result.ok) {
        throw new Error(`deleteEmployeeViaApi failed (${result.status})`);
      }
    });
  }

  async deleteEmployee(name, employeeId) {
    return this.step(`Delete employee: ${name}`, async () => {
      const first = String(name).split(' ')[0];
      await this.navigateToPIM();
      const searchReady = await this.page
        .getByRole('button', { name: 'Search' })
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (searchReady) {
        const count = await this.searchEmployee(name, employeeId);
        if (count > 0) {
          await this.step('Delete employee from list', async () => {
            const row = this.page.locator('.oxd-table-body .oxd-table-card').first();
            await row.locator('.oxd-table-cell-action .bi-trash, i.bi-trash').first().click();
            await this.confirmDialog();
            await waitForToast(this.page, /Successfully Deleted/i);
          });
          return;
        }
      }

      const match = await this.findEmployeeViaApi(first, employeeId);
      if (!match?.empNumber) {
        throw new Error(`deleteEmployee: employee not found for "${name}"`);
      }
      await this.deleteEmployeeViaApi(match.empNumber);
    });
  }

  async assertEmployeeInList(name, employeeId) {
    return this.step(`Verify employee "${name}" exists in PIM list`, async () => {
      const firstName = String(name).split(' ')[0];
      const match = await this.findEmployeeViaApi(firstName, employeeId);
      if (match) return;

      const count = await this.searchEmployee(name, employeeId);
      if (count >= 1) {
        await expect(
          this.page.locator('.oxd-table-body .oxd-table-card').filter({ hasText: firstName }).first()
        ).toBeVisible({ timeout: 15000 });
        return;
      }

      expect(await this.findEmployeeViaApi(firstName, employeeId)).toBeTruthy();
    });
  }

  async assertEmployeeFirstName(empNumber, expectedFirstName, employeeId, searchFirstName) {
    return this.step(`Verify employee first name is "${expectedFirstName}"`, async () => {
      const num = await this.resolveEmpNumber(
        searchFirstName ?? expectedFirstName,
        employeeId,
        empNumber
      );
      expect(num, 'employee empNumber required for assertion').toBeTruthy();
      await this.openEmployeePersonalDetailsForm(num);
      await expect(this.page.locator('input[name="firstName"]')).toHaveValue(expectedFirstName, {
        timeout: 15000,
      });
    });
  }

  async assertEmployeeNotInList(name, employeeId) {
    return this.step(`Verify employee "${name}" is not in PIM list`, async () => {
      const first = String(name).split(' ')[0];
      const match = await this.findEmployeeViaApi(first, employeeId);
      expect(match).toBeFalsy();
    });
  }
}
