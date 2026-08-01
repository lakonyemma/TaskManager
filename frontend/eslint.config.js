import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Native browser dialogs block the whole tab (not just the app), can't
      // be styled, and look out of place next to everything else being an
      // in-app surface (toasts, modals, the PIN gate). Use useDialog()
      // (confirm/prompt) or showMessage() instead.
      'no-restricted-globals': [
        'error',
        { name: 'confirm', message: "Use useDialog()'s confirm() instead of the native browser confirm()." },
        { name: 'alert', message: 'Use showMessage()/an in-app toast instead of the native browser alert().' },
        { name: 'prompt', message: "Use useDialog()'s prompt() instead of the native browser prompt()." },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'confirm', message: "Use useDialog()'s confirm() instead of the native browser confirm()." },
        { object: 'window', property: 'alert', message: 'Use showMessage()/an in-app toast instead of the native browser alert().' },
        { object: 'window', property: 'prompt', message: "Use useDialog()'s prompt() instead of the native browser prompt()." },
      ],
    },
  },
])
