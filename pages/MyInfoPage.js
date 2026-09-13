import { BasePage } from './BasePage.js';
import { setInput, clearAndFill } from '../utils/helpers.js';

export class MyInfoPage extends BasePage {
  async openSection(sectionName) {
    return this.step(`Open My Info section: ${sectionName}`, async () => {
      await this.navigate('/web/index.php/pim/viewMyDetails');
      await this.page
        .locator('.orangehrm-vertical-padding, .oxd-layout-context')
        .first()
        .waitFor({ state: 'visible', timeout: 15000 });
      const link = this.page.locator('a').filter({ hasText: new RegExp(sectionName, 'i') });
      await link.first().waitFor({ state: 'visible', timeout: 15000 });
      await link.first().click();
      await this.waitForSpinner();
    });
  }

  async navigateToPersonalDetails() {
    return this.step('Navigate to Personal Details tab', async () => {
      await this.openSection('Personal Details');
      const nicknameGroup = this.page.locator('.oxd-input-group').filter({ hasText: 'Nickname' });
      const nicknameInput = nicknameGroup.locator('input').first();
      if (await nicknameGroup.count()) {
        await nicknameGroup.scrollIntoViewIfNeeded();
        await nicknameInput.waitFor({ state: 'visible', timeout: 15000 });
        return;
      }
      const middleName = this.page.locator('input[name="middleName"]');
      await middleName.scrollIntoViewIfNeeded();
      await middleName.waitFor({ state: 'visible', timeout: 15000 });
    });
  }

  async updateNickname(nickname) {
    return this.step(`Update nickname to "${nickname}"`, async () => {
      await this.navigateToPersonalDetails();
      await this.step('Fill nickname field', async () => {
        const nicknameInput = this.page
          .locator('.oxd-input-group')
          .filter({ hasText: 'Nickname' })
          .locator('input')
          .first();
        if (await nicknameInput.isVisible().catch(() => false)) {
          await setInput(this.page, 'Nickname', nickname);
        } else {
          await clearAndFill(this.page, this.page.locator('input[name="middleName"]'), nickname);
        }
      });
      await this.step('Save personal details', async () => {
        await this.resilientClick([
          () => this.page.getByRole('button', { name: 'Save' }).first(),
        ]);
        await this.assertSuccessToast();
      });
    });
  }

  async navigateToEmergencyContacts() {
    return this.step('Navigate to Emergency Contacts tab', async () => {
      await this.openSection('Emergency Contacts');
      await this.page
        .getByRole('button', { name: /^Add$/i })
        .first()
        .waitFor({ state: 'visible', timeout: 15000 })
        .catch(() => {});
    });
  }

  async addEmergencyContact({ name, relationship, homeTelephone }) {
    return this.step(`Add emergency contact: ${name}`, async () => {
      await this.openSection('Emergency Contacts');
      await this.step('Open add contact form', async () => {
        const addBtn = this.page.getByRole('button', { name: /Add/i }).first();
        await addBtn.waitFor({ state: 'visible', timeout: 15000 });
        await addBtn.click();
      });
      await this.step('Fill contact details', async () => {
        await setInput(this.page, 'Name', name);
        await setInput(this.page, 'Relationship', relationship);
        await setInput(this.page, 'Home Telephone', homeTelephone);
      });
      await this.step('Save emergency contact', async () => {
        await this.resilientClick([
          () => this.page.locator('form').getByRole('button', { name: 'Save' }),
          () => this.page.getByRole('button', { name: 'Save' }).last(),
        ]);
        await this.assertSuccessToast();
      });
    });
  }

  async navigateToContactDetails() {
    return this.step('Navigate to Contact Details tab', async () => {
      await this.openSection('Contact Details');
      await this.page
        .locator('.oxd-input-group')
        .filter({ hasText: 'Street 1' })
        .locator('input')
        .first()
        .waitFor({ state: 'visible', timeout: 15000 });
    });
  }

  async updateContactDetails({ street1, city, country }) {
    return this.step(`Update contact details: ${street1}, ${city}`, async () => {
      await this.navigateToContactDetails();
      await this.step('Fill contact address fields', async () => {
        await clearAndFill(
          this.page,
          this.page.locator('.oxd-input-group').filter({ hasText: 'Street 1' }).locator('input').first(),
          street1
        );
        await setInput(this.page, 'City', city);
        if (country) {
          const { pickSelect } = await import('../utils/helpers.js');
          await pickSelect(this.page, 'Country', country);
        }
      });
      await this.step('Save contact details', async () => {
        await this.resilientClick([
          () => this.page.getByRole('button', { name: 'Save' }).first(),
        ]);
        await this.assertSuccessToast();
      });
    });
  }
}
