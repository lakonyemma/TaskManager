import { authFetch, getStoredToken, jsonHeaders } from './api'

let installed = false
const sent = new Set<string>()

const sendTelemetry = async (payload: Record<string, unknown>, dedupeKey?: string) => {
  if (!getStoredToken() || !navigator.onLine) return
  if (dedupeKey && sent.has(dedupeKey)) return
  if (dedupeKey) sent.add(dedupeKey)
  try {
    await authFetch('/api/execution/telemetry', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    })
  } catch {
    // Reliability reporting must never create another user-facing failure.
  }
}

export const installClientTelemetry = () => {
  if (installed || typeof window === 'undefined') return
  installed = true

  window.addEventListener('error', (event) => {
    void sendTelemetry({
      kind: 'error',
      message: event.message || 'Unhandled browser error',
      route: window.location.pathname,
      details: {
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
      },
    }, `error:${event.message}:${event.filename}:${event.lineno}`)
  })

  window.addEventListener('unhandledrejection', (event) => {
    const message = event.reason instanceof Error ? event.reason.message : String(event.reason || 'Unhandled promise rejection')
    void sendTelemetry({
      kind: 'error',
      message,
      route: window.location.pathname,
      details: { source: 'unhandledrejection' },
    }, `promise:${message}`)
  })

  window.addEventListener('load', () => {
    window.setTimeout(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      if (!navigation) return
      const durationMs = Math.round(navigation.duration)
      if (durationMs < 1800) return
      void sendTelemetry({
        kind: 'performance',
        message: 'Slow application load',
        route: window.location.pathname,
        durationMs,
        details: {
          domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
          transferSize: navigation.transferSize,
        },
      }, `nav:${window.location.pathname}`)
    }, 750)
  }, { once: true })
}
