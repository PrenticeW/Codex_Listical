import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts.css'
import './index.css'
import App from './App.jsx'
import { applyThemeFamily } from './lib/theme'
import { peekThemeFamily } from './lib/themeStorage'
import { registerSW } from 'virtual:pwa-register'

// Service worker: registerType 'autoUpdate' reloads the page when a new
// build takes control, but the browser only checks for a new worker on
// navigation — a tab left open for weeks keeps running the bundle it loaded,
// including any save logic since fixed (2026-08-27 stale-tab incident). Ask
// the registration to check on every wake and once an hour so a long-lived
// tab is never more than one wake behind the deployed build.
const SW_UPDATE_INTERVAL_MS = 60 * 60 * 1000
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    const check = () => registration.update().catch(() => {})
    setInterval(check, SW_UPDATE_INTERVAL_MS)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
    window.addEventListener('online', check)
  },
})

// Apply the cached theme family before the first render so a refresh never
// flashes the stylesheet's blue defaults while the Supabase read (in
// Layout) is in flight. First-ever visits have no cache and keep the
// defaults until that read resolves.
const cachedTheme = peekThemeFamily()
if (cachedTheme) applyThemeFamily(cachedTheme)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
