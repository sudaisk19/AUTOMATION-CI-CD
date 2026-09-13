import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';
import {
  pickAutocomplete,
  setInput,
  waitForToast,
} from '../utils/helpers.js';

export class RecruitmentPage extends BasePage {
  async ensureAppContext() {
    if (!this.page.url().includes('orangehrmlive.com')) {
      await this.navigate('/web/index.php/dashboard/index');
    }
  }

  async getVacancyIdByTitle(title) {
    return this.step(`Resolve vacancy ID for "${title}"`, async () => {
      await this.ensureAppContext();
      const vacancyId = await this.page.evaluate(
        async ({ base, title }) => {
          const resp = await fetch(`${base}/web/index.php/api/v2/recruitment/vacancies?limit=200`, {
            headers: { Accept: 'application/json' },
          });
          if (!resp.ok) return null;
          const data = ((await resp.json()).data) || [];
          const exact = data.find((v) => v.name === title);
          if (exact) return exact.id;
          const partial = title.slice(0, 14);
          return data.find((v) => v.name && v.name.includes(partial))?.id ?? null;
        },
        { base: this.baseUrl, title }
      );
      if (!vacancyId) {
        throw new Error(`getVacancyIdByTitle: vacancy not found for "${title}"`);
      }
      return vacancyId;
    });
  }

  async addCandidateViaApi({ firstName, lastName, middleName, email, vacancyTitle }) {
    return this.step(`Add candidate via API: ${firstName} ${lastName}`, async () => {
      await this.ensureAppContext();
      const vacancyId = await this.getVacancyIdByTitle(vacancyTitle);
      const result = await this.page.evaluate(
        async ({ base, payload }) => {
          const resp = await fetch(`${base}/web/index.php/api/v2/recruitment/candidates`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          return { ok: resp.ok, status: resp.status, body: await resp.json() };
        },
        {
          base: this.baseUrl,
          payload: { firstName, lastName, middleName, email, vacancyId },
        }
      );
      if (!result.ok) {
        throw new Error(`addCandidateViaApi failed (${result.status}): ${JSON.stringify(result.body)}`);
      }
      return result.body?.data?.id;
    });
  }

  async navigateToVacancies() {
    return this.step('Navigate to Vacancies list', async () => {
      await this.navigate('/web/index.php/recruitment/viewJobVacancy');
      if (this.page.url().includes('viewCandidates')) {
        await this.resilientClick([
          () => this.page.getByRole('link', { name: 'Vacancies' }),
          () => this.page.getByText('Vacancies', { exact: true }),
        ]);
      }
      await this.waitForSpinner();
    });
  }

  async addVacancy({ title, hiringManager, numPositions }) {
    return this.step(`Create vacancy "${title}"`, async () => {
      await this.step('Open Add Vacancy form', async () => {
        await this.navigate('/web/index.php/recruitment/addJobVacancy');
      });
      await this.step('Fill vacancy details', async () => {
        await setInput(this.page, 'Vacancy Name', title);
        await pickAutocomplete(this.page, 'Hiring Manager', hiringManager);
        await setInput(this.page, 'Number of Positions', String(numPositions));
        const jobTitle = this.page
          .locator('.oxd-input-group')
          .filter({ hasText: 'Job Title' })
          .locator('.oxd-select-text')
          .first();
        if (await jobTitle.isVisible().catch(() => false)) {
          await jobTitle.click();
          await this.page.locator('.oxd-select-option').nth(1).click();
        }
      });
      await this.step('Save vacancy', async () => {
        await this.resilientClick([() => this.page.getByRole('button', { name: 'Save' })]);
        const toastShown = await this.page
          .locator('.oxd-toast')
          .first()
          .isVisible({ timeout: 15000 })
          .catch(() => false);
        if (toastShown) {
          await waitForToast(this.page, /Successfully (Saved|Updated)/i);
          return;
        }
        await this.page.waitForURL(/addJobVacancy\/\d+|viewJobVacancy/i, { timeout: 15000 });
      });
    });
  }

  async assertVacancyInList(title) {
    return this.step(`Verify vacancy "${title}" is in list`, async () => {
      await this.navigateToVacancies();
      await expect(this.page.getByText(title, { exact: false })).toBeVisible({ timeout: 15000 });
    });
  }

  async pickVacancyByTitle(vacancyTitle) {
    return this.step(`Select vacancy "${vacancyTitle}"`, async () => {
      const group = this.page.locator('.oxd-input-group').filter({ hasText: /^Vacancy$/ });
      const wrapper = group.locator('.oxd-select-text, .oxd-select-wrapper').first();
      if (!(await wrapper.isVisible({ timeout: 5000 }).catch(() => false))) {
        return;
      }
      await wrapper.click();
      const escaped = String(vacancyTitle).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = this.page.locator('.oxd-select-option').filter({ hasText: new RegExp(escaped, 'i') }).first();
      if (await match.isVisible({ timeout: 3000 }).catch(() => false)) {
        await match.click();
      } else {
        const partial = escaped.slice(0, Math.min(12, escaped.length));
        const partialMatch = this.page
          .locator('.oxd-select-option')
          .filter({ hasText: new RegExp(partial, 'i') })
          .first();
        if (await partialMatch.isVisible({ timeout: 2000 }).catch(() => false)) {
          await partialMatch.click();
        } else {
          await this.page.locator('.oxd-select-option').nth(1).click();
        }
      }
    });
  }

  async addCandidate({ firstName, lastName, middleName = 'A', vacancy, email }) {
    const emailValue = email || `auto.recruit.${Date.now()}@example.com`;
    if (vacancy) {
      return this.addCandidateViaApi({
        firstName,
        lastName,
        middleName,
        email: emailValue,
        vacancyTitle: vacancy,
      });
    }

    return this.step(`Add candidate: ${firstName} ${lastName}`, async () => {
      await this.step('Open Add Candidate form', async () => {
        await this.navigate('/web/index.php/recruitment/addCandidate');
      });
      await this.step('Fill candidate details', async () => {
        const firstInput = this.page.locator('input[name="firstName"]');
        const middleInput = this.page.locator('input[name="middleName"]');
        const lastInput = this.page.locator('input[name="lastName"]');
        await firstInput.waitFor({ state: 'visible', timeout: 15000 });
        for (const [locator, value] of [
          [firstInput, firstName],
          [middleInput, middleName],
          [lastInput, lastName],
        ]) {
          await locator.click();
          await locator.press('ControlOrMeta+a');
          await locator.press('Delete');
          await locator.pressSequentially(String(value), { delay: 60 });
          if (!(await locator.inputValue())) {
            await locator.fill(String(value));
          }
        }
        await setInput(this.page, 'Email', emailValue);
      });
      await this.step('Save candidate', async () => {
        await this.resilientClick([() => this.page.getByRole('button', { name: 'Save' })]);
        const toastShown = await this.page
          .locator('.oxd-toast')
          .first()
          .isVisible({ timeout: 15000 })
          .catch(() => false);
        if (toastShown) {
          await waitForToast(this.page, /Successfully (Saved|Updated)/i);
        }
      });
      const idFromUrl = this.page.url().match(/addCandidate\/(\d+)/)?.[1];
      return idFromUrl ? Number(idFromUrl) : null;
    });
  }

  async resolveCandidateIdByLastName(lastName) {
    return this.step(`Resolve candidate ID by last name "${lastName}"`, async () => {
      const id = await this.page.evaluate(
        async ({ base, lastName }) => {
          const resp = await fetch(
            `${base}/web/index.php/api/v2/recruitment/candidates?limit=100&sortField=candidate.dateOfApplication&sortOrder=DESC`,
            { headers: { Accept: 'application/json' } }
          );
          if (!resp.ok) return null;
          const data = ((await resp.json()).data) || [];
          const match = data.find(
            (c) =>
              String(c.lastName || '').includes(lastName) ||
              `${c.firstName || ''} ${c.lastName || ''}`.includes(lastName)
          );
          return match?.id ?? null;
        },
        { base: this.baseUrl, lastName }
      );
      if (!id) {
        throw new Error(`resolveCandidateIdByLastName: no candidate matching "${lastName}"`);
      }
      return id;
    });
  }

  async shortlistCandidate(candidateIdOrLastName) {
    return this.step('Shortlist candidate', async () => {
      await this.ensureAppContext();
      const candidateId =
        typeof candidateIdOrLastName === 'number' ||
        /^\d+$/.test(String(candidateIdOrLastName))
          ? Number(candidateIdOrLastName)
          : await this.resolveCandidateIdByLastName(String(candidateIdOrLastName));

      const result = await this.page.evaluate(
        async ({ base, candidateId }) => {
          const resp = await fetch(
            `${base}/web/index.php/api/v2/recruitment/candidates/${candidateId}/shortlist`,
            {
              method: 'PUT',
              headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
              body: JSON.stringify({ note: 'E2E shortlist' }),
            }
          );
          return { ok: resp.ok, status: resp.status, body: await resp.text() };
        },
        { base: this.baseUrl, candidateId }
      );
      if (!result.ok) {
        throw new Error(`shortlistCandidate API failed (${result.status}): ${result.body}`);
      }
    });
  }

  async assertCandidateStatus(candidateNamePattern, expectedStatus, candidateId) {
    return this.step(`Verify candidate status is "${expectedStatus}"`, async () => {
      if (candidateId) {
        await this.ensureAppContext();
        const status = await this.page.evaluate(
          async ({ base, candidateId }) => {
            const resp = await fetch(
              `${base}/web/index.php/api/v2/recruitment/candidates/${candidateId}`,
              { headers: { Accept: 'application/json' } }
            );
            if (!resp.ok) return '';
            const data = (await resp.json()).data;
            return data?.status?.label || data?.status?.name || data?.statusName || '';
          },
          { base: this.baseUrl, candidateId }
        );
        expect(status).toMatch(new RegExp(expectedStatus, 'i'));
        return;
      }
      await this.navigate('/web/index.php/recruitment/viewCandidates');
      await this.waitForSpinner();
      const row = this.page.locator('.oxd-table-body .oxd-table-card').filter({
        hasText: candidateNamePattern,
      });
      await expect(row.first()).toContainText(new RegExp(expectedStatus, 'i'));
    });
  }
}
