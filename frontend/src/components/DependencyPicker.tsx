import { useMemo, useState } from 'react'
import { GitBranch, Link2, X } from 'lucide-react'

type DepTask = { id: string; title: string; status: string }

// Manages a single task's dependency graph edges: "depends on" is editable
// (drives blocking-completion server-side), "blocks" is a read-only mirror
// of the same directional relation viewed from the other task.
export default function DependencyPicker({
  taskId, candidateTasks, dependsOn, blocks, onChange, disabled,
}: {
  taskId: string
  candidateTasks: DepTask[]
  dependsOn: DepTask[]
  blocks: DepTask[]
  onChange: (newDependsOnIds: string[]) => void
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const dependsOnIds = useMemo(() => new Set(dependsOn.map(t => t.id)), [dependsOn])

  const options = useMemo(() => {
    const q = query.trim().toLowerCase()
    return candidateTasks
      .filter(t => t.id !== taskId && !dependsOnIds.has(t.id))
      .filter(t => !q || t.title.toLowerCase().includes(q))
      .slice(0, 8)
  }, [candidateTasks, taskId, dependsOnIds, query])

  const addDependency = (depId: string) => {
    onChange([...dependsOn.map(t => t.id), depId])
    setQuery('')
    setOpen(false)
  }

  const removeDependency = (depId: string) => {
    onChange(dependsOn.filter(t => t.id !== depId).map(t => t.id))
  }

  return (
    <div className="dependency-picker">
      <div className="dependency-section">
        <span className="dependency-label"><GitBranch size={13} strokeWidth={1.8} /> Depends on</span>
        <div className="dependency-tag-row">
          {dependsOn.map(t => (
            <span key={t.id} className={`dependency-tag ${t.status === 'COMPLETED' ? 'done' : ''}`}>
              {t.title}
              {!disabled && <button type="button" onClick={() => removeDependency(t.id)} aria-label={`Remove dependency on ${t.title}`}><X size={11} /></button>}
            </span>
          ))}
          {dependsOn.length === 0 && <span className="empty-column" style={{ padding: 0 }}>No dependencies</span>}
        </div>
        {!disabled && (
          <div className="dependency-add">
            <input
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder="Search tasks to depend on…"
              aria-label="Search tasks to add as a dependency"
            />
            {open && options.length > 0 && (
              <ul className="dependency-suggestions" role="listbox">
                {options.map(t => (
                  <li key={t.id}>
                    <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => addDependency(t.id)}>
                      {t.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {blocks.length > 0 && (
        <div className="dependency-section">
          <span className="dependency-label"><Link2 size={13} strokeWidth={1.8} /> Blocks</span>
          <div className="dependency-tag-row">
            {blocks.map(t => (
              <span key={t.id} className={`dependency-tag readonly ${t.status === 'COMPLETED' ? 'done' : ''}`}>{t.title}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
