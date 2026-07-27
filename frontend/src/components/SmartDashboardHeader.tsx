import { CalendarClock, TrendingDown, TrendingUp } from 'lucide-react'

const greetingFor = (hour: number, lang: Record<string, string>) => hour < 12 ? lang.morning : hour < 18 ? lang.afternoon : lang.evening

// Personalized dashboard header: greeting, a plain-language summary of
// today's priorities, and a productivity delta vs. last week — the "feels
// alive" opening the dashboard is built around, using only real numbers
// already computed from the user's own tasks (no synthetic content).
export default function SmartDashboardHeader({
  firstname, dueTodayCount, overdueCount, upcomingCount, productivityDeltaPercent, translations,
}: {
  firstname: string
  dueTodayCount: number
  overdueCount: number
  upcomingCount: number
  productivityDeltaPercent: number | null
  translations: { morning: string; afternoon: string; evening: string }
}) {
  const greeting = greetingFor(new Date().getHours(), translations)
  const hasAnyStat = dueTodayCount > 0 || overdueCount > 0 || upcomingCount > 0

  return (
    <div className="smart-header">
      <h1>{greeting}, {firstname}.</h1>
      {hasAnyStat ? (
        <div className="smart-header-stats">
          {dueTodayCount > 0 && <span className="smart-stat"><CalendarClock size={13} strokeWidth={1.8} /> {dueTodayCount} task{dueTodayCount !== 1 ? 's' : ''} due today</span>}
          {overdueCount > 0 && <span className="smart-stat overdue">{overdueCount} overdue</span>}
          {upcomingCount > 0 && <span className="smart-stat">{upcomingCount} upcoming this week</span>}
        </div>
      ) : (
        <p className="smart-header-empty">Nothing urgent on your plate right now.</p>
      )}
      {productivityDeltaPercent !== null && (
        <p className={`smart-header-delta ${productivityDeltaPercent >= 0 ? 'up' : 'down'}`}>
          {productivityDeltaPercent >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          Your productivity is {Math.abs(productivityDeltaPercent)}% {productivityDeltaPercent >= 0 ? 'higher' : 'lower'} than last week.
        </p>
      )}
    </div>
  )
}
