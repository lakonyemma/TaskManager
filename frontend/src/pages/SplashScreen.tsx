import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import heroImageJpg from '../assets/hero-taskly.jpg'
import heroImageWebp from '../assets/hero-taskly.webp'
import './SplashScreen.css'

// Minimum time the splash screen stays up, regardless of how quickly the
// auth check resolves — long enough to register as a deliberate brand
// moment rather than a flicker.
const SPLASH_MIN_DELAY_MS = 3000

export default function SplashScreen() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [minDelayDone, setMinDelayDone] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setMinDelayDone(true), SPLASH_MIN_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!minDelayDone || loading) return
    navigate(user ? '/app' : '/login', { replace: true })
  }, [minDelayDone, loading, user, navigate])

  return (
    <div className="splash-screen">
      <picture>
        <source srcSet={heroImageWebp} type="image/webp" />
        <img
          src={heroImageJpg}
          alt=""
          aria-hidden="true"
          className="splash-photo"
          loading="eager"
          fetchPriority="high"
        />
      </picture>
      <div className="splash-overlay" />
      <div className="splash-content">
        <div className="splash-logo">Taskly</div>
        <p className="splash-tagline">Work Smarter. Achieve More.</p>
        <div className="splash-loader" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  )
}
