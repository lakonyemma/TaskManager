export type RecurrenceConfig = {
  isRecurring: boolean
  recurrenceRule: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  recurrenceInterval: number
  recurrenceDaysOfWeek: number[]
  recurrenceBusinessDaysOnly: boolean
  recurrenceEndDate: string
  recurrenceCount: number | ''
}

export const DEFAULT_RECURRENCE: RecurrenceConfig = {
  isRecurring: false,
  recurrenceRule: 'WEEKLY',
  recurrenceInterval: 1,
  recurrenceDaysOfWeek: [],
  recurrenceBusinessDaysOnly: false,
  recurrenceEndDate: '',
  recurrenceCount: '',
}
