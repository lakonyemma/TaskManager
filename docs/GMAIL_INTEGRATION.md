# Taskly Gmail Personal Action Inbox

Taskly connects to Gmail with the minimum permission needed for monitoring:

`https://www.googleapis.com/auth/gmail.readonly`

The integration is personal to the authenticated Taskly user. Mail metadata is never workspace-visible until the user explicitly creates a Taskly task or Waiting For item.

## Google Cloud setup

Use the same Google Cloud project as Command Center if desired, but create a **Web application** OAuth client for the Taskly backend.

Authorized redirect URI:

`https://taskly-api-wws3.onrender.com/api/mail/google/callback`

Add Taskly's production domain to the OAuth consent screen as appropriate:

`https://taskly-app.pages.dev`

The consent screen privacy policy is:

`https://taskly-app.pages.dev/privacy`

## Required Render environment variables

- `GMAIL_OAUTH_CLIENT_ID` — Google Web OAuth client ID.
- `GMAIL_OAUTH_CLIENT_SECRET` — Google Web OAuth client secret.
- `GMAIL_OAUTH_REDIRECT_URI=https://taskly-api-wws3.onrender.com/api/mail/google/callback`
- `GMAIL_TOKEN_ENCRYPTION_KEY` — long random secret used for AES-256-GCM token encryption.
- `TASKLY_FRONTEND_URL=https://taskly-app.pages.dev`
- `GMAIL_MONITOR_POLL_INTERVAL_MS=600000` — optional; defaults to ten minutes.

`GMAIL_OAUTH_STATE_SECRET` is optional. If omitted, Taskly signs OAuth state with the Gmail token encryption key (then JWT secret as the final fallback).

## What Taskly stores

Taskly stores encrypted OAuth tokens and limited action metadata: message/thread IDs, counterparty, subject, Gmail snippet, received time, unread state, classification, confidence, detected deadline, and Taskly action status. Full Gmail message bodies and attachments are not intentionally persisted by this feature.

Disconnecting Gmail from Taskly removes the encrypted connection and all Taskly mail-action metadata. It does not modify Gmail itself.

## Monitoring behavior

The monitor excludes Promotions, Social, Spam, and Trash from incoming action detection. It looks for clear requests and deadline language, and separately checks recent Sent threads. A sent thread becomes `WAITING_REPLY` only when its latest message is still from the Taskly user after the configured follow-up period. When a reply arrives, the open Waiting Reply signal is automatically completed.
