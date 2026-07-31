import { useMemo, useState } from 'react'
import { GitBranch, Link2, Shuffle, X } from 'lucide-react'

type DepTask = { id: string; title: string; status: string }

// Manages a single task's dependency graph edges: "depends on" is editable
// (drives blocking-completion server-side), "blocks" is a read-only mirror
// of the same directional relation viewed from the other task, and
// "related to" is a separate, non-blocking, editable cross-link (no cycle
// checks, purely informational).
export default function DependencyPicker({
  taskId, candidateTasks, dependsOn, blocks, relatedTo, onChange, onRelatedChange, disabled,
}: {
  taskId: string
  candidateTasks: DepTask[]
  dependsOn: DepTask[]
  blocks: DepTask[]
  relatedTo: DepTask[]
  onChange: (newDependsOnIds: string[]) => void
  onRelatedChange: (newRelatedIds: string[]) => void
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [relatedQuery, setRelatedQuery] = useState('')
  const [relatedOpen, setRelatedOpen] = useState(false)

  const dependsOnIds = useMemo(() => new Set(dependsOn.map(t => t.id)), [dependsOn])
  const relatedIds = useMemo(() => new Set(relatedTo.map(t => t.id)), [relatedTo])

  const options = useMemo(() => {
    const q = query.trim().toLowerCase()
    return candidateTasks
      .filter(t => t.id !== taskId && !dependsOnIds.has(t.id))
      .filter(t => !q || t.title.toLowerCase().includes(q))
      .slice(0, 8)
  }, [candidateTasks, taskId, dependsOnIds, query])

  const relatedOptions = useMemo(() => {
    const q = relatedQuery.trim().toLowerCase()
    return candidateTasks
      .filter(t => t.id !== taskId && !relatedIds.has(t.id))
      .filter(t => !q || t.title.toLowerCase().includes(q))
      .slice(0, 8)
  }, [candidateTasks, taskId, relatedIds, relatedQuery])

  const addDependency = (depId: string) => {
    onChange([...dependsOn.map(t => t.id), depId])
    setQuery('')
    setOpen(false)
  }

  const removeDependency = (depId: string) => {
    onChange(dependsOn.filter(t => t.id !== depId).map(t => t.id))
  }

  const addRelated = (relId: string) => {
    onRelatedChange([...relatedTo.map(t => t.id), relId])
    setRelatedQuery('')
    setRelatedOpen(false)
  }

  const removeRelated = (relId: string) => {
    onRelatedChange(relatedTo.filter(t => t.id !== relId).map(t => t.id))
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

      <div className="dependency-section">
        <span className="dependency-label"><Shuffle size={13} strokeWidth={1.8} /> Related to</span>
        <div className="dependency-tag-row">
          {relatedTo.map(t => (
            <span key={t.id} className="dependency-tag related">
              {t.title}
              {!disabled && <button type="button" onClick={() => removeRelated(t.id)} aria-label={`Remove related task ${t.title}`}><X size={11} /></button>}
            </span>
          ))}
          {relatedTo.length === 0 && <span className="empty-column" style={{ padding: 0 }}>No related tasks</span>}
        </div>
        {!disabled && (
          <div className="dependency-add">
            <input
              value={relatedQuery}
              onChange={e => { setRelatedQuery(e.target.value); setRelatedOpen(true) }}
              onFocus={() => setRelatedOpen(true)}
              onBlur={() => setTimeout(() => setRelatedOpen(false), 150)}
              placeholder="Search tasks to relate…"
              aria-label="Search tasks to mark as related"
            />
            {relatedOpen && relatedOptions.length > 0 && (
              <ul className="dependency-suggestions" role="listbox">
                {relatedOptions.map(t => (
                  <li key={t.id}>
                    <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => addRelated(t.id)}>
                      {t.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
