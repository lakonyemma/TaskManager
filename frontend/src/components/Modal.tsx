import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import './Modal.css'

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

export default function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  // Focus trap + Escape-to-close + restore focus to whatever triggered the
  // modal on close — standard modal accessibility, applied once here since
  // every modal in the app goes through this component. Deliberately
  // mount/unmount-only (not depending on `onClose`): a caller that defines
  // its close handler inline — a fresh function reference on every render —
  // would otherwise cause this to tear down and re-run on every keystroke
  // typed into a field inside the modal, yanking focus back to whatever
  // opened the modal and then back to the field on each render. `onCloseRef`
  // keeps the Escape handler calling the current callback regardless.
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const card = cardRef.current
    const focusable = card?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ;(focusable?.[0] || card)?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCloseRef.current(); return }
      if (e.key !== 'Tab' || !card) return
      const items = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(el => el.offsetParent !== null)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused.current?.focus?.()
    }
  }, [])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={cardRef} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id={titleId}>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog"><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
