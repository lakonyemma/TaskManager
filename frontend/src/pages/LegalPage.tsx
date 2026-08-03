import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import './AuthPages.css'
import './LegalPage.css'

export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="auth-bg">
      <Link to="/register" className="back-to-landing">&larr; Back</Link>
      <div className="glass-card legal-card">
        <p className="glass-logo">Taskly</p>
        <h1>{title}</h1>
        <p className="legal-updated">Last updated: {updated}</p>
        <div className="legal-body">{children}</div>
      </div>
    </div>
  )
}
