import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Maximize2 } from 'lucide-react'
import './AnalogClock.css'

const STORAGE_KEY = 'taskly.clockSizePx'
const MIN_SIZE = 40
const MAX_SIZE = 200
const DEFAULT_SIZE = 96
const DEFAULT_SIZE_MOBILE = 64

const readInitialSize = () => {
  const stored = Number(localStorage.getItem(STORAGE_KEY))
  if (stored >= MIN_SIZE && stored <= MAX_SIZE) return stored
  return window.innerWidth <= 600 ? DEFAULT_SIZE_MOBILE : DEFAULT_SIZE
}

// Ticks once a second — cheap (a handful of SVG transform updates) and
// gives the second hand real motion instead of feeling frozen.
export default function AnalogClock() {
  const [now, setNow] = useState(() => new Date())
  const [size, setSize] = useState(readInitialSize)
  const dragRef = useRef<{ startX: number; startY: number; startSize: number } | null>(null)

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const handlePointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { startX: e.clientX, startY: e.clientY, startSize: size }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (!dragRef.current) return
    const { startX, startY, startSize } = dragRef.current
    // Dragging the corner outward (down-right) grows it, inward shrinks it —
    // averaging the two axes keeps a diagonal drag feeling proportionate.
    const delta = ((e.clientX - startX) + (e.clientY - startY)) / 2
    setSize(Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(startSize + delta))))
  }

  const stopDragging = () => {
    if (!dragRef.current) return
    dragRef.current = null
    localStorage.setItem(STORAGE_KEY, String(size))
  }

  const hours = now.getHours() % 12
  const minutes = now.getMinutes()
  const seconds = now.getSeconds()

  const hourDeg = hours * 30 + minutes * 0.5
  const minuteDeg = minutes * 6 + seconds * 0.1
  const secondDeg = seconds * 6

  return (
    <div className="analog-clock" style={{ width: size, height: size }} role="img" aria-label={`Current time: ${now.toLocaleTimeString()}`}>
      <svg viewBox="0 0 100 100">
        <circle className="analog-clock-face" cx="50" cy="50" r="45" />
        {Array.from({ length: 12 }).map((_, i) => (
          <line
            key={i}
            className={`analog-clock-tick ${i % 3 === 0 ? 'major' : ''}`}
            x1="50" y1="7" x2="50" y2={i % 3 === 0 ? 13 : 10}
            transform={`rotate(${i * 30} 50 50)`}
          />
        ))}
        <line className="analog-clock-hand hour" x1="50" y1="50" x2="50" y2="28" transform={`rotate(${hourDeg} 50 50)`} />
        <line className="analog-clock-hand minute" x1="50" y1="50" x2="50" y2="18" transform={`rotate(${minuteDeg} 50 50)`} />
        <line className="analog-clock-hand second" x1="50" y1="50" x2="50" y2="15" transform={`rotate(${secondDeg} 50 50)`} />
        <circle className="analog-clock-pivot" cx="50" cy="50" r="3.2" />
      </svg>
      <span
        className="analog-clock-resize-handle"
        role="slider"
        aria-label="Resize clock"
        aria-valuemin={MIN_SIZE}
        aria-valuemax={MAX_SIZE}
        aria-valuenow={size}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onKeyDown={e => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setSize(s => { const next = Math.min(MAX_SIZE, s + 4); localStorage.setItem(STORAGE_KEY, String(next)); return next })
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setSize(s => { const next = Math.max(MIN_SIZE, s - 4); localStorage.setItem(STORAGE_KEY, String(next)); return next })
        }}
      >
        <Maximize2 size={10} strokeWidth={2.5} />
      </span>
    </div>
  )
}
