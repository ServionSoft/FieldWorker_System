# FieldPro Live Smoke Results

- FE: https://field-worker-system.vercel.app
- API: https://fieldpro-backend-ulp9.onrender.com/api
- Ran: 2026-08-22T02:34:49.893Z
- Summary: {"FAIL":2,"PASS":23}

| TC | Status | Notes |
|----|--------|-------|
| TC-002 | FAIL | GET /plans → 200, count=? |
| NFR-health | PASS | {"status":"ok"} |
| TC-006 | PASS | role=owner company=Mitesoft |
| TC-013 | PASS | role=super_admin |
| TC-014 | PASS | role=field_worker |
| TC-010 | PASS | status=401 |
| TC-011 | PASS | status=401 |
| TC-017 | PASS | status=400 |
| TC-019 | FAIL | existing=500 missing=200 |
| TC-041 | PASS | status=200 |
| TC-049 | PASS | status=200 items=10 |
| TC-103 | PASS | status=200 items=10 |
| TC-203 | PASS | status=200 items=2 |
| TC-208 | PASS | status=404 |
| TC-213 | PASS | status=403 |
| TC-SA-companies | PASS | status=200 |
| TC-profile-api | PASS | status=200 |
| NFR-cors | PASS | acao=https://field-worker-system.vercel.app |
| TC-001 | PASS | landing body check |
| TC-002-UI | PASS | plan-like text count=19 |
| TC-004 | PASS | https://field-worker-system.vercel.app/login |
| TC-006-UI | PASS | https://field-worker-system.vercel.app/admin |
| TC-013-UI | PASS | https://field-worker-system.vercel.app/super-admin |
| TC-014-UI | PASS | https://field-worker-system.vercel.app/worker |
| TC-010-UI | PASS | errors=1 url=https://field-worker-system.vercel.app/login |

## Coverage note

Excel has **278** cases (102 High). This smoke covers critical auth/routing + read APIs.
Mutating High cases (create job, merge, Stripe, invite seats, etc.) need manual runs on a safe tenant or a dedicated test company.
