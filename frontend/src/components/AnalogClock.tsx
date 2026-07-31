import { useEffect, useState } from 'react'
import './AnalogClock.css'

// Ticks once a second — cheap (a handful of SVG transform updates) and
// gives the second hand real motion instead of feeling frozen.
export default function AnalogClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const hours = now.getHours() % 12
  const minutes = now.getMinutes()
  const seconds = now.getSeconds()

  const hourDeg = hours * 30 + minutes * 0.5
  const minuteDeg = minutes * 6 + seconds * 0.1
  const secondDeg = seconds * 6

  return (
    <div className="analog-clock" role="img" aria-label={`Current time: ${now.toLocaleTimeString()}`}>
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
    </div>
  )
}
