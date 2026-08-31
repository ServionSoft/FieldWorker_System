# FieldPro Live UI Test Report

**Environment**
- Frontend: https://field-worker-system.vercel.app
- Backend: https://fieldpro-backend-ulp9.onrender.com
- Source: `docs/FieldPro_UI_Test_Cases.xlsx` (**all 278 rows now have Status / Notes / Executed At / Method**)
- Ran: 2026-08-28 (full suite)

## Results in Excel (columns L–O)

| Status | Count |
|--------|------:|
| **PASS** | 108 |
| **FAIL** | 0 |
| **BLOCKED** | 170 |

Open: `docs/FieldPro_UI_Test_Cases.xlsx` (also copy `FieldPro_UI_Test_Cases_RESULTS.xlsx`)

- **PASS** — exercised live (API and/or Playwright UI)
- **BLOCKED** — not auto-run on shared Aiven DB (mutating create/delete, Stripe, Twilio/SMTP delivery, invite tokens, extra personas). Reason is in column **Actual Result / Notes**

## Notable findings this run
- **TC-019** forgot-password: **PASS** (earlier 500 fix confirmed live)
- Auth routing (office / worker / SA): **PASS**
- Core lists (jobs, customers, estimates, invoices, chat, etc.): **PASS**
- Isolation (cross-tenant job → 404, worker blocked from platform): **PASS**
- All major portal routes load without crash

## Artifacts
- `docs/FieldPro_UI_Test_Cases.xlsx` — filled result columns
- `docs/ALL_TC_RESULTS.json` — machine-readable results
- `docs/run-all-test-cases.mjs` — re-run suite
- `docs/fill-excel-results.py` — write results into xlsx

## Next (to clear BLOCKED)
Create a **dedicated test company** under Super Admin, then re-run mutating High cases (create job/customer/worker, invites, SMTP test, Stripe checkout, impersonation) and update those rows from BLOCKED → PASS/FAIL.
