import { useEffect, useState } from 'react'
import './InstallPWA.css'

export default function InstallPWA() {
  const [prompt, setPrompt] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
      return
    }

    const handler = (e) => {
      e.preventDefault()
      setPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => {
      try {
        localStorage.setItem('tw-pwa-installed', '1')
      } catch {
        /* ignore */
      }
      setInstalled(true)
      setPrompt(null)
    })

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (installed || dismissed || !prompt) return null

  const handleInstall = async () => {
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') {
      setPrompt(null)
    }
  }

  return (
    <div className="install-pwa">
      <div className="install-pwa-content">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="install-pwa-icon" />
        <div className="install-pwa-text">
          <strong>Install @tahirwiyan</strong>
          <span>Buka terminal langsung dari home screen</span>
        </div>
      </div>
      <div className="install-pwa-actions">
        <button type="button" className="install-pwa-btn install-pwa-btn-primary" onClick={handleInstall}>
          Install
        </button>
        <button type="button" className="install-pwa-btn" onClick={() => setDismissed(true)}>
          Nanti
        </button>
      </div>
    </div>
  )
}
