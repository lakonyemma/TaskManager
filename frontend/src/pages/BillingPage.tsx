import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, Crown, CreditCard, Smartphone, XCircle } from 'lucide-react'
import { authFetch, jsonHeaders } from '../lib/api'

const features = [
  'Unlimited workspaces',
  'Advanced analytics and workload insights',
  'AI Productivity Assistant and AI scheduling',
  'Advanced reports and PDF/Excel exports',
  'Recurring tasks and advanced dependencies',
  'Custom Kanban columns and saved views',
  'Focus Mode and time tracking',
  'File attachments, email digests and push notifications',
]

type BillingData = {
  subscription: any
  entitlements: any
}

export default function BillingPage() {
  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [search] = useSearchParams()
  const [country, setCountry] = useState('UG')

  const load = async () => {
    try {
      const result = await authFetch('/api/billing') as BillingData
      setData(result)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load billing')
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  useEffect(() => {
    const status = search.get('status')
    const transactionId = search.get('transaction_id')
    if (status === 'callback' && transactionId) {
      setBusy(true)
      authFetch('/api/billing/verify', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ transactionId }) })
        .then(() => load())
        .catch(error => setMessage(error instanceof Error ? error.message : 'Payment verification failed'))
        .finally(() => setBusy(false))
    }
  }, [search])

  const premium = !!data?.entitlements?.premium
  const trialEnds = data?.entitlements?.trialEndsAt ? new Date(data.entitlements.trialEndsAt).toLocaleDateString() : null
  const currency = country === 'UG' ? 'UGX' : 'USD'
  const configuredPrice = useMemo(() => country === 'UG' ? 'Local UGX price' : '$5', [country])

  const startTrial = async () => {
    setBusy(true); setMessage('')
    try { await authFetch('/api/billing/trial', { method: 'POST', headers: jsonHeaders, body: '{}' }); await load() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Trial could not be started') }
    finally { setBusy(false) }
  }

  const checkout = async () => {
    setBusy(true); setMessage('')
    try {
      const result = await authFetch('/api/billing/checkout', {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({ country, currency }),
      }) as { url: string }
      window.location.href = result.url
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Checkout could not be started'); setBusy(false) }
  }

  const cancel = async () => {
    if (!window.confirm('Cancel Premium at the end of the current billing period?')) return
    setBusy(true)
    try { await authFetch('/api/billing/cancel', { method: 'POST', headers: jsonHeaders, body: '{}' }); await load() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Cancellation failed') }
    finally { setBusy(false) }
  }

  if (loading) return <div className="route-loading">Loading billing…</div>

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Crown size={28} /><h1 style={{ margin: 0 }}>Taskly Premium</h1></div>
          <p style={{ opacity: .7 }}>More workspaces. More productivity. One simple plan.</p>
        </div>
        <select value={country} onChange={e => setCountry(e.target.value)} style={{ padding: 10, borderRadius: 10 }}>
          <option value="UG">Uganda</option>
          <option value="US">United States</option>
          <option value="GB">United Kingdom</option>
          <option value="KE">Kenya</option>
        </select>
      </div>

      {message && <div style={{ padding: 14, marginBottom: 18, borderRadius: 12, background: 'rgba(220,38,38,.1)' }}>{message}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, .8fr)', gap: 22 }}>
        <section style={{ border: '1px solid var(--border, #ddd)', borderRadius: 20, padding: 26 }}>
          <h2>Premium includes</h2>
          <div style={{ display: 'grid', gap: 13 }}>
            {features.map(feature => <div key={feature} style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Check size={18} />{feature}</div>)}
          </div>
        </section>

        <section style={{ border: '2px solid #8b5cf6', borderRadius: 20, padding: 26 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>PREMIUM</span><Crown size={20} /></div>
          <div style={{ fontSize: 38, fontWeight: 800, marginTop: 12 }}>{configuredPrice}<span style={{ fontSize: 15, fontWeight: 400 }}>/month</span></div>
          <p style={{ opacity: .7 }}>7-day free trial for eligible accounts.</p>
          <button disabled={busy || premium} onClick={startTrial} style={{ width: '100%', padding: 13, borderRadius: 12, marginBottom: 10 }}>
            {premium ? 'Premium active' : 'Start 7-day free trial'}
          </button>
          <button disabled={busy || premium} onClick={checkout} style={{ width: '100%', padding: 13, borderRadius: 12 }}>
            <CreditCard size={16} style={{ verticalAlign: 'middle', marginRight: 7 }} /> Pay with Visa, Mastercard or Mobile Money
          </button>
          {premium && <button disabled={busy || data?.subscription?.cancelAtPeriodEnd} onClick={cancel} style={{ width: '100%', padding: 12, borderRadius: 12, marginTop: 10 }}>
            {data?.subscription?.cancelAtPeriodEnd ? 'Cancellation scheduled' : 'Cancel Premium'}
          </button>}
          {trialEnds && <p style={{ fontSize: 13, marginTop: 16 }}>Trial ends {trialEnds}.</p>}
          <div style={{ marginTop: 18, display: 'grid', gap: 8, fontSize: 13, opacity: .75 }}>
            <div><CreditCard size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />Visa and Mastercard supported</div>
            <div><Smartphone size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />Uganda checkout supports MTN and Airtel Mobile Money</div>
            <div><XCircle size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />Cancel any time. Your data remains after downgrade.</div>
          </div>
        </section>
      </div>
    </div>
  )
}
