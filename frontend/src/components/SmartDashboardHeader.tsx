import { AlertTriangle, CalendarClock, CalendarRange, CheckCircle2, Mail, Target, TrendingDown, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import AnalogClock from './AnalogClock'

const greetingFor = (hour: number, lang: Record<string, string>) => hour < 12 ? lang.morning : hour < 18 ? lang.afternoon : lang.evening

export default function SmartDashboardHeader({
  firstname, dueTodayCount, overdueCount, upcomingCount, completedYesterdayCount, productivityDeltaPercent, translations,
}: {
  firstname: string
  dueTodayCount: number
  overdueCount: number
  upcomingCount: number
  completedYesterdayCount: number
  productivityDeltaPercent: number | null
  translations: { morning: string; afternoon: string; evening: string }
}) {
  const greeting = greetingFor(new Date().getHours(), translations)
  const hasAnyStat = dueTodayCount > 0 || overdueCount > 0 || upcomingCount > 0

  return (
    <div className="smart-header">
      <div className="smart-header-glow" aria-hidden="true" />
      <div className="smart-header-main">
        <p className="smart-header-eyebrow">{greeting}</p>
        <h1>{firstname} <span className="smart-header-wave">🫠</span></h1>
        {completedYesterdayCount > 0 && (
          <p className="smart-header-yesterday">
            <CheckCircle2 size={13} strokeWidth={1.8} /> You completed {completedYesterdayCount} task{completedYesterdayCount !== 1 ? 's' : ''} yesterday.
          </p>
        )}
        {hasAnyStat ? (
          <div className="smart-header-stats">
            {overdueCount > 0 && <span className="smart-stat overdue"><AlertTriangle size={13} strokeWidth={1.8} /> {overdueCount} overdue</span>}
            {dueTodayCount > 0 && <span className="smart-stat"><CalendarClock size={13} strokeWidth={1.8} /> {dueTodayCount} due today</span>}
            {upcomingCount > 0 && <span className="smart-stat"><CalendarRange size={13} strokeWidth={1.8} /> {upcomingCount} upcoming this week</span>}
          </div>
        ) : (
          <p className="smart-header-empty">Nothing urgent on your plate right now — stay focused.</p>
        )}
        <div className="smart-header-stats">
          <Link to="/app/execution" className="smart-stat"><Target size={13} strokeWidth={1.8} /> Open execution plan</Link>
          <Link to="/app/mail" className="smart-stat"><Mail size={13} strokeWidth={1.8} /> Personal Action Inbox</Link>
        </div>
        {productivityDeltaPercent !== null && (
          <p className={`smart-header-delta ${productivityDeltaPercent >= 0 ? 'up' : 'down'}`}>
            {productivityDeltaPercent >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            Your productivity is {Math.abs(productivityDeltaPercent)}% {productivityDeltaPercent >= 0 ? 'higher' : 'lower'} than last week.
          </p>
        )}
      </div>
      <AnalogClock />
    </div>
  )
}
