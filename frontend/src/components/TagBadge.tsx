export type TagRef = { id: string; name: string; color: string }

// Converts a tag's hex color into a readable badge: solid-ish tint
// background derived from the color at low alpha, full-strength text/border.
// Keeps every tag legible regardless of which of the picker's colors was
// chosen, without needing a second "text color" field per tag.
const hexToRgb = (hex: string): string => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return '139, 92, 246'
  return [m[1], m[2], m[3]].map(h => parseInt(h, 16)).join(', ')
}

export default function TagBadge({ tag, onRemove, size = 'md' }: { tag: TagRef; onRemove?: () => void; size?: 'sm' | 'md' }) {
  const rgb = hexToRgb(tag.color)
  return (
    <span
      className={`tag-badge tag-badge-${size}`}
      style={{ color: tag.color, background: `rgba(${rgb}, 0.14)`, borderColor: `rgba(${rgb}, 0.35)` }}
    >
      {tag.name}
      {onRemove && (
        <button type="button" className="tag-badge-remove" onClick={onRemove} aria-label={`Remove tag ${tag.name}`}>×</button>
      )}
    </span>
  )
}
