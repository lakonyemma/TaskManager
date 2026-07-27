import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'taskly_install_dismissed_at'
const DISMISS_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000 // don't re-nag for 2 weeks after a dismissal

// Chrome/Edge/Android fire `beforeinstallprompt` when the PWA install
// criteria are met (manifest + registered SW with a fetch handler + HTTPS).
// We capture it (browsers only allow triggering `.prompt()` from that
// captured event, and only once) and show a small dismissible banner
// instead of the intrusive native mini-infobar — "display intelligently"
// per the spec, not on every page load.
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY) || 0)
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_SNOOZE_MS) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    const onInstalled = () => { setVisible(false); setDeferredPrompt(null) }
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()))
    setVisible(false)
  }

  const install = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome !== 'accepted') localStorage.setItem(DISMISSED_KEY, String(Date.now()))
    setDeferredPrompt(null)
    setVisible(false)
  }

  if (!visible || !deferredPrompt) return null

  return (
    <div className="install-prompt" role="dialog" aria-label="Install Taskly">
      <Download size={18} strokeWidth={1.8} />
      <div className="install-prompt-body">
        <strong>Install Taskly</strong>
        <span>Launch it like a native app, right from your desktop or home screen.</span>
      </div>
      <button type="button" className="mini-btn" onClick={install}>Install</button>
      <button type="button" className="install-prompt-dismiss" onClick={dismiss} aria-label="Dismiss install prompt"><X size={14} /></button>
    </div>
  )
}
