import '@fontsource-variable/manrope/wght.css'
import '@fontsource/ibm-plex-mono/500.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'

import { App } from '@/app/App'
import { AuthProvider } from '@/features/auth/AuthProvider'

import './index.css'

registerSW({
  immediate: true,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </AuthProvider>
  </StrictMode>,
)
