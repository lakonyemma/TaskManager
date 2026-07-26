import { Link } from 'react-router-dom'
import './LandingPage.css'

const FEATURES = [
  { icon: '☑', title: 'Task Management', desc: 'Create, assign, and track tasks with priorities, due dates, and statuses that keep everyone aligned.' },
  { icon: '☺', title: 'Team Collaboration', desc: 'Invite teammates into shared workspaces, assign roles, and work together in real time.' },
  { icon: '☰', title: 'Project Boards', desc: 'Visualize progress with drag-friendly Kanban boards across To Do, In Progress, Review, and Done.' },
  { icon: '▦', title: 'Calendar Planning', desc: 'See every deadline on a monthly calendar so nothing slips through the cracks.' },
  { icon: '↗', title: 'Productivity Tracking', desc: 'Monitor completion rates and workload distribution across your whole team.' },
  { icon: '▣', title: 'Reports & Analytics', desc: 'Turn task activity into clear reports that show where projects stand.' },
]

export default function LandingPage() {
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
        <div className="hero-blobs" aria-hidden="true">
          <span className="blob blob-1" />
          <span className="blob blob-2" />
          <span className="blob blob-3" />
        </div>
        <div className="hero-overlay" />
        <div className="hero-content">
          <p className="hero-eyebrow">Taskly &middot; Team Productivity Platform</p>
          <h1>Work Smarter.<br />Deliver Faster.</h1>
          <p className="hero-sub">
            Taskly helps teams organize work, collaborate effectively, and deliver projects faster.
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
              <div className="feature-icon">{f.icon}</div>
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
        <div className="browser-mockup">
          <div className="browser-toolbar">
            <span className="browser-dot" style={{ background: '#f87171' }} />
            <span className="browser-dot" style={{ background: '#fbbf24' }} />
            <span className="browser-dot" style={{ background: '#34d399' }} />
            <div className="browser-address">app.taskly.com/dashboard</div>
          </div>
          <div className="browser-preview">
            <div className="preview-sidebar">
              <div className="preview-logo" />
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="preview-nav-item" style={{ opacity: i === 0 ? 1 : 0.5 }} />)}
            </div>
            <div className="preview-main">
              <div className="preview-topbar" />
              <div className="preview-cards">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="preview-card" />)}
              </div>
              <div className="preview-chart">
                {[62, 40, 85, 55, 70, 30, 90].map((h, i) => (
                  <div key={i} className="preview-bar" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <span>&copy; {new Date().getFullYear()} Taskly. All rights reserved.</span>
      </footer>
    </div>
  )
}
