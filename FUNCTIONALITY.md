# FieldPro — Built Functionality (Detailed)

This is a complete inventory of **what the SaaS actually does today**: screens, workflows, rules, and integrations. It is not a roadmap.

Local access: **http://localhost:8080** (app) · **http://localhost:4100** (API)

---

## 0. How the product is split

Three logged-in experiences, plus public pages:

| Experience | URL | Who |
|---|---|---|
| Marketing / pricing | `/` | Anyone |
| Sign in / sign up / forgot password | `/login` | Anyone |
| Accept team invite | `/invite/:token` | Invited email |
| Office | `/admin/*` | owner, admin, dispatcher, office |
| Field | `/worker/*` | field_worker |
| Platform | `/super-admin/*` | super_admin only |

Every tenant API call is scoped by the **JWT company id**. Wrong-tenant IDs return **404**. Super Admin cannot use office CRM unless they **impersonate**.

Nav items and APIs are filtered by **permissions** (role + overrides) and **plan modules** (calendar, dispatch, inventory, reports). Missing a module shows an upgrade page and the API returns `Upgrade required for this feature`.

---

## 1. Public site and accounts

### 1.1 Landing page (`/`)
- FieldPro branding, feature grid, testimonials, stats.
- Live plan cards loaded from `GET /api/plans` (falls back to Basic / Pro / Enterprise copy if the API is down).
- CTA to log in or sign up.

### 1.2 Login (`/login`)
- Work email + password; show/hide password.
- Remember email (`fp_remember_email`).
- Demo role chips: Super Admin, Office Admin, Field Worker (fills email).
- Error if the API is down: “Could not sign in. Is the API running on port 4100?”
- After success, route by role: `/super-admin`, `/admin`, or `/worker`.
- Dark-mode toggle on layouts after login.

### 1.3 Sign up (same page, Signup tab)
- Company name, email, password (min 8).
- Creates: user, company on **Basic**, **owner** membership, 14-day trial, welcome notification, platform-admin notification “New Company Registered”.
- Issues access + refresh tokens immediately.

### 1.4 Forgot password
- Request reset: email with a one-time token (if SMTP is configured).
- Reset: new password; all refresh tokens for that user are revoked.

### 1.5 Session
- Access JWT **15 minutes**; refresh **14 days** (hashed in DB).
- Frontend auto-refreshes on 401 (except during impersonation).
- Logout revokes the refresh token.
- `GET /api/auth/me` returns user, company, role, **permissions**, **planFeatures**, notification prefs, impersonation flag.

### 1.6 Accept invite (`/invite/:token`)
- Shows company name, email, role if the token is valid (7 days, unused).
- Sets name + password; creates or updates the user; inserts `company_members`.
- If role is `field_worker`, creates a `worker_profiles` row.
- Re-checks **worker seat cap** on accept.
- Welcome notification + “Team member joined” to users with `settings.users`.

---

## 2. Office portal — Dashboard

**Path:** `/admin`

- Active / pending / completed / cancelled job counts.
- Jobs scheduled today.
- Active workers.
- Paid invoice revenue.
- Low-stock inventory count (query still runs; Inventory UI is plan-gated).
- Overdue follow-ups (title, customer, due date) — up to 8.
- Unpaid invoices (draft / sent / overdue) — up to 8.
- Lead customer count.
- Job-status breakdown chart data.

---

## 3. Customers (CRM)

**Path:** `/admin/customers` · `/admin/customers/:id`  
**Permission:** `customers.read` / `customers.write`

### 3.1 Customer record
- Status: **lead**, **active**, **inactive**.
- Type: **residential** / **commercial**.
- Source, notes, tags, payment terms, tax exempt, parent customer (hierarchy).
- Totals: job count, paid invoice spend.

### 3.2 Contacts (many per customer)
- First/last name, email, phone, extension, primary flag.
- Add / edit / delete.

### 3.3 Addresses (many per customer)
- Location name, street, unit, city, state, zip, gated property, default flag.
- Add / edit / delete.

### 3.4 Notes
- Timestamped notes with author; add / delete.

### 3.5 Follow-ups
- Title, due date, done flag, optional estimate/job/assignee.
- Company-wide list plus per-customer.
- Dashboard highlights overdue incomplete items.

### 3.6 Activity feed
- Combined timeline on the customer profile (jobs, estimates, invoices, notes, comms as stored).

### 3.7 Import / export / merge
- Export all customers as JSON rows.
- Import a list of rows; returns `created` count and per-row errors.
- Merge two customers: keep one, fold the other (contacts/jobs/etc. re-pointed); duplicate email on create is rejected.

---

## 4. Jobs

**Path:** `/admin/jobs` · `/admin/jobs/:id`  
**Permission:** `jobs.read` / `jobs.write`  
Field workers see **only jobs they are assigned to**.

### 4.1 Create / edit
Fields include: title, description, customer, address (or customer default), priority (`low` / `medium` / `high` / `urgent`), category (`plumbing` / `electrical` / `hvac` / `general`), scheduled date/time, arrival end window, multi-day + end date, estimated duration hours, PO number, job source, notes for techs, completion notes, follow-up required, notify techs, billing type, tax rate, note to customer, materials list, line items (qty, unit price, taxable), assignees.

- If any worker is assigned at create, status starts as **assigned**; otherwise **new**.
- Cannot assign a worker whose employment status is **on_leave**.
- Each assignee gets an in-app + optional email notification (`job.assigned`) linking to `/worker/jobs/:id`.
- **Monthly job cap** from the plan (`max_jobs`; `-1` = unlimited). Count = jobs created this calendar month.

### 4.2 Status workflow
`new` → `assigned` → `in_progress` → `completed` | `cancelled`

- Office can set any of those statuses.
- Field worker may only set **in_progress** or **completed**.
- Completed: sets `completed_at`, increments worker `jobs_completed`, notifies office (`job.completed`).
- Cancelled: notifies office (`job.cancelled`).
- Audited as `job.status`.

### 4.3 Assign later
- Add a worker; if job was `new`, it becomes `assigned`; assignment notification sent.

### 4.4 Notes, line items, photos
- Job notes (office or assigned tech).
- Replace all line items.
- Attach uploaded files as job images (25 MB max upload).

### 4.5 Generate customer invoice from job
- Requires line items.
- Copies lines, computes tax from job tax rate, allocates `INV-YYYY-NNNN`.
- One invoice per job (returns existing if already generated).
- See §7.

### 4.6 Delete
- Office with `jobs.write` can delete a job.

---

## 5. Estimates

**Path:** `/admin/estimates` · `/admin/estimates/:id`  
**Permission:** `estimates.read` / `estimates.write`

### 5.1 Create
- Auto number `EST-YYYY-NNNN`.
- Starts as **draft**.
- Customer, category, description/notes, valid-until, tax rate, PO, referral source, opportunity rating, requested date, arrival window, duration, notes for techs, line items, optional assignees.
- Subtotal / tax / total calculated.

### 5.2 Status
`draft` → `sent` → `approved` | `rejected` → `converted`

- Approving notifies people with `estimates.read`.

### 5.3 Convert to job
- Only **approved** estimates.
- Idempotent: if already converted, returns existing `jobId`.
- **Re-checks monthly job cap**.
- Copies customer, address, lines, assignees; job title `Job from EST-…`; status assigned if there are assignees.
- Estimate marked `converted` with `converted_job_id`.
- Audit `estimate.convert`.

### 5.4 Edit / delete
- Patch fields and line items; delete unused estimates.

---

## 6. Calendar and dispatch (plan-gated)

| Screen | Plan feature | Permission | What it shows |
|---|---|---|---|
| `/admin/calendar` | `calendar` | `dispatch.access` | Jobs (date, time, duration, category, customer, worker ids) and non-converted estimates in a date range |
| `/admin/dispatch` | `dispatch` | `dispatch.access` | Active workers vs jobs in range (who is on which job) |

Locked plans: nav hidden; direct URL shows **Upgrade to unlock…** with link to Billing.

---

## 7. Customer invoices

**Path:** `/admin/invoices`  
**Permission:** `invoices.read` / `invoices.write`

- List/detail: number, customer, job, subtotal, tax, total, due date, status, line items.
- Status: **draft**, **sent**, **paid**, **overdue**.
- Paid sets `paid_at`; notifies `invoices.read` (optional email pref “invoices”).
- Sent / overdue also notify.
- Numbers from a per-company yearly counter (same mechanism as estimates).

These are **customer** invoices (work billed to the homeowner), not Stripe SaaS invoices.

---

## 8. Workers

**Path:** `/admin/workers`  
**Permission:** `workers.manage` (office); field workers can read **their own** profile.

### 8.1 Create worker
- Name, email, phone, specialties, employment status (`active` / `inactive` / `on_leave`), optional password (default `demo123` if omitted).
- Creates user (or reuses existing email not already in the company), member role `field_worker`, worker profile.
- Default Mon–Fri 08:00–17:00 availability.
- **Seat cap** (`max_workers`; `-1` unlimited) counts **active field_worker members**.
- Welcome notification; audit `worker.create`.

### 8.2 Edit / deactivate
- Name, phone, specialties, status.
- Soft-style deactivate via status / member inactive.

### 8.3 Availability and time off
- Replace weekly availability (weekday + start/end).
- Add / remove time-off dates.

---

## 9. Inventory (plan-gated: `inventory`)

**Path:** `/admin/inventory`  
**Permission:** `inventory.read` / `inventory.write`

- Item: name, **SKU** (unique per company), category, quantity, min stock, unit price.
- Create with quantity logs a **receive** movement.
- Quantity changes log movements (delta + actor).
- If quantity drops **below min stock**, office admins get a low-stock notification.
- Delete item.

---

## 10. Communications

**Path:** `/admin/communications`  
**Permission:** `communications.access`

### 10.1 Log
- Types: call, SMS, voicemail, MMS, email.
- Direction, status, from/to, body, duration, customer/job/estimate links, read flag.
- Filter, mark one or all read.
- Manual create of a log row.

### 10.2 Twilio (optional)
- Company “from” number in Settings.
- **Send SMS** and **place call** when `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` are set.
- **Send email template** to a customer (uses email templates + SMTP).
- Inbound webhooks:
  - SMS: match company by To-number, match customer by From, store inbound SMS (dedupe by Twilio SID).
  - Voice: inbound call log; TwiML response.
- Signature check (can skip in local `.env`).

Without Twilio, the comms **log still works**; send/call fail until keys exist.

---

## 11. Team chat

**Path:** `/admin/chat` · `/worker/chat`  
**Permission:** `chat.access`  
**Realtime:** Socket.io

- List threads the user is in.
- Open or create a **direct thread** with another user.
- Field worker can open a **worker ↔ office** thread (all office roles pulled in).
- Send messages; mark thread read.
- Live delivery over the socket; REST history for load.

---

## 12. Documents and files

**Path:** `/admin/documents`

- Upload file (multipart, 25 MB) stored under `backend/uploads/{company_id}/`.
- Attach as a company document, optional job link.
- Signed download URL (token) or authenticated download.
- Delete (office).
- Job photo attach uses the same file store.

---

## 13. Service agreements

**Path:** `/admin/agreements`  
**Permission:** `agreements.access`

- Title, customer, optional job, start/end dates, terms.
- Status: **draft**, **active**, **expired**.
- Create / list / get / patch.

---

## 14. Email templates

**Path:** `/admin/templates`  
**Permission:** `templates.manage`

- Name, subject, body.
- Type: **invoice**, **appointment**, **follow_up**, **welcome**.
- CRUD; used by Communications “send template”.

---

## 15. Reports (plan-gated: `reports`)

**Path:** `/admin/reports`  
**Permission:** `reports.view`

- Total jobs, completed count, paid revenue, average worker rating.
- Job status distribution.
- Worker efficiency: first name, jobs completed, rating scaled for charts.

---

## 16. Notifications (all logged-in users)

- Bell in office / worker / Super Admin headers.
- Unread count; click opens list or `/admin/notifications` (or Super Admin equivalent).
- Mark one / mark all read.
- Socket event to `user:{id}` plus 30-second poll.

**Events produced (examples)**  
Job assigned / completed / cancelled · estimate approved · invoice sent / paid / overdue · member invited / joined / welcome · worker welcome · low stock · company welcome · subscription started / invoice paid / payment failed · platform: new company, tenant payment failed.

Deep link `link_path` on each row (e.g. job, billing tab). Optional email if SMTP is set and the member’s prefs allow (assignments / invoices / billing).

---

## 17. Tenant settings

**Path:** `/admin/settings` (tabs)

### 17.1 Company (`settings.company`)
- Name, email, phone, address, Twilio from-number, timezone / tax / website / invoice footer / logo (via company settings).

### 17.2 Users (`settings.users`)
- Member list with role and status.
- Invite: email, name, role (`owner` | `admin` | `dispatcher` | `office` | `field_worker`).
  - Only an owner can invite another owner.
  - **field_worker invites count pending invites against the worker seat cap.**
- Edit role, active/inactive, per-permission allow/deny vs role defaults.
- Cannot demote/deactivate/remove the **last owner**.
- Cannot remove yourself.
- Promoting someone to active field_worker **re-checks the seat cap** and ensures a worker profile exists.
- Pending invitation list.

### 17.3 SMTP (`settings.smtp`)
- Host, port, user, password (encrypted at rest), TLS, from name/email.
- Send test email.
- Used for invites, password reset, assignment emails, template sends. Falls back to platform SMTP if tenant SMTP is empty.

### 17.4 Billing (`billing.manage`)
- Current plan name, company status (`trial` / `active` / `past_due` / `suspended`), trial end, enabled **feature keys**.
- Upgrade buttons per plan using **DB monthly/yearly cents** (no Stripe Price ID).
- Stripe Checkout subscription with inline `price_data`; metadata `companyId` + `planId`.
- Trialing companies get 14 trial days on Checkout when status is `trial`.
- Customer Portal for cards and Stripe receipts (needs an existing Stripe customer).
- List of **SaaS** invoices synced from Stripe (number, amount, status, hosted URL).

### 17.5 Notification prefs
- Toggles: job assignments, customer invoices, subscription billing. Saved on the member.

---

## 18. Field worker portal

**Path:** `/worker`

| Screen | Function |
|---|---|
| Dashboard | Assigned work snapshot |
| Jobs | List of jobs assigned to this user |
| Job detail | View; set **in_progress** / **completed**; add notes |
| Schedule | Personal scheduled jobs |
| Chat | Worker–office (and direct) threads |

Workers cannot open office CRM, billing, other companies, or jobs they are not assigned to (404).

---

## 19. Super Admin (platform)

**Path:** `/super-admin`  
Role: `super_admin` only.

### 19.1 Dashboard
- Company counts by status, plan mix, platform KPIs (from `/platform/dashboard`).

### 19.2 Companies
- List: name, email, plan, status, employee count.
- Create: name, email, phone, address, plan → **must invite first owner** (does not auto-login Super Admin as tenant).
- Edit: profile, plan, status (`active` / `trial` / `suspended`).
- Soft delete (`deleted_at`).
- Detail: members, billing ids, invite owner again.
- **Impersonate:** issues a tenant access token; banner to stop and restore the Super Admin session.

### 19.3 Subscription plans
- Create/edit: name, monthly $, yearly $, max workers (`-1` unlimited), max jobs/month (`-1` unlimited), marketing bullets, **enabled modules** checkboxes:
  - reports, calendar, dispatch, inventory, api, white_label, multi_location
- Checkout uses monthly/yearly **dollar fields**, not Stripe Price IDs.
- Subscriber count per plan.

**Modules that actually lock product:** reports, calendar, dispatch, inventory.  
**Stored only (no product yet):** api, white_label, multi_location.

### 19.4 Platform reports
- Rollups across tenants (jobs/revenue-style aggregates).

### 19.5 Audit log
- Actor, company, action, entity type/id, metadata, time (e.g. `company.register`, `member.invite`, `job.status`, `invoice.paid`, `estimate.convert`, `worker.create`).

### 19.6 Platform settings
- Platform SMTP (encrypted password), trial days, support email, SMTP test.

### 19.7 Platform billing invoices
- Stripe-synced subscription invoices across companies.

---

## 20. SaaS billing engine (Stripe)

**Requires** `STRIPE_SECRET_KEY`. Webhook sync requires `STRIPE_WEBHOOK_SECRET`.

| Action | Behavior |
|---|---|
| Checkout | Creates/reuses Stripe Customer; subscription line from DB cents; success/cancel URLs on Settings → Billing |
| Portal | Stripe Customer Portal |
| `checkout.session.completed` | Company `active`, store subscription/customer ids, apply `planId`, notify billing managers |
| `customer.subscription.updated/deleted` | Map Stripe status → `active` / `trial` / `past_due` / `suspended`; keep plan_id from metadata |
| `invoice.paid` | Upsert `billing_invoices`; notify; unsuspend-from-past-due path |
| `invoice.payment_failed` | Company `past_due`; notify tenant + platform admins |
| Events table | Idempotent `stripe_event_id` |

Changing a plan’s price in Super Admin affects **new** checkouts. Existing Stripe subscriptions keep the amount they subscribed at until they check out again.

---

## 21. Plan limits (enforced)

| Limit | How it is counted | Where it is checked |
|---|---|---|
| Max field workers | Active `field_worker` members | Create worker; invite field_worker (plus **pending** invites); promote/reactivate field_worker; accept worker invite |
| Max jobs / month | Jobs with `created_at` in current calendar month | Create job; convert estimate → job |
| Feature flags | `subscription_plans.feature_keys` | Inventory router; calendar / dispatch / reports endpoints; office nav + `PlanRoute` |

---

## 22. Permissions catalog

Default grants by role; owner can override per member.

| Permission | Meaning |
|---|---|
| customers.read / write | CRM |
| jobs.read / write | Jobs (field_worker has read on assigned jobs) |
| estimates.read / write | Quotes |
| invoices.read / write | Customer invoices |
| inventory.read / write | Stock |
| workers.manage | Worker HR |
| dispatch.access | Calendar + dispatch |
| communications.access | Calls/SMS log and send |
| documents.access | Files |
| agreements.access | Service agreements |
| templates.manage | Email templates |
| reports.view | Tenant reports |
| settings.company | Company profile |
| settings.users | Invites and permission matrix |
| settings.smtp | Tenant mail |
| billing.manage | Subscription (owner only by default) |
| chat.access | Team chat |

Owner has all. Admin has all except billing + SMTP. Dispatcher / office / field_worker use the narrower defaults in `permissions.ts`.

---

## 23. Cross-cutting platform behavior

- **Dark mode** on all three shells.
- **Logo** / FieldPro branding on login and layouts.
- **Helmet**, CORS to `http://localhost:8080`, auth rate limit (100 / 15 min).
- **PostgreSQL RLS FORCE** + `fieldpro_app` role; `app.current_company_id` set per request.
- **Argon2** passwords; SHA-256 invite/reset/refresh hashes.
- **AES-GCM** for SMTP passwords (`SETTINGS_ENCRYPTION_KEY`).
- Isolation test script: `npm run test:isolation`.
- Seeded demo world: Mitchell Plumbing (Pro), SparkVolt (Enterprise), CoolBreeze (Basic), ProPipe (trial), ArcLight (suspended). Password `demo123`.

---

## 24. What is *not* built (so this list stays honest)

- Tenant public API, white-label UI, multi-location branches (flags only).
- Offline / native mobile apps.
- Customer self-service portal.
- QuickBooks / Xero.
- Live GPS / routing.
- Stripe Dashboard Price objects (intentionally unused).

---

## 25. Demo accounts

Password: `demo123`

| Email | Portal | Plan / notes |
|---|---|---|
| `marcus@fieldpro.io` | Super Admin | Platform |
| `sarah@mitchell-plumbing.com` | Office | Pro — calendar, dispatch, inventory, reports |
| `jake@mitchell-plumbing.com` | Field | Mitchell Plumbing |
| `emma@coolbreeze.com` | Office | Basic — reports only among gated modules |
