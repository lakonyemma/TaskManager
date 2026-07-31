import { useEffect, useRef, useState } from 'react'
import { Lock } from 'lucide-react'
import { authFetch } from '../lib/api'

const LAST_ACTIVE_KEY = 'taskly.appLock.lastActiveAt'
const PIN_LENGTH = 4

// Full-screen gate rendered around the authenticated app when the signed-in
// user has App Lock enabled. Locks on first load of a session and again
// whenever the tab was hidden (backgrounded, device locked, browser
// closed) for longer than the user's configured timeout — 0 minutes means
// "lock immediately on every hide". While locked, nothing else renders, so
// task/workspace data never touches the DOM until the PIN is verified.
export default function AppLockGate({ enabled, timeoutMinutes, userId, children }: {
  enabled: boolean
  timeoutMinutes: number
  userId: string
  children: React.ReactNode
}) {
  const [locked, setLocked] = useState(enabled)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const hiddenAtRef = useRef<number | null>(null)

  const storageKey = `${LAST_ACTIVE_KEY}.${userId}`

  useEffect(() => {
    // Deriving "should this session start locked" from a prop/localStorage
    // combination on mount/enable-change, not synchronizing with an
    // external subscription — the sync setState here is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!enabled) { setLocked(false); return }
    const lastActive = Number(localStorage.getItem(storageKey) || 0)
    const elapsedMs = lastActive ? Date.now() - lastActive : Infinity
    setLocked(elapsedMs >= timeoutMinutes * 60000)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userId])

  useEffect(() => {
    if (!enabled) return
    const markActive = () => localStorage.setItem(storageKey, String(Date.now()))
    const onVisibilityChange = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now()
        markActive()
      } else if (hiddenAtRef.current) {
        const elapsedMs = Date.now() - hiddenAtRef.current
        if (elapsedMs >= timeoutMinutes * 60000) setLocked(true)
        hiddenAtRef.current = null
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    const interval = setInterval(markActive, 30000)
    markActive()
    return () => { document.removeEventListener('visibilitychange', onVisibilityChange); clearInterval(interval) }
  }, [enabled, timeoutMinutes, storageKey])

  const submitPin = async (value: string) => {
    setVerifying(true)
    setError('')
    try {
      await authFetch('/api/settings/app-lock/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: value }) })
      // eslint-disable-next-line react-hooks/purity -- only ever invoked from the keypad's onClick, never during render
      localStorage.setItem(storageKey, String(Date.now()))
      setLocked(false)
      setPin('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect PIN')
      setPin('')
    } finally {
      setVerifying(false)
    }
  }

  const handleDigit = (digit: string) => {
    if (verifying) return
    const next = (pin + digit).slice(0, PIN_LENGTH)
    setPin(next)
    if (next.length === PIN_LENGTH) submitPin(next)
  }

  if (!locked) return <>{children}</>

  return (
    <div className="app-lock-overlay" role="dialog" aria-modal="true" aria-label="App locked">
      <div className="app-lock-content">
        <div className="app-lock-icon"><Lock size={28} strokeWidth={1.8} /></div>
        <h1>Taskly is locked</h1>
        <p>Enter your PIN to continue</p>
        <div className="app-lock-dots">
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <span key={i} className={`app-lock-dot ${i < pin.length ? 'filled' : ''}`} />
          ))}
        </div>
        {error && <p className="app-lock-error">{error}</p>}
        <div className="app-lock-keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key, i) => (
            key === '' ? <span key={i} /> : (
              <button
                key={i}
                type="button"
                className="app-lock-key"
                disabled={verifying}
                onClick={() => key === '⌫' ? setPin(p => p.slice(0, -1)) : handleDigit(key)}
              >{key}</button>
            )
          ))}
        </div>
      </div>
    </div>
  )
}
