# FieldPro — Project Scope

**Product:** FieldPro  
**Type:** Multi-tenant SaaS for field-service companies (plumbing, electrical, HVAC, and similar trades)  
**Status:** Implemented local platform (office portal, field-worker portal, Super Admin)  
**Access (local):** UI `http://localhost:8080` · API `http://localhost:4100`

This document describes the **current product as built**, not a future wishlist. Items that exist only as plan flags or marketing copy are called out under Out of scope / not yet built.

---

## 1. Purpose

FieldPro lets a trade company run the job from the office to the truck:

1. Capture the customer and property.
2. Quote with an estimate.
3. Schedule and assign field workers.
4. Track the job in the field.
5. Invoice and keep records (documents, agreements, comms).
6. Pay FieldPro itself via a subscription plan.

The same codebase serves **many companies**. Each company’s data is isolated. A platform operator (Super Admin) manages tenants, plans, and billing configuration.

---

## 2. Who uses it

| Audience | Portal | Typical users |
|---|---|---|
| Tenant office | `/admin` | Owner, admin, dispatcher, office staff |
| Field worker | `/worker` | Technicians on jobs |
| Platform operator | `/super-admin` | FieldPro staff (`is_platform_admin`) |
| Public | `/`, `/login`, `/invite/:token` | Marketing site, sign-in, invite accept |

Super Admin is **off tenant CRM** unless impersonating a company.

### Roles (tenant)

| Role | Default access |
|---|---|
| **owner** | All permissions, including billing and SMTP |
| **admin** | Most office tools except billing and SMTP |
| **dispatcher** | Customers, jobs, dispatch, chat, comms, documents |
| **office** | Customers, estimates, invoices, reports, documents, agreements |
| **field_worker** | Own jobs, chat, comms, documents |

Owners can override permissions per member. Permissions and plan modules both apply: a user can have `inventory.read` and still be blocked if the company’s plan does not include Inventory.

---

## 3. System shape

```
Browser (Vite React, port 8080)
        HTTP + Socket.io
Express API (TypeScript, port 4100)
        PostgreSQL (RLS, app role fieldpro_app)
```

| Layer | Stack |
|---|---|
| Frontend | React, Vite, React Query, Zustand, React Router, shadcn/ui |
| Backend | Express, TypeScript, Zod, Socket.io, JWT (15m access + refresh) |
| Database | PostgreSQL with **FORCE ROW LEVEL SECURITY**; tenant id from JWT only |
| Files | Local disk `backend/uploads/{company_id}/` |
| Email | Nodemailer; tenant SMTP or platform SMTP |
| Payments | Stripe Checkout (subscription) using **plan amounts from the database** |
| Voice/SMS | Twilio (optional; SID/token in backend `.env`) |

**Isolation rules**

- Company id always comes from the JWT, never from the request body.
- Cross-tenant IDs return **404**, not 403.
- Super Admin has no tenant company unless impersonating.

---

## 4. In scope — tenant office (`/admin`)

### 4.1 Dashboard
Live KPIs: jobs by status, today’s schedule, active workers, revenue, low stock, overdue follow-ups, unpaid invoices, lead count.

### 4.2 Customers (CRM)
- Customer records: contacts, addresses, tags, status (lead / active / etc.), type.
- Notes and follow-ups (due dates, assign, mark done).
- Import, export, merge duplicates.
- Customer profile with related jobs, estimates, invoices, communications.

### 4.3 Jobs
- Create, edit, assign, status workflow (new → assigned → in progress → completed / cancelled).
- Scheduling fields (date, time window, duration, multi-day, category, priority).
- Line items, notes, assignees.
- Monthly **job cap** from the subscription plan (`max_jobs`; `-1` = unlimited). Enforced on create **and** estimate → job convert.

### 4.4 Estimates
- Numbered estimates, line items, tax, assignees, approval status.
- Convert an approved estimate into a job (copies lines and assignees). Conversion counts toward the monthly job cap.

### 4.5 Calendar and dispatch *(plan-gated)*
- **Calendar:** jobs and estimates on a date range.
- **Dispatch board:** workers vs scheduled jobs.
- Requires plan features `calendar` and `dispatch` respectively, plus `dispatch.access`.

### 4.6 Workers
- Field-worker profiles: specialties, availability, employment status, rating/completions.
- Creating or inviting a **field_worker** counts toward `max_workers` (active members + pending invites). Promoting someone to field worker is capped the same way.

### 4.7 Inventory *(plan-gated)*
- Stock items, min-stock, low-stock alerts.
- Requires plan feature `inventory`.

### 4.8 Invoices
- Job-linked invoices, statuses (draft / sent / paid / overdue), totals, customer view.

### 4.9 Communications
- Call / SMS / voicemail / MMS / email log.
- Optional Twilio send/receive when credentials are set.

### 4.10 Chat
- Real-time team chat (Socket.io) between office and field.

### 4.11 Documents, agreements, templates
- File documents per company.
- Service agreements tied to customers/jobs.
- Email templates for outbound mail.

### 4.12 Reports *(plan-gated)*
- Job distribution, revenue, worker efficiency / ratings.
- Requires plan feature `reports`.

### 4.13 Notifications
- In-app bell + list, deep links (`link_path`), event keys.
- Socket rooms per user; 30s poll fallback.
- Optional email for assignments, invoices, billing (per-member prefs).

### 4.14 Settings
Tabs: company profile, users & permissions, invitations, SMTP (test send), Twilio from-number, **billing**, notification prefs.

---

## 5. In scope — field worker (`/worker`)

- Dashboard of assigned work.
- Job list and job detail: status updates and notes.
- Personal schedule.
- Team chat.

Workers do not see office CRM, billing, or other companies.

---

## 6. In scope — platform Super Admin (`/super-admin`)

| Area | Capability |
|---|---|
| Dashboard | Tenant counts, plan mix, platform KPIs |
| Companies | Create, edit, suspend, soft-delete; invite first owner; impersonate |
| Subscriptions | CRUD plans: name, monthly/yearly **dollar amounts**, worker/job limits, marketing bullets, **enabled modules** |
| Reports | Platform-level rollups |
| Audit | Actor, action, entity, timestamp |
| Settings | Platform SMTP, trial days, support email |
| Billing invoices | Stripe-synced subscription invoices |

Creating a company requires inviting the first **owner**; Super Admin does not become a tenant member.

---

## 7. Auth, members, onboarding

- Register company → 14-day trial on **Basic** (configurable via platform `trial_days`).
- Login / logout / refresh tokens.
- Forgot / reset password.
- Invite by email (7-day token) → `/invite/:token` set password and join.
- Impersonation: Super Admin receives a tenant JWT; stop impersonation restores platform session.

---

## 8. Subscriptions and billing

Plans live in `subscription_plans`. Checkout **does not use Stripe Price IDs**. Stripe Checkout `price_data` is built from:

- monthly: `price_cents`
- yearly: `price_cents_yearly` (or monthly × 12)

### Default catalog (seed)

| Plan | Price | Workers | Jobs / month | Modules |
|---|---|---|---|---|
| Basic | $49 | 5 | 50 | `reports` |
| Pro | $99 | 20 | unlimited | `reports`, `calendar`, `dispatch`, `inventory` |
| Enterprise | $249 | unlimited | unlimited | Pro + `api`, `white_label`, `multi_location` |

### Enforced today

- Worker seats (`field_worker` active + pending invites).
- Monthly job creates (including estimate conversion).
- Module gates: reports, calendar, dispatch, inventory (API 403 “Upgrade required”; UI hides nav and shows upgrade page).

### Stored, not productized yet

`api`, `white_label`, `multi_location` can be toggled on a plan but have **no product behavior** yet.

### Stripe still required for payment

- `STRIPE_SECRET_KEY` to start Checkout / Customer Portal.
- `STRIPE_WEBHOOK_SECRET` to sync invoices and subscription status (`active` / `trial` / `past_due` / `suspended`).
- Changing a plan’s dollar amount in the DB applies to **new** checkouts. Existing Stripe subscriptions keep the amount they subscribed at until the customer checks out again.

---

## 9. Integrations (optional)

| Integration | Scope |
|---|---|
| **Stripe** | Checkout, billing portal, webhooks → company status + `billing_invoices` |
| **Twilio** | Outbound/inbound SMS and voice webhooks; skip signature in local dev |
| **SMTP** | Tenant or platform Nodemailer; passwords encrypted with `SETTINGS_ENCRYPTION_KEY` |

The product works without Twilio. Without Stripe, tenants can still be assigned plans manually by Super Admin; self-serve upgrade is disabled.

---

## 10. Security and tenancy (non-functional)

- JWT access 15 minutes; refresh 14 days; hashed refresh tokens.
- Argon2 password hashes.
- Helmet, CORS locked to `http://localhost:8080`, auth rate limit.
- RLS `FORCE` plus a restricted DB role (`fieldpro_app`).
- Isolation test: `npm run test:isolation` in `backend/`.
- Audit log on sensitive tenant and platform actions.

---

## 11. Out of scope / not built

These are **not** in the current product, even if mentioned on the marketing page or as plan keys:

- Public REST API for tenants (`api` flag unused).
- White-label branding (`white_label` unused).
- True multi-location / multi-branch (`multi_location` unused).
- Offline / PWA field mode (landing page copy only).
- Native iOS/Android apps.
- Customer-facing portal (customers do not log in).
- Accounting sync (QuickBooks, Xero).
- GPS live tracking / map routing.
- Stripe catalog Price IDs (removed; amounts come from the database).
- Super Admin using a tenant as a normal office user without impersonation.

---

## 12. Local run and demo

**Prerequisites:** Node 20+, PostgreSQL 14+.

```bash
# API
cd backend && cp .env.example .env && npm install && npm run migrate && npm run seed && npm run dev

# UI (repo root)
npm install && npm run dev
```

Password for local seed only: `demo123`

| Role | Email | Lands on |
|---|---|---|
| Super Admin | `platform@fieldpro.local` | `/super-admin` |

Do not run `npm run seed` on production.

---

## 13. Success criteria (what “done” means for this scope)

A trade company can:

1. Sign up or be invited, with role-based office vs field access.
2. Manage customers, estimates, jobs, invoices, and workers **only for their company**.
3. Hit plan limits (workers / monthly jobs) and unlock calendar, dispatch, inventory, reports according to the plan Super Admin configured.
4. Pay via Stripe using the dollar amounts on the plan row—no Dashboard Price objects required.
5. Receive in-app (and optional email) notifications for assignments and billing.
6. Platform staff can create companies, change plans/modules, impersonate, and audit activity—without mixing tenant data.

Anything beyond section 11 is a **future phase**, not this scope.
