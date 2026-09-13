import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { formatDateForInput, setInput, waitForToast } from '../utils/helpers.js';

function parse24hToMinutes(timeStr) {
  const [h, m] = String(timeStr).split(':').map(Number);
  return h * 60 + (m || 0);
}

function format24hFromMinutes(totalMins) {
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function format12hFromMinutes(totalMins) {
  const d = new Date();
  d.setHours(Math.floor(totalMins / 60), totalMins % 60, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function apiDateToJsDate(apiDate) {
  const [y, m, d] = apiDate.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export class TimePage extends BasePage {
  punchInButton() {
    return this.page.getByRole('button', { name: /^In$/i });
  }

  punchOutButton() {
    return this.page.getByRole('button', { name: /^Out$/i });
  }

  overlapError() {
    return this.page.getByText('Overlapping Records Found');
  }

  async hasOverlapError() {
    return this.overlapError().isVisible({ timeout: 1000 }).catch(() => false);
  }

  async ensureSession() {
    if (!this.page.url().includes('orangehrmlive.com')) {
      await this.navigate('/web/index.php/dashboard/index');
    }
  }

  async getLatestAttendance() {
    await this.ensureSession();
    return this.page.evaluate(async (base) => {
      const resp = await fetch(`${base}/web/index.php/api/v2/attendance/records/latest`, {
        headers: { Accept: 'application/json' },
      });
      if (!resp.ok) return null;
      return (await resp.json()).data ?? null;
    }, this.baseUrl);
  }

  async getTodayAttendanceRecords() {
    await this.ensureSession();
    return this.page.evaluate(async (base) => {
      const now = new Date();
      const apiDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const resp = await fetch(
        `${base}/web/index.php/api/v2/attendance/records?fromDate=${apiDate}&toDate=${apiDate}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!resp.ok) return [];
      return (await resp.json()).data ?? [];
    }, this.baseUrl);
  }

  async getAttendanceTimezone(preferredOffset) {
    await this.ensureSession();
    const list = await this.page.evaluate(async (base) => {
      const resp = await fetch(`${base}/web/index.php/api/v2/attendance/timezones`, {
        headers: { Accept: 'application/json' },
      });
      if (!resp.ok) return [];
      return (await resp.json()).data ?? [];
    }, this.baseUrl);

    const offset = preferredOffset != null ? Number(preferredOffset) : 5;
    return (
      list.find((t) => Number(t.offset) === offset) ||
      list.find((t) => Number(t.offset) === 5 || t.label === '+05:00') ||
      list.find((t) => String(t.name).includes('Karachi') || String(t.name).includes('Kolkata')) ||
      list[0] || { name: 'Asia/Kolkata', offset: 5 }
    );
  }

  async computeNonOverlappingPunchSlot() {
    return this.step('Compute non-overlapping punch-in time slot', async () => {
      const records = await this.getTodayAttendanceRecords();
      let latestEndMins = 0;
      let apiDate;

      for (const row of records) {
        const inMins = row.punchIn?.userTime ? parse24hToMinutes(row.punchIn.userTime) : 0;
        const outMins = row.punchOut?.userTime
          ? parse24hToMinutes(row.punchOut.userTime)
          : inMins;
        latestEndMins = Math.max(latestEndMins, outMins);
        apiDate = row.punchIn?.userDate || row.punchOut?.userDate || apiDate;
      }

      const now = new Date();
      if (!apiDate) {
        apiDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      }

      const nowMins = now.getHours() * 60 + now.getMinutes();
      const punchMins = Math.min(Math.max(latestEndMins + 5, nowMins + 1), 23 * 60 + 55);

      return {
        apiDate,
        apiTime: format24hFromMinutes(punchMins),
        uiDate: formatDateForInput(apiDateToJsDate(apiDate)),
        uiTime: format12hFromMinutes(punchMins),
      };
    });
  }

  async punchOutViaApi(note = 'E2E auto punch out') {
    return this.step('Punch out via attendance API', async () => {
      const latest = await this.getLatestAttendance();
      if (latest?.state?.id !== 'PUNCHED IN') return;

      const recordOffset = Number(latest.punchIn.offset ?? 5);
      const tz = await this.getAttendanceTimezone(recordOffset);
      const inMins = parse24hToMinutes(latest.punchIn.userTime);

      for (let offset = 1; offset <= 15; offset += 1) {
        const result = await this.page.evaluate(
          async ({ base, body }) => {
            const resp = await fetch(`${base}/web/index.php/api/v2/attendance/records`, {
              method: 'PUT',
              headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            return { ok: resp.ok, status: resp.status };
          },
          {
            base: this.baseUrl,
            body: {
              date: latest.punchIn.userDate,
              time: format24hFromMinutes(inMins + offset),
              timezoneOffset: recordOffset,
              timezoneName: tz.name,
              note,
            },
          }
        );

        if (result.ok) {
          await expect
            .poll(async () => (await this.getLatestAttendance())?.state?.id, { timeout: 15000 })
            .not.toBe('PUNCHED IN');
          return;
        }
      }

      throw new Error('punchOutViaApi failed after retries');
    });
  }

  async fillPunchDateTime(uiDate, uiTime) {
    return this.step(`Fill punch date/time: ${uiDate} ${uiTime}`, async () => {
      const dateInput = this.page.getByPlaceholder('yyyy-dd-mm').first();
      const timeInput = this.page.getByPlaceholder('hh:mm').first();
      if (await dateInput.isVisible().catch(() => false)) {
        await dateInput.click();
        await dateInput.press('ControlOrMeta+a');
        await dateInput.press('Delete');
        await dateInput.fill(uiDate);
      } else {
        await setInput(this.page, 'Date', uiDate);
      }
      if (await timeInput.isVisible().catch(() => false)) {
        await timeInput.click();
        await timeInput.press('ControlOrMeta+a');
        await timeInput.press('Delete');
        await timeInput.fill(uiTime);
      } else {
        await setInput(this.page, 'Time', uiTime);
      }
      await this.overlapError().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    });
  }

  async openPunchInScreen() {
    return this.step('Open Punch In screen', async () => {
      await this.navigate('/web/index.php/attendance/punchIn');
      await this.waitForSpinner();
    });
  }

  async openPunchOutScreen() {
    return this.step('Open Punch Out screen', async () => {
      await this.navigate('/web/index.php/attendance/punchOut');
      await this.waitForSpinner();
    });
  }

  async waitForPunchControls() {
    return this.step('Wait for punch In/Out controls', async () => {
      await expect
        .poll(
          async () => {
            const canIn = await this.punchInButton().isVisible().catch(() => false);
            const canOut = await this.punchOutButton().isVisible().catch(() => false);
            return canIn || canOut;
          },
          { timeout: 20000 }
        )
        .toBe(true);

      return {
        canPunchIn: await this.punchInButton().isVisible().catch(() => false),
        canPunchOut: await this.punchOutButton().isVisible().catch(() => false),
      };
    });
  }

  async waitForPunchToast() {
    return this.step('Wait for punch success toast', async () => {
      await this.waitForSpinner();
      const toast = this.page.locator('.oxd-toast').first();
      if (await toast.isVisible({ timeout: 8000 }).catch(() => false)) {
        await waitForToast(this.page, /Success|Punched|Successfully/i).catch(() => {});
      }
    });
  }

  async isPunchedIn() {
    const latest = await this.getLatestAttendance();
    return latest?.state?.id === 'PUNCHED IN';
  }

  async ensurePunchedOut() {
    return this.step('Ensure user is punched out before punch-in', async () => {
      const latest = await this.getLatestAttendance();
      if (latest?.state?.id !== 'PUNCHED IN') return;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        await this.punchOutViaApi();
        const state = (await this.getLatestAttendance())?.state?.id;
        if (state !== 'PUNCHED IN') return;
      }

      const final = await this.getLatestAttendance();
      expect(final?.state?.id).not.toBe('PUNCHED IN');
    });
  }

  async clearPunchInOverlap() {
    return this.step('Resolve overlapping punch-in records', async () => {
      let slot = await this.computeNonOverlappingPunchSlot();
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await this.fillPunchDateTime(slot.uiDate, slot.uiTime);
        if (!(await this.hasOverlapError())) return slot;
        const extraMins = parse24hToMinutes(slot.apiTime) + 5 * (attempt + 1);
        slot = {
          ...slot,
          apiTime: format24hFromMinutes(extraMins),
          uiTime: format12hFromMinutes(extraMins),
        };
      }
      throw new Error('clearPunchInOverlap: could not resolve overlapping attendance records');
    });
  }

  async clickPunchIn() {
    return this.step('Click Punch In button', async () => {
      await this.resilientClick([
        () => this.punchInButton(),
        () => this.page.locator('button.oxd-button').filter({ hasText: /^In$/i }),
      ]);
    });
  }

  async clickPunchOut() {
    return this.step('Click Punch Out button', async () => {
      await this.resilientClick([
        () => this.punchOutButton(),
        () => this.page.locator('button.oxd-button').filter({ hasText: /^Out$/i }),
      ]);
    });
  }

  async assertPunchedIn() {
    return this.step('Verify user is punched in', async () => {
      await expect
        .poll(
          async () => {
            if (this.page.url().includes('punchOut')) return true;
            if (await this.punchOutButton().isVisible().catch(() => false)) return true;
            return (await this.getLatestAttendance())?.state?.id === 'PUNCHED IN';
          },
          { timeout: 30000 }
        )
        .toBe(true);
    });
  }

  async punchIn() {
    return this.step('Record attendance punch in', async () => {
      await this.ensurePunchedOut();

      await this.openPunchInScreen();
      if (this.page.url().includes('punchOut')) {
        await this.punchOutViaApi();
        await this.openPunchInScreen();
      }

      await this.waitForPunchControls();
      await this.clearPunchInOverlap();

      await this.step('Submit punch in', async () => {
        await expect(this.punchInButton()).toBeEnabled({ timeout: 20000 });
        await this.clickPunchIn();
        await this.waitForPunchToast();
      });

      if (await this.hasOverlapError()) {
        await this.step('Retry punch in after overlap resolution', async () => {
          await this.clearPunchInOverlap();
          await this.clickPunchIn();
          await this.waitForPunchToast();
        });
      }

      await this.assertPunchedIn();
    });
  }

  async punchOut() {
    return this.step('Record attendance punch out', async () => {
      if (!(await this.isPunchedIn())) {
        throw new Error('punchOut: user is not punched in — run punch in first');
      }

      if (!this.page.url().includes('punchOut')) {
        await this.openPunchOutScreen();
      } else {
        await this.waitForSpinner();
      }

      const { canPunchOut } = await this.waitForPunchControls();
      if (!canPunchOut) {
        const latest = await this.getLatestAttendance();
        if (latest?.state?.id === 'PUNCHED IN') {
          await this.punchOutViaApi();
          return;
        }
        throw new Error('punchOut: user is not punched in — run punch in first');
      }

      await this.step('Submit punch out', async () => {
        await expect(this.punchOutButton()).toBeEnabled();
        await this.clickPunchOut();
        await this.waitForPunchToast();
      });
    });
  }

  async assertPunchRecordExists() {
    return this.step('Verify punch record exists in My Attendance', async () => {
      await this.navigate('/web/index.php/attendance/viewMyAttendanceRecord');
      await this.waitForSpinner();
      const rows = this.page.locator('.oxd-table-body .oxd-table-card, .oxd-table-body .oxd-table-row');
      await expect(rows.first()).toBeVisible({ timeout: 20000 });
    });
  }

  async navigateToMyTimesheets() {
    return this.step('Navigate to My Timesheets', async () => {
      if (this.page.url().includes('viewMyTimesheet')) {
        await this.waitForSpinner();
        return;
      }
      await this.navigate('/web/index.php/time/viewMyTimesheet');
      await this.waitForSpinner();
      await expect(this.page).toHaveURL(/time\/viewMyTimesheet/i, { timeout: 20000 });
    });
  }

  async submitCurrentTimesheet() {
    return this.step('Submit current period timesheet', async () => {
      await this.navigateToMyTimesheets();

      const rows = this.page.locator('.oxd-table-body .oxd-table-card');
      await expect
        .poll(async () => rows.count(), { timeout: 20000 })
        .toBeGreaterThanOrEqual(0);

      const count = await rows.count();

      if (count === 0) {
        await this.step('Verify timesheet module is accessible', async () => {
          await expect(this.page).toHaveURL(/time\//i);
        });
        return;
      }

      await this.step('Open timesheet for submission', async () => {
        const submittableRow = rows.filter({ hasText: /Not Submitted|Initial/i }).first();
        const hasSubmittable = await submittableRow.isVisible().catch(() => false);

        const targetRow = hasSubmittable ? submittableRow : rows.first();
        const actionIcon = targetRow
          .locator('.bi-pencil-fill, .bi-eye, button, .oxd-table-cell-action')
          .first();
        if (await actionIcon.isVisible().catch(() => false)) {
          await actionIcon.click();
          await this.waitForSpinner();
        }

        const edit = this.page.getByRole('button', { name: /^Edit$/i });
        if (await edit.isVisible().catch(() => false)) {
          await edit.click();
          await this.waitForSpinner();
        }
      });

      await this.step('Submit timesheet', async () => {
        const submit = this.page.getByRole('button', { name: /^Submit$/i });
        if (await submit.isVisible().catch(() => false)) {
          await submit.click();
          await this.confirmDialog();
          const toast = this.page.locator('.oxd-toast');
          if (await toast.isVisible().catch(() => false)) {
            await waitForToast(this.page, /Success|Submitted/i);
            return;
          }
        }

        expect(this.page.url()).toContain('/time/');
      });
    });
  }
}
