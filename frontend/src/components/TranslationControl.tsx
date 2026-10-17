import { useEffect, useState } from 'react'

type Translator = {
  service: { use: (name: string) => void }
  listener: { start: () => void }
  execute: () => void
  changeLanguage: (language: string) => void
  language: { setLocal: (language: string) => void }
}
declare global { interface Window { translate?: Translator } }
const CONSENT_KEY = 'taskly.translation.externalConsent.v1'
const LANGUAGE_KEY = 'taskly.translation.language.v1'
// Presentation-only: translation never writes to application state, APIs, or PostgreSQL.
// Editing fields retain their original text; translated DOM text is for reading only.
const SCRIPT_URL = 'https://res.wang.market/translate/translate.js'

function read(key: string) { try { return localStorage.getItem(key) } catch { return null } }
function save(key: string, value: string) { try { localStorage.setItem(key, value) } catch { /* storage unavailable */ } }

function loadTranslator(): Promise<Translator> {
  if (window.translate) return Promise.resolve(window.translate)
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => window.translate ? resolve(window.translate) : reject(new Error('Translation library unavailable'))
    script.onerror = () => reject(new Error('Translation library failed to load'))
    document.head.appendChild(script)
  })
}

// The translation engine stays mounted outside Settings, so language persists
// across route changes and after reloading a dashboard URL.
let initialization: Promise<Translator> | null = null
function initialize(): Promise<Translator> {
  if (!initialization) {
    initialization = loadTranslator().then(translate => {
      translate.service.use('client.edge')
      translate.language.setLocal('english')
      translate.listener.start()
      translate.execute()
      return translate
    }).catch(err => { initialization = null; throw err })
  }
  return initialization
}

export function TranslationRuntime() {
  useEffect(() => {
    let mounted = true
    const sync = () => {
      if (read(CONSENT_KEY) !== 'yes') return
      void initialize().then(translate => {
        if (!mounted) return
        translate.changeLanguage(read(LANGUAGE_KEY) || 'english')
        window.dispatchEvent(new Event('taskly:translation-ready'))
      }).catch(() => {
        // Settings can retry; no external translation service is loaded without consent.
      })
    }
    window.addEventListener('taskly:translation-change', sync)
    sync()
    return () => {
      mounted = false
      window.removeEventListener('taskly:translation-change', sync)
    }
  }, [])
  return null
}

export default function TranslationControl() {
  const [consented, setConsented] = useState(() => read(CONSENT_KEY) === 'yes')
  const [language, setLanguage] = useState(() => read(LANGUAGE_KEY) || 'english')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const sync = () => {
      setReady(Boolean(window.translate))
      setError(window.translate ? '' : 'Translation is loading. Please try again shortly.')
    }
    window.addEventListener('taskly:translation-ready', sync)
    sync()
    return () => window.removeEventListener('taskly:translation-ready', sync)
  }, [])
  function changeLanguage(next: string) {
    setLanguage(next)
    save(LANGUAGE_KEY, next)
    window.dispatchEvent(new Event('taskly:translation-change'))
  }
  function revoke() {
    save(CONSENT_KEY, 'no')
    setConsented(false)
    // Remove previously translated DOM state and disable translation observers on a clean reload.
    window.dispatchEvent(new Event('taskly:translation-change'))
    window.location.reload()
  }
  return (
    <aside aria-label="Translation settings" style={{ width: '100%', padding: 16, borderRadius: 12, background: 'var(--card-bg, #181b30)', color: '#fff', fontSize: 14 }}>
      {!consented ? (
        <>
          <strong>Language & translation</strong>
          <p>Translation may send all visible text, including private tasks, comments, names and workspace content, to an external translation service. Do not enable for confidential data without permission from the people involved.</p>
          <button type="button" onClick={() => { save(CONSENT_KEY, 'yes'); setConsented(true); window.dispatchEvent(new Event('taskly:translation-change')) }}>I agree — enable translation</button>
        </>
      ) : (
        <>
          <label htmlFor="taskly-translation-language">Display language (original content is preserved)</label>
          <select id="taskly-translation-language" value={language} disabled={!ready} onChange={e => changeLanguage(e.target.value)} style={{ display: 'block', width: '100%', margin: '6px 0', color: '#111' }}>
            <option value="english">English</option>
            <option value="chinese_simplified">Chinese (Simplified)</option>
            <option value="spanish">Spanish</option>
            <option value="french">French</option>
            <option value="german">German</option>
            <option value="japanese">Japanese</option>
            <option value="korean">Korean</option>
            <option value="swahili">Swahili (availability varies)</option>
          </select>
          {error && <p role="alert">{error}</p>}
          <button type="button" onClick={() => changeLanguage('english')} disabled={!ready || language === 'english'}>Show original language</button>{' '}
          <button type="button" onClick={revoke}>Disable translation and revoke consent</button>
        </>
      )}
    </aside>
  )
}
