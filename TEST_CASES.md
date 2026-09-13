# OrangeHRM Playwright E2E — Full Test Case & Flakiness Reference

> Revision notes for `AUTOMATION-CI-CD`. Everything below was derived by reading the actual
> code in `tests/`, `pages/`, `utils/`, `fixtures/`, plus 451 historical Allure result files
> in `allure-results/` (≈16–22 recorded runs per test).

---

## 1. Project at a glance

| Thing | Value |
|---|---|
| App under test (AUT) | `https://opensource-demo.orangehrmlive.com` (public shared demo) |
| Credentials | `Admin` / `admin123` (from `.env`, defaults in `utils/config.js`) |
| Runner | Playwright `1.60.0`, JavaScript **ESM** (`"type": "module"`) |
| Pattern | Page Object Model — 9 classes, all extending `BasePage` |
| Reporting | Allure (`allure-playwright` v3) + Playwright HTML + `list` |
| Logging | log4js → console + `logs/run.log` + Allure attachment |
| Specs | 8 files, **26 unique tests**, TC001–TC025 (TC004 used twice — see §7) |
| Timeouts | test `90s`, expect `20s`, action `15s`, navigation `30s` |
| Parallelism | `fullyParallel: true` but `workers: 1` everywhere (local **and** CI) |
| Retries | `0` local, `1` in CI |
| CI | **Jenkins** — GitHub Actions workflow disabled at `.github/workflows/playwright.yml.disabled` |
| Locale/TZ pinned | `en-US` / `Asia/Karachi` |

### Execution flow

```
globalSetup (login once → auth.json)
   └─> testSetup.js auto-fixture (per test)
         • push TC-ID annotation
         • logger.info [START]
         • ---- run the test ----
         • captureAfterEach()  → screenshot on PASS *and* FAIL
         • attachErrorDetails() → error message + stack
         • attachLogsToAllure() → last 50 log lines
         • logger.info [STATUS] + duration
   └─> globalTeardown (run-summary.txt → API cleanup → log4js shutdown)
```

### Playwright projects (`playwright.config.js`)

| Project | Browser | Auth | Includes |
|---|---|---|---|
| `chromium` | Desktop Chrome | `storageState: auth.json` | everything **except** `login.spec.js`, `time.spec.js` (19 tests) |
| `login-tests` | Desktop Chrome | **no** storage state (must log in fresh) | `login.spec.js` only (4 tests) |
| `time-serial` | Desktop Chrome | `auth.json` | `time.spec.js` only (3 tests) |
| `firefox` | Desktop Firefox | `auth.json` | same as chromium (19 tests) — known flaky, excluded from stable run |

`npx playwright test --list` → **45 total** (26 unique + 19 Firefox duplicates).
The "26 tests" figure in the README = chromium + login-tests + time-serial.

```bash
# the stable / submission run
npx playwright test --project=chromium --project=login-tests --project=time-serial
```

---

## 2. Test case catalogue

### 2.1 Login — `tests/login.spec.js` → `LoginPage` → project `login-tests`

This is the **only** spec that does not use `auth.json`; `beforeEach` navigates to
`/web/index.php/auth/login` so every test starts unauthenticated.

| TC | Title | Steps | Assertion |
|---|---|---|---|
| **TC001** | Valid admin login redirects to dashboard | `login(username, password)` with creds from `getAdminCredentials()` | URL matches `/dashboard/`, spinners gone, `.oxd-topbar-header` visible |
| **TC002** | Invalid credentials shows error alert | login with `users.invalid` (`Admin` / `WrongPass999`) | `role=alert` contains `Invalid credentials`; URL still `auth/login` |
| **TC003** | Empty form shows two required errors | click **Login** with both fields blank | exactly **2** `.oxd-input-field-error-message`, both = `Required` |
| **TC004** | Logout returns to login page | login → assert dashboard → `.oxd-userdropdown-tab` → `menuitem Logout` | URL `auth/login` + Login button visible |

Severity: TC001/TC002/TC004 = `critical`, TC003 = `normal`.
Data source: `testdata/users.json`.

---

### 2.2 PIM / Employee — `tests/employee.spec.js` → `EmployeePage` → `chromium`

**`test.describe.serial`** — TC005 and TC006 consume `sharedData.createdEmployee` produced by TC004.
If TC004 fails, the rest of the file is skipped.

| TC | Title | What it actually does |
|---|---|---|
| **TC004** | Add new employee | Builds unique data (`AutoTest` + `TCEmployee<ts>` + `TC<8-digit ts>`), attaches it to Allure, fills `/pim/addEmployee`, waits for `Successfully Saved` toast. Then resolves `empNumber` from the URL, or falls back to `expect.poll` on `findEmployeeViaApi()` (30 s) hitting `/api/v2/pim/employees?nameOrId=`. Stores `{firstName, lastName, employeeId, fullName, empNumber}` in `sharedData`. **severity: critical** |
| **TC005** | Search employee by name | `assertEmployeeInList()` — tries the REST API first; if no hit, falls back to the PIM UI search (reset filter → autocomplete hint input → ArrowDown/Enter → Search), then re-checks the API. |
| **TC006** | Edit employee first name | `resolveEmpNumber()` → open `/pim/viewPersonalDetails/empNumber/<n>` → `clearAndFill(input[name=firstName])` → Save → `assertEmployeeFirstName()` re-opens the form and asserts `toHaveValue(EditedFirst<ts>)`. Has a UI-search fallback path if `empNumber` can't be resolved. |
| **TC007** | Delete employee | Self-contained: creates its **own** throwaway employee (`TempDel Emp<ts>` / `D<8-digit>`), deletes it via the list trash icon + confirm dialog, falls back to `deleteEmployeeViaApi()` (`DELETE /api/v2/pim/employees` with `{ids:[n]}`), then asserts the API no longer returns it. |

Data source: `testdata/employees.json`. Uniqueness strategy: `getTimestamp()` (epoch ms) suffix,
last name truncated to 30 chars.

---

### 2.3 Leave — `tests/leave.spec.js` → `LeavePage` → `chromium`

`beforeAll` opens a throwaway context with `auth.json` and calls `discoverEmployee(page)` —
picks the **first** "human-looking" employee from `/api/v2/pim/employees` (name is alphabetic,
≥3 chars, no digits). Not serial, but all four tests share that employee.

| TC | Title | Detail |
|---|---|---|
| **TC008** | Assign leave with valid working dates | First *tries* `addEntitlement()` in a `try/catch` (swallowed — the employee may already have one), then `assignLeave()` with `getFutureWorkingDate(offset+30)` / `(offset+31)` so weekends are skipped. Asserts via `assertAssignedToast()` which is deliberately loose: any toast matching `Success\|Assigned\|Saved\|Updated`, else a body-text regex fallback. **severity: critical** |
| **TC009** | Assign leave on non-working day | Computes the next Sunday (≥7 days out), assigns, then inspects body text for `no working days\|failed\|invalid\|error\|overlap\|exceed\|cannot` or any inline error. ⚠️ **The final assertion is a tautology — see §6.1.** |
| **TC010** | Add leave entitlement | `addEntitlement()` (60 days `CAN - Vacation`). On throw, degrades to merely navigating to `/leave/viewLeaveEntitlements` and asserting the *Entitlements* heading is visible. No hard assertion that the entitlement saved. |
| **TC011** | Filter leave list by Scheduled | `filterLeaveListByStatus('Scheduled', employee)` — navigate → open filter → reset → `pickAutocomplete('Employee Name')` → toggle the multi-select status chips (walks `Scheduled / Pending Approval / Rejected / Cancelled / Taken`, adding or removing each to match the desired set) → Search. Then either asserts `No Records Found` or that **every** row contains `Scheduled`. |

Data source: `testdata/leave.json`. Note `testdata/leaveData.json` also exists and is **unused**
(dead data file — the only consumer name is `loadTestData('leave')`).

`LeavePage.assertNoWorkingDayError()` is a fully-written, **never-called** method.

---

### 2.4 Admin / User Management — `tests/admin.spec.js` → `AdminPage` → `chromium`

**`test.describe.serial`** — TC013 and TC014 operate on `sharedData.createdUsername` from TC012.

`beforeAll` calls `discoverEmployee(page, { withoutSystemUser: true, pickLast: true })` — it
cross-references `/api/v2/admin/users` and filters out any employee already linked to a system
user, then picks the **last** of the remaining pool (OrangeHRM rejects one user per employee).

| TC | Title | Detail |
|---|---|---|
| **TC012** | Add system user with ESS role | Username = `tc_ess_user_AUTO_<ts>`. Fills Role → Status → Employee Name (autocomplete) → Username → Password → Confirm Password, Save, waits for `Successfully Saved`. Verify = `assertUserInList()` → `searchUser()` which is an `expect.poll` re-running the whole filter+search up to **35 s**. **severity: critical** |
| **TC013** | Edit user role to Admin | `editUserRole()` — search → pencil icon → `pickSelect('User Role','Admin')` → Save → re-search and assert the row contains `Admin`. The spec then asserts the row text matches `/Admin/i` a second time. |
| **TC014** | Delete system user | Row trash icon, or checkbox + header trash as fallback → confirm dialog → `Successfully Deleted` toast. `assertUserNotInList()` polls (20 s) for `No Records Found` / zero cards / row text not containing the username. |

Data source: `testdata/users.json` → `newUser`, `editTarget`.

---

### 2.5 Recruitment — `tests/recruitment.spec.js` → `RecruitmentPage` → `chromium`

**`test.describe.serial`** — TC016 needs TC015's vacancy, TC017 needs TC016's candidate id.

| TC | Title | Detail |
|---|---|---|
| **TC015** | Create vacancy | Title = `AutoTC Vacancy<ts>`, hiring manager = discovered employee, positions = 1, job title = the second `.oxd-select-option`. Save accepts either a `Successfully Saved` toast **or** a URL change to `addJobVacancy/<id>` / `viewJobVacancy`. Verified by `assertVacancyInList()`. |
| **TC016** | Add candidate to vacancy | Because `vacancy` is passed, `addCandidate()` short-circuits to **`addCandidateViaApi()`** — resolves the vacancy id from `/api/v2/recruitment/vacancies`, then `POST /api/v2/recruitment/candidates`. Returns the new candidate id. The whole UI candidate-form path in `RecruitmentPage` is therefore **dead code in this suite**. |
| **TC017** | Shortlist candidate | `PUT /api/v2/recruitment/candidates/<id>/shortlist`, then `assertCandidateStatus()` re-fetches the candidate and asserts `status.label` matches `/Shortlisted/i`. |

Data source: `testdata/recruitment.json`. Candidate last name = `TC016<last-4-of-ts>`,
email = `auto.recruit.tc.<ts>@example.com`.

---

### 2.6 My Info — `tests/myinfo.spec.js` → `MyInfoPage` → `chromium`

Not serial. `beforeEach` goes straight to `/pim/viewMyDetails`. All three act on the **Admin's own**
employee record, so they are independent of `discoverEmployee`.

| TC | Title | Detail |
|---|---|---|
| **TC018** | Update nickname | `AutoNick<ts>`. If the Nickname group isn't present, degrades to writing into `input[name="middleName"]` instead. Verification is only `assertSuccessToast()` inside the page object — the spec itself asserts nothing. |
| **TC019** | Add emergency contact | `AutoContact<ts>` / `Friend` / `03001234567` → Add → fill → Save → success toast. Spec then asserts `getByText(contactName)` is visible — the only My Info test with a real spec-level assertion. |
| **TC020** | Update contact details | `Auto Street <ts>` + city `Karachi` → Save → success toast. No spec-level assertion; no reload-and-verify. |

Data source: `testdata/myinfo.json`.

---

### 2.7 Directory — `tests/directory.spec.js` → `DirectoryPage` → `chromium`

Not serial. `beforeAll` runs `discoverEmployee()` **only if** `directory.useDiscoveredEmployee` is
true in `testdata/directory.json` (it currently is).

| TC | Title | Detail |
|---|---|---|
| **TC021** | Search by name shows matching card | `searchByName(employee.firstName)` → `assertCardVisible()` polls up to 20 s across `.orangehrm-directory-card, .oxd-grid-item` looking for the name, then asserts `getResultCount() >= 1`. |
| **TC022** | Filter by job title | Opens the Job Title select, ArrowDown + Enter (whatever the first option is), Search. Passes on **either** branch: 0 results → assert `No Records Found`; >0 results → `expect(count).toBeGreaterThanOrEqual(0)` (always true). **severity: minor** |

`directory.noResultsTerm` (`ZZZ_NO_MATCH_XYZ999`) is defined but **unused** — the negative
directory case from the spreadsheet was never implemented.

---

### 2.8 Time & Attendance — `tests/time.spec.js` → `TimePage` → `time-serial`

**`test.describe.serial`** + `test.setTimeout(120_000)`. Isolated into its own project because
punch in must precede punch out and attendance state is global to the shared demo account.

| TC | Title | Detail |
|---|---|---|
| **TC023** | Submit current period timesheet | Navigate to `/time/viewMyTimesheet`, find a row matching `Not Submitted\|Initial`, open it, click Edit then Submit, confirm dialog, expect a `Success\|Submitted` toast. If there are **zero** rows, it degrades to asserting the URL contains `/time/`. |
| **TC024** | Punch in | The most defensive code in the repo. `ensurePunchedOut()` → if state is `PUNCHED IN`, punch out via `PUT /api/v2/attendance/records` (retries offsets +1…+15 min). Then open `/attendance/punchIn`, `clearPunchInOverlap()` computes a slot **after** the latest existing punch-out and ≥ now+1 min, retries +5 min up to 6× while `Overlapping Records Found` is showing, clicks **In**, and re-checks state via the API. **severity: critical** |
| **TC025** | Punch out | Throws immediately if not punched in. Clicks **Out**, or falls back to `punchOutViaApi()`. Then `assertPunchRecordExists()` asserts at least one row on `/attendance/viewMyAttendanceRecord`. **severity: critical** |

Data source: `testdata/timeData.json` (`attendance` notes attached to Allure).
`testdata/time.json` exists but is **unused** (dead data file — only contains notes).

Date handling quirk: the demo's date inputs are **`yyyy-dd-mm`** (year-day-month), *not*
`YYYY-MM-DD`. `formatDateForInput()` emits that order deliberately. Do not "fix" it.

---

## 3. Historical pass rates & flakiness

Aggregated from every `*-result.json` in `allure-results/` (each row = all recorded attempts,
retries included; the latest single report was a clean 26/26 in 405 s).
Flakiness % = failures ÷ executed attempts (skips excluded).

| TC | Module | Attempts | Pass | Fail | Broken | Skip | Pass rate | Avg | Max |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| TC001 | Login | 15 | 15 | 0 | 0 | 1 | 100 % | 12 s | 27 s |
| TC002 | Login | 15 | 14 | 1 | 0 | 1 | 93 % | 14 s | 40 s |
| TC003 | Login | 15 | 15 | 0 | 0 | 1 | 100 % | 7 s | 15 s |
| TC004 (logout) | Login | 15 | 14 | 1 | 0 | 1 | 93 % | 15 s | 50 s |
| TC004 (add emp) | PIM | 18 | 18 | 0 | 0 | 2 | 100 % | 14 s | 40 s |
| TC005 | PIM | 18 | 18 | 0 | 0 | 2 | 100 % | 7 s | 15 s |
| **TC006** | **PIM** | **19** | **13** | **6** | 0 | 2 | **68 %** 🔴 | 14 s | 31 s |
| TC007 | PIM | 13 | 13 | 0 | 0 | 7 | 100 % | 8 s | 21 s |
| TC008 | Leave | 16 | 15 | 0 | 1 | 2 | 94 % | 34 s | 61 s |
| TC009 | Leave | 16 | 16 | 0 | 0 | 2 | 100 %* | 11 s | 31 s |
| TC010 | Leave | 16 | 16 | 0 | 0 | 2 | 100 %* | 26 s | 52 s |
| **TC011** | **Leave** | **22** | **14** | **5** | **3** | 2 | **64 %** 🔴 | 23 s | **91 s** |
| TC012 | Admin | 17 | 14 | 2 | 1 | 2 | 82 % 🟠 | 19 s | 41 s |
| TC013 | Admin | 12 | 11 | 1 | 0 | 5 | 92 % | 16 s | 50 s |
| TC014 | Admin | 11 | 11 | 0 | 0 | 5 | 100 % | 9 s | 20 s |
| TC015 | Recruitment | 13 | 13 | 0 | 0 | 2 | 100 % | 15 s | 34 s |
| TC016 | Recruitment | 13 | 13 | 0 | 0 | 2 | 100 % | 8 s | 15 s |
| TC017 | Recruitment | 13 | 13 | 0 | 0 | 2 | 100 % | 8 s | 15 s |
| TC018 | My Info | 13 | 13 | 0 | 0 | 2 | 100 % | 15 s | 49 s |
| TC019 | My Info | 13 | 13 | 0 | 0 | 2 | 100 % | 14 s | 31 s |
| TC020 | My Info | 13 | 13 | 0 | 0 | 2 | 100 % | 13 s | 47 s |
| TC021 | Directory | 14 | 13 | 1 | 0 | 2 | 93 % | 13 s | 31 s |
| TC022 | Directory | 13 | 13 | 0 | 0 | 2 | 100 %* | 8 s | 15 s |
| TC023 | Time | 18 | 17 | 1 | 0 | 1 | 94 % | 9 s | 53 s |
| **TC024** | **Time** | **16** | **10** | **5** | **1** | 2 | **63 %** 🔴 | 28 s | 64 s |
| TC025 | Time | 10 | 10 | 0 | 0 | **8** | 100 %† | 9 s | 27 s |

\* = 100 % partly because the assertion is weak/unfalsifiable (see §6).
† = TC025's 8 skips are cascade skips from TC024 failing in the same serial block.

**Retry trend recorded in the last report: `{"run": 26, "retry": 314}`** — i.e. the suite has
historically needed a very large number of re-attempts to reach green.

---

## 4. Flaky tests — root causes and existing mitigations

### 🔴 TC006 — Edit employee first name (68 %)

Recorded failures:
```
Error: HTTP 404 for .../pim/pimPersonalDetails/empNumber/393
Error: HTTP 404 for .../pim/pimPersonalDetails/empNumber/401
TimeoutError: locator.click: Timeout 15000ms exceeded.
TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
TypeError: Cannot read properties of undefined (reading 'fullName')
Error: locator.waitFor: Test ended.
```

Causes:
1. **Eventual consistency.** The employee created in TC004 is not immediately readable by
   `empNumber` — the demo returns 404 for a few seconds. Note the URL in the old failures
   (`pimPersonalDetails`) differs from the current code (`viewPersonalDetails`), so that
   specific 404 was partly a wrong-route bug that has since been corrected.
2. **Serial data dependency.** `Cannot read properties of undefined (reading 'fullName')` =
   TC004 didn't populate `sharedData.createdEmployee`. Any TC004 failure poisons TC006.
3. **Shared demo churn.** Other users of the public demo delete records mid-run.

Mitigations already in the code: `resolveEmpNumber()` uses `expect.poll` with
`intervals: [1000, 2000, 3000]` over 30 s; `BasePage.navigate()` retries 4× with backoff and
re-logs in if it lands on `auth/login`; a UI-search fallback exists if the API can't resolve.

### 🔴 TC011 — Filter leave list by Scheduled (64 %, slowest at 91 s)

Recorded failures:
```
Test timeout of 60000ms exceeded.
Test timeout of 90000ms exceeded.
TimeoutError: locator.innerText: Timeout 15000ms exceeded.
Error: expect(locator).toContainText(expected) failed
```

Causes:
1. **`setLeaveListStatuses()` is expensive.** It loops over 5 known statuses, and for each one
   that is in the wrong state it re-opens the multi-select, waits for the dropdown, clicks,
   presses Escape and waits for the form loader. Worst case = 5 full dropdown round-trips on a
   slow shared demo, which is what blows the 90 s test budget.
2. **The Vue multi-select is racy.** Chips render asynchronously, so `selectedChips()` can read
   a stale state and toggle an option that was already correct — flipping it off.
3. **Data dependency on TC008.** TC011 expects `Scheduled` rows for the discovered employee, but
   the leave file is **not** `describe.serial`. On a retry Playwright re-runs only TC011, so if
   TC008's assignment never landed the row set is empty — sometimes `No Records Found`,
   sometimes rows in another status → `toContainText` fails.
4. `locator.innerText` timing out = the toast/table was still re-rendering.

### 🔴 TC024 — Punch in (63 %)

Recorded failures:
```
Test timeout of 60000ms exceeded.
Error: expect(received).toBe(expected) // Object.is equality
```

Causes:
1. **Global shared attendance state.** Everyone hitting the public demo punches the same Admin
   account in and out. `Overlapping Records Found` is the dominant failure mode.
2. **Timezone arithmetic.** The config pins `Asia/Karachi` (+05:00) while the server default
   may differ; `getAttendanceTimezone()` searches for offset 5, then Karachi/Kolkata, then
   falls back to `list[0]`. A mismatch pushes the computed slot into an occupied window.
3. **End-of-day clamp.** `computeNonOverlappingPunchSlot()` clamps to `23:55`. Run it late at
   night with existing records and there is no free slot left — the 6 retries all collide.
4. `expect(...).toBe(true)` failing = `waitForPunchControls()` never saw either **In** or **Out**.

Mitigations already in the code: `ensurePunchedOut()` API punch-out with 15 minute-offsets,
`clearPunchInOverlap()` with 6 × +5 min retries, a post-click overlap re-check, and
`assertPunchedIn()` polling the API for 30 s. TC025's 8 skips are all cascades from this.

### 🟠 TC012 — Add system user (82 %)

```
"beforeAll" hook timeout of 60000ms exceeded.
Error: Timeout 25000ms exceeded while waiting on the predicate
Error: expect(received).toBe(expected)
```

- The `beforeAll` runs a **double** API sweep (`/pim/employees` + `/admin/users`) in a
  freshly-launched browser context — slow, and it is the single most timeout-prone hook.
- `searchUser()`'s 35 s poll re-runs the entire navigate+reset+filter+search cycle each
  iteration, so one poll tick can take longer than the remaining budget.
- OrangeHRM refuses a second system user for the same employee; if the demo has accumulated
  users, the `withoutSystemUser` pool can come back empty or stale.
- ⚠️ **The `{ timeout: 120_000 }` passed to `beforeAll` is silently ignored — see §6.2.**

### 🟡 Lower-frequency flakes

| TC | Failure | Cause |
|---|---|---|
| TC002 (93 %) | `expect(page).toHaveURL(expected) failed` | Demo occasionally redirects to `/auth/validate` or a `?error=` variant before settling back on `auth/login`. |
| TC004 logout (93 %) | `expect(locator).toBeVisible() failed` | The user dropdown / menu item animates in; the 5 s wait on the `Logout` menuitem is tight on a slow demo. |
| TC013 (92 %) | `expect(locator).toContainText(expected)` | The user list is re-fetched before the role update has propagated. |
| TC021 (93 %) | `expect(locator).toBeVisible() failed` | Directory cards re-render after the search response; also depends on whichever employee `discoverEmployee()` picked that run. |
| TC023 (94 %) | `page.goto: net::ERR_NAME_NOT_RESOLVED` | Pure network/DNS blip — environmental, not a test defect. |
| TC008 (94 %) | `Test timeout of 60000ms exceeded` | Entitlement + assign + toast in one test on a slow demo; note avg 34 s / max 61 s, the 2nd-slowest test. |

### The cross-cutting flakiness drivers

1. **The AUT is a public shared sandbox.** Data is mutated by strangers and reset periodically.
   Every "record still exists" assertion is inherently racy.
2. **Serial data chains.** `employee`, `admin`, `recruitment` and `time` are `describe.serial`;
   `leave` and `directory` are *not* but still share `beforeAll` state. Retries re-run a single
   test without its producer, which is why retries don't always rescue these.
3. **OrangeHRM's Vue UI.** Autocompletes fire debounced XHRs, selects render into detached
   dropdown portals, and inputs ignore `fill()` unless cleared with Ctrl+A + Delete first —
   hence `pickAutocomplete`, `pickSelect`, `clearAndFill`.
4. **`workers: 1` everywhere**, so the whole suite is serialised — a slow demo turns into a
   suite-wide timeout risk rather than isolated failures.

---

## 5. The resilience toolkit (why the helpers look the way they do)

| Helper | File | What problem it solves |
|---|---|---|
| `BasePage.navigate()` | `pages/BasePage.js` | 4 retries + backoff, throws on HTTP ≥400, **auto re-login** if redirected to `auth/login`, then waits out spinners. |
| `waitForSpinner()` / `waitForFormReady()` | BasePage / helpers | Waits for every `.oxd-loading-spinner`, `.oxd-form-loader`, `.oxd-overlay` to hide *or* detach. |
| `resilientClick(strategies)` | BasePage | Tries an ordered list of locator strategies, first visible one wins. |
| `resilientFill(label, value)` | BasePage | getByLabel → `groupByLabel` → placeholder → `[name=…]`. |
| `clearAndFill()` | helpers | Scroll → visible → enabled → click → Ctrl+A → Delete → fill, with a `force: true` fallback. Required for Vue inputs. |
| `pickAutocomplete()` | helpers | Types the full string, then each word, `pressSequentially` at 80 ms, waits for a non-"Searching" `[role=option]`, clicks it, Escape, then **verifies the input actually holds a value with no error**. Throws with the last attempt's diagnostics. |
| `pickSelect()` | helpers | Option by text → span fallback → `nth(1)` last resort; asserts the trigger no longer says `-- Select --`. |
| `discoverEmployee()` | helpers | 4 attempts, re-logs in if needed, filters to human-looking names, optionally excludes employees that already have system users. Avoids hardcoding `Paul Collings`. |
| `getFutureWorkingDate()` | helpers | Skips Sat/Sun so leave assignment never hits *No Working Days Selected*. |
| `formatDateForInput()` | helpers | Emits **`yyyy-dd-mm`** — the demo's actual input order. |
| `expect.poll` | throughout | Used instead of `waitForTimeout` for eventual-consistency reads (empNumber, user list, punch state, directory cards). |
| `waitForToast()` | helpers | Waits for `.oxd-toast`, optionally asserts the error/warn class. |

`utils/screenshotUtil.js` attaches a full-page screenshot on **pass and fail** (named
`Screenshot (passed)` / `Screenshot (failed)`), which is why the Allure results directory holds
hundreds of PNGs.

---

## 6. Known defects and inconsistencies in the suite itself

### 6.1 TC009's assertion can never fail 🔴

`tests/leave.spec.js:93`:
```js
expect(hasError || !assigned || assigned).toBeTruthy();
```
`!assigned || assigned` is always `true`, so the whole expression is a tautology. TC009's
100 % pass rate is meaningless — it does not verify that a Sunday assignment is rejected.
The correct assertion already exists but is never called: `LeavePage.assertNoWorkingDayError()`.

### 6.2 `beforeAll` option objects are silently ignored 🟠

`tests/admin.spec.js:23` and `tests/leave.spec.js:26`:
```js
test.beforeAll(async ({ browser }) => { … }, { timeout: 120_000 });
```
Playwright 1.60's signatures are `beforeAll(fn)` and `beforeAll(title, fn)` only — there is no
options parameter. The hook therefore still runs under the default timeout, which is exactly
what the historical `"beforeAll" hook timeout of 60000ms exceeded` failure shows. Use
`test.setTimeout()` inside the hook instead.

### 6.3 Other weak assertions

| Where | Issue |
|---|---|
| TC022 | `expect(count).toBeGreaterThanOrEqual(0)` — always true. |
| TC010 | The `catch` branch only asserts a heading is visible; a failed entitlement save still passes. |
| TC018, TC020, TC023 | No spec-level assertion at all — they rely entirely on a toast check inside the page object. |
| TC008 `assertAssignedToast()` | Falls back to matching `/Success\|Assigned\|Scheduled\|Leave/i` against the **whole page body** — the word "Leave" is on every Leave page. |
| TC023 | If the timesheet list is empty it degrades to `expect(url).toContain('/time/')`. |

### 6.4 Duplicate TC ID

`TC004` is used twice — `login.spec.js` (logout) and `employee.spec.js` (add employee).
`--grep TC004` matches both, and the Allure `testId` label collides.

### 6.5 `globalTeardown` cleanup is over-broad ⚠️

`fixtures/globalTeardown.js`:
```js
if (prefixes.some((p) => full.includes(p) || (emp.employeeId || '').startsWith('TC'))) { … DELETE … }
```
The `|| (emp.employeeId || '').startsWith('TC')` term is inside the `.some()` callback, so it is
true for *every* prefix. Effect: **any employee on the shared public demo whose Employee ID
starts with `TC` is deleted**, whether or not this suite created it. Move that condition out of
the `some()` and AND it with a name-prefix match.

### 6.6 README vs. reality

| README says | Actually |
|---|---|
| `test:ci` = "full suite, 2 retries, 2 workers" | `--project=chromium --project=login-tests --workers=1`; config is `retries: 1`, `workers: 1`. **Excludes `time-serial`, so TC023–TC025 never run in CI.** |
| `npm test` | Also excludes `time-serial` — same gap. |
| "26 tests" | 26 unique; `--list` reports 45 including Firefox. |
| "test data is JSON in `fixtures/`" (Cursor rule) | Test data lives in `testdata/`; `fixtures/` holds hooks. |
| "Use TypeScript" (Cursor rule 2) | The project is JavaScript ESM. This rule file contradicts rule 1 and the codebase. |

### 6.7 Dead code / unused assets

- `testdata/leaveData.json` and `testdata/time.json` — never loaded.
- `directory.noResultsTerm` — defined, never used (negative directory case not implemented).
- `users.json` → `valid`, `deleteTarget` — unused (`getAdminCredentials()` reads `.env` instead).
- `LeavePage.assertNoWorkingDayError()`, `DirectoryPage.searchByDepartment()`,
  `DirectoryPage.resetFilters()`, `EmployeePage.getFirstResultName()`,
  `MyInfoPage.navigateToEmergencyContacts()`, `TimePage.navigateToMyTimesheets()` (partially),
  `RecruitmentPage.addCandidate()` UI branch, `RecruitmentPage.pickVacancyByTitle()` — unused.
- `setInput` imported but unused in `EmployeePage.js`.
- `dataUtil.readTestData()` (XML support via `xml2js`) is never called — `xml2js` is effectively
  an unused dependency.
- `logs/run-summary.txt` still points at an old path
  (`/home/sudais/projects/SOFTWARE-TESTING-PROJECT/orangehrm-testing/logs/run.log`).
- `auth.json` is committed to the working tree but listed in `.gitignore` — it is untracked,
  just present locally.

---

## 7. Spreadsheet vs. implementation (`OrangeHRM_TC_v3.xlsx`)

The workbook defines **34** test cases with a completely **different numbering scheme** from the
26 implemented. Do not cross-reference IDs between the two — e.g. spreadsheet TC017 is
"Add system user with ESS role", but implemented TC017 is "Shortlist candidate".

Spreadsheet coverage: Login 3 · PIM 7 · Leave 6 · Admin 5 · Recruitment 4 · My Info 3 ·
Directory 2 · Time 4 (21 positive / 13 negative).

**Spreadsheet cases with no implementation** (all negative/validation cases — the implemented
suite is heavily positive-path):

| Sheet TC | Case | Status |
|---|---|---|
| TC002 | Invalid login, **data-driven over 3 rows** | Only 1 row implemented (no parameterised loop) |
| TC005 | Add employee with empty required fields | ❌ not implemented |
| TC006 | Duplicate Employee ID rejected | ❌ not implemented |
| TC008 | Employee search with non-existent name | ❌ not implemented |
| TC009 | Edit **job title** (implemented version edits first name instead) | ⚠️ changed |
| TC012 | To-date before from-date rejected | ❌ not implemented |
| TC013 | Leave Type not selected → Required | ❌ not implemented |
| TC014/TC015 | Leave shows Pending Approval / Cancel a leave | ❌ not implemented |
| TC018 | Duplicate username rejected | ❌ not implemented |
| TC019 | Add-user form with all fields empty | ❌ not implemented |
| TC020 | Edit user **status** Enabled→Disabled (implemented version edits *role*) | ⚠️ changed |
| TC023 | Add-vacancy required-field validation | ❌ not implemented |
| TC026 | Edit Nationality / Marital Status (implemented version edits *nickname*) | ⚠️ changed |
| TC030 | Directory search with non-existent name | ❌ not implemented (`noResultsTerm` is dead) |
| TC031/TC032 | Create timesheet + add project time entry | ⚠️ implemented TC023 only *submits* an existing timesheet |

Net: **negative-path coverage is the biggest gap** — 13 negative cases on paper, roughly 3
implemented (TC002, TC003, TC009-as-written-but-tautological).

---

## 8. Fastest ways to re-verify after time away

```bash
npm install && npx playwright install chromium
cp .env.example .env

# 1. Sanity: does the demo even accept our login? (regenerates auth.json)
rm -f auth.json && npx playwright test --project=login-tests

# 2. Stable full run (26 tests, ~7 min)
npx playwright test --project=chromium --project=login-tests --project=time-serial

# 3. Isolate a flaky one with retries + trace
npx playwright test --grep TC011 --project=chromium --retries=2 --trace=on
npx playwright test --grep TC024 --project=time-serial --headed

# 4. Reports
npm run allure:generate && npm run allure:open   # needs Java 8+
npx playwright show-report
```

Reading a failure: open the Allure test → attachments contain `Screenshot (failed)`,
`error-message`, `error-stack`, and `execution-log` (last 50 log4js lines). Traces only exist
`on-first-retry`, so re-run with `--trace=on` if you need one locally.

---

## 9. If you pick this project back up — ranked fix list

1. **Fix TC009's tautological assertion** — swap in `assertNoWorkingDayError()`. It is currently
   a test that cannot fail. (§6.1)
2. **Fix the `globalTeardown` cleanup predicate** — it deletes strangers' records on a shared
   public demo. (§6.5)
3. **Make `leave.spec.js` `describe.serial`** or make TC011 provision its own Scheduled leave,
   so retries can actually rescue it. (§4 TC011)
4. **Replace the ignored `beforeAll` options with `test.setTimeout()`** in `admin.spec.js` and
   `leave.spec.js`. (§6.2)
5. **Speed up `setLeaveListStatuses()`** — read the chips once, compute the diff, then toggle
   only what's needed instead of re-reading inside the loop.
6. **Add `time-serial` to `test:ci`** so TC023–TC025 are covered in the pipeline. (§6.6)
   *(The README's retries/workers claims were corrected when CI moved to Jenkins; the npm
   script itself still excludes `time-serial`.)*
7. **Give TC018 / TC020 / TC023 real assertions** — reload and verify the persisted value.
8. **Rename the duplicate TC004** (login logout → e.g. TC026). (§6.4)
9. **Implement the missing negative cases** from the spreadsheet — that's where the coverage
   story is weakest. (§7)
10. **Decide on Firefox** — either stabilise it or delete the project from the config; right now
    it exists but is documented as "don't run it".
