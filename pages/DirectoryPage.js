import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { pickAutocomplete, pickSelect, groupByLabel } from '../utils/helpers.js';

export class DirectoryPage extends BasePage {
  async open() {
    return this.step('Open Employee Directory', async () => {
      await super.navigate('/web/index.php/directory/viewDirectory');
      await this.waitForSpinner();
    });
  }

  async openFilterPanel() {
    return this.step('Open directory filter panel', async () => {
      const filterBtn = this.page.locator('.oxd-table-filter, .oxd-switch-button').first();
      const employeeInput = this.page
        .locator('.oxd-input-group')
        .filter({ hasText: 'Employee Name' })
        .locator('input');
      if (!(await employeeInput.isVisible().catch(() => false))) {
        await filterBtn.click();
      }
      await expect(employeeInput).toBeVisible({ timeout: 8000 });
    });
  }

  async searchByName(name) {
    return this.step(`Search directory by employee name: ${name}`, async () => {
      await this.open();
      await this.openFilterPanel();
      await this.step('Enter employee name and search', async () => {
        await pickAutocomplete(this.page, 'Employee Name', name);
        await this.page.keyboard.press('Escape');
        await this.resilientClick([() => this.page.getByRole('button', { name: 'Search' })]);
        await this.waitForSpinner();
      });
    });
  }

  async searchByDepartment(department) {
    return this.step(`Search directory by department: ${department}`, async () => {
      await this.open();
      await this.openFilterPanel();
      await this.step('Select job title and search', async () => {
        await pickSelect(this.page, 'Job Title', department);
        await this.resilientClick([() => this.page.getByRole('button', { name: 'Search' })]);
        await this.waitForSpinner();
      });
    });
  }

  async filterByFirstJobTitle() {
    return this.step('Filter directory by first available job title', async () => {
      await this.open();
      await this.openFilterPanel();
      await this.step('Select first job title and search', async () => {
        const jobGroup = groupByLabel(this.page, 'Job Title');
        await jobGroup.locator('.oxd-select-text').click();
        await this.page.keyboard.press('ArrowDown');
        await this.page.keyboard.press('Enter');
        await this.resilientClick([() => this.page.getByRole('button', { name: 'Search' })]);
        await this.waitForSpinner();
      });
    });
  }

  async getResultCount() {
    const cards = this.page.locator(
      '.orangehrm-directory-card, .oxd-grid-item, .oxd-table-body .oxd-table-card'
    );
    return cards.count();
  }

  async assertCardVisible(name) {
    return this.step(`Verify directory card visible for "${name}"`, async () => {
      await expect
        .poll(
          async () => {
            const cards = this.page.locator('.orangehrm-directory-card, .oxd-grid-item');
            const count = await cards.count();
            for (let i = 0; i < count; i += 1) {
              const text = await cards.nth(i).innerText().catch(() => '');
              if (text.includes(name)) return true;
            }
            return false;
          },
          { timeout: 20000, intervals: [500, 1000, 2000] }
        )
        .toBe(true);
    });
  }

  async resetFilters() {
    return this.step('Reset directory filters', async () => {
      await this.resilientClick([() => this.page.getByRole('button', { name: 'Reset' })]);
      await this.waitForSpinner();
    });
  }
}
