const DB_NAME = 'taskly-sw'
const STORE_NAME = 'kv'
const TOKEN_KEY = 'accessToken'

const openDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1)
  req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE_NAME)) req.result.createObjectStore(STORE_NAME) }
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})

// Mirrors the current access token into IndexedDB so the service worker —
// which has no access to localStorage/sessionStorage — can make
// authenticated fetches (Mark Complete / Snooze) when a push notification
// action is tapped with no Taskly tab open. Called from lib/api.ts's token
// mutation points (login, refresh, logout) so it never drifts.
export const syncTokenToServiceWorker = async (token: string | null): Promise<void> => {
  if (typeof indexedDB === 'undefined') return
  try {
    const db = await openDb()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    if (token) tx.objectStore(STORE_NAME).put(token, TOKEN_KEY)
    else tx.objectStore(STORE_NAME).delete(TOKEN_KEY)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // IndexedDB unavailable (private browsing, etc.) — background push
    // actions simply won't be able to authenticate; foreground use is fine.
  }
}
