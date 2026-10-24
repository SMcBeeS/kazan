import { Link } from 'react-router-dom'
import { useI18n } from '../context/LanguageContext'
import { useLibrary } from '../context/LibraryContext'
import { EmptyState } from '../components/ui/States'
import { HistoryIcon, PlayIcon, TrashIcon } from '../components/icons'

/** HistoryPage — list of recently watched anime with quick "continue" links. */
export default function HistoryPage() {
  const { t } = useI18n()
  const { history, removeHistory, clearHistory } = useLibrary()

  if (history.length === 0) {
    return (
      <div className="container-page py-12">
        <EmptyState
          icon={<HistoryIcon className="h-7 w-7" />}
          title={t('history.empty')}
          hint={t('history.emptyHint')}
          action={
            <Link to="/catalog" className="btn-primary">
              {t('favorites.browse')}
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="container-page py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-wide text-white sm:text-3xl">{t('history.title')}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {new Date(history[0]?.updatedAt ?? Date.now()).toLocaleString()}
          </p>
        </div>
        <button onClick={clearHistory} className="btn-ghost text-red-300">
          <TrashIcon className="h-4 w-4" />
          {t('history.clear')}
        </button>
      </header>

      <div className="space-y-3">
        {history.map((h) => (
          <div
            key={h.mal_id}
            className="flex items-center gap-4 rounded-2xl border border-night-700/70 bg-night-850/60 p-3 transition hover:border-slate-400/60"
          >
            <Link to={`/anime/${h.mal_id}`} className="h-20 w-14 shrink-0 overflow-hidden rounded-lg">
              {h.image ? (
                <img src={h.image} alt={h.title} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center bg-night-800 text-slate-600">?</div>
              )}
            </Link>

            <div className="min-w-0 flex-1">
              <Link to={`/anime/${h.mal_id}`} className="block truncate text-sm font-bold text-white hover:text-white">
                {h.title}
              </Link>
              {h.format !== 'MOVIE' && h.episode != null && (
                <p className="mt-0.5 text-xs text-slate-300">{t('history.watchedEpisode', { n: h.episode })}</p>
              )}
              <p className="mt-0.5 text-[11px] text-slate-500">
                {t('history.updated')}: {new Date(h.updatedAt).toLocaleString()}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {h.episode != null && (
                <Link to={`/watch/${h.mal_id}/${h.episode}`} className="btn-primary px-4 py-2 text-xs">
                  <PlayIcon className="h-3.5 w-3.5" />
                  {t('history.continue')}
                </Link>
              )}
              <button
                onClick={() => removeHistory(h.mal_id)}
                aria-label={t('history.remove')}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-night-600/80 bg-night-800/70 text-slate-400 transition hover:text-red-400"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
