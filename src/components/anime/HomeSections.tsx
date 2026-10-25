import { Link } from 'react-router-dom'
import { useI18n } from '../../context/LanguageContext'
import { useLibrary } from '../../context/LibraryContext'
import { anilist } from '../../lib/anipub'
import { useAsync } from '../../hooks/useAsync'
import { topGenresFromHistory } from '../../lib/storage'
import type { AnimeSummary } from '../../lib/types'
import { Carousel, CarouselItem } from './Carousel'
import { AnimeCard, AnimeCardSkeleton } from './AnimeCard'
import { CloseIcon, PlayIcon } from '../icons'

/**
 * ContinueWatching — prominent carousel on the home page listing the anime the
 * user most recently opened episodes for, with a direct "resume" button back to
 * the exact episode (#10).
 */
export function ContinueWatching() {
  const { t } = useI18n()
  const { continueWatching, removeContinue } = useLibrary()

  if (continueWatching.length === 0) return null

  return (
    <Carousel
      title={t('home.continueWatching')}
      subtitle={t('home.continueWatchingSub')}
      viewAllHref="/history"
    >
      {continueWatching.map((item) => (
        <CarouselItem key={item.animeId}>
          <ContinueCard
            coverImage={item.coverImage}
            title={item.title}
            episode={item.episode}
            totalEpisodes={item.totalEpisodes ?? null}
            to={`/watch/${item.animeId}/${item.episode}`}
            onRemove={() => removeContinue(item.animeId)}
          />
        </CarouselItem>
      ))}
    </Carousel>
  )
}

function ContinueCard({
  coverImage,
  title,
  episode,
  totalEpisodes,
  to,
  onRemove,
}: {
  coverImage: string
  title: string
  episode: number
  totalEpisodes: number | null
  to: string
  onRemove: () => void
}) {
  const { t } = useI18n()
  // Cache entries may store relative AniPub paths (e.g. "/files/...") that 404
  // if used directly. Sanitize them to absolute URLs before rendering, and fall
  // back to the existing "?" placeholder when there is no image at all.
  const finalImageUrl = coverImage
    ? coverImage.startsWith('http')
      ? coverImage
      : 'https://anipub.org' + coverImage
    : ''
  const episodeLabel =
    totalEpisodes != null
      ? `${t('home.episodeShort', { n: episode })} / ${totalEpisodes}`
      : t('home.episodeShort', { n: episode })

  return (
    <div className="group relative">
      <Link
        to={to}
        className="block overflow-hidden rounded-2xl border border-night-700/70 bg-night-850 transition group-hover:-translate-y-1 group-hover:border-slate-400/60 group-hover:shadow-glow-accent"
      >
        <div className="relative aspect-[16/10] overflow-hidden">
          {finalImageUrl ? (
            <img
              src={finalImageUrl}
              alt={title}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-night-800 text-slate-600">
              ?
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-night-950/90 via-transparent to-transparent" />
          {/* Play affordance */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-night-900 shadow-glow-accent">
              <PlayIcon className="ms-0.5 h-5 w-5" />
            </span>
          </div>
          <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-lg bg-night-900/90 px-2 py-0.5 text-[10px] font-bold text-white ring-1 ring-white/15 backdrop-blur-sm">
            {episodeLabel}
          </span>
        </div>
        <div className="p-2.5">
          <h3 className="line-clamp-1 text-sm font-bold text-white">{title}</h3>
          <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-slate-300">
            <PlayIcon className="h-3 w-3" />
            {t('home.resume')}
          </span>
        </div>
      </Link>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('history.remove')}
        className="absolute end-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-night-600/80 bg-night-900/80 text-slate-300 opacity-0 backdrop-blur-sm transition hover:text-red-400 group-hover:opacity-100"
      >
        <CloseIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/**
 * TasteSection — "Animes Based on Your Taste". If the user has watch history we
 * extract their most-watched genres and fetch recommendations for them; if not,
 * we show a curated "Must Watch" (top popularity) row (#10).
 */
export function TasteSection() {
  const { t } = useI18n()
  const { history } = useLibrary()
  const topGenres = topGenresFromHistory(3)
  const hasHistory = history.length > 0 && topGenres.length > 0
  const primaryGenre = hasHistory ? topGenres[0] : null

  const recs = useAsync(
    (s): Promise<AnimeSummary[]> =>
      primaryGenre
        ? anilist
            .searchAnime({ genre: primaryGenre, order_by: 'popularity', limit: 24, sfw: true }, s)
            .then((r) => r.data)
        : anilist.getTopAnime('bypopularity', 1, s).then((r) => r.data),
    [primaryGenre],
  )

  const title = hasHistory ? t('home.basedOnTaste') : t('home.mustWatch')
  const subtitle = hasHistory ? t('home.basedOnTasteSub') : t('home.mustWatchSub')

  return (
    <Carousel title={title} subtitle={subtitle} viewAllHref="/catalog?sort=popularity">
      {recs.loading && <AnimeCardSkeleton count={7} />}
      {recs.error && <p className="px-1 py-4 text-sm text-red-400">{recs.error}</p>}
      {recs.data?.map((a) => (
        <CarouselItem key={a.mal_id}>
          <AnimeCard anime={a} />
        </CarouselItem>
      ))}
    </Carousel>
  )
}
