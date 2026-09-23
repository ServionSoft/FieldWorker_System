# FieldPro — Frontend

Vite + React + TypeScript SPA for FieldPro, a multi-tenant field-service CRM (office portal, field-worker portal, and Super Admin).

The UI talks to the API over HTTP and WebSocket only. Backend docs: [`backend/README.md`](./backend/README.md).

## Stack

- **Vite 5** + **React 18** + **TypeScript**
- **React Router** for routing
- **TanStack Query** for server state
- **Zustand** for session / app store
- **Tailwind CSS** + **shadcn/ui** (Radix)
- **Socket.IO client** for chat / realtime
- **Zod** + React Hook Form for validation

## Prerequisites

- Node.js **20+**
- Backend API running (see [`backend/README.md`](./backend/README.md))

## Setup

```bash
# from repo root
npm install
```

Create a root `.env` (or copy from your local config):

```env
VITE_API_URL=http://localhost:4100/api
```

Use the same host/port as the backend `PORT` (default **4100** so it does not collide with other local APIs on 4000).

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Dev server at **http://localhost:8080** |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview the production build |
| `npm run lint` | ESLint |

## Project structure

```
src/
  pages/          Routes (public, admin, worker, super-admin)
  components/     UI + CRM components
  hooks/          Shared hooks (FieldPro data, unsaved guard, …)
  lib/            API client, form validation, utils
  store/          Zustand app store (auth session, hydrate)
  assets/         Static assets imported by the app
public/           Favicon, marketing images, robots.txt
```

## Portals & main routes

| Area | Base path | Who |
|------|-----------|-----|
| Marketing / login | `/`, `/login` | Public |
| Onboarding | `/onboarding` | New company owners |
| Office | `/admin/*` | Owner, admin, dispatcher, office |
| Field worker | `/worker/*` | Field workers |
| Super Admin | `/super-admin/*` | Platform admins |
| Invite / reset | `/invite/:token`, `/reset-password` | Public token flows |

Office modules include jobs, estimates, customers, workers, calendar, dispatch, inventory, invoices, chat, communications, documents, agreements, templates, reports, and settings.

## Auth

Tokens are stored in `localStorage`:

- `fp_access` — short-lived access JWT
- `fp_refresh` — refresh JWT

The API client in `src/lib/api.ts` attaches the access token and refreshes on 401 when possible.

## Local seed

Requires a local seeded database (see backend README). **Do not seed production.**

Password: **`demo123`**

| Role | Email |
|------|-------|
| Super admin | `platform@fieldpro.local` |

## Local development checklist

1. Start PostgreSQL and the backend (`cd backend && npm run dev`).
2. Confirm `GET /health` on the API.
3. Set `VITE_API_URL` to `http://localhost:<PORT>/api`.
4. From repo root: `npm run dev` → open **http://localhost:8080**.

## Related docs

- [`backend/README.md`](./backend/README.md) — API setup, env, migrate/seed
- [`FUNCTIONALITY.md`](./FUNCTIONALITY.md) — product behavior overview
- [`SRF.md`](./SRF.md) — software requirements
- [`TESTING_REPORT.md`](./TESTING_REPORT.md) — QA / automation report
