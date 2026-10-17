import { useEffect, useState } from 'react'
import SplashScreen from './SplashScreen'

// Keep a brief branded handoff on a fresh launch without making users wait
// through a fixed three-second animation before interacting with the app.
const INITIAL_SPLASH_MS = 900

export default function AppSplashGate({ children }: { children: React.ReactNode }) {
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), INITIAL_SPLASH_MS)
    return () => window.clearTimeout(timer)
  }, [])

  // The HTML boot splash covers the interval before React first paints.
  useEffect(() => {
    document.getElementById('boot-splash')?.remove()
  }, [])

  // Resuming an already-running PWA should return users directly to their
  // existing page. AppLockGate independently handles security on resume.
  return (
    <>
      {children}
      {showSplash && <SplashScreen />}
    </>
  )
}
