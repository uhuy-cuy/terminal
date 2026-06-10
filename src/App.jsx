import { useCallback, useEffect, useState } from 'react'
import Terminal from './components/Terminal'
import InstallPWA from './components/InstallPWA'
import ThemeSwitcher from './components/ThemeSwitcher'
import { applyTheme, getTheme, setPromptStyle } from './utils/themes'
import './App.css'

export default function App() {
  const [themeTick, setThemeTick] = useState(0)

  useEffect(() => {
    const bump = () => setThemeTick((n) => n + 1)
    window.addEventListener('tw-theme-change', bump)
    return () => window.removeEventListener('tw-theme-change', bump)
  }, [])

  const handleThemeChange = useCallback((themeId) => {
    const preset = getTheme(themeId)
    const result = applyTheme(themeId, { custom: {}, style: preset.style })
    window.dispatchEvent(new Event('tw-theme-change'))
    return result
  }, [])

  const handleStyleChange = useCallback((style) => {
    if (!setPromptStyle(style)) return false
    window.dispatchEvent(new Event('tw-theme-change'))
    return true
  }, [])

  return (
    <div className="app">
      <div className="window-chrome">
        <div className="window-buttons">
          <span className="btn btn-close" />
          <span className="btn btn-minimize" />
          <span className="btn btn-maximize" />
        </div>
        <span className="window-title">@tahirwiyan — terminal</span>
      </div>
      <Terminal />
      <ThemeSwitcher
        key={themeTick}
        onThemeChange={handleThemeChange}
        onStyleChange={handleStyleChange}
      />
      <InstallPWA />
    </div>
  )
}
