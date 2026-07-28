import { authFetch } from './api'

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export const isPushSupported = (): boolean =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export const getNotificationPermission = (): NotificationPermission | 'unsupported' =>
  isPushSupported() ? Notification.permission : 'unsupported'

export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!isPushSupported()) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch (err) {
    console.error('Service worker registration failed', err)
    return null
  }
}

// Requests notification permission (if not already decided) and subscribes
// this browser to Web Push, saving the subscription server-side. Safe to
// call repeatedly — it reuses an existing subscription when one exists.
export const subscribeToPush = async (): Promise<boolean> => {
  if (!isPushSupported()) return false

  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (permission !== 'granted') return false

  const registration = await registerServiceWorker()
  if (!registration) return false
  await navigator.serviceWorker.ready

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    const keyData = await authFetch('/api/push/vapid-public-key') as { publicKey: string; configured: boolean }
    if (!keyData.publicKey) return false
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyData.publicKey) as unknown as BufferSource,
    })
  }

  const json = subscription.toJSON()
  await authFetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent }),
  })
  return true
}

export const unsubscribeFromPush = async (): Promise<void> => {
  if (!isPushSupported()) return
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  await authFetch('/api/push/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  }).catch(() => { /* best-effort — the local unsubscribe already succeeded */ })
}

export const sendTestPush = (): Promise<unknown> => authFetch('/api/push/test', { method: 'POST' })

export type ServiceWorkerMessage =
  | { type: 'PUSH_RECEIVED'; title: string; body: string; data?: { taskId?: string | null; url?: string } }
  | { type: 'NAVIGATE'; url: string }
  | { type: 'TASK_COMPLETED'; taskId: string }
  | { type: 'REMINDER_SNOOZED'; reminderId: string }

// Push events land in the service worker even when Taskly is open in a
// focused tab — this bridges them back to the page so it can show an
// in-app toast (requirement: toast when the app is open) instead of relying
// solely on the OS-level notification.
export const onServiceWorkerMessage = (handler: (msg: ServiceWorkerMessage) => void): (() => void) => {
  if (!('serviceWorker' in navigator)) return () => {}
  const listener = (event: MessageEvent) => handler(event.data as ServiceWorkerMessage)
  navigator.serviceWorker.addEventListener('message', listener)
  return () => navigator.serviceWorker.removeEventListener('message', listener)
}
