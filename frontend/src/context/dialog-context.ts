import { createContext } from 'react'

export type ConfirmOptions = {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

export type PromptOptions = {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  placeholder?: string
  defaultValue?: string
}

export type DialogContextValue = {
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>
  prompt: (message: string, options?: PromptOptions) => Promise<string | null>
}

export const DialogContext = createContext<DialogContextValue | null>(null)
