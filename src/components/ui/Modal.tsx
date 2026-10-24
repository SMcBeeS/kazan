import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useI18n } from '../../context/LanguageContext'
import { cx } from '../../lib/utils'
import { CloseIcon } from '../icons'

/**
 * Modal — accessible dialog overlay (backdrop + focus trap-lite).
 *
 * - Closes on Escape and on backdrop click.
 * - Locks body scroll while open and restores it on unmount.
 * - Focuses the panel on open for keyboard users.
 * - Fully RTL-aware (uses logical properties + dir from i18n).
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'lg',
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  size?: 'md' | 'lg' | 'xl'
}) {
  const { t } = useI18n()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Move focus into the dialog for a11y.
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  const maxW = size === 'md' ? 'max-w-lg' : size === 'xl' ? 'max-w-5xl' : 'max-w-3xl'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cx(
          'relative z-10 w-full animate-fade-up rounded-2xl border border-night-700 bg-night-900 shadow-card outline-none',
          maxW,
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-night-700/70 px-4 py-3">
          {title && <h2 className="text-sm font-bold text-white">{title}</h2>}
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="ms-auto flex h-9 w-9 items-center justify-center rounded-lg border border-night-600/80 bg-night-800/70 text-slate-300 transition hover:border-slate-400/60 hover:text-white"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
