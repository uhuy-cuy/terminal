import { getCurrentThemeState, getTheme, setPromptStyle, THEMES } from '../utils/themes'
import './ThemeSwitcher.css'

export default function ThemeSwitcher({ onThemeChange, onStyleChange }) {
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
      <details className="theme-switcher-details">
        <summary className="theme-switcher-toggle" title="Ganti tema">
          <span className="theme-preview">
            <span style={{ background: theme.vars['--tw-user-bg'] }} />
            <span style={{ background: theme.vars['--tw-path-bg'] }} />
            <span style={{ background: theme.vars['--tw-git-bg'] }} />
            <span style={{ background: theme.vars['--tw-shell-bg'] }} />
          </span>
          <span className="theme-switcher-label">{theme.label}</span>
          <span className="theme-switcher-style">{style}</span>
        </summary>
        <div className="theme-switcher-panel">
          <p className="theme-panel-title">Gaya prompt</p>
          <div className="theme-style-row">
            {styles.map((s) => (
              <button
                key={s}
                type="button"
                className={`theme-style-btn${s === style ? ' theme-style-btn--active' : ''}`}
                onClick={() => handleStyle(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <p className="theme-panel-title">Pilih tema</p>
          <div className="theme-grid">
            {Object.values(THEMES).map((t) => (
              <button
                key={t.id}
                type="button"
                className={`theme-card${t.id === activeId ? ' theme-card--active' : ''}`}
                onClick={() => handleSelect(t.id)}
                title={t.desc}
              >
                <span className="theme-card-preview">
                  <i style={{ background: t.vars['--tw-user-bg'] }} />
                  <i style={{ background: t.vars['--tw-path-bg'] }} />
                  <i style={{ background: t.vars['--tw-git-bg'] }} />
                  <i style={{ background: t.vars['--tw-shell-bg'] }} />
                </span>
                <span className="theme-card-name">{t.label}</span>
                <span className="theme-card-id">{t.id}</span>
              </button>
            ))}
          </div>
          <p className="theme-panel-hint">
            CLI: <code>theme set dracula</code> · <code>theme style rounded</code> ·{' '}
            <code>theme custom --user=#hex</code>
          </p>
        </div>
      </details>
    </div>
  )
}
