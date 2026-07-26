# BWAT.md

This file provides guidance to Bwat when working with code in this repository.

## Tech Stack

- **Backend**: Express.js + TypeScript (NodeNext modules), Prisma ORM + PostgreSQL, JWT auth (bcrypt), Resend for email
- **Frontend**: React 19 + TypeScript, Vite 8, React Router v7 (actually wired up via `<BrowserRouter>`)
- **No Tailwind CSS, no Redux** — frontend uses plain CSS and local component state / React Context only
- **No Zod** — controllers do manual field validation

## Brand Identity

Single design-token source: `frontend/src/styles/brand.css`.

- `--tm-bg: #060B23` (page background)
- `--tm-bg-soft: #0c1130` (panels/sidebar)
- `--tm-primary: #8B5CF6`, `--tm-secondary: #A855F7`, `--tm-accent: #C084FC`
- `--tm-card: rgba(255,255,255,0.05)`, `--tm-card-border: rgba(255,255,255,0.1)`
- Typography: `system-ui, 'Segoe UI', Roboto, sans-serif`

The authenticated dashboard additionally supports 9 user-selectable accent themes and 9 fonts (`[data-theme]` / `[data-font]` attributes on `<html>`, persisted per-user as `User.colorTheme` / `User.fontStyle`) — this is a personalization layer on top of the base brand palette, not a replacement for it.

## Architecture

**There is exactly one backend entrypoint and one route structure** — `src/server.ts` mounts feature-scoped routers from `src/features/*/`:

- `features/auth` → `/api/auth` (register, login, refresh, logout, logout-all, sessions, me, email verification)
- `features/workspaces` → `/api/workspaces` (CRUD, members, member role update/remove)
- `features/tasks` → `/api/tasks`
- `features/notifications` → `/api/notifications`
- `features/reports` → `/api/reports`
- `features/invitations` → `/api/invitations` (includes a public `/preview/:token` for prefilling the register page)
- `features/settings` → `/api/settings` (profile, password change)
- `features/activity` → `/api/activity` (read-only activity feed)

No legacy `app.ts` / `controllers/` / `routes/` directory exists — if you see references to those elsewhere (old docs, stale comments), they're wrong; ignore them.

**Frontend routing**: `<BrowserRouter>` in `main.tsx`, routes defined in `App.tsx`:
- `/` → `pages/LandingPage.tsx` (marketing page, public)
- `/login`, `/register` → `pages/LoginPage.tsx` / `RegisterPage.tsx` (public; redirect to `/app` if already authenticated)
- `/verify-email` → `pages/VerifyEmailPage.tsx` (public; reads `?token=`)
- `/app/*` → `pages/DashboardApp.tsx` (lazy-loaded to keep Recharts/FullCalendar out of the public bundle), wrapped in `components/ProtectedRoute.tsx` (redirects to `/login` if unauthenticated)

**Email verification**: registration no longer issues a session — `POST /api/auth/register` creates the user with `emailVerified: false`, emails a verification link, and returns just a confirmation message. `POST /api/auth/login` 403s with `{ emailNotVerified: true }` until `GET /api/auth/verify-email/:token` is hit. `POST /api/auth/resend-verification` reissues the token (generic response either way, so it can't be used to enumerate accounts). The `verifyEmail` handler is deliberately idempotent — it does NOT null the token after use — because a single "consume-once" GET breaks under React StrictMode's double-effect-invocation in dev and under corporate email scanners that prefetch links; repeat hits just no-op into "already verified". Pre-existing users (from before this feature) were backfilled as verified via the migration, not locked out.

A workspace invite accepted during registration can't be redeemed until the account is verified and logs in (no session exists yet at registration time) — the invite token is stashed via `setPendingInvite()`/`getPendingInvite()` in `lib/api.ts` and redeemed inside `AuthContext.login()` after a successful sign-in.

**Mobile navigation**: below 900px the sidebar becomes a fixed-position slide-in drawer (`.sidebar.open`, driven by `mobileNavOpen` state in `DashboardApp.tsx`), toggled by a hamburger button (`.mobile-menu-btn`) in the topbar, with a `.mobile-nav-backdrop` that closes it on tap. It mirrors the desktop sidebar exactly (same nav items/order) — no separate bottom-nav pattern.

Auth state lives in `context/AuthContext.tsx` (`AuthProvider` + the `AuthContext` object in `context/auth-context.ts`, consumed via `hooks/useAuth.ts` — split into separate files so `react-refresh/only-export-components` stays happy). `lib/api.ts` holds the token storage helpers and `authFetch`, which auto-refreshes the access token once on a 401 and throws `SessionExpiredError` if the refresh token itself is invalid/revoked.

**Sessions**: Refresh tokens are tracked server-side in the `Session` model (hashed token, user agent, IP, `revokedAt`). `/api/auth/refresh` checks the session hasn't been revoked, not just that the JWT verifies. This backs the Settings → "Active sessions" list, per-session revoke, and "log out of all devices".

**Prisma**: Client generated to `generated/prisma/` (custom output path, configured in `prisma.config.ts`). Uses `@prisma/adapter-pg`. Shadow-database creation is blocked for the local `taskmanager` Postgres role (no CREATEDB), so schema changes are applied with `prisma db push --accept-data-loss` in this environment rather than `prisma migrate dev`.

**Email**: `src/utils/email.ts` uses Resend if `RESEND_API_KEY` is set, otherwise logs the invitation link to the console (dev fallback). Never hardcode the key — it's read from `.env` (`.env.example` documents all vars).

**Activity logging**: Mutating endpoints call `createActivityLog()` from `src/utils/activity.ts`. `GET /api/activity` reads it back (workspace-scoped or all-of-current-user's-workspaces).

## Coding Conventions

- **Backend TS import extensions**: relative imports use `.js` (NodeNext + `"type": "module"`). Do not use `.ts`.
- **Auth pattern**: controllers cast `req` as `Request & { user?: { id: string; email: string } }`; always check it exists and 401 otherwise.
- **Error handling**: try/catch, `console.error(error)`, `{ message: "Server error" }` + 500. `shared/errorHandler.ts` is the catch-all fallback.
- **Response shape**: always a JSON object with a `message` and/or resource key — never a bare array/string.
- **Frontend**: plain CSS only. `App.css` for the dashboard shell, `styles/brand.css` for shared tokens, per-page CSS files (`LandingPage.css`, `AuthPages.css`) colocated with their component.
- **Frontend TypeScript**: `verbatimModuleSyntax` is on — use `import type { ... }` for type-only imports.

## Commands

```bash
# Backend (cd backend)
npm run dev              # tsx watch src/server.ts
npm run build             # tsc
npm run start              # node dist/server.js
npm run prisma:generate    # prisma generate
npm run prisma:migrate     # prisma migrate dev (requires CREATEDB on the db role for the shadow db)

# Frontend (cd frontend)
npm run dev          # vite dev server (port 5173, proxies /api to :5000)
npm run build        # tsc -b && vite build
npm run lint         # eslint
npm run preview      # vite preview
```

## Gotchas

- **`install.cmd`** at the project root is an unrelated "Antigravity CLI" (agy) installer — not part of TaskManager, don't touch it.
- **`test.js`** at the project root is an empty stub — no test suite exists yet.
- **JWT_SECRET**: falls back to an insecure dev default with a console warning if unset. Must be set in any non-local environment.
- **Avatar uploads**: the frontend Settings page can store a raw base64 data URL directly in `User.avatarUrl` (no file storage backend) — `express.json({ limit: '5mb' })` in `server.ts` accounts for this; don't shrink that limit without also fixing avatar upload to use real file storage.
