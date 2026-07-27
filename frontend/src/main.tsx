import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './lib/push.ts'

// Registered unconditionally (not gated on push-notification permission) so
// the PWA install prompt and offline asset/API caching work for every
// visitor, not just ones who've opted into push.
void registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
