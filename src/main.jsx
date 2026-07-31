import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts.css'
import './index.css'
import App from './App.jsx'
import { applyThemeFamily } from './lib/theme'
import { peekThemeFamily } from './lib/themeStorage'

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
