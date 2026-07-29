# Setting up real email delivery (Gmail SMTP)

Taskly's transactional emails — account email verification and workspace
invitations — are both sent through Gmail's SMTP servers using
[Nodemailer](https://nodemailer.com), the same infrastructure for both.
Without any configuration, these "emails" are just logged to the backend
console (with the link) so the app is fully usable in local dev without an
email account. This doc covers turning on **real delivery**.

The integration itself needs zero code changes to go live — set the
environment variables below and restart the backend.

## 1. Create a Gmail App Password

Gmail SMTP requires an **App Password**, not your normal account password —
and App Passwords require **2-Step Verification** to be turned on for the
account first.

1. Turn on 2-Step Verification: https://myaccount.google.com/signinoptions/two-step-verification
2. Generate an App Password: https://myaccount.google.com/apppasswords
   - Name it something like `taskly-backend`.
   - Copy the 16-character password (shown with spaces, e.g. `abcd efgh
     ijkl mnop`) — Google only shows it once.

A dedicated Gmail account for sending (rather than a personal inbox) is
recommended for production.

## 2. Configure environment variables

In `backend/.env` (see `backend/.env.example` for the full list):

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-address@gmail.com
SMTP_PASS="abcd efgh ijkl mnop"   # the 16-character App Password
SMTP_FROM="Taskly <your-address@gmail.com>"
APP_URL=https://your-frontend-domain.com   # used to build links inside emails
```

- Any of the `SMTP_*` vars missing → the backend logs verification/invitation
  emails to the console instead of sending them. This is intentional
  dev-mode behavior, not a bug — see `backend/src/utils/email.ts`.
- `SMTP_PORT=587` with `SMTP_SECURE=false` uses STARTTLS, Gmail's standard
  submission port — this is the combination to use. `SMTP_PORT=465` would
  need `SMTP_SECURE=true` instead (implicit TLS) if you ever switch to it.
- `APP_URL` is used to build links inside emails (e.g.
  `${APP_URL}/verify-email?token=...`, `${APP_URL}/invite/<token>`). Point it
  at wherever the frontend is actually reachable (e.g. `http://localhost:5173`
  locally, your real domain in production).

Restart `npm run dev` (or your deployed process) after changing `.env`.

## 3. Test delivery

**Email verification:**
1. Register a new account with a real email address.
2. Taskly responds with "check your email" instead of signing you in —
   accounts can't sign in until verified.
3. Click the link in the verification email; it opens `/verify-email` in the
   app, confirms verification, and a "you're verified" email follows.
4. Sign in — it now succeeds.
5. If the link expired (24h) or was never received, use "Resend verification
   email" on the sign-in screen or `/resend-verification`.

**Invitations:**
1. Sign in to Taskly, go to **Team**, and invite a real email address you can
   check (your own is fine).
2. Watch the backend logs if nothing arrives — a missing `SMTP_*` var logs a
   warning at startup (`[email] SMTP_HOST/SMTP_USER/SMTP_PASS are not fully
   set...`).
3. Check the recipient's inbox (and spam folder).
4. Click the link — it opens `/invite/<token>`, which signs an existing
   account straight into the workspace, or sends a new signup to
   registration (email prefilled) and joins them automatically once they
   verify and log in.
5. Once accepted, the original inviter receives an "invitation accepted"
   email.

## How the integration is built

- `backend/src/utils/email.ts` — a single Nodemailer transporter built from
  `SMTP_HOST/PORT/SECURE/USER/PASS`, plus four templates sharing a common
  branded HTML shell: `sendVerificationEmail`, `sendVerificationSuccessEmail`,
  `sendInvitationEmail`, `sendInvitationAcceptedEmail`. When SMTP isn't fully
  configured, emails are logged to the console (with the link) instead of
  thrown as errors, so a missing/misconfigured mailer never breaks
  registration or invitation flows themselves.
- `backend/src/features/auth/authController.ts` — `register()` creates the
  account unverified and generates a `verificationToken` (24h expiry)
  instead of issuing a session. `verifyEmail()` is deliberately idempotent
  (doesn't null the token on success) so it survives double-fires and
  email-client link prefetching. `resendVerification()` always returns the
  same generic message regardless of whether the account exists, to avoid
  leaking which emails are registered. `login()` 403s with
  `emailNotVerified: true` until the account is verified.
- `backend/src/features/invitations/invitationController.ts` — unchanged
  logic from before (single-use tokens, 7-day expiry, duplicate-invite and
  existing-member checks, resend/cancel), now also emails the original
  inviter when their invitation is accepted.
- `POST /api/auth/verify-email`, `POST /api/auth/resend-verification`,
  `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/invitations`,
  and `POST /api/invitations/:id/resend` are all rate limited (see
  `backend/src/middleware/rateLimit.ts`) to prevent spam/abuse.
- Recipients who already have a Taskly account and have turned off "Send me
  workspace invitation emails" in Settings → Notification preferences are
  skipped for the email (they still get the in-app notification).

## Production notes

Gmail SMTP has modest sending limits (roughly 500/day for a regular
account, more for Google Workspace) and isn't designed as a bulk
transactional mail provider — deliverability and rate limits can become a
problem at real scale. It's a solid fit for a personal project or small
team; if volume grows, consider migrating `utils/email.ts` to a dedicated
transactional provider (Resend, SES, Postmark, SendGrid) — only that one
file needs to change, since it fully owns the templates and the "send or
log" fallback.
