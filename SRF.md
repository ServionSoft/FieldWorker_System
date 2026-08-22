# FieldPro — Software Requirements Specification (SRF)

| Field | Value |
|---|---|
| **Document type** | Software Requirements Specification (SRF / SRS) |
| **Product** | FieldPro — multi-tenant field-service CRM / SaaS |
| **Status** | As-built (requirements describe the implemented system) |
| **Version** | 2.0 |
| **Date** | 20 August 2026 |
| **Local access** | UI `http://localhost:8080` · API `http://localhost:4100` |
| **Related docs** | `PROJECT_SCOPE.md` · `FUNCTIONALITY.md` · `EMAIL_QA_REPORT.md` |

This SRF states **what the system shall do**, including a **complete inventory of every page and user activity**. Items that exist only as plan flags or marketing copy are listed under **out of scope** and are **not** requirements of the current release.

---

## 1. Introduction

### 1.1 Purpose

This document is the single source of truth for product, engineering, and QA. It covers:

1. Formal **shall** / **shall not** requirements (FR / NFR / IR / CR).
2. A **page-by-page catalog** of every route in the application.
3. Every **user activity** available on each page (view, create, edit, delete, send, filter, etc.).

### 1.2 Product overview

FieldPro is a **multi-tenant** SaaS for plumbing, electrical, HVAC, and similar trades. A tenant company shall:

1. Capture the customer and property.
2. Quote with an estimate.
3. Schedule and assign field workers.
4. Track the job in the field.
5. Invoice and keep records (documents, agreements, communications).
6. Pay FieldPro via a subscription plan (optional Stripe).

The same codebase shall serve **many companies**. Each company’s data shall be isolated. A platform operator (Super Admin) shall manage tenants, plans, and platform email/billing configuration.

### 1.3 Intended audience

| Audience | Use of this SRF |
|---|---|
| Product / business | Scope, roles, plan gates, page inventory |
| Engineering | Requirement IDs and screen contracts |
| QA | Test cases mapped to pages, activities, and FR / NFR IDs |
| Platform operators | Super Admin, tenancy, billing, platform SMTP |

### 1.4 Definitions

| Term | Meaning |
|---|---|
| **Tenant / company** | One customer of FieldPro (e.g. Mitchell Plumbing) |
| **Office user** | Tenant member with role owner, admin, dispatcher, or office |
| **Field worker** | Tenant member with role `field_worker` |
| **Super Admin** | Platform staff (`is_platform_admin` / role `super_admin`) |
| **SaaS invoice** | Stripe subscription invoice billed to the tenant |
| **Customer invoice** | Invoice billed by the tenant to their end customer |
| **Platform email** | FieldPro system mail via Super Admin SMTP |
| **Tenant CRM email** | Customer-facing mail via that company’s SMTP only |
| **RLS** | PostgreSQL row-level security |
| **Plan feature** | Module key on `subscription_plans` (e.g. `inventory`) |
| **Archive** | Soft hide via `archived_at` (customers, jobs) |
| **Hard delete** | Permanent row removal |

### 1.5 Requirement language

- **Shall** — mandatory for the current product.
- **Should** — recommended quality; not a release blocker if absent.
- **Shall not** — prohibited behavior.
- **Out of scope** — not a requirement of this release.

IDs: **FR-xxx** functional · **NFR-xxx** non-functional · **IR-xxx** interface · **CR-xxx** constraint · **PG-xxx** page/activity (catalog).

---

## 2. Overall description

### 2.1 Product perspective

```
Browser (Vite React, port 8080)
        HTTPS/HTTP + Socket.io
Express API (TypeScript, port 4100)
        PostgreSQL (RLS FORCE, role fieldpro_app)
        Optional: Stripe, Twilio, SMTP (platform + tenant)
        Files: local disk uploads/{company_id}/
```

### 2.2 User classes

| ID | Class | Portal | Typical users |
|---|---|---|---|
| UC-1 | Public visitor | `/` | Anyone |
| UC-2 | Unauthenticated user | `/login`, `/reset-password`, `/invite/:token` | Invitee, returning staff |
| UC-3 | Tenant office | `/admin/*`, `/onboarding` | Owner, admin, dispatcher, office |
| UC-4 | Field worker | `/worker/*` | Technicians |
| UC-5 | Super Admin | `/super-admin/*` | FieldPro staff |

**FR-001** Super Admin shall not use tenant CRM unless impersonating that company.

### 2.3 Operating environment

| Item | Requirement |
|---|---|
| Client | Modern desktop browser (Chrome, Edge, Firefox, Safari) |
| Runtime | Node.js 20+, PostgreSQL 14+ |
| Local demo | Seeded companies; password `demo123` (development only) |

### 2.4 Design constraints

Tenancy: company id **shall** come from the JWT only, never from the client-supplied body as the source of truth. See §8.

### 2.5 Assumptions

- One FieldPro company ≈ one trade business (no true multi-branch product).
- End customers (homeowners) do not log in.
- Stripe, Twilio, and SMTP are optional; core CRM shall work without them.
- Plan flags `api`, `white_label`, `multi_location` may be stored but have **no product behavior** in this release.

### 2.6 Complete route map

| Portal | Path | Page component | Access |
|---|---|---|---|
| Public | `/` | Index | Anyone |
| Public | `/login` | Login | Anyone |
| Public | `/reset-password` | ResetPassword | Anyone (token) |
| Public | `/invite/:token` | InviteAccept | Invitee |
| Public | `*` | NotFound | Anyone |
| Shared redirect | `/profile` | → role profile path | Authenticated |
| Office | `/onboarding` | Onboarding | Office roles; incomplete profile |
| Office | `/admin` | Dashboard | Office + company profile complete |
| Office | `/admin/jobs` | Jobs | `jobs.read` |
| Office | `/admin/jobs/:id` | JobDetail | `jobs.read` |
| Office | `/admin/estimates` | Estimates | `estimates.read` |
| Office | `/admin/estimates/:id` | EstimateDetail | `estimates.read` |
| Office | `/admin/calendar` | Calendar | `dispatch.access` + plan `calendar` |
| Office | `/admin/dispatch` | Dispatch | `dispatch.access` + plan `dispatch` |
| Office | `/admin/customers` | Customers | `customers.read` |
| Office | `/admin/customers/:id` | CustomerProfile | `customers.read` |
| Office | `/admin/workers` | Workers | `workers.manage` |
| Office | `/admin/inventory` | Inventory | `inventory.read` + plan `inventory` |
| Office | `/admin/invoices` | Invoices | `invoices.read` |
| Office | `/admin/chat` | Chat | `chat.access` |
| Office | `/admin/communications` | Communications | `communications.access` |
| Office | `/admin/documents` | Documents | `documents.access` |
| Office | `/admin/agreements` | Agreements | `agreements.access` |
| Office | `/admin/templates` | Templates | `templates.manage` |
| Office | `/admin/reports` | Reports | `reports.view` + plan `reports` |
| Office | `/admin/settings` | Settings | Tab-gated permissions |
| Office | `/admin/profile` | Profile | Any office role |
| Office | `/admin/notifications` | NotificationsPage | Any office role |
| Worker | `/worker` | Dashboard | `field_worker` |
| Worker | `/worker/jobs` | WorkerJobs | `field_worker` |
| Worker | `/worker/jobs/:id` | WorkerJobDetail | Assigned only |
| Worker | `/worker/schedule` | Schedule | `field_worker` |
| Worker | `/worker/chat` | Chat | `chat.access` |
| Worker | `/worker/profile` | Profile | `field_worker` |
| Platform | `/super-admin` | Dashboard | `super_admin` |
| Platform | `/super-admin/companies` | Companies | `super_admin` |
| Platform | `/super-admin/companies/:id` | CompanyDetail | `super_admin` |
| Platform | `/super-admin/subscriptions` | Subscriptions | `super_admin` |
| Platform | `/super-admin/reports` | Reports | `super_admin` |
| Platform | `/super-admin/audit` | Audit | `super_admin` |
| Platform | `/super-admin/settings` | Settings | `super_admin` |
| Platform | `/super-admin/profile` | Profile | `super_admin` |
| Platform | `/super-admin/notifications` | NotificationsPage | `super_admin` |

---

## 3. Complete page and activity catalog

Each subsection lists **who**, **what the user sees**, and **every activity** the page shall support. Activities are labeled **PG-xxx**.

### 3.0 Cross-cutting shell activities (all authenticated portals)

| ID | Activity | Requirement |
|---|---|---|
| PG-001 | Navigate primary sidebar / bottom nav | Role- and permission-filtered links only. |
| PG-002 | Toggle dark mode | Available from layout chrome. |
| PG-003 | Open global search (Ctrl+K) | Office layouts; results per FR-260. |
| PG-004 | Open notification bell | Unread count; list; mark read; deep links. |
| PG-005 | Open own profile | Route to `/admin/profile`, `/worker/profile`, or `/super-admin/profile`. |
| PG-006 | Log out | Revoke refresh token; return to `/login`. |
| PG-007 | Impersonation banner (if active) | Stop impersonation and restore Super Admin session. |
| PG-008 | Unsaved-change guard | Confirm before leaving dirty forms (NFR-110). |

---

### 3.1 Public — Landing page (`/`)

**Who:** Anyone (UC-1).

| ID | Activity |
|---|---|
| PG-010 | View FieldPro branding, feature grid, testimonials, stats |
| PG-011 | View live subscription plan cards from `GET /api/plans` (fallback copy if API down) |
| PG-012 | Navigate to Log in |
| PG-013 | Navigate to Sign up (login page signup tab) |

---

### 3.2 Public — Login / Sign up / Forgot password (`/login`)

**Who:** Anyone (UC-2).

| ID | Activity |
|---|---|
| PG-020 | Sign in with work email + password (show/hide password) |
| PG-021 | Remember email (`fp_remember_email`) |
| PG-022 | Use demo role chips (Super Admin / Office / Field Worker) to prefill email (local) |
| PG-023 | See API-down error message if login fails because API is unreachable |
| PG-024 | After success, route by role to `/super-admin`, `/admin`, or `/worker` |
| PG-025 | Open Sign up tab: company name, email, password (min 8) |
| PG-026 | Submit sign up → create user, Basic company, owner membership, trial, welcome notification, tokens |
| PG-027 | Request forgot password (email); generic success whether or not user exists |
| PG-028 | Navigate to landing page |

---

### 3.3 Public — Reset password (`/reset-password`)

**Who:** Anyone with a reset token query param.

| ID | Activity |
|---|---|
| PG-030 | Enter new password (min 8) and confirm |
| PG-031 | Submit reset; on success all refresh tokens for that user are revoked |
| PG-032 | See validation errors for weak/mismatched password or invalid/expired token |
| PG-033 | Navigate to login after success |

---

### 3.4 Public — Accept invite (`/invite/:token`)

**Who:** Invited email (UC-2).

| ID | Activity |
|---|---|
| PG-040 | View company name, invited email, role if token valid (unused, within 7 days) |
| PG-041 | Set name + password and accept invite |
| PG-042 | Create or update user; insert `company_members`; create `worker_profiles` if `field_worker` |
| PG-043 | Re-check worker seat cap on accept for field_worker |
| PG-044 | Receive welcome notification; office users with `settings.users` notified of join |
| PG-045 | See error for invalid/expired/used token |

---

### 3.5 Public — Not found (`*`)

| ID | Activity |
|---|---|
| PG-050 | View 404 / not-found page |
| PG-051 | Navigate back to a safe entry (home or login) |

---

### 3.6 Office — Onboarding (`/onboarding`)

**Who:** Office roles when `company.onboardingRequired` is true. Completing profile shall unlock `/admin`.

| ID | Activity |
|---|---|
| PG-060 | Step 1 — Company: edit name, email, phone, address, website, timezone; validate required fields |
| PG-061 | Step 2 — Business: select business type (plumbing / electrical / HVAC / general) |
| PG-062 | Step 3 — Email (optional): configure tenant SMTP (host, port, user, password, TLS, from name/email, reply-to) |
| PG-063 | Step 4 — Team (optional): invite a teammate (name, email, role) |
| PG-064 | Save company profile and continue between steps |
| PG-065 | Complete onboarding when required company fields are valid → set onboarding complete → `/admin` |
| PG-066 | Skip optional steps without blocking completion of required company data |

---

### 3.7 Office — Dashboard (`/admin`)

**Who:** Office roles with `jobs.read` (dashboard aggregates). Nav always available to office after onboarding.

| ID | Activity |
|---|---|
| PG-070 | View job counts: active / pending / completed / cancelled (and related status breakdown) |
| PG-071 | View jobs scheduled today |
| PG-072 | View active workers count |
| PG-073 | View paid invoice revenue |
| PG-074 | View low-stock inventory count |
| PG-075 | View overdue follow-ups (up to 8) and open customer |
| PG-076 | View unpaid invoices (draft / sent / overdue, up to 8) and open invoice |
| PG-077 | View lead customer count |
| PG-078 | View job-status chart data |
| PG-079 | Navigate to related modules from cards / links |

---

### 3.8 Office — Jobs list (`/admin/jobs`)

**Permission:** `jobs.read` / `jobs.write`.

| ID | Activity |
|---|---|
| PG-080 | List jobs with server pagination |
| PG-081 | Search / filter: status (incl. unassigned), priority, category, source, worker, date range, archived, starred |
| PG-082 | Sort and change page size; save named views; column visibility prefs |
| PG-083 | Star / pin jobs; pinned sort first |
| PG-084 | Open create job form |
| PG-085 | Create job (all FR-091 fields); assign workers; materials; line items |
| PG-086 | Open job detail |
| PG-087 | Bulk archive / restore / status (max 50) |
| PG-088 | Archive / restore single job |
| PG-089 | Clear filters; empty-state guidance |
| PG-090 | Discard create with unsaved-change confirm |

---

### 3.9 Office — Job detail (`/admin/jobs/:id`)

| ID | Activity |
|---|---|
| PG-100 | View job header, customer, address, schedule, status, assignees, line items, notes, materials |
| PG-101 | Breadcrumb back to jobs / customer |
| PG-102 | Change status (office: any valid status) |
| PG-103 | Assign / unassign workers (no on_leave) |
| PG-104 | Add job notes |
| PG-105 | Replace line items |
| PG-106 | Upload / view job images (25 MB max) |
| PG-107 | Generate customer invoice from job (requires lines; one invoice per job) |
| PG-108 | Edit job fields (where UI exposes patch) |
| PG-109 | Archive / restore / hard delete (write permission) |
| PG-110 | Copy / click-to-call customer contact |
| PG-111 | Star / pin |

---

### 3.10 Office — Estimates list (`/admin/estimates`)

**Permission:** `estimates.read` / `estimates.write`.

| ID | Activity |
|---|---|
| PG-120 | List estimates with pagination, search, status filter |
| PG-121 | Saved views / column prefs |
| PG-122 | Create estimate (auto `EST-YYYY-NNNN`, draft) |
| PG-123 | Open estimate detail |
| PG-124 | Unsaved create guard |

---

### 3.11 Office — Estimate detail (`/admin/estimates/:id`)

| ID | Activity |
|---|---|
| PG-130 | View estimate number, customer, lines, totals, status, assignees |
| PG-131 | Edit fields and line items |
| PG-132 | Change status: draft → sent → approved \| rejected |
| PG-133 | On **sent**: send customer estimate email via **tenant SMTP** (if configured) |
| PG-134 | Convert **approved** estimate to job (idempotent; job-cap check) |
| PG-135 | Delete unused (non-converted) estimate |
| PG-136 | Navigate to converted job when present |

---

### 3.12 Office — Calendar (`/admin/calendar`)

**Plan:** `calendar` · **Permission:** `dispatch.access`.

| ID | Activity |
|---|---|
| PG-140 | View calendar of jobs (date, time, duration, category, customer, workers) |
| PG-141 | View non-converted estimates in date range |
| PG-142 | Change date range / navigate periods |
| PG-143 | Open job or estimate from calendar event |
| PG-144 | If plan locked: see Upgrade Required UI linking to Billing |

---

### 3.13 Office — Dispatch (`/admin/dispatch`)

**Plan:** `dispatch` · **Permission:** `dispatch.access`.

| ID | Activity |
|---|---|
| PG-150 | View active workers vs jobs in range |
| PG-151 | See who is assigned to which job |
| PG-152 | Navigate to job / worker context |
| PG-153 | If plan locked: Upgrade Required |

---

### 3.14 Office — Customers list (`/admin/customers`)

**Permission:** `customers.read` / `customers.write`.

| ID | Activity |
|---|---|
| PG-160 | List customers with pagination |
| PG-161 | Search / filter: status, type, source, city, archived, starred |
| PG-162 | Saved views / columns / page size |
| PG-163 | Create customer (lead/active/inactive; residential/commercial; tags; etc.) |
| PG-164 | Open customer profile |
| PG-165 | Archive / restore; bulk archive/restore/status (max 50) |
| PG-166 | Star / pin |
| PG-167 | Import CSV/rows; export customers |
| PG-168 | Merge two customers |
| PG-169 | Unsaved create guard |

---

### 3.15 Office — Customer profile (`/admin/customers/:id`)

| ID | Activity |
|---|---|
| PG-180 | View profile summary, status, totals (jobs, spend) |
| PG-181 | Edit customer fields |
| PG-182 | Manage contacts: add / edit / delete / set primary |
| PG-183 | Manage addresses: add / edit / delete / set default |
| PG-184 | Add / delete notes |
| PG-185 | Create / complete follow-ups (title, due, assignee, optional job/estimate) |
| PG-186 | View related jobs, estimates, invoices, communications, documents, agreements |
| PG-187 | View activity timeline |
| PG-188 | Archive / restore; hard delete only if no related jobs/estimates/invoices (else 409) |
| PG-189 | Breadcrumbs; copy/click-to-call; unsaved edit guard |

---

### 3.16 Office — Workers (`/admin/workers`)

**Permission:** `workers.manage`.

| ID | Activity |
|---|---|
| PG-200 | List workers |
| PG-201 | Create worker (name, email, phone, specialties, status, optional password) |
| PG-202 | Edit worker profile and employment status |
| PG-203 | Manage weekly availability |
| PG-204 | Add / remove time-off dates |
| PG-205 | Enforce seat cap on create / reactivate |
| PG-206 | Unsaved form guard |

---

### 3.17 Office — Inventory (`/admin/inventory`)

**Plan:** `inventory` · **Permission:** `inventory.read` / `inventory.write`.

| ID | Activity |
|---|---|
| PG-210 | List inventory items |
| PG-211 | Create item (name, SKU unique, category, qty, min stock, unit price) |
| PG-212 | Adjust quantity (movement log) |
| PG-213 | Edit / delete item |
| PG-214 | Receive low-stock notifications when quantity drops below min stock |
| PG-215 | Unsaved form guard; Upgrade Required if plan locked |

---

### 3.18 Office — Customer invoices (`/admin/invoices`)

**Permission:** `invoices.read` / `invoices.write`.

| ID | Activity |
|---|---|
| PG-220 | List invoices with pagination, search, status, saved views |
| PG-221 | Open invoice detail (deep link `?id=` supported) |
| PG-222 | Change status: draft / sent / paid / overdue |
| PG-223 | On **sent**: email customer via **tenant SMTP**; notify staff with invoice email pref via **platform SMTP** |
| PG-224 | On **paid**: set `paid_at`; notify staff |
| PG-225 | View line items, totals, due date, linked job/customer |

---

### 3.19 Office — Chat (`/admin/chat`)

**Permission:** `chat.access`.

| ID | Activity |
|---|---|
| PG-230 | List threads the user belongs to |
| PG-231 | Open or create a direct thread with another user |
| PG-232 | Send messages (REST + Socket.io live) |
| PG-233 | Mark thread read |

---

### 3.20 Office — Communications (`/admin/communications`)

**Permission:** `communications.access`.

| ID | Activity |
|---|---|
| PG-240 | List communication logs (call, SMS, voicemail, MMS, email) |
| PG-241 | Filter by type / customer / job / estimate |
| PG-242 | Mark one or all read |
| PG-243 | Manually create a log row |
| PG-244 | Send SMS (Twilio configured) |
| PG-245 | Place call (Twilio configured) |
| PG-246 | Send email template to customer via **tenant SMTP only** (never platform SMTP) |
| PG-247 | View inbound Twilio logs when webhooks configured |

---

### 3.21 Office — Documents (`/admin/documents`)

**Permission:** `documents.access`.

| ID | Activity |
|---|---|
| PG-250 | List company documents |
| PG-251 | Upload file (multipart, max 25 MB) under `uploads/{company_id}/` |
| PG-252 | Attach optional job link |
| PG-253 | Download via auth or signed URL |
| PG-254 | Delete document (office) |

---

### 3.22 Office — Agreements (`/admin/agreements`)

**Permission:** `agreements.access`.

| ID | Activity |
|---|---|
| PG-260 | List service agreements |
| PG-261 | Create agreement (title, customer, optional job, dates, terms) |
| PG-262 | Edit status: draft / active / expired |
| PG-263 | View / patch agreement |
| PG-264 | Unsaved create guard |

---

### 3.23 Office — Email templates (`/admin/templates`)

**Permission:** `templates.manage`.

| ID | Activity |
|---|---|
| PG-270 | List tenant CRM templates |
| PG-271 | Create / edit / delete template |
| PG-272 | Set type: `invoice` \| `appointment` \| `follow_up` \| `estimate` \| `customer_communication` |
| PG-273 | Edit subject/body with `{variable}` placeholders |
| PG-274 | Shall **not** edit platform templates (password reset, welcome, SaaS billing, etc.) |
| PG-275 | Unsaved create/edit guard |

---

### 3.24 Office — Reports (`/admin/reports`)

**Plan:** `reports` · **Permission:** `reports.view`.

| ID | Activity |
|---|---|
| PG-280 | View total / completed jobs, paid revenue, average rating |
| PG-281 | View status distribution |
| PG-282 | View worker efficiency metrics |
| PG-283 | Upgrade Required if plan locked |

---

### 3.25 Office — Settings (`/admin/settings`)

Tabs are permission-gated. Query `?tab=` selects tab.

#### Tab: Company (`settings.company`)

| ID | Activity |
|---|---|
| PG-290 | View / edit company name, email, phone, address |
| PG-291 | Edit website, timezone, tax rate, invoice footer, logo settings |
| PG-292 | Edit Twilio from-number (E.164) |
| PG-293 | Save company profile with field validation |

#### Tab: Users (`settings.users`)

| ID | Activity |
|---|---|
| PG-300 | List members (role, status, permissions) |
| PG-301 | Invite user (email, name, role); only owner invites owner |
| PG-302 | Field_worker invite counts against seat cap |
| PG-303 | Edit member role / status / permission overrides |
| PG-304 | View pending invitations |
| PG-305 | Shall not demote/deactivate/remove last owner or remove self |

#### Tab: Company email / SMTP (`settings.smtp`)

| ID | Activity |
|---|---|
| PG-310 | Configure tenant SMTP: host, port, user, password, TLS, from name/email, reply-to |
| PG-311 | Save SMTP (password encrypted; blank password leaves existing) |
| PG-312 | Send tenant SMTP test email (evidence channel=`tenant`) |
| PG-313 | Shall use this SMTP **only** for customer CRM mail |
| PG-314 | Shall **not** read or modify Super Admin / platform SMTP |

#### Tab: Communications (Twilio)

| ID | Activity |
|---|---|
| PG-320 | View guidance that SID/token live in backend `.env` |
| PG-321 | Set company from-number used for Twilio |

#### Tab: Billing (`billing.manage`)

| ID | Activity |
|---|---|
| PG-330 | View plan name, company status, trial end, feature keys |
| PG-331 | Start Stripe Checkout upgrade (DB cents; no Price ID required) |
| PG-332 | Open Stripe Customer Portal |
| PG-333 | List SaaS invoices (number, amount, status, hosted URL) |
| PG-334 | If Stripe unset: self-serve upgrade disabled; Super Admin plan assign still works |

#### Tab: Notifications

| ID | Activity |
|---|---|
| PG-340 | Toggle email prefs: assignments, customer invoices, subscription billing |
| PG-341 | Save prefs on membership |

---

### 3.26 Office — Profile (`/admin/profile`)

| ID | Activity |
|---|---|
| PG-350 | View / edit own name, phone, avatar (as implemented) |
| PG-351 | Change password (if exposed) |
| PG-352 | View role and company context |
| PG-353 | Update notification preferences (if mirrored from settings) |

---

### 3.27 Office — Notifications (`/admin/notifications`)

| ID | Activity |
|---|---|
| PG-360 | List all notifications |
| PG-361 | Mark one read / mark all read |
| PG-362 | Follow deep `link_path` to entity |

---

### 3.28 Field worker — Dashboard (`/worker`)

| ID | Activity |
|---|---|
| PG-370 | View assigned work snapshot (today / upcoming / counts as implemented) |
| PG-371 | Navigate to jobs / schedule / chat |

---

### 3.29 Field worker — Jobs list (`/worker/jobs`)

| ID | Activity |
|---|---|
| PG-380 | List **only** jobs assigned to this worker |
| PG-381 | Open job detail |
| PG-382 | Filter/search within own jobs (as UI provides) |

---

### 3.30 Field worker — Job detail (`/worker/jobs/:id`)

| ID | Activity |
|---|---|
| PG-390 | View assigned job details, customer, address, schedule, notes, materials, lines |
| PG-391 | Set status to **in_progress** or **completed** only |
| PG-392 | Add job notes |
| PG-393 | Attach photos (job images) |
| PG-394 | Unassigned / other-company job IDs shall **404** |

---

### 3.31 Field worker — Schedule (`/worker/schedule`)

| ID | Activity |
|---|---|
| PG-400 | View personal scheduled jobs on a calendar/list |
| PG-401 | Open job from schedule |

---

### 3.32 Field worker — Chat (`/worker/chat`)

| ID | Activity |
|---|---|
| PG-410 | List threads |
| PG-411 | Open / create worker↔office or direct thread |
| PG-412 | Send messages; mark read |

---

### 3.33 Field worker — Profile (`/worker/profile`)

| ID | Activity |
|---|---|
| PG-420 | View / edit own profile fields |
| PG-421 | Update notification prefs (assignments etc. as allowed) |

---

### 3.34 Super Admin — Dashboard (`/super-admin`)

| ID | Activity |
|---|---|
| PG-430 | View company counts by status (active / trial / suspended) |
| PG-431 | View plan distribution and platform KPIs (MRR-style aggregates as implemented) |
| PG-432 | View recent platform activity snippets |

---

### 3.35 Super Admin — Companies (`/super-admin/companies`)

| ID | Activity |
|---|---|
| PG-440 | List companies (name, email, plan, status, employee count) |
| PG-441 | Create company (profile + plan); **must invite first owner** (SA is not a tenant member) |
| PG-442 | Edit company profile / plan / status |
| PG-443 | Soft-delete company |
| PG-444 | Open company detail |

---

### 3.36 Super Admin — Company detail (`/super-admin/companies/:id`)

| ID | Activity |
|---|---|
| PG-450 | View company profile, members, billing IDs, status |
| PG-451 | Re-invite owner |
| PG-452 | Impersonate owner/admin (tenant JWT + banner); audit action |
| PG-453 | Stop impersonation from banner |

---

### 3.37 Super Admin — Subscriptions / plans (`/super-admin/subscriptions`)

| ID | Activity |
|---|---|
| PG-460 | List subscription plans |
| PG-461 | Create / edit plan: name, monthly $, yearly $, max workers, max jobs/month |
| PG-462 | Set marketing feature bullets |
| PG-463 | Toggle modules: reports, calendar, dispatch, inventory (+ stored-only api/white_label/multi_location) |
| PG-464 | Optional Stripe price ID fields (not required for Checkout) |

---

### 3.38 Super Admin — Platform reports (`/super-admin/reports`)

| ID | Activity |
|---|---|
| PG-470 | View platform-level reports / aggregates |

---

### 3.39 Super Admin — Audit log (`/super-admin/audit`)

| ID | Activity |
|---|---|
| PG-480 | List audit events (actor, company, action, entity, time) |
| PG-481 | Filter / paginate audit log |

---

### 3.40 Super Admin — Platform settings (`/super-admin/settings`)

| ID | Activity |
|---|---|
| PG-490 | Edit trial days and support email |
| PG-491 | Configure **Platform Email** SMTP: host, port, user, password, TLS, from name/email, reply-to |
| PG-492 | Save platform SMTP (password encrypted; omitted on GET) |
| PG-493 | Send platform SMTP test (channel=`platform`) |
| PG-494 | Edit **platform** email templates: password_reset, welcome, tenant_invitation, system_notification, subscription_started, payment_failed |
| PG-495 | View Stripe configured flag |
| PG-496 | Tenants shall **not** access this page or APIs |

---

### 3.41 Super Admin — Profile & notifications

| ID | Activity |
|---|---|
| PG-500 | `/super-admin/profile` — own profile |
| PG-501 | `/super-admin/notifications` — platform notifications list / mark read |

---

### 3.42 Email channel activities (cross-page)

| ID | Activity | Channel |
|---|---|---|
| PG-510 | Forgot / reset password email | Platform |
| PG-511 | Signup / welcome email | Platform |
| PG-512 | Tenant user / worker / owner invitation email | Platform |
| PG-513 | Staff system notifications (assignment, completion, invoice staff notify, billing) | Platform |
| PG-514 | SaaS subscription started / payment failed / invoice paid emails | Platform |
| PG-515 | Customer invoice email | Tenant |
| PG-516 | Customer estimate email | Tenant |
| PG-517 | Customer appointment email (job create with schedule) | Tenant |
| PG-518 | Customer follow-up email | Tenant |
| PG-519 | Customer communication / template send | Tenant |
| PG-520 | Platform SMTP test | Platform |
| PG-521 | Tenant SMTP test | Tenant |

**Shall not:** fall back from tenant→platform or platform→tenant. Tenant shall not modify platform SMTP. Platform mail shall not use tenant From.

---

## 4. System features and functional requirements

### 4.1 Public site and accounts

| ID | Requirement | Priority |
|---|---|---|
| FR-010 | The system shall present a public landing page with branding, features, and live plan cards from `GET /api/plans` (fallback copy if API is down). | Must |
| FR-011 | A user shall sign in with email and password. Invalid credentials shall fail without revealing whether the email exists beyond a generic error. | Must |
| FR-012 | Sign-in shall route Super Admin to `/super-admin`, office roles to `/admin` (or `/onboarding` if required), field workers to `/worker`. | Must |
| FR-013 | Sign-up shall create a user, a company on **Basic**, an **owner** membership, a configurable trial (default 14 days), welcome notification, and tokens. | Must |
| FR-014 | Sign-up password shall be at least 8 characters. | Must |
| FR-015 | Forgot-password shall accept an email and, if **platform SMTP** is configured, send a one-time reset via **platform** channel. Response shall be generic whether or not the user exists. | Must |
| FR-016 | Reset-password (`/reset-password`) shall set a new password and revoke all refresh tokens for that user. | Must |
| FR-017 | Access JWT shall expire in **15 minutes**; refresh token shall last **14 days** and be stored hashed. | Must |
| FR-018 | The client shall refresh the access token on 401 except during Super Admin impersonation. | Must |
| FR-019 | Logout shall revoke the refresh token. | Must |
| FR-020 | `GET /api/auth/me` shall return user, company, role, permissions, plan features, notification prefs, and impersonation flag. | Must |
| FR-021 | Invite accept (`/invite/:token`) shall work for unused tokens within **7 days**, set name/password, create/update user and membership, create worker profile if role is field_worker, and re-check worker seat cap. | Must |
| FR-022 | Incomplete company profile shall require `/onboarding` before office CRM (`onboardingRequired`). | Must |

### 4.2 Authorization (roles and permissions)

| ID | Requirement | Priority |
|---|---|---|
| FR-030 | Tenant roles shall be: `owner`, `admin`, `dispatcher`, `office`, `field_worker`. | Must |
| FR-031 | Owner shall have all tenant permissions including billing and SMTP. | Must |
| FR-032 | Admin shall have all tenant permissions except `billing.manage` and `settings.smtp` by default. | Must |
| FR-033 | Dispatcher default: customers, jobs, dispatch, chat, comms, documents (read/write as catalogued). | Must |
| FR-034 | Office default: customers, estimates, invoices, reports, documents, agreements. | Must |
| FR-035 | Field worker default: `jobs.read`, `chat.access`, `communications.access`, `documents.access`. | Must |
| FR-036 | An owner shall override permissions per member (allow/deny vs role defaults). | Must |
| FR-037 | Nav and APIs shall require **both** permission and plan feature where a module is gated. Missing module shall hide nav, show upgrade UI, and return API error “Upgrade required for this feature”. | Must |
| FR-038 | Only an owner shall invite another owner. | Must |
| FR-039 | The system shall not allow demoting, deactivating, or removing the last owner, nor removing oneself. | Must |

**Permission catalog (all shall be enforceable on API):**  
`customers.read/write`, `jobs.read/write`, `estimates.read/write`, `invoices.read/write`, `inventory.read/write`, `workers.manage`, `dispatch.access`, `communications.access`, `documents.access`, `agreements.access`, `templates.manage`, `reports.view`, `settings.company`, `settings.users`, `settings.smtp`, `billing.manage`, `chat.access`.

### 4.3 Tenancy and isolation

| ID | Requirement | Priority |
|---|---|---|
| FR-050 | Every tenant API call shall be scoped by JWT `company_id`. | Must |
| FR-051 | A request using another company’s resource UUID shall return **404**, not 403. | Must |
| FR-052 | PostgreSQL RLS shall be **FORCE** on tenant business tables; the app shall connect as `fieldpro_app` with `app.current_company_id` set per request. | Must |
| FR-053 | A field worker shall see only jobs they are assigned to; other job IDs shall 404. | Must |
| FR-054 | Suspended companies and expired trials shall be blocked from tenant CRM (login / tenant middleware). | Must |
| FR-055 | Isolation shall be verifiable via `npm run test:isolation` in `backend/`. | Must |

### 4.4 Office dashboard

| ID | Requirement | Priority |
|---|---|---|
| FR-060 | `/admin` shall show job counts by status, jobs scheduled today, active workers, paid invoice revenue, low-stock count, overdue follow-ups (up to 8), unpaid invoices (up to 8), lead count, and job-status chart data. | Must |

### 4.5 Customers (CRM)

**Permission:** `customers.read` / `customers.write`  
**Paths:** `/admin/customers`, `/admin/customers/:id`

| ID | Requirement | Priority |
|---|---|---|
| FR-070 | A customer shall have status **lead**, **active**, or **inactive**; type residential/commercial; source, notes, tags, payment terms, tax exempt, optional parent customer. | Must |
| FR-071 | A customer shall have many contacts (name, email, phone, ext, primary flag) and many addresses (location, street, unit, city, state, zip, gated, default). | Must |
| FR-072 | The system shall support timestamped notes with author, add/delete. | Must |
| FR-073 | Follow-ups shall have title, due date, done flag, optional estimate/job/assignee; company-wide list and per-customer; dashboard shall highlight overdue incomplete items. Creating a follow-up shall email the customer via **tenant SMTP** when configured. | Must |
| FR-074 | Customer profile shall show related jobs, estimates, invoices, communications, documents, agreements, and an activity timeline. | Must |
| FR-075 | Users shall import CSV/rows, export customers, and merge two customers (keep one; re-point related records). | Must |
| FR-076 | Duplicate email/phone on create/edit shall **warn**, not block, except where existing create rules reject duplicate email. | Must |
| FR-077 | Lists shall paginate on the server (search, status, type, source, city, archived, starred). | Must |
| FR-078 | Users shall archive and restore customers (`archived_at`). Default lists shall show **active** (non-archived) records. | Must |
| FR-079 | Hard DELETE shall succeed only if the customer has no related jobs, estimates, or invoices; otherwise **409** with guidance to archive. | Must |
| FR-080 | Users shall star and pin customers; pinned records shall sort first. | Must |
| FR-081 | A customer shall have an optional **owner** (user id); create/update shall record `created_by` / `updated_by`. | Must |
| FR-082 | Users shall save named filter views and remember column visibility / page size per company in the browser. | Must |
| FR-083 | Bulk actions (max 50 ids) shall support archive, restore, and status change. | Must |
| FR-084 | Global search (Ctrl+K) shall find customers (non-archived) by name, email, phone. | Must |
| FR-085 | Unsaved changes on customer create/edit (including profile edit) shall prompt before discard. | Must |

### 4.6 Jobs

**Permission:** `jobs.read` / `jobs.write`  
**Paths:** `/admin/jobs`, `/admin/jobs/:id`, `/worker/jobs`, `/worker/jobs/:id`

| ID | Requirement | Priority |
|---|---|---|
| FR-090 | A job shall belong to an existing customer and may copy default address. | Must |
| FR-091 | Job fields shall include title, description, priority (low/medium/high/urgent), category (plumbing/electrical/hvac/general), schedule date/time, arrival end, multi-day/end date, duration, PO, source, tech notes, completion notes, follow-up flag, notify techs, billing type, tax, customer note, materials, line items, assignees. | Must |
| FR-092 | Status workflow shall be `new` → `assigned` → `in_progress` → `completed` \| `cancelled`. | Must |
| FR-093 | If any worker is assigned at create, status shall start as **assigned**; otherwise **new**. | Must |
| FR-094 | The system shall not assign a worker whose employment status is **on_leave**. | Must |
| FR-095 | Each assignee shall receive in-app notification (`job.assigned`) and email via **platform SMTP** only when `notify_email_assignments` is true; link for field users `/worker/jobs/:id`. | Must |
| FR-096 | Monthly job cap (`max_jobs`; `-1` unlimited) shall count jobs created in the current calendar month and shall be enforced on **create** and **estimate convert**. | Must |
| FR-097 | Office with write shall set any job status. Field workers shall set only **in_progress** or **completed**. | Must |
| FR-098 | Completing a job shall set `completed_at`, increment worker `jobs_completed`, notify office staff (not field workers en masse) via platform email when configured. Cancel shall notify office. Status changes shall be audited. | Must |
| FR-099 | Users shall add notes, replace line items, and attach job images (same 25 MB file store). | Must |
| FR-100 | Generating a customer invoice from a job shall require line items, copy lines, apply job tax, allocate `INV-YYYY-NNNN`, and be **one invoice per job** (return existing if already generated). | Must |
| FR-101 | Lists shall paginate in SQL with filters: search, status (including unassigned), priority, category, source, worker, date range, archived, starred, sort. | Must |
| FR-102 | Users shall archive/restore jobs; bulk archive/restore/status (max 50). Default list: non-archived. | Must |
| FR-103 | Hard DELETE of a job shall be available to `jobs.write`. UI shall offer archive as the non-destructive path. | Must |
| FR-104 | Jobs shall support owner, created_by, updated_by, star, and pin. | Must |
| FR-105 | Global search shall find non-archived jobs by title, description, PO, customer name. | Must |
| FR-106 | Unsaved changes on job create shall prompt before discard. | Must |
| FR-107 | Creating a job with `scheduledDate` shall send a customer appointment email via **tenant SMTP** when the customer has email and tenant SMTP is configured. | Must |

### 4.7 Estimates

**Permission:** `estimates.read` / `estimates.write`

| ID | Requirement | Priority |
|---|---|---|
| FR-110 | Estimates shall auto-number `EST-YYYY-NNNN` and start as **draft**. | Must |
| FR-111 | Status shall be `draft` → `sent` → `approved` \| `rejected` → `converted`. | Must |
| FR-112 | Approving shall notify users with `estimates.read`. | Must |
| FR-113 | Convert shall be allowed only for **approved** estimates; shall be idempotent; shall re-check monthly job cap; shall copy customer, address, lines, assignees; job title `Job from EST-…`; mark estimate converted. Audit `estimate.convert`. | Must |
| FR-114 | Users shall patch fields/line items and delete unused estimates. | Must |
| FR-115 | Lists shall paginate with search and status; saved views and column prefs; unsaved warning on create. | Must |
| FR-116 | Global search shall match estimate number and customer name. | Must |
| FR-117 | Setting status to **sent** shall email the customer via **tenant SMTP** (no platform fallback). | Must |

### 4.8 Calendar and dispatch (plan-gated)

| ID | Requirement | Priority |
|---|---|---|
| FR-120 | Calendar (`/admin/calendar`) shall require plan feature `calendar` and permission `dispatch.access`. It shall show jobs and non-converted estimates in a date range. | Must |
| FR-121 | Dispatch (`/admin/dispatch`) shall require plan feature `dispatch` and `dispatch.access`. It shall show active workers vs jobs in range. | Must |
| FR-122 | Locked plans shall hide nav; direct URL shall show upgrade page linking to Billing. | Must |

### 4.9 Customer invoices

**Permission:** `invoices.read` / `invoices.write`

| ID | Requirement | Priority |
|---|---|---|
| FR-130 | Customer invoices shall be job-linked with number, customer, subtotal, tax, total, due date, status, line items. | Must |
| FR-131 | Status shall be **draft**, **sent**, **paid**, **overdue**. | Must |
| FR-132 | Paid shall set `paid_at` and notify `invoices.read` (optional email pref “invoices” via **platform SMTP**). Sent/overdue shall notify staff the same way. | Must |
| FR-133 | Numbers shall use a per-company yearly counter (same mechanism as estimates). | Must |
| FR-134 | Lists shall paginate; saved views; column prefs; deep link `?id=`. | Must |
| FR-135 | Global search shall match invoice number and customer name. | Must |
| FR-136 | Setting status to **sent** shall email the customer via **tenant SMTP** with template variables including customer name, company name, invoice number, amount/total, due date. | Must |

These are **not** Stripe SaaS invoices (see §4.18).

### 4.10 Workers

**Permission:** `workers.manage` (office); field workers may read **their own** profile.

| ID | Requirement | Priority |
|---|---|---|
| FR-140 | Create worker shall set name, email, phone, specialties, status (`active` / `inactive` / `on_leave`), optional password (development default `demo123` if omitted). | Must |
| FR-141 | Create shall create or reuse user, membership `field_worker`, worker profile, default Mon–Fri 08:00–17:00 availability. | Must |
| FR-142 | Seat cap (`max_workers`; `-1` unlimited) shall count **active field_worker members** and **pending field_worker invites**. Enforced on create, invite, promote/reactivate, and invite accept. | Must |
| FR-143 | Users shall edit name/phone/specialties/status and manage weekly availability and time-off dates. | Must |
| FR-144 | Unsaved worker form changes shall prompt before discard. | Must |
| FR-145 | Global search shall find workers by name, email, phone when the actor has jobs.read or workers.manage. | Must |

### 4.11 Inventory (plan-gated: `inventory`)

| ID | Requirement | Priority |
|---|---|---|
| FR-150 | Inventory shall require plan feature `inventory` and `inventory.read` / `inventory.write`. | Must |
| FR-151 | Item shall have name, SKU unique per company, category, quantity, min stock, unit price. | Must |
| FR-152 | Quantity changes shall log movements (actor + delta). Create-with-qty shall log receive. | Must |
| FR-153 | Quantity below min stock shall notify office admins. | Must |
| FR-154 | Unsaved inventory form changes shall prompt before discard. | Must |

### 4.12 Communications

**Permission:** `communications.access`

| ID | Requirement | Priority |
|---|---|---|
| FR-160 | The system shall log call, SMS, voicemail, MMS, email with direction, status, from/to, body, duration, optional customer/job/estimate, read flag. | Must |
| FR-161 | Users shall filter, mark one or all read, and manually create a log row. | Must |
| FR-162 | If Twilio SID/token are configured, users shall send SMS and place calls from the company from-number. | Must |
| FR-163 | Inbound Twilio SMS/voice webhooks shall match company by To-number and store logs (SMS dedupe by Twilio SID). Signature check shall apply unless skip is enabled for local dev. | Must |
| FR-164 | Without Twilio, the log shall still work; send/call shall fail until keys exist. | Must |
| FR-165 | Send email template shall use **tenant CRM templates** + **tenant SMTP** only. Failure shall not use platform SMTP. | Must |
| FR-166 | Global search shall match comms body/from/to when the actor has `communications.access`. | Must |

### 4.13 Team chat

**Permission:** `chat.access` · Socket.io

| ID | Requirement | Priority |
|---|---|---|
| FR-170 | Users shall list threads they belong to, open/create a direct thread, send messages, and mark read. | Must |
| FR-171 | A field worker shall open a worker↔office thread (office roles included). | Must |
| FR-172 | Live delivery shall use Socket.io authenticated with JWT; REST shall provide history. | Must |

### 4.14 Documents, agreements, templates

| ID | Requirement | Priority |
|---|---|---|
| FR-180 | Users with `documents.access` shall upload files (multipart, max **25 MB**) under `uploads/{company_id}/`, attach as documents (optional job), download via auth or short-lived signed URL, and delete (office). | Must |
| FR-181 | Global search shall match document original names when `documents.access`. | Must |
| FR-182 | Service agreements (`agreements.access`) shall have title, customer, optional job, dates, terms, status draft/active/expired. Unsaved create shall prompt. | Must |
| FR-183 | Email templates (`templates.manage`) shall have name, subject, body, type `invoice` \| `appointment` \| `follow_up` \| `estimate` \| `customer_communication`. Unsaved create/edit shall prompt. Tenants shall not edit platform templates. | Must |

### 4.15 Reports (plan-gated: `reports`)

| ID | Requirement | Priority |
|---|---|---|
| FR-190 | Tenant reports shall require `reports` + `reports.view` and show total/completed jobs, paid revenue, average rating, status distribution, worker efficiency. | Must |

### 4.16 Notifications

| ID | Requirement | Priority |
|---|---|---|
| FR-200 | All logged-in users shall have a bell with unread count, list, mark one/all read, deep `link_path`. | Must |
| FR-201 | Delivery shall use socket room `user:{id}` plus 30-second poll fallback. | Must |
| FR-202 | Optional staff email shall use **platform SMTP** and respect member prefs (assignments, invoices, billing). | Must |
| FR-203 | Events shall include at least: job assigned/completed/cancelled, estimate approved, invoice sent/paid/overdue, member invite/join, worker welcome, low stock, company welcome, subscription/payment events, platform new-company / payment-failed. | Must |

### 4.17 Tenant settings

| ID | Requirement | Priority |
|---|---|---|
| FR-210 | Company profile (`settings.company`): name, email, phone, address, Twilio from-number, timezone/tax/website/invoice footer/logo settings. | Must |
| FR-211 | Users (`settings.users`): list, invite (email, name, role), edit role/status/permission overrides, pending invitations. | Must |
| FR-212 | Tenant SMTP (`settings.smtp`): host, port, user, encrypted password, TLS, from name/email, reply-to; test send. Used **only** for tenant-to-customer CRM email. **No fallback** to platform SMTP. | Must |
| FR-213 | Billing (`billing.manage`): plan name, company status, trial end, feature keys, checkout from **DB cents**, Customer Portal, list of Stripe SaaS invoices. | Must |
| FR-214 | Notification prefs: assignments, customer invoices, subscription billing. | Must |
| FR-215 | Layouts shall support dark mode. | Must |

### 4.18 SaaS billing (Stripe)

| ID | Requirement | Priority |
|---|---|---|
| FR-220 | Checkout shall **not** require Stripe Price IDs; `price_data` shall use `price_cents` / `price_cents_yearly` (or monthly × 12). | Must |
| FR-221 | Without `STRIPE_SECRET_KEY`, self-serve upgrade shall be disabled; Super Admin shall still assign plans. | Must |
| FR-222 | Webhooks shall be idempotent by `stripe_event_id` and map subscription/invoice events to company status `active` / `trial` / `past_due` / `suspended`. | Must |
| FR-223 | Changing plan dollars in Super Admin shall apply to **new** checkouts only. | Must |
| FR-224 | Trialing companies shall receive Checkout trial days consistent with platform `trial_days` when status is trial. | Must |
| FR-225 | Billing notify emails (subscription started, payment failed, invoice paid) shall use **platform SMTP** and `notify_email_billing`. | Must |

### 4.19 Plan limits (enforced)

| ID | Limit | Count | Checked on |
|---|---|---|---|
| FR-230 | Max field workers | Active `field_worker` members + pending worker invites | Worker create, invite, promote, invite accept |
| FR-231 | Max jobs / month | Jobs with `created_at` this calendar month | Job create, estimate convert |
| FR-232 | Feature flags | `feature_keys` | Inventory router; calendar/dispatch/reports APIs; office nav |

**Enforced product modules:** `reports`, `calendar`, `dispatch`, `inventory`.  
**Stored only (not FR of this release):** `api`, `white_label`, `multi_location`.

### 4.20 Field worker portal

| ID | Requirement | Priority |
|---|---|---|
| FR-240 | `/worker` dashboard shall show assigned work snapshot. | Must |
| FR-241 | Job list/detail shall show assigned jobs only; worker shall set in_progress/completed and add notes/photos. | Must |
| FR-242 | Schedule shall show personal scheduled jobs. | Must |
| FR-243 | Chat shall be available. | Must |
| FR-244 | Field workers shall not open office CRM, billing, other companies, or unassigned jobs. | Must |

### 4.21 Super Admin (platform)

| ID | Requirement | Priority |
|---|---|---|
| FR-250 | Access shall be `super_admin` only. | Must |
| FR-251 | Dashboard shall show company counts by status, plan mix, platform KPIs. | Must |
| FR-252 | Companies: list, create (must invite first owner — Super Admin shall not become a tenant member), edit profile/plan/status, soft-delete, detail, re-invite owner. | Must |
| FR-253 | Impersonate shall issue a tenant access JWT; UI shall show a banner to stop and restore the platform session. Action shall be audited. | Must |
| FR-254 | Plans: CRUD name, monthly/yearly dollars, max workers, max jobs/month, bullets, module checkboxes. | Must |
| FR-255 | Platform reports, audit log, **platform SMTP** (host, port, user, encrypted password, TLS, from name/email, reply-to, test send), platform templates, trial days/support email, Stripe-synced billing invoices across tenants. Platform SMTP is used only for FieldPro system email (auth, invites, SaaS billing, staff system notifications). | Must |
| FR-256 | Tenants shall receive 403 on all `/api/platform/*` routes. | Must |

### 4.22 Cross-cutting CRM UX

| ID | Requirement | Priority |
|---|---|---|
| FR-260 | Global search (Ctrl+K) shall search customers, jobs, estimates, invoices, and permission-gated workers, documents, communications. Empty query shall not leak archived customers/jobs. | Must |
| FR-261 | Recently viewed records shall appear in search when the query is empty. | Must |
| FR-262 | Copy / click-to-call for email and phone on customer/job surfaces. | Must |
| FR-263 | Breadcrumbs on customer and job detail. | Must |
| FR-264 | List empty states, clear-filters, and pagination UI when total exceeds page size. | Must |

### 4.23 Dual email channels

| ID | Requirement | Priority |
|---|---|---|
| FR-270 | The system shall maintain two isolated SMTP channels: **platform** (Super Admin settings) and **tenant** (company settings). | Must |
| FR-271 | Platform mail shall never use tenant SMTP; tenant CRM mail shall never use platform SMTP (no silent fallback). | Must |
| FR-272 | SMTP passwords shall be encrypted at rest and never returned from APIs or written to logs. | Must |
| FR-273 | Sender (From / Reply-To) shall come from stored SMTP config for that channel; clients shall not override sender via request body. | Must |
| FR-274 | Tenant identity for CRM send shall come from authenticated JWT company id only. | Must |

---

## 5. External interface requirements

### 5.1 User interfaces (IR)

| ID | Requirement |
|---|---|
| IR-010 | Office, field, and Super Admin shall be distinct shells with role-based routing. |
| IR-011 | Public pages: `/`, `/login`, `/reset-password`, `/invite/:token`. |
| IR-012 | Demo login chips may prefill Super Admin / office / field emails (local). |
| IR-013 | Onboarding shall gate incomplete office companies before `/admin`. |

### 5.2 Hardware interfaces

None. Browser + server.

### 5.3 Software interfaces

| ID | System | Requirement |
|---|---|---|
| IR-020 | PostgreSQL | System of record; RLS FORCE for tenant tables. |
| IR-021 | Stripe | Optional Checkout, Customer Portal, webhooks. |
| IR-022 | Twilio | Optional SMS/voice outbound and inbound webhooks. |
| IR-023 | SMTP | Two isolated Nodemailer channels: **platform** and **tenant**. Passwords encrypted. No silent fallback. |
| IR-024 | Socket.io | Chat and notification push; JWT on connect. |

### 5.4 Communication interfaces

| ID | Requirement |
|---|---|
| IR-030 | REST JSON API under `/api`. |
| IR-040 | CORS shall allow the configured `CORS_ORIGIN` (default `http://localhost:8080`). |
| IR-050 | Health: `GET /health` shall return status ok. |

---

## 6. Non-functional requirements

### 6.1 Security

| ID | Requirement | Priority |
|---|---|---|
| NFR-010 | Passwords shall be hashed with Argon2. | Must |
| NFR-020 | Invite, reset, and refresh tokens shall be stored hashed (SHA-256). | Must |
| NFR-030 | Tenant **and** platform SMTP passwords shall be encrypted at rest (AES-GCM, `SETTINGS_ENCRYPTION_KEY`). Passwords shall not appear in API responses or logs. | Must |
| NFR-040 | Auth endpoints shall be rate-limited (100 requests / 15 minutes in production). | Must |
| NFR-050 | Helmet shall be enabled. | Must |
| NFR-060 | Production deployments **shall not** use placeholder JWT secrets, the default encryption key, or the hardcoded `fieldpro_app` password from development. | Must (production) |
| NFR-070 | Cross-tenant data leakage shall not occur for RLS-backed tables; isolation tests shall pass. | Must |

### 6.2 Reliability and operations

| ID | Requirement | Priority |
|---|---|---|
| NFR-080 | Stripe webhook handling shall be idempotent. | Must |
| NFR-090 | File driver in this release is **local disk** only (`FILE_DRIVER=local`). | Must (current) |
| NFR-100 | Sensitive tenant and platform actions shall be written to the audit log. | Must |
| NFR-105 | SMTP send failures shall surface clear errors without stack traces or secrets; business records shall not be corrupted solely because email failed (unless the API is explicitly designed to require send success, e.g. send-template). | Must |

### 6.3 Usability

| ID | Requirement | Priority |
|---|---|---|
| NFR-110 | Destructive navigation away from dirty forms shall confirm (customers, jobs, estimates, workers, inventory, agreements, templates, customer profile, onboarding where applicable). | Must |
| NFR-120 | List toolbars shall keep primary search/filters visible; secondary filters behind a More control; saved views in a compact menu. | Should |

### 6.4 Performance

| ID | Requirement | Priority |
|---|---|---|
| NFR-130 | Customer, job, estimate, and invoice **list** endpoints shall paginate in SQL (default page size 25, max 100). | Must |
| NFR-140 | Dropdown/related-record caches may load up to 100 active records in this release (known limitation). | Should improve |

### 6.5 Maintainability

| ID | Requirement | Priority |
|---|---|---|
| NFR-150 | Schema changes shall be versioned SQL migrations. | Must |
| NFR-160 | API inputs shall be validated with Zod. | Must |

---

## 7. Data requirements (summary)

**Core tenant entities:** companies, users, members, customers (+ contacts, addresses, notes, follow-ups, tags), jobs (+ assignees, notes, line items, images), estimates, invoices, workers, inventory, files/documents, communications, chat, notifications, agreements, email_templates, record_favorites, saved_views, company_settings (tenant SMTP).

**Platform:** subscription_plans, billing_invoices/events, audit_logs, platform_settings, platform_email_templates, invitations.

**Archive columns:** `customers.archived_at`, `jobs.archived_at`.  
**Ownership/audit:** `owner_user_id`, `created_by`, `updated_by` on customers/jobs (and created/updated on estimates/invoices as implemented).

---

## 8. Constraints

| ID | Constraint |
|---|---|
| CR-010 | Tenant id in APIs comes from JWT, not a client-chosen company id. |
| CR-020 | Super Admin is not a tenant member of companies they create; they invite an owner. |
| CR-030 | One customer invoice per job. |
| CR-040 | Convert estimate → job only from approved estimates. |
| CR-050 | Last owner cannot be removed. |
| CR-060 | Field workers cannot be assigned while `on_leave`. |
| CR-070 | Tenant SMTP and platform SMTP are separate; no cross-channel fallback. |

---

## 9. Out of scope (this release)

The following **shall not** be treated as delivered requirements:

- Tenant public REST API (`api` flag unused)
- White-label branding (`white_label` unused)
- Multi-location / multi-branch (`multi_location` unused)
- Offline / PWA / native iOS or Android apps
- Customer self-service portal
- QuickBooks / Xero
- Live GPS / map routing
- Stripe Dashboard Price objects (intentionally unused)

Marketing copy that mentions these items does **not** create a requirement.

---

## 10. Acceptance criteria (release “done”)

A trade company can:

1. Sign up or be invited, complete onboarding, with role-based office vs field access. **(FR-013, FR-021, FR-022, FR-030)**  
2. Manage customers, estimates, jobs, invoices, and workers **only for their company**. **(FR-050–FR-055)**  
3. Hit plan limits (workers / monthly jobs) and unlock calendar, dispatch, inventory, reports according to the plan Super Admin configured. **(FR-120, FR-150, FR-190, FR-230–FR-232)**  
4. Pay via Stripe using dollar amounts on the plan row, or operate on a Super-Admin-assigned plan without Stripe. **(FR-220–FR-221)**  
5. Receive in-app (and optional platform email) notifications for assignments and billing. **(FR-200–FR-203, FR-270–FR-274)**  
6. Send customer CRM emails only via tenant SMTP; system emails only via platform SMTP. **(FR-212, FR-255, FR-270–FR-274)**  
7. Platform staff can create companies, change plans/modules, impersonate, and audit activity without mixing tenant data. **(FR-250–FR-256)**  
8. Archive/restore customers and jobs; hard-delete customers only when they have no related financial/job documents. **(FR-078–FR-079, FR-102)**  

QA shall additionally run `backend` `npm run test:isolation`, `npm run test:email-complete` (or email channel suite), and smoke: login (all demo personas), Ctrl+K search, archive/restore, plan gate on a Basic tenant, impersonation start/stop, every page in §2.6 loads for an authorized role.

---

## 11. Traceability

| Spec | Content |
|---|---|
| This SRF §3 | Page / activity catalog (PG-xxx) |
| This SRF §4–§8 | Formal requirements (FR / NFR / IR / CR) |
| `FUNCTIONALITY.md` | Narrative screen behavior (UI test oracle) |
| `PROJECT_SCOPE.md` | Product boundary |
| `EMAIL_QA_REPORT.md` | Dual-channel email acceptance evidence |
| Isolation script | Tenancy acceptance **(FR-055)** |

### 11.1 Page → primary FR map

| Page | Primary FRs |
|---|---|
| `/` | FR-010 |
| `/login` | FR-011–FR-015, FR-019 |
| `/reset-password` | FR-016 |
| `/invite/:token` | FR-021 |
| `/onboarding` | FR-022, FR-210, FR-212 |
| `/admin` | FR-060 |
| `/admin/jobs*` | FR-090–FR-107 |
| `/admin/estimates*` | FR-110–FR-117 |
| `/admin/calendar` | FR-120, FR-122 |
| `/admin/dispatch` | FR-121, FR-122 |
| `/admin/customers*` | FR-070–FR-085 |
| `/admin/workers` | FR-140–FR-145 |
| `/admin/inventory` | FR-150–FR-154 |
| `/admin/invoices` | FR-130–FR-136 |
| `/admin/chat` | FR-170–FR-172 |
| `/admin/communications` | FR-160–FR-166 |
| `/admin/documents` | FR-180–FR-181 |
| `/admin/agreements` | FR-182 |
| `/admin/templates` | FR-183 |
| `/admin/reports` | FR-190 |
| `/admin/settings` | FR-210–FR-215, FR-220–FR-225 |
| `/admin/notifications` | FR-200–FR-203 |
| `/worker*` | FR-240–FR-244 |
| `/super-admin*` | FR-250–FR-256 |

---

## 12. Document history

| Version | Date | Notes |
|---|---|---|
| 1.0 | 19 Aug 2026 | Initial as-built SRF |
| 2.0 | 20 Aug 2026 | Full page/activity catalog (PG-xxx); dual email channels; onboarding & reset-password; template types; updated FR-095/098/107/117/136/165/183/212/225/270–274 |
