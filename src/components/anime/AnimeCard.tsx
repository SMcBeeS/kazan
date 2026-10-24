import { Link } from 'react-router-dom'
import type { AnimeSummary } from '../../lib/types'
import { coverImage, cx, formatLabel, formatRating, formatScore, isMovie } from '../../lib/utils'
import { useI18n } from '../../context/LanguageContext'
import { translateGenre } from '../../i18n'
import { useLibrary } from '../../context/LibraryContext'
import { HeartIcon, PlayIcon, StarIcon } from '../icons'
import { Skeleton } from '../ui/Feedback'

/**
 * AnimeCard — dashboard-style poster card: rounded poster, star score badge,
 * optional rank badge, and bottom metadata (title, genre line).
 */
export function AnimeCard({
  anime,
  eager,
  rank,
}: {
  anime: AnimeSummary
  eager?: boolean
  rank?: number
}) {
  const { t, lang } = useI18n()
  const { isFavorite, toggleFavorite } = useLibrary()
  const fav = isFavorite(anime.mal_id)
  const img = coverImage(anime)
  // Movies are single runs — an episode count is meaningless there, so the
  // card shows the total runtime instead (or nothing if unknown).
  const isMovieAnime = anime.format === 'MOVIE' || isMovie(anime.type)
  const movieRuntime = isMovieAnime && anime.duration ? anime.duration.replace(/\s*per ep$/i, '') : null

  return (
    <div className="group relative">
      <Link
        to={`/anime/${anime.mal_id}`}
        className="block focus-visible:outline-none"
        aria-label={anime.title}
      >
        <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-night-700/70 bg-night-850 transition duration-300 group-hover:-translate-y-1.5 group-hover:border-slate-400/60 group-hover:shadow-glow-accent">
          {img ? (
            <img
              src={img}
              alt={anime.title}
              loading={eager ? 'eager' : 'lazy'}
              decoding="async"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-600">
              <span className="text-3xl">?</span>
            </div>
          )}

          {/*
            Bottom scrim only — a single, subtle gradient that guarantees title
            legibility without the heavy always-on dark overlay or stacked
            shadows that previously washed out the poster (#2).
          */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-night-950/85 via-night-950/20 to-transparent" />

          {anime.score != null && (
            <div className="absolute start-2 top-2 flex items-center gap-1 rounded-full bg-night-950/80 px-2 py-1 text-xs font-bold text-gold-400 backdrop-blur-sm">
              <StarIcon filled className="h-3.5 w-3.5" />
              {formatScore(anime.score)}
            </div>
          )}

          {rank != null && (
            <div className="absolute end-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-night-900/90 px-1.5 text-xs font-bold text-white ring-1 ring-white/20">
              {rank}
            </div>
          )}

          {anime.type && rank == null && (
            <span className="absolute end-2 top-2 rounded-full bg-night-900/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-100 ring-1 ring-white/15 backdrop-blur-sm">
              {formatLabel(anime.type, lang)}
            </span>
          )}

          {/* Play affordance on hover */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition duration-300 group-hover:opacity-100">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-night-900 shadow-glow-accent">
              <PlayIcon className="ms-0.5 h-5 w-5" />
            </span>
          </div>

          {/* Title overlay */}
          <div className="absolute inset-x-0 bottom-0 p-2.5">
            <h3 className="line-clamp-1 text-sm font-bold text-white text-shadow-lg">
              {anime.title_english || anime.title}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {!isMovieAnime && anime.episodes != null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-night-950/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-200 backdrop-blur-sm">
                  {anime.episodes} {t('detail.episodes')}
                </span>
              )}
              {movieRuntime && (
                <span className="inline-flex items-center gap-1 rounded-full bg-night-950/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-200 backdrop-blur-sm">
                  {movieRuntime}
                </span>
              )}
              {anime.rating && (
                <span className="inline-flex items-center rounded-full bg-night-950/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300 backdrop-blur-sm">
                  {formatRating(anime.rating)}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>

      {/* Bottom metadata: title, genre line, star score */}
      <div className="mt-2 px-0.5">
        <h3 className="line-clamp-1 text-sm font-bold text-white">
          {anime.title_english || anime.title}
        </h3>
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
          <span className="min-w-0 flex-1 truncate font-medium text-slate-400">
            {(anime.genres ?? []).slice(0, 2).map((g) => translateGenre(g.name, lang)).join(' • ') ||
              formatLabel(anime.type ?? '', lang)}
          </span>
          {anime.score != null && (
            <span className="flex shrink-0 items-center gap-1 font-bold text-gold-400">
              <StarIcon filled className="h-3 w-3" />
              {formatScore(anime.score)}
            </span>
          )}
        </div>
      </div>

      {/* Favorite toggle (outside link so it doesn't navigate) */}
      <button
        type="button"
        onClick={() => toggleFavorite(anime)}
        aria-label={fav ? t('detail.removeFavorite') : t('detail.addFavorite')}
        aria-pressed={fav}
        className={cx(
          'absolute end-2 bottom-[62px] z-10 flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-sm transition',
          fav
            ? 'border-white/50 bg-white/10 text-white hover:bg-white/20'
            : 'border-night-600/80 bg-night-900/70 text-slate-300 opacity-0 hover:border-white/50 hover:text-white group-hover:opacity-100 focus-visible:opacity-100',
        )}
      >
        <HeartIcon filled={fav} className="h-4 w-4" />
      </button>
    </div>
  )
}

/** Grid of skeleton cards used while loading lists. */
export function AnimeCardSkeleton({ count = 12 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-[2/3] w-full rounded-2xl" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </>
  )
}
