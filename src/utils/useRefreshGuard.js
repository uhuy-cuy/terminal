import { useEffect, useRef } from 'react'

export const REFRESH_CONFIRM = {
  title: 'Refresh halaman?',
  message: 'Semua log di layar saat ini akan hilang. Terminal akan dimuat ulang dari awal.',
  detail: [
    'Proses npm/server di background tidak ikut terhenti',
    'Cek server: perintah running',
  ],
  confirmLabel: 'Ya, refresh',
  cancelLabel: 'Tetap di sini',
  variant: 'danger',
  icon: '↻',
}

function isRefreshShortcut(e) {
  if (e.key === 'F5') return true
  if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) return true
  return false
}

export function useRefreshGuard(enabled, askConfirm) {
  const enabledRef = useRef(enabled)
  const askConfirmRef = useRef(askConfirm)
  const confirmingRef = useRef(false)
  const bypassRef = useRef(false)

  enabledRef.current = enabled
  askConfirmRef.current = askConfirm

  useEffect(() => {
    const promptReload = () => {
      if (!enabledRef.current || typeof askConfirmRef.current !== 'function') {
        return Promise.resolve(false)
      }
      if (confirmingRef.current || bypassRef.current) {
        return Promise.resolve(false)
      }

      confirmingRef.current = true
      return askConfirmRef.current()
        .then((ok) => {
          if (ok) {
            bypassRef.current = true
            window.location.reload()
          }
          return ok
        })
        .finally(() => {
          confirmingRef.current = false
        })
    }

    const onKeyDown = (e) => {
      if (!enabledRef.current) return
      if (!isRefreshShortcut(e)) return
      e.preventDefault()
      e.stopImmediatePropagation()
      void promptReload()
    }

    const onNavigate = (event) => {
      if (bypassRef.current) return
      if (event.navigationType !== 'reload') return
      if (!enabledRef.current) return

      if (event.canIntercept && typeof event.intercept === 'function') {
        event.intercept({
          async handler() {
            await promptReload()
          },
        })
        return
      }

      if (event.cancelable) {
        event.preventDefault()
        void promptReload()
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.navigation?.addEventListener?.('navigate', onNavigate)

    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.navigation?.removeEventListener?.('navigate', onNavigate)
    }
  }, [])
}

export function terminalHasSession(lines) {
  if (!lines?.length) return false
  if (lines.some((line) => line.type === 'prompt' || line.type === 'loading' || line.type === 'running')) {
    return true
  }
  return lines.length >= 1
}
