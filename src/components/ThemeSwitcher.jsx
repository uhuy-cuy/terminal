import { useEffect, useState } from 'react'
import { getCurrentThemeState, getTheme, setPromptStyle, THEMES } from '../utils/themes'
import './ThemeSwitcher.css'

export default function ThemeSwitcher({ onThemeChange, onStyleChange }) {
  const [open, setOpen] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    const bump = () => setTick((n) => n + 1)
    window.addEventListener('tw-theme-change', bump)
    return () => window.removeEventListener('tw-theme-change', bump)
  }, [])

  const { id: activeId, style } = getCurrentThemeState()
  const theme = getTheme(activeId)
  const styles = ['powerline', 'rounded', 'flat']

  const handleSelect = (themeId) => {
    onThemeChange(themeId)
  }

  const handleStyle = (nextStyle) => {
    if (onStyleChange) onStyleChange(nextStyle)
    else setPromptStyle(nextStyle)
  }

  return (
    <div className="theme-switcher">
      <details
        className="theme-switcher-details"
        open={open}
        onToggle={(e) => setOpen(e.currentTarget.open)}
      >
        <summary className="theme-switcher-toggle" title="Ganti tema">
          <span className="theme-preview">
            <span style={{ background: theme.vars['--tw-user-bg'] }} />
            <span style={{ background: theme.vars['--tw-path-bg'] }} />
            <span style={{ background: theme.vars['--tw-git-bg'] }} />
            <span style={{ background: theme.vars['--tw-shell-bg'] }} />
          </span>
          <span className="theme-switcher-label">{theme.label}</span>
          <span className="theme-switcher-chevron" aria-hidden="true" />
        </summary>
        <div className="theme-switcher-panel">
          <div className="theme-style-tabs" role="tablist" aria-label="Gaya prompt">
            {styles.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={s === style}
                className={`theme-style-tab${s === style ? ' theme-style-tab--active' : ''}`}
                onClick={() => handleStyle(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <ul className="theme-list">
            {Object.values(THEMES).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={`theme-row${t.id === activeId ? ' theme-row--active' : ''}`}
                  onClick={() => handleSelect(t.id)}
                  title={t.desc}
                >
                  <span className="theme-row-swatch">
                    <span style={{ background: t.vars['--tw-user-bg'] }} />
                    <span style={{ background: t.vars['--tw-path-bg'] }} />
                    <span style={{ background: t.vars['--tw-git-bg'] }} />
                    <span style={{ background: t.vars['--tw-shell-bg'] }} />
                  </span>
                  <span className="theme-row-text">
                    <span className="theme-row-name">{t.label}</span>
                    <span className="theme-row-id">{t.id}</span>
                  </span>
                  {t.id === activeId && <span className="theme-row-check">✓</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  )
}
