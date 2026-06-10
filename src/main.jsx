import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import { loadSavedTheme } from './utils/themes.js'
import './index.css'

loadSavedTheme()

registerSW({
  immediate: true,
  onOfflineReady() {
    console.log('@tahirwiyan siap offline')
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
