import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import './ConfirmDialog.css'

export default function ConfirmDialog({
  open,
  title,
  message,
  detail,
  confirmLabel = 'Ya, lanjutkan',
  cancelLabel = 'Batal',
  variant = 'danger',
  icon = '⚠',
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    cancelRef.current?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCancel?.()
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        onCancel?.()
      }
    }

    document.addEventListener('keydown', onKey, true)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prev
    }
  }, [open, onCancel])

  if (!open) return null

  return createPortal(
    <div
      className="confirm-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel?.()
      }}
    >
      <div
        className={`confirm-dialog confirm-dialog--${variant}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="confirm-dialog-chrome">
          <span className="confirm-chrome-dot confirm-chrome-dot--close" />
          <span className="confirm-chrome-dot confirm-chrome-dot--min" />
          <span className="confirm-chrome-dot confirm-chrome-dot--max" />
          <span className="confirm-dialog-chrome-title">@tahirwiyan — terminal</span>
        </div>

        <div className="confirm-dialog-body">
          <div className="confirm-dialog-icon" aria-hidden="true">
            {icon}
          </div>
          <h2 id="confirm-dialog-title" className="confirm-dialog-title">
            {title}
          </h2>
          <p id="confirm-dialog-desc" className="confirm-dialog-message">
            {message}
          </p>
          {detail?.length > 0 && (
            <ul className="confirm-dialog-detail">
              {detail.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="confirm-dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            className="confirm-btn confirm-btn--ghost"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm-btn confirm-btn--${variant}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
