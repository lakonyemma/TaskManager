import { useEffect, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import Modal from './Modal'

// Explicit getUserMedia-based capture (as opposed to just an
// `<input type=file capture>`, which hands the whole flow to the OS and
// never surfaces a permission-denied state to the app) — lets us show a
// live preview and a clear, actionable message if the user blocks camera
// access, per the "graceful fallback when permissions are denied"
// requirement. Works on any browser/PWA that implements
// navigator.mediaDevices.getUserMedia (all modern mobile + desktop browsers).
export default function CameraCapture({ onCapture, onClose }: {
  onCapture: (file: File) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!navigator.mediaDevices?.getUserMedia) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError('Camera capture is not supported in this browser. Use the file picker instead.')
      return
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
        setReady(true)
      })
      .catch(err => {
        if (cancelled) return
        setError(
          err?.name === 'NotAllowedError'
            ? 'Camera access was denied. Allow camera access in your browser settings, or use the file picker instead.'
            : 'Unable to access the camera. Use the file picker instead.',
        )
      })
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const capture = () => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(blob => {
      if (!blob) return
      onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.9)
  }

  return (
    <Modal title="Take a photo" onClose={onClose}>
      {error ? (
        <div>
          <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>
          <button type="button" className="mini-btn" onClick={onClose}>Close</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <video ref={videoRef} muted playsInline style={{ width: '100%', borderRadius: 12, background: '#000', maxHeight: 320, objectFit: 'cover' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="mini-btn secondary-btn" onClick={onClose}><X size={13} /> Cancel</button>
            <button type="button" className="mini-btn" disabled={!ready} onClick={capture}><Camera size={13} /> Capture</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
