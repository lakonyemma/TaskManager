import { useEffect, useRef, useState } from 'react'
import SplashScreen from './SplashScreen'

const SPLASH_DELAY_MS = 3000

// Mobile PWAs are almost always resumed from a suspended background tab
// when the user taps the app icon, not reloaded from scratch — so a splash
// that only shows once on mount would never reappear, leaving whatever
// screen was frozen before backgrounding ("stale screen") visible instead.
// This re-shows the splash over whatever's currently rendered every time
// the app comes back to the foreground, giving App Lock's own
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
        hiddenAtRef.current = null
        setShowSplash(true)
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
