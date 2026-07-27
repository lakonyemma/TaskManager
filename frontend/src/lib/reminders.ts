// Mirrors backend/src/features/reminders/reminderService.ts REMINDER_OFFSET_OPTIONS.
export const REMINDER_OFFSETS: { minutes: number; label: string }[] = [
  { minutes: 5, label: '5 minutes before' },
  { minutes: 10, label: '10 minutes before' },
  { minutes: 15, label: '15 minutes before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 1440, label: '1 day before' },
]

export type ReminderSchedule = {
  id: string
  taskId: string
  offsetMinutes: number | null
  remindAt: string
  label: string
  status: 'PENDING' | 'SENT' | 'CANCELLED' | 'SNOOZED'
}
