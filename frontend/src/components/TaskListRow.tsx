import type { CSSProperties } from 'react'
import type { RowComponentProps } from 'react-window'
import { Maximize2, X } from 'lucide-react'
import type { Task } from '../pages/DashboardApp'
import TagBadge from './TagBadge'

type RowHandlers = {
  statusColumns: string[]
  onSelect: (task: Task) => void
  onMove: (id: string, status: string) => void
  onDelete: (task: Task) => void
  onFocus: (task: Task) => void
}

function TaskRowContent({ tk, style, statusColumns, onSelect, onMove, onDelete, onFocus }: { tk: Task; style?: CSSProperties } & RowHandlers) {
  const blocked = tk.dependsOn?.some((d) => d.status !== 'COMPLETED')
  return (
    <div className="task-list-item" style={style} onClick={() => onSelect(tk)}>
      <div className="task-list-info">
        <strong>{tk.title}</strong>
        {tk.description && <span>{tk.description}</span>}
        <div className="task-list-meta">
          <span className={`priority-badge ${tk.priority.toLowerCase()}`}>{tk.priority}</span>
          <span className={`status-badge ${tk.status.toLowerCase()}`}>{tk.status.replace('_', ' ')}</span>
          {blocked && <span className="status-badge blocked">Blocked</span>}
          {tk.isRecurring && <span className="status-badge recurring">Repeats</span>}
          {tk.dueDate && <span>Due: {new Date(tk.dueDate).toLocaleDateString()}</span>}
        </div>
        {tk.tags && tk.tags.length > 0 && (
          <div className="tag-row" style={{ marginTop: 6 }}>
            {tk.tags.map(tag => <TagBadge key={tag.id} tag={tag} size="sm" />)}
          </div>
        )}
      </div>
      <div className="task-list-actions" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="mini-btn" title="Focus on this task" onClick={() => onFocus(tk)}><Maximize2 size={13} /></button>
        <select value={tk.status} onChange={(e) => onMove(tk.id, e.target.value)}>
          {statusColumns.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <button type="button" className="mini-btn danger-btn" onClick={() => onDelete(tk)} aria-label={`Delete task ${tk.title}`}><X size={13} /></button>
      </div>
    </div>
  )
}

// Non-virtualized row — used when the list is short enough that mapping
// over it directly is simpler and just as fast.
export function TaskListRowStatic({ tk, statusColumns, onSelect, onMove, onDelete, onFocus }: { tk: Task } & RowHandlers) {
  return <TaskRowContent tk={tk} statusColumns={statusColumns} onSelect={onSelect} onMove={onMove} onDelete={onDelete} onFocus={onFocus} />
}

// react-window v2 row component — used once a workspace's task list gets
// long enough that rendering every row to the DOM at once would be the
// bottleneck (see the VIRTUALIZE_THRESHOLD check at the call site).
export function TaskListRow({ index, style, tasksList, statusColumns, onSelect, onMove, onDelete, onFocus }: RowComponentProps<RowHandlers & { tasksList: Task[] }>) {
  const tk = tasksList[index]
  return <TaskRowContent tk={tk} style={style} statusColumns={statusColumns} onSelect={onSelect} onMove={onMove} onDelete={onDelete} onFocus={onFocus} />
}
