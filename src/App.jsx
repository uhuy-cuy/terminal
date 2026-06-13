import { useCallback, useEffect, useRef, useState } from 'react'
import TerminalTabs from './components/TerminalTabs'
import InstallPWA from './components/InstallPWA'
import ServerLinkBadge from './components/ServerLinkBadge'
import ThemeSwitcher from './components/ThemeSwitcher'
import ConfirmDialog from './components/ConfirmDialog'
import { extractPortFromUrl } from './utils/linkify'
import { applyTheme, getTheme, setPromptStyle } from './utils/themes'
import { REFRESH_CONFIRM, useRefreshGuard } from './utils/useRefreshGuard'
import './App.css'

const APP_UPDATE_CONFIRM = {
  title: 'Versi baru tersedia',
  message: 'Ada pembaruan aplikasi terminal. Muat ulang sekarang atau tetap pakai versi saat ini.',
  detail: ['Log di layar tetap aman jika Anda pilih "Nanti"'],
  confirmLabel: 'Muat ulang',
  cancelLabel: 'Nanti',
  variant: 'primary',
  icon: '⬆',
}

export default function App() {
  const [activeServerUrl, setActiveServerUrl] = useState(null)
  const [terminalHasLogs, setTerminalHasLogs] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const killPortRef = useRef(null)
  const appUpdateRef = useRef(null)

  const askConfirm = useCallback(
    (config) =>
      new Promise((resolve) => {
        setConfirmDialog({
          ...config,
          onConfirm: () => {
            setConfirmDialog(null)
            resolve(true)
          },
          onCancel: () => {
            setConfirmDialog(null)
            resolve(false)
          },
        })
      }),
    [],
  )

  const askRefreshConfirm = useCallback(() => askConfirm(REFRESH_CONFIRM), [askConfirm])

  useRefreshGuard(terminalHasLogs, askRefreshConfirm)

  useEffect(() => {
    const onAppUpdate = (e) => {
      const applyUpdate = e.detail?.applyUpdate
      if (typeof applyUpdate !== 'function') return
      appUpdateRef.current = applyUpdate
      askConfirm(APP_UPDATE_CONFIRM).then((ok) => {
        if (ok) applyUpdate(true)
        else appUpdateRef.current = null
      })
    }

    window.addEventListener('tw-app-update', onAppUpdate)
    return () => window.removeEventListener('tw-app-update', onAppUpdate)
  }, [askConfirm])
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
        <div className="window-chrome-right">
          <ServerLinkBadge
            url={activeServerUrl}
            onKill={() => {
              const port = extractPortFromUrl(activeServerUrl)
              const run = killPortRef.current
              if (!run) return
              if (port) {
                Promise.resolve(run(`killport ${port}`)).then(() => run('killnode'))
              } else {
                run('killnode')
              }
            }}
          />
          <ThemeSwitcher
            onThemeChange={handleThemeChange}
            onStyleChange={handleStyleChange}
          />
        </div>
      </div>
      <TerminalTabs
        onServerUrlChange={setActiveServerUrl}
        killPortRef={killPortRef}
        onTerminalHasLogsChange={setTerminalHasLogs}
      />
      <InstallPWA />
      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title}
        message={confirmDialog?.message}
        detail={confirmDialog?.detail}
        confirmLabel={confirmDialog?.confirmLabel}
        cancelLabel={confirmDialog?.cancelLabel}
        variant={confirmDialog?.variant}
        icon={confirmDialog?.icon}
        onConfirm={confirmDialog?.onConfirm}
        onCancel={confirmDialog?.onCancel}
      />
    </div>
  )
}
