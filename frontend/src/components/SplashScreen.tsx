import heroImageJpg from '../assets/hero-taskly.jpg'
import heroImageWebp from '../assets/hero-taskly.webp'
import './SplashScreen.css'

// Purely presentational — AppSplashGate decides when this is on screen,
// both on first load and every time the app is brought back to the
// foreground (mobile PWAs are usually resumed, not reloaded).
export default function SplashScreen() {
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
