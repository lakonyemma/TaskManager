import { Repeat } from 'lucide-react'
import type { RecurrenceConfig } from '../lib/recurrence'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const RULE_UNIT: Record<RecurrenceConfig['recurrenceRule'], string> = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }

export default function RecurrencePicker({ value, onChange }: { value: RecurrenceConfig; onChange: (v: RecurrenceConfig) => void }) {
  const set = (patch: Partial<RecurrenceConfig>) => onChange({ ...value, ...patch })
  const toggleDay = (day: number) => set({
    recurrenceDaysOfWeek: value.recurrenceDaysOfWeek.includes(day)
      ? value.recurrenceDaysOfWeek.filter(d => d !== day)
      : [...value.recurrenceDaysOfWeek, day].sort(),
  })

  return (
    <div className="recurrence-picker">
      <label className="remember-row">
        <input type="checkbox" checked={value.isRecurring} onChange={e => set({ isRecurring: e.target.checked })} />
        <span><Repeat size={13} style={{ verticalAlign: -2 }} /> Repeat this task</span>
      </label>

      {value.isRecurring && (
        <div className="recurrence-details">
          <div className="recurrence-interval-row">
            <span>Every</span>
            <input
              type="number" min={1} max={365} value={value.recurrenceInterval}
              onChange={e => set({ recurrenceInterval: Math.max(1, Number(e.target.value) || 1) })}
              aria-label="Recurrence interval"
            />
            <select value={value.recurrenceRule} onChange={e => set({ recurrenceRule: e.target.value as RecurrenceConfig['recurrenceRule'] })} aria-label="Recurrence unit">
              <option value="DAILY">day(s)</option>
              <option value="WEEKLY">week(s)</option>
              <option value="MONTHLY">month(s)</option>
              <option value="YEARLY">year(s)</option>
            </select>
          </div>

          {value.recurrenceRule === 'WEEKLY' && (
            <div className="recurrence-weekday-row">
              {WEEKDAYS.map((label, day) => (
                <button
                  key={day} type="button"
                  className={`recurrence-weekday ${value.recurrenceDaysOfWeek.includes(day) ? 'active' : ''}`}
                  onClick={() => toggleDay(day)}
                  aria-pressed={value.recurrenceDaysOfWeek.includes(day)}
                  aria-label={`Repeat on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]}`}
                >{label}</button>
              ))}
            </div>
          )}

          {value.recurrenceRule === 'DAILY' && (
            <label className="remember-row">
              <input type="checkbox" checked={value.recurrenceBusinessDaysOnly} onChange={e => set({ recurrenceBusinessDaysOnly: e.target.checked })} />
              <span>Business days only (skip weekends)</span>
            </label>
          )}

          <div className="recurrence-end-row">
            <span>Ends</span>
            <select
              value={value.recurrenceEndDate ? 'date' : value.recurrenceCount ? 'count' : 'never'}
              onChange={e => {
                if (e.target.value === 'never') set({ recurrenceEndDate: '', recurrenceCount: '' })
                else if (e.target.value === 'date') set({ recurrenceCount: '' })
                else set({ recurrenceEndDate: '' })
              }}
            >
              <option value="never">Never</option>
              <option value="date">On date</option>
              <option value="count">After N occurrences</option>
            </select>
            {(value.recurrenceEndDate || !value.recurrenceCount) && (
              <input
                type="date" value={value.recurrenceEndDate}
                onChange={e => set({ recurrenceEndDate: e.target.value, recurrenceCount: '' })}
                style={{ display: value.recurrenceCount ? 'none' : undefined }}
                aria-label="Recurrence end date"
              />
            )}
            {!!value.recurrenceCount && (
              <input
                type="number" min={1} max={999} value={value.recurrenceCount}
                onChange={e => set({ recurrenceCount: Math.max(1, Number(e.target.value) || 1), recurrenceEndDate: '' })}
                aria-label="Number of occurrences"
              />
            )}
          </div>
          <p className="recurrence-summary">
            Repeats every {value.recurrenceInterval > 1 ? `${value.recurrenceInterval} ` : ''}{RULE_UNIT[value.recurrenceRule]}{value.recurrenceInterval > 1 ? 's' : ''}
            {value.recurrenceRule === 'WEEKLY' && value.recurrenceDaysOfWeek.length > 0 ? ` on ${value.recurrenceDaysOfWeek.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}` : ''}
            {value.recurrenceBusinessDaysOnly ? ' (business days only)' : ''}
            {value.recurrenceEndDate ? ` until ${value.recurrenceEndDate}` : ''}
            {value.recurrenceCount ? ` for ${value.recurrenceCount} occurrences` : ''}.
          </p>
        </div>
      )}
    </div>
  )
}
