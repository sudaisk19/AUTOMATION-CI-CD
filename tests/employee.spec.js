import { test, expect } from '../fixtures/testSetup.js';
import { setAllureLabels, attachTestData } from '../utils/allureHelper.js';
import { loadTestData } from '../utils/dataUtil.js';
import { EmployeePage } from '../pages/EmployeePage.js';
import { getTimestamp } from '../utils/helpers.js';

const employees = loadTestData('employees');

test.describe.serial('PIM / Employee Module', () => {
  const sharedData = {};

  test.beforeEach(async ({ page }, testInfo) => {
    setAllureLabels(testInfo, {
      suite: 'PIM',
      feature: 'Employee Management',
      severity: 'normal',
      module: 'Employee',
      tcId: testInfo.title.match(/TC\d+/)?.[0] || 'TC',
    });
  });

  test('TC004 — add new employee with firstName, lastName and employeeId', async ({
    page,
  }, testInfo) => {
    setAllureLabels(testInfo, {
      severity: 'critical',
      tcId: 'TC004',
    });
    const ts = getTimestamp();
    const employeePage = new EmployeePage(page);
    const data = {
      firstName: employees.new.firstName,
      lastName: `${employees.new.lastName}${ts}`.slice(0, 30),
      employeeId: `TC${ts.slice(-8)}`,
    };

    await test.step('Prepare employee test data', async () => {
      await attachTestData(testInfo, data, 'employee-test-data');
    });
    await test.step('Add new employee', async () => {
      await employeePage.addEmployee(data);
    });
    await test.step('Verify employee was created', async () => {
      await expect(page).toHaveURL(/viewPersonalDetails|editEmployee|viewEmployee/i);
      let empNumber = page.url().match(/empNumber\/(\d+)/)?.[1];
      if (!empNumber) {
        await expect
          .poll(
            async () => {
              const match = await employeePage.findEmployeeViaApi(data.firstName, data.employeeId);
              return match?.empNumber ?? null;
            },
            { timeout: 30000 }
          )
          .toBeTruthy();
        const match = await employeePage.findEmployeeViaApi(data.firstName, data.employeeId);
        empNumber = match?.empNumber ? String(match.empNumber) : undefined;
      }
      sharedData.createdEmployee = {
        ...data,
        fullName: `${data.firstName} ${data.lastName}`,
        empNumber,
      };
    });
  });

  test('TC005 — search employee by name returns matching results', async ({ page }, testInfo) => {
    setAllureLabels(testInfo, { severity: 'normal', tcId: 'TC005' });
    const employeePage = new EmployeePage(page);
    const emp = sharedData.createdEmployee;

    await test.step('Verify shared employee exists from TC004', async () => {
      expect(emp, 'TC004 must create sharedData.createdEmployee').toBeTruthy();
    });
    await test.step('Search and verify employee in PIM list', async () => {
      await employeePage.assertEmployeeInList(emp.fullName, emp.employeeId);
    });
  });

  test('TC006 — edit employee first name saves successfully', async ({ page }, testInfo) => {
    setAllureLabels(testInfo, { severity: 'normal', tcId: 'TC006' });
    const ts = getTimestamp();
    const employeePage = new EmployeePage(page);
    const updated = `${employees.edit.updatedFirstName}${ts}`;

    await test.step('Edit employee first name', async () => {
      await employeePage.editEmployeeFirstName(
        sharedData.createdEmployee.fullName,
        updated,
        sharedData.createdEmployee.employeeId,
        sharedData.createdEmployee.empNumber
      );
    });
    await test.step('Verify updated first name is saved', async () => {
      await employeePage.assertEmployeeFirstName(
        sharedData.createdEmployee.empNumber,
        updated,
        sharedData.createdEmployee.employeeId,
        sharedData.createdEmployee.firstName
      );
    });
  });

  test('TC007 — delete employee removes record from PIM list', async ({ page }, testInfo) => {
    setAllureLabels(testInfo, { severity: 'normal', tcId: 'TC007' });
    const ts = getTimestamp();
    const employeePage = new EmployeePage(page);
    const temp = {
      firstName: employees.deleteTemp.firstName,
      lastName: `${employees.deleteTemp.lastNamePrefix}${ts}`,
      employeeId: `D${ts.slice(-8)}`,
    };

    await test.step('Prepare temporary employee data', async () => {
      await attachTestData(testInfo, temp);
    });
    await test.step('Create temporary employee', async () => {
      await employeePage.addEmployee(temp);
    });
    await test.step('Delete temporary employee', async () => {
      await employeePage.deleteEmployee(`${temp.firstName} ${temp.lastName}`, temp.employeeId);
    });
    await test.step('Verify employee is removed from PIM', async () => {
      await employeePage.assertEmployeeNotInList(`${temp.firstName} ${temp.lastName}`, temp.employeeId);
    });
  });
});
