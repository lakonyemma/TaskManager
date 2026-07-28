# Push Notification Reminder System

Taskly reminds users about upcoming task due dates using real Web Push
notifications, delivered through a service worker so they arrive even when
the Taskly tab is closed, the browser is backgrounded, or the user is on a
different site. This document covers the architecture, data model, APIs,
setup, and how to test it.

## Architecture overview

```
 Task created/edited (dueDate + assignee)
        │
        ▼
 reminderService.syncTaskReminders()
        │  creates ReminderSchedule rows (status=PENDING)
        ▼
 reminderWorker (polls every REMINDER_POLL_INTERVAL_MS, default 30s)
        │  remindAt <= now?
        ├─► creates in-app Notification (Notification Center)
        └─► sendPushToUser() → web-push → browser Push Service
                                              │
                                              ▼
                                   Service Worker (public/sw.js)
                                     'push' event
                                        ├─► self.registration.showNotification()
                                        └─► postMessage() to any open tab → in-app toast
                                     'notificationclick' event
                                        ├─ View     → focus/open /app/tasks
                                        ├─ Complete → PATCH /api/tasks/:id { status: COMPLETED }
                                        └─ Snooze   → POST /api/reminders/:id/snooze
```

The service worker makes its own authenticated fetches (for Mark Complete /
Snooze) even with no Taskly tab open, using an access token mirrored into
IndexedDB by the page (`frontend/src/lib/swAuthSync.ts`) — a service worker
has no access to `localStorage`.

## Data model (Prisma)

| Model                     | Purpose                                                                 |
| -------------------------- | ------------------------------------------------------------------------ |
| `PushSubscription`          | One row per browser/device a user granted push permission on. Keyed by the browser's unique `endpoint`. |
| `NotificationPreference`   | Per-user: `pushEnabled`, `soundEnabled`, `vibrationEnabled`, `defaultReminderMinutes[]`. |
| `ReminderSchedule`         | One row per scheduled reminder (`offsetMinutes` + `remindAt`, or a fully custom `remindAt`). Status: `PENDING → SENT` / `CANCELLED` / `SNOOZED`. |
| `Notification` (existing) | Extended with `reminderScheduleId` so Notification Center entries trace back to the reminder that created them. |

Migration: `backend/prisma/migrations/20260727120000_add_push_notification_system`.

## Reminder lifecycle

`backend/src/features/reminders/reminderService.ts` owns scheduling:

- **Create** (`POST /api/tasks`) — if the new task has a `dueDate` and
  `assignedToId`, reminders are created from `reminderOffsets` (minutes
  before due, e.g. `[5,10,15,30,60,1440]`) and/or `customReminderTimes`
  (absolute ISO timestamps) in the request body, falling back to the
  assignee's `defaultReminderMinutes` preference when omitted.
- **Edit** (`PATCH /api/tasks/:id`) — reminders are resynced whenever
  `dueDate`, `assignedToId`, or reminder fields are explicitly sent. An
  edit that only touches `dueDate` preserves the previously-selected
  offsets and recomputes `remindAt` against the new due date; explicit
  custom absolute times are only replaced when resent.
- **Complete** — transitioning a task to `COMPLETED` cancels all pending
  reminders. Reopening a completed task with a future due date reschedules
  them.
- **Delete** — `ReminderSchedule` rows cascade-delete with the task.
- **Snooze** — `POST /api/reminders/:id/snooze` (also used by the "Snooze"
  push action) resolves the original reminder and creates a new one
  `minutes` (default 10) from now.
- Reminders whose `remindAt` would already be in the past are simply not
  created (no backlog of instantly-firing reminders on old tasks).

`backend/src/features/reminders/reminderWorker.ts` polls for due reminders
(`status=PENDING AND remindAt <= now`) every `REMINDER_POLL_INTERVAL_MS`
(default 30000ms — matches the rest of this codebase's lack of a job-queue
dependency, see `backend/src/utils/plan.ts`), writes the in-app
`Notification`, and pushes to every subscribed device via `utils/push.ts`.

## APIs

All endpoints require `Authorization: Bearer <token>` and are scoped to the
authenticated user — a user can only manage their own subscriptions,
preferences, and reminders, and only ever receives reminders for tasks they
are assigned.

| Method & path                          | Purpose |
| --------------------------------------- | ------- |
| `GET /api/push/vapid-public-key`        | Returns the VAPID public key for `pushManager.subscribe`. |
| `POST /api/push/subscribe`              | Upserts a `PushSubscription` for the caller (by `endpoint`). |
| `POST /api/push/unsubscribe`            | Removes the caller's subscription for a given `endpoint`. |
| `POST /api/push/test`                   | Sends a test push to all of the caller's subscriptions. |
| `GET /api/reminders/options`            | The 6 preset reminder intervals. |
| `GET /api/reminders/task/:taskId`       | Active reminders for a task (membership-checked). |
| `POST /api/reminders/:id/snooze`        | Snooze a reminder (`{ minutes }`, default 10, owner-only). |
| `DELETE /api/reminders/:id`             | Cancel a reminder (owner-only). |
| `GET /api/settings/notification-preferences`   | Read the caller's preferences (auto-created on first read). |
| `PATCH /api/settings/notification-preferences` | Update `pushEnabled` / `soundEnabled` / `vibrationEnabled` / `defaultReminderMinutes`. |
| `GET /api/notifications`                | Notification Center feed (now includes `task: { id, title, status }`). |

Task create/update (`POST /api/tasks`, `PATCH /api/tasks/:id`) additionally
accept `reminderOffsets: number[]` and `customReminderTimes: string[]` (ISO).

## Frontend

- `frontend/public/sw.js` — the service worker. Handles `push`,
  `notificationclick` (view/complete/snooze actions), and
  `pushsubscriptionchange` (auto-resubscribes if the push service rotates
  the subscription).
- `frontend/public/icons/notification-icon.svg` /
  `notification-badge.svg` — branded notification icons.
- `frontend/src/lib/push.ts` — `subscribeToPush()`,
  `unsubscribeFromPush()`, `sendTestPush()`, and
  `onServiceWorkerMessage()` for bridging push events back into the app as
  in-app toasts while a tab is open and focused.
- `frontend/src/lib/swAuthSync.ts` — mirrors the current access token into
  IndexedDB so the service worker can act on its own.
- `frontend/src/lib/reminders.ts` — the shared reminder-offset constants
  used by both the task form and the Notifications/Settings pages.
- `frontend/src/pages/DashboardApp.tsx` — requests notification permission
  once after login, renders the notification bell + dropdown, the full
  **Notifications** page (task name, message, read/unread status,
  timestamp), the **Settings → Push notifications** panel (enable/disable
  push, sound, vibration, default reminder times, send-test-notification),
  reminder-offset pickers on task creation, and the toast stack.
- `frontend/src/components/TaskDetailPanel.tsx` — per-task reminder
  management: toggle preset offsets, add a custom reminder, snooze/cancel
  individual reminders.

## Setup

1. Generate a VAPID keypair once per environment:
   ```bash
   cd backend && npx web-push generate-vapid-keys
   ```
2. Set in `backend/.env`:
   ```
   VAPID_PUBLIC_KEY=...
   VAPID_PRIVATE_KEY=...
   VAPID_SUBJECT=mailto:you@example.com
   REMINDER_POLL_INTERVAL_MS=30000
   ```
3. (Optional) set `VITE_VAPID_PUBLIC_KEY` in `frontend/.env` as a fallback —
   the app normally fetches the public key from the API at runtime, so this
   is only used if that request can't be made yet.
4. Run the migration (already applied in this repo):
   `npx prisma migrate deploy` (or `migrate dev` locally).
5. `npm run dev` in both `backend/` and `frontend/`. The reminder worker
   starts automatically with the server.

Without `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` set, push sends are skipped
(logged once at boot) but in-app notifications keep working — the same
graceful-degradation pattern already used for `RESEND_API_KEY`.

## Testing performed

- **Backend, scripted end-to-end** (register → login → create workspace →
  fetch VAPID key → subscribe → set preferences → create task with
  reminders → verify `ReminderSchedule` rows → edit due date and confirm
  offsets are preserved/recomputed → verify a status-only `PATCH` no
  longer nulls `assignedToId`/`dueDate` (a pre-existing bug this feature
  surfaced and fixed) → snooze → complete task and confirm reminders are
  cancelled → test-push against a subscription with a real-shaped key,
  confirmed a real 404 from Google's FCM correctly prunes the stale
  subscription).
- `npx tsc --noEmit` (backend) and `npx tsc -b` (frontend): clean.
- `npm run lint` (frontend): no new errors (pre-existing unrelated error in
  `BillingPanel.tsx` from prior work, not touched by this feature).
- `npm run build` (frontend): production build succeeds; `sw.js` and
  `icons/` are copied into `dist/` as static assets.
- `node --check public/sw.js`: valid syntax.

**Not tested here** (no GUI browser available in this environment): the
actual notification permission prompt, a live push notification arriving
in a real browser with the tab closed/backgrounded, clicking the
View/Complete/Snooze action buttons in an OS notification, and
sound/vibration playback. The API and scheduling logic those depend on are
covered above — verifying the browser-side behavior needs a manual pass
in an actual browser (Chrome/Edge/Firefox on desktop, or Chrome on
Android — iOS Safari requires the app be added to the home screen for Web
Push to work at all, a platform limitation, not a Taskly one).

### Manual browser test checklist

1. Log in — a permission prompt should appear once; accept it.
2. Settings → Push notifications → "Send test notification" — a system
   notification should appear immediately.
3. Create a task due ~2 minutes from now with the "5 minutes before"
   reminder unchecked and a custom reminder time ~30s out; confirm it
   fires (poll interval is 30s, so allow up to that long).
4. Minimize the browser / switch tabs — confirm the reminder still
   arrives as an OS notification.
5. Close the Taskly tab entirely (keep the browser open) — confirm the
   reminder still arrives.
6. Click "Mark Complete" on the notification — confirm the task's status
   updates and no further reminders fire for it.
7. Click "Snooze" on another reminder — confirm a new one fires ~10
   minutes later.
8. With Taskly open and focused, trigger a push (e.g. "Send test
   notification") — confirm an in-app toast also appears.
