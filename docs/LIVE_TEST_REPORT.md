# FieldPro Live UI Test Report

**Environment**
- Frontend: https://field-worker-system.vercel.app
- Backend: https://fieldpro-backend-ulp9.onrender.com
- Source cases: `docs/FieldPro_UI_Test_Cases.xlsx` (278 cases; 102 High / 117 Medium / 59 Low)
- Ran: 2026-08-22 (live smoke automation + API probes)

## Executive summary

| Result | Count (this smoke) |
|--------|--------------------|
| PASS | 24 (after correcting TC-002 false fail) |
| FAIL | 1 (`TC-019` forgot-password — **bug found & fix pushed**) |
| Not run yet | Remaining High/Medium/Low (mutating / deep UI flows) |

Production is **usable** for login and core portals (office / worker / super-admin).  
`VITE_API_URL` correctly ends with `/api`.

## Smoke results (automated)

| TC ID | Status | Notes |
|-------|--------|-------|
| TC-001 | PASS | Landing loads branding |
| TC-002 | PASS | `GET /api/plans` → `{ items: [...] }` (3 plans); UI shows plan cards |
| TC-004 | PASS | Navigate to `/login` |
| TC-006 | PASS | Office login API + UI → `/admin` (demo company on live DB: **Mitesoft**) |
| TC-010 | PASS | Invalid password → 401 + UI error |
| TC-011 | PASS | Unknown email → 401 |
| TC-013 | PASS | Super Admin → `/super-admin` |
| TC-014 | PASS | Field worker → `/worker` |
| TC-017 | PASS | Short password register → 400 |
| TC-019 | FAIL→FIXED | Existing email returned **500** (see bug below) |
| TC-041 | PASS | Dashboard API 200 |
| TC-049 | PASS | Jobs list paginated |
| TC-103 | PASS | Customers list paginated |
| TC-203 | PASS | Worker jobs list 200 |
| TC-208 | PASS | Worker random job id → 404 |
| TC-213 | PASS | Worker blocked from `/platform` → 403 |
| Profile API | PASS | `GET /api/profile` 200 |
| Health | PASS | `/health` ok |
| CORS | PASS | Allows Vercel origin |

Artifacts: `docs/LIVE_SMOKE_RESULTS.md`, `docs/LIVE_SMOKE_RESULTS.json`, `docs/live-smoke.mjs`

## Bug found during testing

### BUG-001 — Forgot password 500 for existing users (TC-019)
- **Endpoint:** `POST /api/auth/forgot-password`
- **Symptom:** Existing users → HTTP 500; unknown email → 200 `{ok:true}` (leaks that account exists + breaks TC-019)
- **Cause:** Reset link built from `CORS_ORIGIN` which is now a **comma-separated** list; email send could also throw and bubble as 500
- **Fix:** Use `APP_PUBLIC_URL` (fallback first CORS origin); catch email failures and still return generic `{ok:true}`
- **Status:** Fixed in code; push to `main` so Render redeploys, then re-test TC-019

## Demo data note
Live Aiven DB no longer matches README Mitchell Plumbing emails for office owner in this run — `sarah@mitchell-plumbing.com` logged in as **owner of Mitesoft**. Super Admin / worker demos still work. Prefer UI “Sign in as” buttons or confirm emails with senior.

## Remaining High-priority work (manual / next pass)

Not executed in smoke (writes / email / Stripe / plan gates / multi-step UI):

- Onboarding TC-032–039  
- Jobs create/cap/assign TC-054–076  
- Estimates convert TC-079–091  
- Calendar / Dispatch plan gates TC-094–100  
- Customers merge/delete TC-110–111  
- Workers seats TC-125–126  
- Inventory / Invoices / Chat / Comms / Documents  
- Settings SMTP / Billing / Invites  
- SA impersonation TC-222–223  
- Cross-cutting RBAC / tenancy / NFR security  

**Recommend:** create a dedicated test company under Super Admin and run mutating High cases there only.

## How to re-run smoke

```bash
node docs/live-smoke.mjs
```

Requires Playwright Chromium installed once: `npx playwright install chromium`
