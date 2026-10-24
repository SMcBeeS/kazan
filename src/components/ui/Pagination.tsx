import { useI18n } from '../../context/LanguageContext'
import { ChevronLeft, ChevronRight } from '../icons'

/** Numbered pagination with prev/next, RTL-aware arrows. */
export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number
  totalPages: number
  onChange: (page: number) => void
}) {
  const { t, dir } = useI18n()
  if (totalPages <= 1) return null

  const Prev = dir === 'rtl' ? ChevronRight : ChevronLeft
  const Next = dir === 'rtl' ? ChevronLeft : ChevronRight

  // Build a compact window of page numbers around the current page.
  const pages: number[] = []
  const start = Math.max(1, Math.min(page - 2, totalPages - 4))
  const end = Math.min(totalPages, start + 4)
  for (let i = start; i <= end; i++) pages.push(i)

  return (
    <nav className="flex items-center justify-center gap-1.5 py-6" aria-label="pagination">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="flex h-9 items-center gap-1 rounded-lg border border-night-600/80 bg-night-850 px-3 text-sm text-slate-200 transition hover:border-slate-400/60 disabled:opacity-40"
      >
        <Prev className="h-4 w-4" />
        <span className="hidden sm:inline">{t('catalog.prev')}</span>
      </button>

      {start > 1 && <span className="px-1 text-slate-500">…</span>}
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          aria-current={p === page ? 'page' : undefined}
          className={
            p === page
              ? 'h-9 w-9 rounded-lg bg-white text-sm font-bold text-night-900'
              : 'h-9 w-9 rounded-lg border border-night-600/80 bg-night-850 text-sm text-slate-300 transition hover:border-slate-400/60 hover:text-white'
          }
        >
          {p}
        </button>
      ))}
      {end < totalPages && <span className="px-1 text-slate-500">…</span>}

      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="flex h-9 items-center gap-1 rounded-lg border border-night-600/80 bg-night-850 px-3 text-sm text-slate-200 transition hover:border-slate-400/60 disabled:opacity-40"
      >
        <span className="hidden sm:inline">{t('catalog.next')}</span>
        <Next className="h-4 w-4" />
      </button>
    </nav>
  )
}
