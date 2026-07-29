# Setting up real email delivery (Resend)

Taskly's transactional emails — workspace invitations and account email
verification — are both sent through [Resend](https://resend.com) using the
same infrastructure. Without any configuration, these "emails" are just
logged to the backend console (with the link) so the app is fully usable in
local dev without an email account. This doc covers turning on **real
delivery**.

The integration itself needs zero code changes to go live — set the two
environment variables below and restart the backend.

## 1. Create a Resend account

1. Go to https://resend.com and sign up (free tier is enough for testing —
   100 emails/day, 3,000/month at the time of writing).
2. Verify your own email address to activate the account.

## 2. Get an API key

1. In the Resend dashboard, go to **API Keys** → **Create API Key**.
2. Name it something like `taskly-backend`. "Sending access" permission is
   enough; you don't need "Full access".
3. Copy the key (starts with `re_`) — Resend only shows it once.

## 3. Verify a sending domain (recommended for production)

Resend's shared `onboarding@resend.dev` sender works out of the box for
testing, but for production you should send from your own domain so emails
don't land in spam and so `EMAIL_FROM` can show your brand:

1. In Resend, go to **Domains** → **Add Domain** and enter your domain
   (e.g. `taskly.app`).
2. Resend gives you a handful of DNS records (SPF, DKIM, and optionally
   DMARC) — add them at your DNS provider.
3. Wait for Resend to show the domain as **Verified** (usually a few
   minutes, can take longer depending on DNS propagation).
4. Once verified, you can send from any address `@yourdomain.com`.

## 4. Configure environment variables

In `backend/.env` (see `backend/.env.example` for the full list):

```bash
RESEND_API_KEY=re_your_real_key_here
EMAIL_FROM="Taskly <onboarding@resend.dev>"   # or "Taskly <invites@yourdomain.com>" once verified
APP_URL=https://your-frontend-domain.com       # used to build the invitation accept link
```

- `RESEND_API_KEY` unset → the backend logs invitation emails to the console
  instead of sending them. This is intentional dev-mode behavior, not a bug —
  see `backend/src/utils/email.ts`.
- `APP_URL` is used to build the link inside the email
  (`${APP_URL}/register?invite=<token>`). Point it at wherever the frontend
  is actually reachable (e.g. `http://localhost:5173` locally, your real
  domain in production).

Restart `npm run dev` (or your deployed process) after changing `.env`.

## 5. Test delivery

**Invitations:**
1. Sign in to Taskly, go to **Team**, and invite a real email address you can
   check (your own is fine).
2. Watch the backend logs:
   - If you see `[email] RESEND_API_KEY is not set…`, the key isn't loaded —
     double check `.env` and that you restarted the process.
   - If there's no warning and no error, the email was handed to Resend.
3. Check the Resend dashboard's **Logs** tab — it shows every send attempt,
   including bounces/failures with the reason.
4. Check the recipient's inbox (and spam folder, especially before domain
   verification is complete).
5. Click the link in the email — it should open the registration page with
   the email prefilled and, after signing up, automatically join the
   workspace once the account is verified and signed in (see below).

**Email verification:**
1. Register a new account with a real email address.
2. Taskly responds with "check your email" instead of signing you in —
   accounts can't sign in until verified.
3. Click the link in the verification email; it opens `/verify-email` in the
   app, confirms verification, and lets you proceed to sign in.
4. If the link expired (24h) or was never received, use "Resend verification
   email" on the sign-in or registration confirmation screen.

## How the integration is built

- `backend/src/utils/email.ts` — `sendInvitationEmail()` and
  `sendVerificationEmail()`, sharing a common branded HTML shell. Uses the
  official `resend` npm package when `RESEND_API_KEY` is set; otherwise logs
  to the console. Errors from Resend are caught and logged, not thrown, so a
  transient email failure never breaks the invitation/registration flow
  itself (the underlying record is already created by then).
- `backend/src/features/invitations/invitationController.ts` — creates a
  cryptographically random single-use `token` (`crypto.randomUUID()`) with a
  7-day expiry, stored on `WorkspaceInvitation`. Tokens are validated,
  status-checked (`pending`/`accepted`/`expired`/`cancelled`), and consumed
  on accept. `POST /:id/resend` issues a fresh token/expiry and invalidates
  the old link. All of these actions are logged to `ActivityLog`.
- `backend/src/features/auth/authController.ts` — `register()` generates a
  `verificationToken` (`crypto.randomUUID()`, 24h expiry) instead of issuing a
  session. `verifyEmail()` looks the user up by token; success just flips
  `emailVerified`/`emailVerifiedAt` without clearing the token, which makes
  the endpoint safely idempotent against double-fires and email-client link
  prefetching. `resendVerification()` always returns the same generic
  message whether or not the account exists, to avoid leaking which emails
  are registered.
- `POST /api/invitations`, `POST /api/invitations/:id/resend`,
  `POST /api/auth/login`, `POST /api/auth/register`, and
  `POST /api/auth/resend-verification` are all rate limited (see
  `backend/src/middleware/rateLimit.ts`) to prevent spam/abuse.
- Recipients who already have a Taskly account and have turned off "Send me
  workspace invitation emails" in Settings → Notification preferences are
  skipped for the email (they still get the in-app notification).
