import { Link } from 'react-router-dom'
import type { Genre } from '../../lib/types'
import { GENRE_ICONS } from '../GenreIcons'
import { useI18n } from '../../context/LanguageContext'
import { translateGenre } from '../../i18n'

/**
 * GenreChips — horizontal scroll row of rounded dark genre cards with a distinct
 * per-genre line icon + label; each chip deep-links into the pre-filtered catalog.
 */
export function GenreChips({ genres }: { genres: Genre[] }) {
  const { lang } = useI18n()
  return (
    <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
      {genres.map((g) => {
        const Icon = GENRE_ICONS[g.name] ?? (() => <span className="text-slate-300">?</span>)
        return (
          <Link
            key={g.mal_id}
            to={`/catalog?genre=${encodeURIComponent(g.name)}`}
            className="group flex w-28 shrink-0 snap-start flex-col items-center gap-2 rounded-2xl border border-night-600/60 bg-night-850/70 px-3 py-4 text-center transition hover:-translate-y-0.5 hover:border-slate-400/60 hover:shadow-glow-accent"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-night-800 text-slate-300 transition group-hover:bg-white/10 group-hover:text-white">
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-xs font-bold text-slate-100">{translateGenre(g.name, lang)}</span>
          </Link>
        )
      })}
    </div>
  )
}
