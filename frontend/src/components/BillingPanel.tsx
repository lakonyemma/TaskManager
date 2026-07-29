import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { authFetch, jsonHeaders } from '../lib/api'

type Plan = {
  id: string
  key: 'FREE' | 'PREMIUM' | 'TEAM'
  name: string
  priceMonthlyCents: number
  priceAnnualCents: number
  maxWorkspaces: number | null
  maxTasksPerWorkspace: number | null
  maxWorkspaceMembers: number | null
  canUseKanban: boolean
  canUseCalendar: boolean
  canUseAnalytics: boolean
  canUseFileAttachments: boolean
  canUseExport: boolean
  canCreateTeamWorkspace: boolean
}
type Subscription = {
  id: string
  status: string
  billingCycle: 'MONTHLY' | 'ANNUAL'
  provider: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  plan: Plan
}
type Payment = { id: string; provider: string; amountCents: number; currency: string; status: string; createdAt: string }

const money = (cents: number) => cents === 0 ? 'Free' : `$${(cents / 100).toFixed(2)}`

export default function BillingPanel({ workspaceId, isOwner, onMessage }: {
  workspaceId: string
  isOwner: boolean
  onMessage: (msg: string, type?: 'info' | 'success' | 'error') => void
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [plans, setPlans] = useState<Plan[]>([])
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [canManageBilling, setCanManageBilling] = useState(false)
  const [cycle, setCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY')
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const loadPlans = useCallback(async () => {
    try { const d = await authFetch('/api/billing/plans') as { plans: Plan[] }; setPlans(d.plans || []) } catch { setPlans([]) }
  }, [])

  const loadSubscription = useCallback(async () => {
    if (!workspaceId) return
    try {
      const d = await authFetch(`/api/billing/workspaces/${workspaceId}/subscription`) as { subscription: Subscription | null; payments: Payment[]; canManageBilling: boolean }
      setSubscription(d.subscription); setPayments(d.payments || []); setCanManageBilling(d.canManageBilling)
    } catch { setSubscription(null) }
  }, [workspaceId])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadPlans(); loadSubscription() }, [loadPlans, loadSubscription])

  // PayPal and Flutterwave both redirect back here after the customer
  // approves payment on the provider's own site — PayPal appends `token`
  // (the order id), Flutterwave appends `transaction_id`. Stripe needs no
  // client-side step: its webhook activates the subscription server-side.
  useEffect(() => {
    const paypalToken = searchParams.get('token')
    const flutterwaveTxId = searchParams.get('transaction_id')
    const status = searchParams.get('status')
    if (!workspaceId) return

    const finish = async () => {
      try {
        if (paypalToken) {
          await authFetch('/api/payments/paypal/capture', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ orderId: paypalToken }) })
          onMessage('Payment successful — plan upgraded', 'success')
        } else if (flutterwaveTxId) {
          await authFetch(`/api/payments/flutterwave/verify?transactionId=${encodeURIComponent(flutterwaveTxId)}`)
          onMessage('Payment successful — plan upgraded', 'success')
        } else if (status === 'success') {
          onMessage('Payment successful — plan upgraded', 'success')
        } else if (status === 'cancelled') {
          onMessage('Checkout cancelled', 'info')
        } else {
          return
        }
        await loadSubscription()
      } catch (err) {
        onMessage(err instanceof Error ? err.message : 'Unable to confirm payment', 'error')
      } finally {
        setSearchParams({}, { replace: true })
      }
    }
    finish()
    // Only run once per redirect-back — re-running on every render would
    // re-capture the same PayPal order and error out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  const startCheckout = async (planKey: 'PREMIUM' | 'TEAM', provider: 'stripe' | 'paypal' | 'flutterwave') => {
    const key = `${planKey}-${provider}`
    setBusyKey(key)
    try {
      const d = await authFetch(`/api/payments/${provider}/checkout`, {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({ workspaceId, planKey, billingCycle: cycle }),
      }) as { url: string }
      window.location.href = d.url
    } catch (err) {
      onMessage(err instanceof Error ? err.message : `Unable to start ${provider} checkout`, 'error')
      setBusyKey(null)
    }
  }

  const handleCancel = async () => {
    if (!confirm('Cancel your subscription? You will keep access until the current period ends.')) return
    try {
      await authFetch(`/api/billing/workspaces/${workspaceId}/subscription/cancel`, { method: 'POST' })
      onMessage('Subscription will end at the current period\'s close.', 'info')
      await loadSubscription()
    } catch (err) { onMessage(err instanceof Error ? err.message : 'Unable to cancel subscription', 'error') }
  }

  if (!workspaceId) return <p className="empty-column">Select a workspace to manage billing</p>

  const upgradablePlans = plans.filter(p => p.key !== 'FREE')

  return (
    <div className="dashboard-grid">
      <div className="panel full-width">
        <h2>Current plan</h2>
        {subscription ? (
          <div className="current-plan-card">
            <div>
              <strong>{subscription.plan.name}</strong>
              <span className={`role-badge ${subscription.status === 'ACTIVE' ? 'owner' : 'member'}`} style={{ marginLeft: 8 }}>{subscription.status}</span>
              {subscription.cancelAtPeriodEnd && <span className="role-badge member" style={{ marginLeft: 8 }}>Cancels at period end</span>}
            </div>
            <div className="task-list-meta">
              <span>{money(subscription.billingCycle === 'ANNUAL' ? subscription.plan.priceAnnualCents : subscription.plan.priceMonthlyCents)} / {subscription.billingCycle.toLowerCase()}</span>
              {subscription.currentPeriodEnd && <span>Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}</span>}
              {subscription.provider && <span>via {subscription.provider}</span>}
            </div>
            {isOwner && subscription.plan.key !== 'FREE' && !subscription.cancelAtPeriodEnd && (
              <button type="button" className="mini-btn danger-btn" onClick={handleCancel}>Cancel subscription</button>
            )}
          </div>
        ) : <p className="empty-column">No subscription found</p>}
      </div>

      {isOwner && (
        <div className="panel full-width">
          <h2>Upgrade</h2>
          <div className="billing-cycle-toggle">
            <button type="button" className={`mini-btn ${cycle === 'MONTHLY' ? 'active' : ''}`} onClick={() => setCycle('MONTHLY')}>Monthly</button>
            <button type="button" className={`mini-btn ${cycle === 'ANNUAL' ? 'active' : ''}`} onClick={() => setCycle('ANNUAL')}>Annual (save ~10%)</button>
          </div>
          <div className="plan-card-grid">
            {upgradablePlans.map(plan => (
              <div key={plan.id} className={`plan-card ${subscription?.plan.key === plan.key ? 'current' : ''}`}>
                <h3>{plan.name}</h3>
                <p className="plan-price">{money(cycle === 'ANNUAL' ? plan.priceAnnualCents : plan.priceMonthlyCents)}<span> / {cycle.toLowerCase()}</span></p>
                <ul className="plan-features">
                  <li><Check size={13} /> {plan.maxTasksPerWorkspace ? `${plan.maxTasksPerWorkspace} tasks/workspace` : 'Unlimited tasks'}</li>
                  <li><Check size={13} /> {plan.maxWorkspaceMembers ? `${plan.maxWorkspaceMembers} member${plan.maxWorkspaceMembers > 1 ? 's' : ''}` : 'Unlimited members'}</li>
                  {plan.canUseAnalytics && <li><Check size={13} /> Advanced analytics</li>}
                  {plan.canUseFileAttachments && <li><Check size={13} /> File attachments</li>}
                  {plan.canUseExport && <li><Check size={13} /> Data export</li>}
                  {plan.canCreateTeamWorkspace && <li><Check size={13} /> Team workspaces</li>}
                </ul>
                {subscription?.plan.key === plan.key ? (
                  <span className="role-badge owner">Current plan</span>
                ) : (
                  <div className="plan-checkout-buttons">
                    <button type="button" disabled={busyKey === `${plan.key}-stripe`} onClick={() => startCheckout(plan.key as 'PREMIUM' | 'TEAM', 'stripe')}>Pay with Stripe</button>
                    <button type="button" className="secondary-btn" disabled={busyKey === `${plan.key}-paypal`} onClick={() => startCheckout(plan.key as 'PREMIUM' | 'TEAM', 'paypal')}>PayPal</button>
                    <button type="button" className="secondary-btn" disabled={busyKey === `${plan.key}-flutterwave`} onClick={() => startCheckout(plan.key as 'PREMIUM' | 'TEAM', 'flutterwave')}>Flutterwave</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {canManageBilling && (
        <div className="panel full-width">
          <h2>Payment history</h2>
          {payments.length === 0 ? <p className="empty-column">No payments yet</p> : (
            <div className="task-list">
              {payments.map(p => (
                <div key={p.id} className="task-list-item">
                  <div className="task-list-info">
                    <strong>{money(p.amountCents)} {p.currency}</strong>
                    <span>{p.provider} · {new Date(p.createdAt).toLocaleString()}</span>
                  </div>
                  <span className={`status-badge ${p.status.toLowerCase()}`}>{p.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
