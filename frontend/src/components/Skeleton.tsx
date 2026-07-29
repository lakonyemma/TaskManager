// Shared skeleton-loading primitives — replaces plain "Loading…" text with a
// shimmering placeholder shaped like the content that's about to appear, so
// layout doesn't jump when real data lands.

export function SkeletonLine({ width = '100%', height = 14 }: { width?: string | number; height?: number }) {
  return <span className="skeleton skeleton-line" style={{ width, height }} />
}

export function SkeletonCircle({ size = 32 }: { size?: number }) {
  return <span className="skeleton skeleton-circle" style={{ width: size, height: size }} />
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-card-head">
        <SkeletonCircle size={28} />
        <div style={{ flex: 1 }}>
          <SkeletonLine width="60%" height={12} />
        </div>
      </div>
      <SkeletonLine width="90%" />
      <SkeletonLine width="70%" />
    </div>
  )
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton-list">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-list-item">
          <SkeletonCircle size={24} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SkeletonLine width={`${70 - i * 5}%`} />
            <SkeletonLine width="40%" height={10} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonStatCards({ count = 4 }: { count?: number }) {
  return (
    <div className="skeleton-stat-row">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-stat-card">
          <SkeletonLine width="50%" height={10} />
          <SkeletonLine width="35%" height={22} />
        </div>
      ))}
    </div>
  )
}

export function SkeletonChart({ height = 220 }: { height?: number }) {
  return <div className="skeleton skeleton-chart" style={{ height }} />
}
