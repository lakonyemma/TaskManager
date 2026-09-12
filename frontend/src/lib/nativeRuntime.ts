import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { Network } from '@capacitor/network'

const CHANNEL_ID = 'taskly-reminders'
let listenersInstalled = false

type ReminderTask = {
  id: string
  title: string
  dueDate?: string | null
}

type WaitingItem = {
  id: string
  title: string
  followUpAt?: string | null
}

export const isNativeTaskly = () => Capacitor.isNativePlatform()

const hashId = (value: string, salt = 0) => {
  let hash = 2166136261 ^ salt
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash % 1_900_000_000) + 10_000
}

const safeNotificationTime = (value: string, offsetMinutes = 0) => {
  const raw = new Date(value)
  if (Number.isNaN(raw.getTime())) return null
  const at = new Date(raw.getTime() - offsetMinutes * 60_000)
  const minimum = Date.now() + 8_000
  if (at.getTime() < minimum) at.setTime(minimum)
  return at
}

export const ensureNativeNotificationPermission = async () => {
  if (!isNativeTaskly()) return false
  try {
    let permission = await LocalNotifications.checkPermissions()
    if (permission.display !== 'granted') permission = await LocalNotifications.requestPermissions()
    if (permission.display !== 'granted') return false

    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Task reminders',
      description: 'Taskly deadlines, next actions and follow-up reminders',
      importance: 5,
      vibration: true,
      lights: true,
    })
    return true
  } catch {
    // An older Taskly shell may not have the native plugin yet. The existing
    // web-push path remains active, so this must never break the web app.
    return false
  }
}

export const scheduleNativeExecutionNotifications = async ({
  nextAction,
  waiting,
}: {
  nextAction?: ReminderTask | null
  waiting: WaitingItem[]
}) => {
  if (!isNativeTaskly()) return
  const permitted = await ensureNativeNotificationPermission()
  if (!permitted) return

  try {
    const pending = await LocalNotifications.getPending()
    if (pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map((item) => ({ id: item.id })) })
    }

    const notifications: Array<{
      id: number
      title: string
      body: string
      schedule: { at: Date; allowWhileIdle: boolean }
      channelId: string
      extra: { url: string; taskId: string }
    }> = []

    if (nextAction?.dueDate) {
      const at = safeNotificationTime(nextAction.dueDate, 30)
      if (at && at.getTime() <= Date.now() + 7 * 24 * 60 * 60 * 1000) {
        notifications.push({
          id: hashId(nextAction.id, 11),
          title: 'Your next Taskly action',
          body: `${nextAction.title} is due soon. Start it now while it is still manageable.`,
          schedule: { at, allowWhileIdle: true },
          channelId: CHANNEL_ID,
          extra: { url: '/app/execution', taskId: nextAction.id },
        })
      }
    }

    for (const item of waiting.slice(0, 20)) {
      if (!item.followUpAt) continue
      const at = safeNotificationTime(item.followUpAt)
      if (!at || at.getTime() > Date.now() + 30 * 24 * 60 * 60 * 1000) continue
      notifications.push({
        id: hashId(item.id, 29),
        title: 'Taskly follow-up',
        body: `Follow up: ${item.title}`,
        schedule: { at, allowWhileIdle: true },
        channelId: CHANNEL_ID,
        extra: { url: '/app/execution', taskId: item.id },
      })
    }

    if (notifications.length) await LocalNotifications.schedule({ notifications })
  } catch {
    // Web push/reminder schedules are the fallback on browsers and old shells.
  }
}

export const getNativeAppVersion = async (): Promise<string | null> => {
  if (!isNativeTaskly()) return null
  try {
    const info = await App.getInfo()
    return info.version
  } catch {
    return null
  }
}

export const getNetworkState = async () => {
  if (!isNativeTaskly()) return { connected: navigator.onLine, connectionType: 'unknown' }
  try {
    return await Network.getStatus()
  } catch {
    return { connected: navigator.onLine, connectionType: 'unknown' }
  }
}

export const openExternalUrl = async (url: string) => {
  if (isNativeTaskly()) {
    try {
      await Browser.open({ url })
      return
    } catch {
      // Fall through to normal browser navigation on older shells.
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

export const installNativeRuntimeListeners = async () => {
  if (!isNativeTaskly() || listenersInstalled) return
  listenersInstalled = true
  try {
    await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      const url = typeof event.notification.extra?.url === 'string' ? event.notification.extra.url : '/app/execution'
      window.location.assign(url)
    })
  } catch {
    // Native notification plugin not available in an older shell.
  }
}
