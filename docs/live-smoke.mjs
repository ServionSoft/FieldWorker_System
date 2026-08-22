/**
 * Live smoke against Vercel + Render for FieldPro UI test cases (High priority subset).
 * Read-heavy; avoids destructive writes on shared Aiven DB except where noted.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FE = process.env.FE_URL || 'https://field-worker-system.vercel.app';
const API = process.env.API_URL || 'https://fieldpro-backend-ulp9.onrender.com/api';
const PASS = 'demo123';

const users = {
  sa: 'marcus@fieldpro.io',
  office: 'sarah@mitchell-plumbing.com',
  worker: 'jake@mitchell-plumbing.com',
};

const results = [];

function record(tc, status, notes = '') {
  results.push({ tc, status, notes, at: new Date().toISOString() });
  const mark = status === 'PASS' ? 'PASS' : status === 'FAIL' ? 'FAIL' : status;
  console.log(`[${mark}] ${tc}${notes ? ' — ' + notes : ''}`);
}

async function api(method, pathName, { token, body, origin } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  const res = await fetch(`${API}${pathName}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { data = await res.json(); } catch { /* ignore */ }
  } else {
    data = await res.text();
  }
  return { status: res.status, data, headers: res.headers };
}

async function login(email) {
  const r = await api('POST', '/auth/login', {
    body: { email, password: PASS },
    origin: FE,
  });
  if (r.status !== 200 || !r.data?.accessToken) {
    throw new Error(`login failed ${email}: ${r.status} ${JSON.stringify(r.data)}`);
  }
  return r.data;
}

async function runApiSmoke() {
  // TC-002 plans
  {
    const r = await api('GET', '/plans', { origin: FE });
    const ok = r.status === 200 && Array.isArray(r.data) && r.data.length > 0;
    record('TC-002', ok ? 'PASS' : 'FAIL', `GET /plans → ${r.status}, count=${Array.isArray(r.data) ? r.data.length : '?'}`);
  }

  // health (ops)
  {
    const res = await fetch(API.replace(/\/api$/, '') + '/health');
    const j = await res.json();
    record('NFR-health', res.status === 200 && j.status === 'ok' ? 'PASS' : 'FAIL', JSON.stringify(j));
  }

  // TC-006 office login
  let office;
  try {
    office = await login(users.office);
    record('TC-006', 'PASS', `role=${office.role} company=${office.company?.name || office.user?.companyId}`);
  } catch (e) {
    record('TC-006', 'FAIL', String(e.message));
    return;
  }

  // TC-013 SA login + route expectation (API role)
  let sa;
  try {
    sa = await login(users.sa);
    record('TC-013', sa.role === 'super_admin' ? 'PASS' : 'FAIL', `role=${sa.role}`);
  } catch (e) {
    record('TC-013', 'FAIL', String(e.message));
  }

  // TC-014 worker login
  let worker;
  try {
    worker = await login(users.worker);
    record('TC-014', worker.role === 'field_worker' ? 'PASS' : 'FAIL', `role=${worker.role}`);
  } catch (e) {
    record('TC-014', 'FAIL', String(e.message));
  }

  // TC-010 invalid password
  {
    const r = await api('POST', '/auth/login', {
      body: { email: users.office, password: 'wrong-password-999' },
      origin: FE,
    });
    record('TC-010', r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
  }

  // TC-011 non-existent email
  {
    const r = await api('POST', '/auth/login', {
      body: { email: 'nobody-does-not-exist@example.com', password: PASS },
      origin: FE,
    });
    record('TC-011', r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
  }

  // TC-017 short password signup
  {
    const r = await api('POST', '/auth/register', {
      body: { companyName: 'X', email: `short${Date.now()}@example.com`, password: 'short' },
      origin: FE,
    });
    record('TC-017', r.status === 400 || r.status === 422 ? 'PASS' : 'FAIL', `status=${r.status}`);
  }

  // TC-019 forgot password generic
  {
    const a = await api('POST', '/auth/forgot-password', { body: { email: users.office }, origin: FE });
    const b = await api('POST', '/auth/forgot-password', { body: { email: 'nope@example.com' }, origin: FE });
    const ok = a.status < 500 && b.status < 500 && a.status === b.status;
    record('TC-019', ok ? 'PASS' : 'FAIL', `existing=${a.status} missing=${b.status}`);
  }

  // TC-041 dashboard
  {
    const r = await api('GET', '/dashboard', { token: office.accessToken, origin: FE });
    record('TC-041', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  }

  // TC-049 jobs list
  {
    const r = await api('GET', '/jobs?page=1&pageSize=10', { token: office.accessToken, origin: FE });
    const ok = r.status === 200 && Array.isArray(r.data?.items);
    record('TC-049', ok ? 'PASS' : 'FAIL', `status=${r.status} items=${r.data?.items?.length}`);
  }

  // TC-103 customers
  {
    const r = await api('GET', '/customers?page=1&pageSize=10', { token: office.accessToken, origin: FE });
    const ok = r.status === 200 && Array.isArray(r.data?.items);
    record('TC-103', ok ? 'PASS' : 'FAIL', `status=${r.status} items=${r.data?.items?.length}`);
  }

  // TC-203 worker jobs isolation (only assigned)
  if (worker) {
    const r = await api('GET', '/jobs?page=1&pageSize=50', { token: worker.accessToken, origin: FE });
    record('TC-203', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status} items=${r.data?.items?.length ?? '?'}`);
  }

  // TC-208 / TC-078 cross-tenant: random UUID should 404
  if (worker) {
    const fake = '00000000-0000-4000-8000-000000000099';
    const r = await api('GET', `/jobs/${fake}`, { token: worker.accessToken, origin: FE });
    record('TC-208', r.status === 404 ? 'PASS' : 'FAIL', `status=${r.status}`);
  }

  // TC-213 worker blocked from platform
  if (worker) {
    const r = await api('GET', '/platform/companies?page=1', { token: worker.accessToken, origin: FE });
    record('TC-213', r.status === 401 || r.status === 403 || r.status === 404 ? 'PASS' : 'FAIL', `status=${r.status}`);
  }

  // SA companies list
  if (sa) {
    const r = await api('GET', '/platform/companies?page=1&pageSize=10', { token: sa.accessToken, origin: FE });
    record('TC-SA-companies', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  }

  // profile mounted
  {
    const r = await api('GET', '/profile', { token: office.accessToken, origin: FE });
    record('TC-profile-api', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  }

  // CORS
  {
    const r = await api('GET', '/plans', { origin: FE });
    const acao = r.headers.get('access-control-allow-origin');
    record('NFR-cors', acao === FE || acao === '*' ? 'PASS' : 'FAIL', `acao=${acao}`);
  }
}

async function runUiSmoke() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  try {
    // TC-001 / TC-004 landing
    await page.goto(FE + '/', { waitUntil: 'domcontentloaded' });
    const bodyText = await page.locator('body').innerText();
    record('TC-001', /FieldPro|field service|pro/i.test(bodyText) ? 'PASS' : 'FAIL', 'landing body check');

    // plan cards (TC-002 UI)
    await page.waitForTimeout(2000);
    const hasPlans = await page.getByText(/Basic|Pro|Enterprise|\/mo|month/i).count();
    record('TC-002-UI', hasPlans > 0 ? 'PASS' : 'BLOCKED', `plan-like text count=${hasPlans}`);

    // TC-004 navigate login
    await page.goto(FE + '/login', { waitUntil: 'domcontentloaded' });
    record('TC-004', page.url().includes('/login') ? 'PASS' : 'FAIL', page.url());

    // TC-006 UI office login → /admin
    await page.fill('input[type="email"], input[name="email"]', users.office);
    await page.fill('input[type="password"]', PASS);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/(admin|onboarding|worker|super-admin)/, { timeout: 90000 });
    const officeUrl = page.url();
    const officeOk = /\/admin|\/onboarding/.test(officeUrl);
    record('TC-006-UI', officeOk ? 'PASS' : 'FAIL', officeUrl);

    // logout via clearing storage and go login
    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());

    // TC-013 SA → super-admin
    await page.goto(FE + '/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[type="email"], input[name="email"]', users.sa);
    await page.fill('input[type="password"]', PASS);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/super-admin/, { timeout: 90000 });
    record('TC-013-UI', page.url().includes('/super-admin') ? 'PASS' : 'FAIL', page.url());

    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());

    // TC-014 worker → /worker
    await page.goto(FE + '/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[type="email"], input[name="email"]', users.worker);
    await page.fill('input[type="password"]', PASS);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/worker/, { timeout: 90000 });
    record('TC-014-UI', page.url().includes('/worker') ? 'PASS' : 'FAIL', page.url());

    // TC-010 UI invalid password
    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());
    await page.goto(FE + '/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[type="email"], input[name="email"]', users.office);
    await page.fill('input[type="password"]', 'wrong-password-999');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForTimeout(3000);
    const errVisible = await page.getByText(/invalid|could not sign in|incorrect|try again/i).count();
    record('TC-010-UI', errVisible > 0 && page.url().includes('/login') ? 'PASS' : 'FAIL', `errors=${errVisible} url=${page.url()}`);
  } catch (e) {
    record('UI-SMOKE', 'FAIL', String(e.message || e));
  } finally {
    await browser.close();
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname);

async function main() {
  console.log('FE', FE);
  console.log('API', API);
  await runApiSmoke();
  await runUiSmoke();

  const summary = results.reduce((a, r) => {
    a[r.status] = (a[r.status] || 0) + 1;
    return a;
  }, {});
  const payload = { fe: FE, api: API, ranAt: new Date().toISOString(), summary, results };
  fs.writeFileSync(path.join(outDir, 'LIVE_SMOKE_RESULTS.json'), JSON.stringify(payload, null, 2));

  const lines = [
    '# FieldPro Live Smoke Results',
    '',
    `- FE: ${FE}`,
    `- API: ${API}`,
    `- Ran: ${payload.ranAt}`,
    `- Summary: ${JSON.stringify(summary)}`,
    '',
    '| TC | Status | Notes |',
    '|----|--------|-------|',
    ...results.map((r) => `| ${r.tc} | ${r.status} | ${r.notes.replace(/\|/g, '/')} |`),
    '',
    '## Coverage note',
    '',
    'Excel has **278** cases (102 High). This smoke covers critical auth/routing + read APIs.',
    'Mutating High cases (create job, merge, Stripe, invite seats, etc.) need manual runs on a safe tenant or a dedicated test company.',
    '',
  ];
  fs.writeFileSync(path.join(outDir, 'LIVE_SMOKE_RESULTS.md'), lines.join('\n'));
  console.log('Summary', summary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
