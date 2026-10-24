import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../context/LanguageContext'
import { useAsync } from '../../hooks/useAsync'
import { anilist } from '../../lib/anipub'
import type { JikanRelation } from '../../lib/types'
import { cx, relationImage } from '../../lib/utils'
import { ErrorState } from '../ui/States'
import { Skeleton } from '../ui/Feedback'
import { ChevronDown, PlayIcon } from '../icons'

/**
 * RelationsSection — "Seasons & Relations" browser.
 *
 * Collapsible disclosure, closed by default. Only the trigger button is shown
 * until the user clicks it; expanding it fetches /anime/{id}/relations and
 * renders each relation group (Sequel, Prequel, Side Story, Parent Story, …)
 * as a tab so users can jump between seasons cleanly. Each entry links to its
 * own detail page.
 */
export function RelationsSection({ animeId }: { animeId: number }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  return (
    <section className="mt-8">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="relations-panel"
        className="flex w-full items-center gap-3 rounded-xl border border-night-700/70 bg-night-850/50 px-4 py-3 text-start transition hover:border-slate-400/60 hover:bg-night-800/70"
      >
        <span className="flex-1 text-lg font-bold text-white">{t('detail.relationsToggle')}</span>
        <ChevronDown
          className={cx('h-5 w-5 shrink-0 text-slate-400 transition', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div id="relations-panel" className="mt-4">
          <p className="mb-4 text-sm text-slate-500">{t('detail.relationsHint')}</p>
          <RelationsContent animeId={animeId} />
        </div>
      )}
    </section>
  )
}

/**
 * RelationsContent — mounts only while the disclosure is open, so the
 * relations request is deferred until the user actually asks to see the grid.
 */
function RelationsContent({ animeId }: { animeId: number }) {
  const { t } = useI18n()
  const relations = useAsync((s) => anilist.getRelations(animeId, s).then((r) => r.data), [animeId])

  if (relations.loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    )
  }

  if (relations.error) {
    return (
      <ErrorState
        message={relations.error}
        onRetry={relations.reload}
        compact
      />
    )
  }

  const groups = (relations.data ?? []).filter((g) => g.entry.length > 0)
  if (groups.length === 0) {
    return (
      <p className="rounded-xl border border-night-700/70 bg-night-850/60 p-4 text-sm text-slate-400">
        {t('detail.noRelations')}
      </p>
    )
  }

  return <RelationsTabs groups={groups} />
}

/** Tab switcher over relation groups + grid of related entries. */
function RelationsTabs({ groups }: { groups: JikanRelation[] }) {
  const [active, setActive] = useState(groups[0]?.relation ?? '')
  const current = groups.find((g) => g.relation === active) ?? groups[0]

  return (
    <div>
      {/* Tabs */}
      <div className="thin-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1">
        {groups.map((g) => (
          <button
            key={g.relation}
            type="button"
            onClick={() => setActive(g.relation)}
            aria-pressed={g.relation === current.relation}
            className={cx(
              'shrink-0 rounded-full border px-4 py-1.5 text-xs font-semibold transition',
              g.relation === current.relation
                ? 'border-white/40 bg-white/10 text-white'
                : 'border-night-600/80 bg-night-800/60 text-slate-300 hover:border-slate-400/60 hover:text-white',
            )}
          >
            {g.relation}
          </button>
        ))}
      </div>

      {/* Entries */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {current.entry.map((entry) => (
          <Link
            key={entry.mal_id}
            to={`/anime/${entry.mal_id}`}
            className="group flex items-center gap-3 rounded-xl border border-night-700/70 bg-night-850/60 p-2 transition hover:border-slate-400/60 hover:bg-night-800/70"
          >
            <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-night-800">
              {relationImage(entry) ? (
                <img
                  src={relationImage(entry)}
                  alt={entry.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-600">
                  ?
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                <PlayIcon className="h-5 w-5 text-white drop-shadow-lg" />
              </div>
            </div>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-3 text-xs font-semibold text-slate-100">{entry.name}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
