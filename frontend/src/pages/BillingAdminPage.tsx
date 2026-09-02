import { useEffect, useState } from 'react'
import { authFetch } from '../lib/api'

type Summary = { subscriptions: { plan: string; status: string; count: number }[]; revenue: { total: string; currency: string }[] }

export default function BillingAdminPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    authFetch('/api/billing/admin/summary')
      .then(data => setSummary(data as Summary))
      .catch(err => setError(err instanceof Error ? err.message : 'Unable to load billing summary'))
  }, [])

  if (error) return <div style={{ padding: 32 }}>{error}</div>
  if (!summary) return <div className="route-loading">Loading billing dashboard…</div>

  const totalSubscribers = summary.subscriptions.filter(s => s.plan === 'PREMIUM').reduce((n, s) => n + Number(s.count), 0)

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 32 }}>
      <h1>Billing Dashboard</h1>
      <p style={{ opacity: .7 }}>Premium subscription health and revenue overview.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 16, margin: '24px 0' }}>
        <div style={{ padding: 20, border: '1px solid var(--border,#ddd)', borderRadius: 16 }}><strong>Premium subscribers</strong><div style={{ fontSize: 32, fontWeight: 800 }}>{totalSubscribers}</div></div>
        <div style={{ padding: 20, border: '1px solid var(--border,#ddd)', borderRadius: 16 }}><strong>Active</strong><div style={{ fontSize: 32, fontWeight: 800 }}>{summary.subscriptions.find(s => s.plan === 'PREMIUM' && s.status === 'ACTIVE')?.count ?? 0}</div></div>
        <div style={{ padding: 20, border: '1px solid var(--border,#ddd)', borderRadius: 16 }}><strong>Past due</strong><div style={{ fontSize: 32, fontWeight: 800 }}>{summary.subscriptions.find(s => s.plan === 'PREMIUM' && s.status === 'PAST_DUE')?.count ?? 0}</div></div>
      </div>
      <section style={{ border: '1px solid var(--border,#ddd)', borderRadius: 16, padding: 20 }}>
        <h2>Subscription status</h2>
        <div style={{ display: 'grid', gap: 8 }}>{summary.subscriptions.map(item => <div key={`${item.plan}-${item.status}`} style={{ display: 'flex', justifyContent: 'space-between', padding: 10 }}><span>{item.plan} · {item.status}</span><strong>{item.count}</strong></div>)}</div>
      </section>
      <section style={{ border: '1px solid var(--border,#ddd)', borderRadius: 16, padding: 20, marginTop: 16 }}>
        <h2>Successful revenue</h2>
        {summary.revenue.length ? summary.revenue.map(item => <div key={item.currency} style={{ display: 'flex', justifyContent: 'space-between', padding: 10 }}><span>{item.currency}</span><strong>{item.total}</strong></div>) : <p>No successful payments yet.</p>}
      </section>
    </div>
  )
}
