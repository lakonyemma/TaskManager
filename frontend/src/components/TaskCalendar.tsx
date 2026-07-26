import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg } from '@fullcalendar/core'
import './TaskCalendar.css'

type Task = { id: string; title: string; dueDate?: string | null; status: string; priority: string }

const PRIORITY_COLOR: Record<string, string> = {
  LOW: '#38bdf8', MEDIUM: '#8B5CF6', HIGH: '#fb923c', CRITICAL: '#f87171',
}

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
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
        height="auto"
        events={events}
        eventClick={handleEventClick}
        dayMaxEvents={3}
      />
    </div>
  )
}
