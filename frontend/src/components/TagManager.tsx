import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import EmptyState from './EmptyState'

export type ManagedTag = { id: string; name: string; color: string; _count?: { tasks: number } }

const DEFAULT_COLOR = '#8b5cf6'

export default function TagManager({
  tags, canManage, canDelete, onCreate, onUpdate, onDelete,
}: {
  tags: ManagedTag[]
  canManage: boolean
  canDelete: boolean
  onCreate: (name: string, color: string) => void | Promise<void>
  onUpdate: (id: string, data: { name?: string; color?: string }) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const submitNew = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onCreate(name.trim(), color)
    setName('')
    setColor(DEFAULT_COLOR)
  }

  const commitRename = (id: string) => {
    if (editingName.trim()) onUpdate(id, { name: editingName.trim() })
    setEditingId(null)
  }

  return (
    <div>
      {canManage && (
        <form className="tag-manager-row" onSubmit={submitNew} style={{ marginBottom: 4 }}>
          <input type="color" value={color} onChange={e => setColor(e.target.value)} aria-label="Tag color" />
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="New tag name" maxLength={40} />
          <button type="submit" className="mini-btn" disabled={!name.trim()}>Add</button>
        </form>
      )}
      {tags.length === 0 ? (
        <EmptyState kind="generic" compact title="No tags yet" description={canManage ? 'Create your first tag above.' : 'No tags have been created in this workspace.'} />
      ) : (
        <div className="tag-manager-list">
          {tags.map(tag => (
            <div key={tag.id} className="tag-manager-row">
              <input
                type="color"
                value={tag.color}
                onChange={e => onUpdate(tag.id, { color: e.target.value })}
                aria-label={`Change color for ${tag.name}`}
                disabled={!canManage}
              />
              {editingId === tag.id ? (
                <input
                  type="text"
                  value={editingName}
                  autoFocus
                  maxLength={40}
                  onChange={e => setEditingName(e.target.value)}
                  onBlur={() => commitRename(tag.id)}
                  onKeyDown={e => { if (e.key === 'Enter') commitRename(tag.id); if (e.key === 'Escape') setEditingId(null) }}
                />
              ) : (
                <span
                  style={{ flex: 1, cursor: canManage ? 'text' : 'default', color: tag.color, fontWeight: 600, fontSize: '0.85rem' }}
                  onClick={() => { if (canManage) { setEditingId(tag.id); setEditingName(tag.name) } }}
                >
                  {tag.name}
                </span>
              )}
              {typeof tag._count?.tasks === 'number' && <span className="tag-manager-count">{tag._count.tasks} task{tag._count.tasks === 1 ? '' : 's'}</span>}
              {canDelete && (
                <button type="button" className="mini-btn danger-btn" onClick={() => { if (confirm(`Delete tag "${tag.name}"? It will be removed from every task.`)) onDelete(tag.id) }} aria-label={`Delete tag ${tag.name}`}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
