import { useEffect, useMemo, useRef, useState } from 'react'
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

type StripeInstance = {
  elements: (options: { clientSecret: string }) => { create: (type: string) => { mount: (selector: HTMLElement) => void; unmount: () => void } }
  confirmPayment: (options: { elements: ReturnType<StripeInstance['elements']>; confirmParams?: { return_url?: string }; redirect?: 'if_required' }) => Promise<{ error?: { message?: string } }>
}

declare global {
  interface Window { Stripe?: (publishableKey: string) => StripeInstance }
}

type BillingData = { subscription: any; entitlements: any }

const loadStripeScript = () => new Promise<void>((resolve, reject) => {
  if (window.Stripe) return resolve()
  const existing = document.querySelector('script[data-taskly-stripe]')
  if (existing) { existing.addEventListener('load', () => resolve()); existing.addEventListener('error', () => reject(new Error('Unable to load card payment form'))); return }
  const script = document.createElement('script')
  script.src = 'https://js.stripe.com/v3/'
  script.async = true
  script.dataset.tasklyStripe = 'true'
  script.onload = () => resolve()
  script.onerror = () => reject(new Error('Unable to load card payment form'))
  document.head.appendChild(script)
})

export default function BillingPage() {
  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [country, setCountry] = useState('UG')
  const [paymentMethod, setPaymentMethod] = useState<'mobile_money' | 'card'>('mobile_money')
  const [phone, setPhone] = useState('')
  const [cardSecret, setCardSecret] = useState<string | null>(null)
  const [stripeKey, setStripeKey] = useState<string | null>(null)
  const [reference, setReference] = useState<string | null>(null)
  const cardMount = useRef<HTMLDivElement | null>(null)
  const cardElement = useRef<{ unmount: () => void } | null>(null)

  const load = async () => {
    try { setData(await authFetch('/api/billing') as BillingData) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load billing') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  const pollPayment = async (paymentReference: string) => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const result = await authFetch('/api/billing/verify', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ reference: paymentReference }) }) as any
        if (result?.status === 'completed' || result?.entitlements?.premium) {
          await load()
          setMessage('Payment successful. Premium is now active.')
          return true
        }
      } catch (error: any) {
        if (error?.status !== 402 && attempt > 1) throw error
      }
      await new Promise(resolve => setTimeout(resolve, 3000))
    }
    throw new Error('Payment is still pending. You can leave this page and check Billing again shortly.')
  }

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
        body: JSON.stringify({ country, paymentMethod, phone: paymentMethod === 'mobile_money' ? phone : undefined }),
      }) as any
      setReference(result.reference)
      if (paymentMethod === 'card') {
        if (!result.clientSecret || !result.stripePublishableKey) throw new Error('Card payment setup was not returned by DGateway')
        setCardSecret(result.clientSecret)
        setStripeKey(result.stripePublishableKey)
        setMessage('Enter your card details below to complete payment.')
        setBusy(false)
        return
      }
      setMessage('A Mobile Money payment prompt has been sent to your phone. Approve it to continue.')
      await pollPayment(result.reference)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Payment could not be started') }
    finally { setBusy(false) }
  }

  useEffect(() => {
    if (!cardSecret || !stripeKey || !cardMount.current) return
    let mounted = true
    void loadStripeScript().then(() => {
      if (!mounted || !window.Stripe || !cardMount.current) return
      const stripe = window.Stripe(stripeKey)
      const elements = stripe.elements({ clientSecret: cardSecret })
      const element = elements.create('payment')
      element.mount(cardMount.current)
      cardElement.current = element
    }).catch(error => setMessage(error instanceof Error ? error.message : 'Unable to load card form'))
    return () => { mounted = false; cardElement.current?.unmount(); cardElement.current = null }
  }, [cardSecret, stripeKey])

  const payByCard = async () => {
    if (!cardSecret || !stripeKey || !window.Stripe) return
    setBusy(true); setMessage('')
    try {
      const stripe = window.Stripe(stripeKey)
      const elements = stripe.elements({ clientSecret: cardSecret })
      const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: `${window.location.origin}/app/billing` }, redirect: 'if_required' })
      if (result.error) throw new Error(result.error.message || 'Card payment failed')
      if (reference) await pollPayment(reference)
      setCardSecret(null); setStripeKey(null); setReference(null)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Card payment failed') }
    finally { setBusy(false) }
  }

  const cancel = async () => {
    if (!window.confirm('Cancel Premium at the end of the current billing period?')) return
    setBusy(true)
    try { await authFetch('/api/billing/cancel', { method: 'POST', headers: jsonHeaders, body: '{}' }); await load() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Cancellation failed') }
    finally { setBusy(false) }
  }

  const premium = !!data?.entitlements?.premium
  const trialEnds = data?.entitlements?.trialEndsAt ? new Date(data.entitlements.trialEndsAt).toLocaleDateString() : null
  const currency = paymentMethod === 'card' ? 'USD' : country === 'UG' ? 'UGX' : 'USD'
  const configuredPrice = useMemo(() => currency === 'UGX' ? 'Local UGX price' : '$5', [currency])

  if (loading) return <div className="route-loading">Loading billing…</div>

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Crown size={28} /><h1 style={{ margin: 0 }}>Taskly Premium</h1></div>
          <p style={{ opacity: .7 }}>More workspaces. More productivity. One simple plan.</p>
        </div>
        <select value={country} onChange={e => setCountry(e.target.value)} style={{ padding: 10, borderRadius: 10 }}>
          <option value="UG">Uganda</option><option value="US">United States</option><option value="GB">United Kingdom</option><option value="KE">Kenya</option>
        </select>
      </div>

      {message && <div style={{ padding: 14, marginBottom: 18, borderRadius: 12, background: 'rgba(220,38,38,.1)' }}>{message}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, .8fr)', gap: 22 }}>
        <section style={{ border: '1px solid var(--border, #ddd)', borderRadius: 20, padding: 26 }}>
          <h2>Premium includes</h2>
          <div style={{ display: 'grid', gap: 13 }}>{features.map(feature => <div key={feature} style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Check size={18} />{feature}</div>)}</div>
        </section>

        <section style={{ border: '2px solid #8b5cf6', borderRadius: 20, padding: 26 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>PREMIUM</span><Crown size={20} /></div>
          <div style={{ fontSize: 38, fontWeight: 800, marginTop: 12 }}>{configuredPrice}<span style={{ fontSize: 15, fontWeight: 400 }}>/month</span></div>
          <p style={{ opacity: .7 }}>7-day free trial for eligible accounts.</p>
          <button disabled={busy || premium} onClick={startTrial} style={{ width: '100%', padding: 13, borderRadius: 12, marginBottom: 10 }}>{premium ? 'Premium active' : 'Start 7-day free trial'}</button>

          {!cardSecret && <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <button onClick={() => setPaymentMethod('mobile_money')} disabled={busy} style={{ padding: 11, borderRadius: 10, opacity: paymentMethod === 'mobile_money' ? 1 : .65 }}><Smartphone size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />Mobile Money</button>
              <button onClick={() => setPaymentMethod('card')} disabled={busy} style={{ padding: 11, borderRadius: 10, opacity: paymentMethod === 'card' ? 1 : .65 }}><CreditCard size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />Visa / Mastercard</button>
            </div>
            {paymentMethod === 'mobile_money' && <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Mobile Money number, e.g. 0771234567" style={{ width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 10, marginBottom: 10 }} />}
            <button disabled={busy || premium} onClick={checkout} style={{ width: '100%', padding: 13, borderRadius: 12 }}>{busy ? 'Processing…' : paymentMethod === 'mobile_money' ? 'Pay with Mobile Money' : 'Continue to card payment'}</button>
          </>}

          {cardSecret && <div style={{ marginTop: 12 }}>
            <div ref={cardMount} style={{ padding: 12, border: '1px solid var(--border, #ddd)', borderRadius: 10, marginBottom: 10, minHeight: 80 }} />
            <button disabled={busy} onClick={payByCard} style={{ width: '100%', padding: 13, borderRadius: 12 }}>{busy ? 'Processing card…' : 'Pay $5 with card'}</button>
          </div>}

          {premium && <button disabled={busy || data?.subscription?.cancelAtPeriodEnd} onClick={cancel} style={{ width: '100%', padding: 12, borderRadius: 12, marginTop: 10 }}>{data?.subscription?.cancelAtPeriodEnd ? 'Cancellation scheduled' : 'Cancel Premium'}</button>}
          {trialEnds && <p style={{ fontSize: 13, marginTop: 16 }}>Trial ends {trialEnds}.</p>}
          <div style={{ marginTop: 18, display: 'grid', gap: 8, fontSize: 13, opacity: .75 }}>
            <div><CreditCard size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />Visa and Mastercard via DGateway and Stripe</div>
            <div><Smartphone size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />Uganda supports MTN and Airtel Mobile Money</div>
            <div><XCircle size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />Cancel any time. Your data remains after downgrade.</div>
          </div>
        </section>
      </div>
    </div>
  )
}
