# FieldPro — Backend

Express + TypeScript API for FieldPro. Multi-tenant field-service platform with PostgreSQL Row-Level Security (RLS), JWT auth, file uploads, chat (Socket.IO), and optional Twilio / Stripe integrations.

Frontend docs: [`../README.md`](../README.md).

## Stack

- **Node.js** + **Express** + **TypeScript** (`tsx` in development)
- **PostgreSQL** with tenant RLS (`app.current_company_id`)
- **JWT** access + refresh tokens (Argon2 password hashing)
- **Socket.IO** for realtime chat
- **Multer** for local file uploads
- **Zod** for request validation
- Optional: **Twilio** (SMS), **Stripe** (billing), **Nodemailer** (tenant SMTP)

## Prerequisites

- Node.js **20+**
- PostgreSQL **14+** (user that can create databases / roles)

## Setup

```bash
cd backend
cp .env.example .env
# edit .env — set DATABASE_URL / APP_DATABASE_URL passwords and secrets
npm install
npm run migrate   # creates DB, app role, schema, RLS
npm run seed      # demo companies, users, sample CRM data
npm run dev       # default http://localhost:4100
```

Health check:

```bash
curl http://localhost:4100/health
# → { "status": "ok" }
```

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Watch mode (`tsx watch src/index.ts`) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled `dist/index.js` |
| `npm run migrate` | Apply schema / migrations |
| `npm run seed` | Seed demo data (password: `demo123`) |

## Environment

Copy from `.env.example`. Important variables:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Admin/migrate connection (can create DB/roles) |
| `APP_DATABASE_URL` | Runtime app role connection (RLS) |
| `PORT` | API port (default `4100`) |
| `CORS_ORIGIN` | SPA origin(s), comma-separated (default `http://localhost:8080,http://127.0.0.1:8080`) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Signing secrets |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | Token lifetimes |
| `FILE_LOCAL_DIR` | Upload directory (default `./uploads`) |
| `APP_PUBLIC_URL` | Frontend URL (invites, links) |
| `TWILIO_*` | SMS (optional) |
| `STRIPE_*` | Billing (optional) |
| `SETTINGS_ENCRYPTION_KEY` | Encrypts sensitive company settings |

Match the frontend `VITE_API_URL` to this `PORT` (e.g. `http://localhost:4100/api`).

## Project structure

```
src/
  index.ts          HTTP + Socket.IO bootstrap
  config/           Env loading
  db/               Pool, migrate, seed
  middleware/       Auth, errors, tenancy helpers
  modules/          Route modules by domain
  realtime/         Chat / event bus
  services/         Shared services (email, …)
  utils/            Helpers
uploads/            Local files per company (`{company_id}/…`)
```

## API surface (prefix `/api`)

| Mount | Domain |
|-------|--------|
| `/api/auth` | Login, register, refresh, password reset |
| `/api/profile` | Current user profile |
| `/api/plans` | Public plan catalog |
| `/api/invites` | Accept invite (public) |
| `/api/members` | Team members & invites |
| `/api/billing` | Subscription / Stripe checkout |
| `/api/customers` | Customers, contacts, addresses |
| `/api/follow-ups` | Follow-ups |
| `/api/workers` | Field workers |
| `/api/jobs` | Jobs, status, assignees, line items, invoice |
| `/api/estimates` | Estimates & convert-to-job |
| `/api/invoices` | Invoices |
| `/api/inventory` | Inventory |
| `/api/files` / `/api/documents` | Uploads & documents |
| `/api/agreements` | Service agreements |
| `/api/templates` | Email templates |
| `/api/communications` | Comms log + Twilio webhooks |
| `/api/chat` | Chat rooms / messages |
| `/api/notifications` | In-app notifications |
| `/api/company` | Tenant company settings |
| `/api/platform` | Super Admin (companies, audit, …) |
| `/api` (ops/search) | Calendar, dispatch, search, reports |

Also: `GET /health` (no auth).

## Tenancy & security

- Company id always comes from the **JWT / session**, never from a client-supplied body field for authorization.
- Cross-tenant resource access returns **404** (not 403), to avoid leaking existence.
- RLS uses session GUCs such as `app.current_company_id` and `app.current_user_id`.
- Effective permissions (role + member overrides) are loaded into the session for RBAC checks.

## Demo accounts (after seed)

Password for all: **`demo123`**

| Role | Email |
|------|-------|
| Super admin | `marcus@fieldpro.io` |
| Mitchell Plumbing owner | `sarah@mitchell-plumbing.com` |
| Mitchell field worker | `jake@mitchell-plumbing.com` |

Additional tenants: SparkVolt Electrical, CoolBreeze HVAC, and more (see `src/db/seed.ts`).

## Optional integrations

- **Twilio** — set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`; webhook base via `TWILIO_WEBHOOK_BASE`
- **Stripe** — set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`; webhook at `/api/webhooks/stripe`
- **Tenant SMTP** — configured per company in Settings / onboarding (platform email used for invites, password reset, billing)

Without these keys, related features degrade gracefully (log / skip send) in development.

## Production notes

- Set strong unique `JWT_*` secrets and `SETTINGS_ENCRYPTION_KEY`
- Use `NODE_ENV=production`
- Serve uploads behind auth or a private object store if you move off `FILE_DRIVER=local`
- Point `CORS_ORIGIN` and `APP_PUBLIC_URL` at the real SPA origin
