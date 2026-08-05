import { useState } from 'react'
import { Check, Flag, Trash2 } from 'lucide-react'
import EmptyState from './EmptyState'
import { useDialog } from '../hooks/useDialog'

export type ManagedMilestone = {
  id: string
  name: string
  description?: string | null
  dueDate?: string | null
  achievedAt?: string | null
  totalTasks: number
  completedTasks: number
}

export default function MilestoneManager({
  milestones, canManage, canDelete, onCreate, onUpdate, onDelete,
}: {
  milestones: ManagedMilestone[]
  canManage: boolean
  canDelete: boolean
  onCreate: (name: string, description: string, dueDate: string) => void | Promise<void>
  onUpdate: (id: string, data: { name?: string; description?: string; dueDate?: string | null; achieved?: boolean }) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
}) {
  const { confirm } = useDialog()
  const [name, setName] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const submitNew = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onCreate(name.trim(), '', dueDate)
    setName('')
    setDueDate('')
  }

  const commitRename = (id: string) => {
    if (editingName.trim()) onUpdate(id, { name: editingName.trim() })
    setEditingId(null)
  }

  return (
    <div>
      {canManage && (
        <form className="tag-manager-row" onSubmit={submitNew} style={{ marginBottom: 4 }}>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="New milestone name" maxLength={60} style={{ flex: 1 }} />
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} aria-label="Milestone due date" style={{ maxWidth: 150 }} />
          <button type="submit" className="mini-btn" disabled={!name.trim()}>Add</button>
        </form>
      )}
      {milestones.length === 0 ? (
        <EmptyState kind="generic" compact title="No milestones yet" description={canManage ? 'Create your first milestone above.' : 'No milestones have been created in this workspace.'} />
      ) : (
        <div className="tag-manager-list">
          {milestones.map(m => {
            const progress = m.totalTasks > 0 ? Math.round((m.completedTasks / m.totalTasks) * 100) : 0
            return (
              <div key={m.id} className="milestone-manager-item">
                <div className="tag-manager-row">
                  <button
                    type="button"
                    className={`mini-btn milestone-achieve-btn ${m.achievedAt ? 'active' : ''}`}
                    disabled={!canManage}
                    onClick={() => onUpdate(m.id, { achieved: !m.achievedAt })}
                    aria-label={m.achievedAt ? `Mark ${m.name} not reached` : `Mark ${m.name} reached`}
                    title={m.achievedAt ? 'Reached — click to reopen' : 'Mark as reached'}
                  >
                    {m.achievedAt ? <Check size={13} /> : <Flag size={13} />}
                  </button>
                  {editingId === m.id ? (
                    <input
                      type="text"
                      value={editingName}
                      autoFocus
                      maxLength={60}
                      onChange={e => setEditingName(e.target.value)}
                      onBlur={() => commitRename(m.id)}
                      onKeyDown={e => { if (e.key === 'Enter') commitRename(m.id); if (e.key === 'Escape') setEditingId(null) }}
                    />
                  ) : (
                    <span
                      style={{ flex: 1, cursor: canManage ? 'text' : 'default', fontWeight: 600, fontSize: '0.85rem', textDecoration: m.achievedAt ? 'line-through' : 'none' }}
                      onClick={() => { if (canManage) { setEditingId(m.id); setEditingName(m.name) } }}
                    >
                      {m.name}
                    </span>
                  )}
                  {m.dueDate && <span className="tag-manager-count">Due {new Date(m.dueDate).toLocaleDateString()}</span>}
                  {canDelete && (
                    <button type="button" className="mini-btn danger-btn" onClick={async () => { if (await confirm(`Delete milestone "${m.name}"? Linked tasks will be unaffected.`, { danger: true, confirmLabel: 'Delete' })) onDelete(m.id) }} aria-label={`Delete milestone ${m.name}`}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <div className="milestone-progress-row">
                  <div className="milestone-progress-track">
                    <div className="milestone-progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="tag-manager-count">{m.completedTasks}/{m.totalTasks} tasks{m.totalTasks > 0 ? ` · ${progress}%` : ''}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
