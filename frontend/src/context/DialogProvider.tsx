import { useCallback, useRef, useState, type ReactNode } from 'react'
import Modal from '../components/Modal'
import { DialogContext, type ConfirmOptions, type PromptOptions } from './dialog-context'

type DialogState =
  | { kind: 'confirm'; message: string; options: ConfirmOptions }
  | { kind: 'prompt'; message: string; options: PromptOptions }

// Renders a single shared Modal for every confirm()/prompt() call in the
// app, in place of native browser dialogs — those can't be styled, block
// the whole tab (not just the app), and look out of place next to
// everything else here being an in-app surface (toasts, modals, PIN gate).
export default function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [inputValue, setInputValue] = useState('')
  const resolveRef = useRef<((value: boolean | string | null) => void) | null>(null)

  const settle = useCallback((value: boolean | string | null) => {
    resolveRef.current?.(value)
    resolveRef.current = null
    setDialog(null)
  }, [])

  const confirm = useCallback((message: string, options: ConfirmOptions = {}) => {
    return new Promise<boolean>(resolve => {
      resolveRef.current = resolve as (value: boolean | string | null) => void
      setDialog({ kind: 'confirm', message, options })
    })
  }, [])

  const prompt = useCallback((message: string, options: PromptOptions = {}) => {
    setInputValue(options.defaultValue || '')
    return new Promise<string | null>(resolve => {
      resolveRef.current = resolve as (value: boolean | string | null) => void
      setDialog({ kind: 'prompt', message, options })
    })
  }, [])

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      {dialog && (
        <Modal
          title={dialog.options.title || (dialog.kind === 'prompt' ? 'Name it' : 'Please confirm')}
          onClose={() => settle(dialog.kind === 'confirm' ? false : null)}
        >
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: dialog.kind === 'prompt' ? '0 0 12px' : 0 }}>
            {dialog.message}
          </p>
          {dialog.kind === 'prompt' && (
            <input
              type="text"
              autoFocus
              value={inputValue}
              placeholder={dialog.options.placeholder}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') settle(inputValue) }}
            />
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="mini-btn secondary-btn" onClick={() => settle(dialog.kind === 'confirm' ? false : null)}>
              {dialog.options.cancelLabel || 'Cancel'}
            </button>
            <button
              type="button"
              className={`mini-btn ${dialog.kind === 'confirm' && dialog.options.danger ? 'danger-btn' : ''}`}
              onClick={() => settle(dialog.kind === 'confirm' ? true : inputValue)}
            >
              {dialog.options.confirmLabel || (dialog.kind === 'prompt' ? 'Save' : 'Confirm')}
            </button>
          </div>
        </Modal>
      )}
    </DialogContext.Provider>
  )
}
