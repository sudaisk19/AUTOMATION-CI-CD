import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';

export class LoginPage extends BasePage {
  async login(username, password) {
    return this.step(`Login as "${username}"`, async () => {
      await this.step('Open login page', async () => {
        await this.navigate('/web/index.php/auth/login');
      });
      await this.step('Enter username and password', async () => {
        await this.page.getByPlaceholder('Username').fill(username);
        await this.page.getByPlaceholder('Password').fill(password);
      });
      await this.step('Click Login button', async () => {
        await this.resilientClick([() => this.page.getByRole('button', { name: 'Login' })]);
      });
    });
  }

  async assertDashboardLoaded() {
    return this.step('Verify dashboard is loaded', async () => {
      await this.step('Assert dashboard URL', async () => {
        await expect(this.page).toHaveURL(/dashboard/, { timeout: 30000 });
      });
      await this.step('Wait for page spinners to disappear', async () => {
        await this.waitForSpinner();
      });
      await this.step('Verify top bar is visible', async () => {
        await expect(
          this.page.locator('.oxd-topbar-header, .oxd-userdropdown-tab').first()
        ).toBeVisible({ timeout: 20000 });
      });
    });
  }

  async assertInvalidCredentialsError() {
    return this.step('Verify invalid credentials error is shown', async () => {
      await expect(this.page.getByRole('alert')).toContainText(/Invalid credentials/i);
    });
  }

  async assertRequiredErrors() {
    return this.step('Verify required field validation errors', async () => {
      const errors = this.page.locator('.oxd-input-field-error-message');
      await expect(errors).toHaveCount(2);
      await expect(errors.nth(0)).toContainText('Required');
      await expect(errors.nth(1)).toContainText('Required');
    });
  }

  async logout() {
    return this.step('Logout from application', async () => {
      await this.step('Open user dropdown menu', async () => {
        const userDropdown = this.page.locator('.oxd-userdropdown-tab');
        await userDropdown.waitFor({ state: 'visible', timeout: 15000 });
        await userDropdown.click();
      });
      await this.step('Click Logout menu item', async () => {
        const logoutLink = this.page.getByRole('menuitem', { name: /logout/i });
        await logoutLink.waitFor({ state: 'visible', timeout: 5000 });
        await logoutLink.click();
      });
      await this.step('Verify login page is displayed', async () => {
        await expect(this.page).toHaveURL(/auth\/login/, { timeout: 15000 });
        await expect(this.page.getByRole('button', { name: 'Login' })).toBeVisible();
      });
    });
  }
}
