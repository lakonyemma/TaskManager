import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg } from '@fullcalendar/core'
import './TaskCalendar.css'

type Task = { id: string; title: string; dueDate?: string | null; status: string; priority: string }

const PRIORITY_COLOR: Record<string, string> = {
  LOW: '#38bdf8', MEDIUM: '#8B5CF6', HIGH: '#fb923c', CRITICAL: '#f87171',
}

// A 7-column month grid genuinely can't show a readable task title in the
// ~45px-wide cells a phone screen leaves it — defaulting to the list/agenda
// view there instead is what makes tasks legible on mobile; the grid is
// still one tap away via the view switcher for anyone who wants it.
const isNarrowScreen = () => typeof window !== 'undefined' && window.innerWidth < 700

export default function TaskCalendar({ tasks, onTaskClick }: { tasks: Task[]; onTaskClick: (taskId: string) => void }) {
  const events = tasks
    .filter(t => t.dueDate)
    .map(t => ({
      id: t.id,
      title: t.title,
      date: t.dueDate as string,
      backgroundColor: PRIORITY_COLOR[t.priority] || '#8B5CF6',
      borderColor: 'transparent',
      classNames: t.status === 'COMPLETED' ? ['fc-event-done'] : [],
    }))

  const handleEventClick = (info: EventClickArg) => {
    onTaskClick(info.event.id)
  }

  return (
    <div className="task-calendar-wrap">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        initialView={isNarrowScreen() ? 'listWeek' : 'dayGridMonth'}
        headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,listWeek' }}
        height="auto"
        events={events}
        eventClick={handleEventClick}
        dayMaxEvents={3}
        noEventsText="No tasks due this week"
      />
    </div>
  )
}
