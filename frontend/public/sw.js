// Taskly service worker — handles Web Push delivery while the app is
// closed/backgrounded, plus the action buttons on a delivered notification.
// Plain classic-script JS (not an ES module) so it needs no build step and
// works from a static /sw.js registration.

const DB_NAME = 'taskly-sw';
const STORE_NAME = 'kv';
const TOKEN_KEY = 'accessToken';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getToken() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(TOKEN_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

// Authenticated fetch the SW can make on its own, independent of any open
// tab — needed so "Mark Complete" / "Snooze" work even when Taskly's tab is
// closed. The access token is kept in sync here by the page (see
// lib/push.ts) since a service worker has no access to localStorage.
async function authFetch(url, options) {
  const token = await getToken();
  const headers = new Headers((options && options.headers) || {});
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, Object.assign({}, options, { headers }));
}

async function notifyClients(message) {
  const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  allClients.forEach((client) => client.postMessage(message));
}

function base64UrlToUint8Array(base64Url) {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function arrayBufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Fired whenever the push service delivers a message — this is what makes
// notifications work with the Taskly tab closed or the browser backgrounded.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Task Reminder', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Task Reminder';
  const body = payload.body || '';
  const wantsSound = payload.sound !== false;
  const wantsVibration = payload.vibrate !== false;

  const options = {
    body,
    icon: '/icons/notification-icon.svg',
    badge: '/icons/notification-badge.svg',
    tag: payload.tag || 'taskly-notification',
    renotify: true,
    // silent + no vibrate pattern is the closest the Notifications API gets
    // to letting the user opt out of sound/vibration independently — actual
    // sound playback otherwise follows the OS/browser notification settings.
    silent: !wantsSound && !wantsVibration,
    vibrate: wantsVibration ? [200, 100, 200] : undefined,
    data: {
      url: payload.url || '/app/tasks',
      taskId: payload.taskId || null,
      reminderId: payload.reminderId || null,
      notificationId: payload.notificationId || null,
    },
    actions: payload.actions || [
      { action: 'view', title: 'View Task' },
      { action: 'complete', title: 'Mark Complete' },
      { action: 'snooze', title: 'Snooze' },
    ],
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // Also tell any open tab so it can show an in-app toast instead of
      // (or in addition to) the OS notification while Taskly is focused.
      notifyClients({ type: 'PUSH_RECEIVED', title, body, data: options.data }),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const data = notification.data || {};
  const action = event.action;
  notification.close();

  event.waitUntil(
    (async () => {
      if (action === 'complete' && data.taskId) {
        try {
          await authFetch(`/api/tasks/${data.taskId}`, { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED' }) });
          await notifyClients({ type: 'TASK_COMPLETED', taskId: data.taskId });
          await self.registration.showNotification('Task Reminder', {
            body: 'Task marked complete.',
            icon: '/icons/notification-icon.svg',
            tag: notification.tag,
          });
        } catch (err) {
          console.error('[sw] Failed to mark task complete', err);
        }
        return;
      }

      if (action === 'snooze' && data.reminderId) {
        try {
          await authFetch(`/api/reminders/${data.reminderId}/snooze`, { method: 'POST', body: JSON.stringify({ minutes: 10 }) });
          await notifyClients({ type: 'REMINDER_SNOOZED', reminderId: data.reminderId });
          await self.registration.showNotification('Task Reminder', {
            body: "We'll remind you again in 10 minutes.",
            icon: '/icons/notification-icon.svg',
            tag: notification.tag,
          });
        } catch (err) {
          console.error('[sw] Failed to snooze reminder', err);
        }
        return;
      }

      // Default click (or the "View Task" action) — focus an existing tab if
      // one is open, otherwise open a new one at the task.
      const targetUrl = data.url || '/app/tasks';
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        if ('focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url: targetUrl });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })(),
  );
});

// The push service can invalidate a subscription (key rotation, browser
// housekeeping) without the page being open to notice — resubscribe here so
// delivery doesn't silently die until the user happens to revisit Taskly.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const oldKey = event.oldSubscription && event.oldSubscription.options
          ? event.oldSubscription.options.applicationServerKey
          : null;
        const keyResponse = await authFetch('/api/push/vapid-public-key');
        const keyData = oldKey ? null : await keyResponse.json().catch(() => null);
        const applicationServerKey = oldKey || (keyData && keyData.publicKey ? base64UrlToUint8Array(keyData.publicKey) : undefined);

        const subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });

        await authFetch('/api/push/subscribe', {
          method: 'POST',
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            keys: {
              p256dh: arrayBufferToBase64Url(subscription.getKey('p256dh')),
              auth: arrayBufferToBase64Url(subscription.getKey('auth')),
            },
            userAgent: self.navigator ? self.navigator.userAgent : undefined,
          }),
        });
      } catch (err) {
        console.error('[sw] Failed to resubscribe after pushsubscriptionchange', err);
      }
    })(),
  );
});
