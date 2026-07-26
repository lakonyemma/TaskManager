import { useEffect, useRef, useState } from 'react'
import {
  LayoutDashboard, ClipboardCheck, KanbanSquare, CalendarDays, Users, ChartColumn, Bell,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, BarChart, Bar,
} from 'recharts'
import './ProductPreview.css'

const STATUS_DATA = [
  { name: 'Completed', value: 24, color: '#34d399' },
  { name: 'In Progress', value: 12, color: '#fb923c' },
  { name: 'To Do', value: 8, color: '#38bdf8' },
  { name: 'Overdue', value: 3, color: '#f87171' },
]

const TREND_DATA = [
  { day: 'Mon', done: 4 }, { day: 'Tue', done: 7 }, { day: 'Wed', done: 5 },
  { day: 'Thu', done: 9 }, { day: 'Fri', done: 12 }, { day: 'Sat', done: 6 }, { day: 'Sun', done: 8 },
]

const TEAM = [
  { name: 'Amara', color: '#8B5CF6' }, { name: 'Jonah', color: '#A855F7' },
  { name: 'Priya', color: '#38bdf8' }, { name: 'Théo', color: '#fb923c' },
]

const NOTIFS = [
  'Amara assigned you "Redesign onboarding flow"',
  'Sprint review scheduled for Friday, 2:00 PM',
  'Jonah completed "API rate limiting"',
]

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'tasks', label: 'My Tasks', icon: ClipboardCheck },
  { key: 'boards', label: 'Boards', icon: KanbanSquare },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'team', label: 'Team', icon: Users },
  { key: 'reports', label: 'Reports', icon: ChartColumn },
] as const

type TabKey = typeof TABS[number]['key']

function MiniCalendar() {
  const today = new Date()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).getDay()
  const marked = new Set([3, 9, 14, 22, today.getDate()])
  return (
    <div className="pv-calendar">
      {Array.from({ length: firstDay }).map((_, i) => <span key={`e${i}`} />)}
      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
        <span key={d} className={`pv-cal-day ${d === today.getDate() ? 'is-today' : ''} ${marked.has(d) ? 'has-task' : ''}`}>{d}</span>
      ))}
    </div>
  )
}

function TabContent({ tab }: { tab: TabKey }) {
  if (tab === 'dashboard') {
    return (
      <>
        <div className="pv-cards">
          <div className="pv-card"><strong>47</strong><span>Total</span></div>
          <div className="pv-card"><strong style={{ color: '#34d399' }}>24</strong><span>Completed</span></div>
          <div className="pv-card"><strong style={{ color: '#fb923c' }}>12</strong><span>In Progress</span></div>
          <div className="pv-card"><strong style={{ color: '#f87171' }}>3</strong><span>Overdue</span></div>
        </div>
        <div className="pv-charts-row">
          <div className="pv-chart-box">
            <ResponsiveContainer width="100%" height={110}>
              <PieChart>
                <Pie data={STATUS_DATA} dataKey="value" innerRadius={28} outerRadius={44} paddingAngle={3} stroke="none">
                  {STATUS_DATA.map(s => <Cell key={s.name} fill={s.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="pv-chart-box">
            <ResponsiveContainer width="100%" height={110}>
              <AreaChart data={TREND_DATA}>
                <defs>
                  <linearGradient id="pvArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C084FC" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#C084FC" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" hide />
                <Area type="monotone" dataKey="done" stroke="#A855F7" fill="url(#pvArea)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </>
    )
  }
  if (tab === 'reports') {
    return (
      <div className="pv-chart-box" style={{ width: '100%' }}>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={TREND_DATA}>
            <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Bar dataKey="done" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }
  if (tab === 'calendar') return <MiniCalendar />
  if (tab === 'team') {
    return (
      <div className="pv-team-list">
        {TEAM.map(m => (
          <div key={m.name} className="pv-team-row">
            <span className="pv-avatar" style={{ background: m.color }}>{m.name[0]}</span>
            <span>{m.name}</span>
          </div>
        ))}
      </div>
    )
  }
  if (tab === 'boards') {
    return (
      <div className="pv-board">
        {['To Do', 'In Progress', 'Done'].map(col => (
          <div key={col} className="pv-board-col">
            <span className="pv-board-title">{col}</span>
            <div className="pv-board-card" />
            <div className="pv-board-card" />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="pv-tasks">
      {[1, 2, 3].map(i => (
        <div key={i} className="pv-task-row">
          <span className="pv-task-check" />
          <span className="pv-task-line" style={{ width: `${70 - i * 12}%` }} />
        </div>
      ))}
    </div>
  )
}

export default function ProductPreview() {
  const [active, setActive] = useState<TabKey>('dashboard')
  const [notifOpen, setNotifOpen] = useState(false)
  const paused = useRef(false)

  useEffect(() => {
    const interval = setInterval(() => {
      if (paused.current) return
      setActive(prev => {
        const idx = TABS.findIndex(t => t.key === prev)
        return TABS[(idx + 1) % TABS.length].key
      })
    }, 3200)
    return () => clearInterval(interval)
  }, [])

  return (
    <div
      className="browser-mockup"
      onMouseEnter={() => { paused.current = true }}
      onMouseLeave={() => { paused.current = false }}
    >
      <div className="browser-toolbar">
        <span className="browser-dot" style={{ background: '#f87171' }} />
        <span className="browser-dot" style={{ background: '#fbbf24' }} />
        <span className="browser-dot" style={{ background: '#34d399' }} />
        <div className="browser-address">app.taskly.com/{active}</div>
      </div>
      <div className="pv-body">
        <div className="pv-sidebar">
          <div className="pv-logo">Taskly</div>
          {TABS.map(t => (
            <button
              key={t.key}
              className={`pv-nav-item ${active === t.key ? 'active' : ''}`}
              onClick={() => setActive(t.key)}
              type="button"
            >
              <t.icon size={15} strokeWidth={2} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <div className="pv-main">
          <div className="pv-topbar">
            <span className="pv-topbar-title">{TABS.find(t => t.key === active)?.label}</span>
            <div className="pv-bell-wrap">
              <Bell size={15} onClick={() => setNotifOpen(v => !v)} />
              <span className="pv-badge">{NOTIFS.length}</span>
              {notifOpen && (
                <div className="pv-notif-dropdown">
                  {NOTIFS.map(n => <div key={n} className="pv-notif-item">{n}</div>)}
                </div>
              )}
            </div>
          </div>
          <div className="pv-content" key={active}>
            <TabContent tab={active} />
          </div>
        </div>
      </div>
    </div>
  )
}
