import type { ReactNode } from 'react'
import { useI18n } from '../../context/LanguageContext'
import { cx } from '../../lib/utils'
import { AlertIcon } from '../icons'
import { Spinner } from './Feedback'

/** Full-width error panel with a retry button. */
export function ErrorState({
  message,
  onRetry,
  compact,
}: {
  message?: string
  onRetry?: () => void
  compact?: boolean
}) {
  const { t } = useI18n()
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center gap-4 px-4 text-center',
        compact ? 'min-h-0 py-6' : 'min-h-[40vh]',
      )}
      role="alert"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15 text-red-400">
        <AlertIcon className="h-7 w-7" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-slate-100">{t('common.error')}</h3>
        <p className="mt-1 max-w-md text-sm text-slate-400">
          {message ?? t('common.tryAgain')}
        </p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="btn-primary">
          <Spinner className="hidden h-4 w-4" />
          {t('common.retry')}
        </button>
      )}
    </div>
  )
}

/** Friendly empty state with icon, message, hint and optional action. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-night-800 text-slate-300">
        {icon ?? <span className="text-2xl">✦</span>}
      </div>
      <div>
        <h3 className="text-lg font-bold text-slate-100">{title}</h3>
        {hint && <p className="mt-1 max-w-md text-sm text-slate-400">{hint}</p>}
      </div>
      {action}
    </div>
  )
}
