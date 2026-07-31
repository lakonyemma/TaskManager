import { useEffect, useRef, useState } from 'react'
import SplashScreen from './SplashScreen'

const SPLASH_DELAY_MS = 3000

// Below this, a hidden->visible flip is just a quick glance away (a
// notification, a lock-screen tap, switching apps for a second) — not a
// real "reopen," and re-showing a 3s full-screen splash for it made the
// *entire app* feel like it was constantly hanging. Only genuine returns
// (past this threshold) get the splash treatment again.
const MIN_HIDDEN_MS_TO_RESPLASH = 10000

// Mobile PWAs are almost always resumed from a suspended background tab
// when the user taps the app icon, not reloaded from scratch — so a splash
// that only shows once on mount would never reappear, leaving whatever
// screen was frozen before backgrounding ("stale screen") visible instead.
// This re-shows the splash over whatever's currently rendered when the app
// comes back to the foreground after a real gap, giving App Lock's own
// visibilitychange check (see AppLockGate) a moment to decide — invisibly,
// underneath — whether to reveal the PIN screen or the dashboard once it
// fades.
export default function AppSplashGate({ children }: { children: React.ReactNode }) {
  const [showSplash, setShowSplash] = useState(true)
  const hiddenAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (!showSplash) return
    const timer = setTimeout(() => setShowSplash(false), SPLASH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [showSplash])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now()
      } else if (hiddenAtRef.current !== null) {
        const elapsedMs = Date.now() - hiddenAtRef.current
        hiddenAtRef.current = null
        if (elapsedMs >= MIN_HIDDEN_MS_TO_RESPLASH) setShowSplash(true)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  return (
    <>
      {children}
      {showSplash && <SplashScreen />}
    </>
  )
}
