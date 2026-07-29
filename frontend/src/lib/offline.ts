// Offline-first task support: an IndexedDB cache of the last-seen tasks per
// workspace (so the list still renders with no network) plus an outbox of
// queued mutations (create/update/complete) made while offline, replayed in
// order once connectivity returns. Raw IndexedDB, no dependency — matches
// the hand-rolled IndexedDB already used in swAuthSync.ts for the same
// "no extra library needed" reason.

const DB_NAME = 'taskly-offline'
const DB_VERSION = 1
const TASKS_STORE = 'tasks'
const OUTBOX_STORE = 'outbox'

const openDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, DB_VERSION)
  req.onupgradeneeded = () => {
    const db = req.result
    if (!db.objectStoreNames.contains(TASKS_STORE)) db.createObjectStore(TASKS_STORE, { keyPath: 'id' })
    if (!db.objectStoreNames.contains(OUTBOX_STORE)) db.createObjectStore(OUTBOX_STORE, { keyPath: 'localId', autoIncrement: true })
  }
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})

export type OutboxMutation =
  | { type: 'create'; clientId: string; workspaceId: string; payload: Record<string, unknown> }
  | { type: 'update'; taskId: string; payload: Record<string, unknown> }

type OutboxEntry = OutboxMutation & { localId: number; createdAt: number }
type CachedTask = { id: string; workspaceId: string; [key: string]: unknown }

export const isOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine

// Replaces the cached snapshot for one workspace. Deletes-then-puts rather
// than put-only so tasks removed while online (deleted, or moved to another
// workspace) don't linger forever in the offline cache.
export const cacheTasks = async (workspaceId: string, tasks: CachedTask[]): Promise<void> => {
  try {
    const db = await openDb()
    const tx = db.transaction(TASKS_STORE, 'readwrite')
    const store = tx.objectStore(TASKS_STORE)
    const existing: CachedTask[] = await new Promise((resolve, reject) => {
      const req = store.getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error)
    })
    for (const t of existing) if (t.workspaceId === workspaceId) store.delete(t.id)
    for (const t of tasks) store.put(t)
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
  } catch { /* best-effort cache — offline viewing just won't have this workspace yet */ }
}

export const getCachedTasks = async (workspaceId: string): Promise<CachedTask[]> => {
  try {
    const db = await openDb()
    const tx = db.transaction(TASKS_STORE, 'readonly')
    const all: CachedTask[] = await new Promise((resolve, reject) => {
      const req = tx.objectStore(TASKS_STORE).getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error)
    })
    return all.filter((t) => t.workspaceId === workspaceId)
  } catch { return [] }
}

// Optimistic local updates so the UI reflects an offline change immediately,
// without waiting for sync.
export const upsertCachedTask = async (task: CachedTask): Promise<void> => {
  try {
    const db = await openDb()
    const tx = db.transaction(TASKS_STORE, 'readwrite')
    tx.objectStore(TASKS_STORE).put(task)
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
  } catch { /* ignore */ }
}

export const queueMutation = async (mutation: OutboxMutation): Promise<void> => {
  try {
    const db = await openDb()
    const tx = db.transaction(OUTBOX_STORE, 'readwrite')
    tx.objectStore(OUTBOX_STORE).add({ ...mutation, createdAt: Date.now() })
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
  } catch { /* ignore */ }
}

const getOutbox = async (): Promise<OutboxEntry[]> => {
  try {
    const db = await openDb()
    const tx = db.transaction(OUTBOX_STORE, 'readonly')
    return await new Promise((resolve, reject) => {
      const req = tx.objectStore(OUTBOX_STORE).getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error)
    })
  } catch { return [] }
}

const removeFromOutbox = async (localId: number): Promise<void> => {
  try {
    const db = await openDb()
    const tx = db.transaction(OUTBOX_STORE, 'readwrite')
    tx.objectStore(OUTBOX_STORE).delete(localId)
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
  } catch { /* ignore */ }
}

export const getOutboxCount = async (): Promise<number> => (await getOutbox()).length

// Replays queued mutations against the real API in the order they were
// made. A queued 'create' carries the clientId it was queued with, which
// the backend upserts on (see taskController's idempotent-create path) —
// safe to retry if a sync attempt is interrupted partway through. Any
// 'update' queued against a task that was itself still-offline (identified
// by its temporary clientId as taskId) gets remapped to the real
// server-assigned id once that create resolves — the "resolve conflicts
// safely" case that actually happens in practice: edit an item you just
// created offline, before ever going back online.
export const syncOutbox = async (
  authFetch: (url: string, init?: RequestInit) => Promise<unknown>,
): Promise<{ synced: number; failed: number }> => {
  const entries = await getOutbox()
  let synced = 0
  let failed = 0
  const idRemap = new Map<string, string>()

  for (const entry of entries) {
    try {
      if (entry.type === 'create') {
        const d = await authFetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...entry.payload, workspaceId: entry.workspaceId, clientId: entry.clientId }),
        }) as { task: { id: string } }
        idRemap.set(entry.clientId, d.task.id)
      } else {
        const realId = idRemap.get(entry.taskId) || entry.taskId
        await authFetch(`/api/tasks/${realId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry.payload),
        })
      }
      await removeFromOutbox(entry.localId)
      synced += 1
    } catch {
      // Still offline, or a real server error — stop here to preserve
      // ordering for whatever's left; the next sync attempt picks up where
      // this one stopped.
      failed += 1
      break
    }
  }

  return { synced, failed }
}
