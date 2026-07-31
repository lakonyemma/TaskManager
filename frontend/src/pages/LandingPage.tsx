import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ClipboardCheck, Users, KanbanSquare, CalendarDays, TrendingUp, ChartColumn } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import heroImageJpg from '../assets/hero-taskly.jpg'
import heroImageWebp from '../assets/hero-taskly.webp'
import './LandingPage.css'

// Deliberate pause before redirecting an already-signed-in visitor away from
// the landing page, so it doesn't flash-and-vanish before they can register
// it. Fixed via a ref (not effect deps) so the timer never resets while the
// auth check resolves in the background.
const AUTO_REDIRECT_DELAY_MS = 3000

// Recharts is a sizeable dependency — defer it until the below-the-fold
// preview section is actually rendered instead of shipping it in the
// critical path for first-time (unauthenticated) visitors.
const ProductPreview = lazy(() => import('../components/ProductPreview'))

const FEATURES = [
  { icon: ClipboardCheck, title: 'Task Management', desc: 'Create, assign, and track tasks with priorities, due dates, and statuses that keep everyone aligned.' },
  { icon: Users, title: 'Team Collaboration', desc: 'Invite teammates into shared workspaces, assign roles, and work together in real time.' },
  { icon: KanbanSquare, title: 'Project Boards', desc: 'Visualize progress with drag-friendly Kanban boards across To Do, In Progress, Review, and Done.' },
  { icon: CalendarDays, title: 'Calendar Planning', desc: 'See every deadline on a real calendar so nothing slips through the cracks.' },
  { icon: TrendingUp, title: 'Productivity Tracking', desc: 'Monitor completion rates and workload distribution across your whole team.' },
  { icon: ChartColumn, title: 'Reports & Analytics', desc: 'Turn task activity into clear reports that show where projects stand.' },
]

export default function LandingPage() {
  const [heroImageFailed, setHeroImageFailed] = useState(false)
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  const authRef = useRef({ user, loading })
  useEffect(() => {
    authRef.current = { user, loading }
  }, [user, loading])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!authRef.current.loading && authRef.current.user) {
        navigate('/app', { replace: true })
      }
    }, AUTO_REDIRECT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [navigate])

  const scrollToFeatures = () => {
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <div className="landing-logo">Taskly</div>
        <div className="landing-nav-actions">
          <Link to="/login" className="btn-ghost">Sign In</Link>
          <Link to="/register" className="btn-primary">Create Account</Link>
        </div>
      </nav>

      <section className="hero">
        {!heroImageFailed && (
          <picture>
            <source srcSet={heroImageWebp} type="image/webp" />
            <img
              src={heroImageJpg}
              alt=""
              aria-hidden="true"
              className="hero-photo"
              loading="eager"
              fetchPriority="high"
              onError={() => setHeroImageFailed(true)}
            />
          </picture>
        )}
        {heroImageFailed && (
          <div className="hero-blobs" aria-hidden="true">
            <span className="blob blob-1" />
            <span className="blob blob-2" />
            <span className="blob blob-3" />
          </div>
        )}
        <div className="hero-overlay" />
        <div className="hero-content">
          <p className="hero-eyebrow">Taskly &middot; Team Productivity Platform</p>
          <h1>Taskly: Work Smarter.<br />Achieve More.</h1>
          <p className="hero-sub">
            Taskly helps teams organize work, collaborate efficiently, and deliver projects faster.
          </p>
          <div className="hero-actions">
            <button type="button" className="btn-primary large" onClick={scrollToFeatures}>Get Started</button>
            <Link to="/register" className="btn-ghost large">Create Account</Link>
          </div>
        </div>
      </section>

      <section id="features" className="features-section">
        <div className="section-heading">
          <p className="section-eyebrow">Features</p>
          <h2>Everything your team needs, in one place</h2>
        </div>
        <div className="feature-grid">
          {FEATURES.map(f => (
            <div key={f.title} className="feature-card">
              <div className="feature-icon"><f.icon size={22} strokeWidth={2} /></div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="showcase-section">
        <div className="section-heading">
          <p className="section-eyebrow">Product Preview</p>
          <h2>See Taskly in action</h2>
        </div>
        <Suspense fallback={<div className="preview-skeleton" />}>
          <ProductPreview />
        </Suspense>
      </section>

      <footer className="landing-footer">
        <span>&copy; {new Date().getFullYear()} Taskly. All rights reserved.</span>
      </footer>
    </div>
  )
}
