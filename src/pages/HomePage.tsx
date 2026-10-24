import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useI18n } from '../context/LanguageContext'
import { anilist } from '../lib/anilist'
import { useAsync } from '../hooks/useAsync'
import { AnimeCard, AnimeCardSkeleton } from '../components/anime/AnimeCard'
import { Carousel, CarouselItem } from '../components/anime/Carousel'
import { HeroBanner } from '../components/anime/HeroBanner'
import { GenreChips } from '../components/anime/GenreGrid'
import { ContinueWatching, TasteSection } from '../components/anime/HomeSections'
import { Skeleton } from '../components/ui/Feedback'
import { ErrorState } from '../components/ui/States'
import type { AnimeSummary } from '../lib/types'

type SectionState<T> = {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

/**
 * HomePage — seasonal hero, trending carousel, latest episodes, seasonal,
 * top-rated, and a popular-genres grid. Each section loads independently with
 * its own loading / error / retry handling. Also renders the personalized
 * "Continue Watching" and "Based on Your Taste" sections (#10).
 */
export default function HomePage() {
  const { t } = useI18n()

  const trending = useAsync((s) => anilist.getTopAnime('airing', 1, s).then((r) => r.data), [])
  const seasonal = useAsync((s) => anilist.getSeasonNow(1, s).then((r) => r.data), [])
  const popular = useAsync((s) => anilist.getTopAnime('bypopularity', 1, s).then((r) => r.data), [])

  // Hero carousel gets the top seasonal anime (top 7), falling back to
  // trending / popular so the banner is never empty (#1, #10).
  const heroItems: AnimeSummary[] = (
    seasonal.data ?? trending.data ?? popular.data ?? []
  )
    .slice(0, 7)

  return (
    <div>
      <HeroBanner items={heroItems} />

      {/* Continue Watching + taste-based recs (#10) */}
      <ContinueWatching />

      <Section
        title={t('home.trending')}
        subtitle={t('home.trendingSub')}
        viewAllHref="/catalog?sort=popularity"
        state={trending}
        renderRow={(items) =>
          items.map((a, i) => (
            <CarouselItem key={a.mal_id}>
              <AnimeCard anime={a} eager={i < 6} rank={i + 1} />
            </CarouselItem>
          ))
        }
      />

      <LatestEpisodes />

      <Section
        title={t('home.seasonal')}
        subtitle={t('home.seasonalSub')}
        viewAllHref="/catalog"
        state={seasonal}
        renderRow={(items) =>
          items.map((a) => (
            <CarouselItem key={a.mal_id}>
              <AnimeCard anime={a} />
            </CarouselItem>
          ))
        }
      />

      <TasteSection />

      <GenresSection />

      <Section
        title={t('home.topRated')}
        subtitle={t('home.topRatedSub')}
        viewAllHref="/catalog?sort=score"
        state={popular}
        renderRow={(items) =>
          items.map((a) => (
            <CarouselItem key={a.mal_id}>
              <AnimeCard anime={a} />
            </CarouselItem>
          ))
        }
      />
    </div>
  )
}

/* ---------------------------- section wrapper ---------------------------- */

function Section<T extends AnimeSummary[]>({
  title,
  subtitle,
  viewAllHref,
  state,
  renderRow,
}: {
  title: string
  subtitle?: string
  viewAllHref?: string
  state: SectionState<T>
  renderRow: (items: T) => ReactNode
}) {
  if (state.loading) {
    return (
      <Carousel title={title} subtitle={subtitle} viewAllHref={viewAllHref}>
        <AnimeCardSkeleton count={7} />
      </Carousel>
    )
  }
  if (state.error) {
    return (
      <section className="container-page py-8">
        <h2 className="mb-4 text-xl font-semibold tracking-wide text-white sm:text-2xl">{title}</h2>
        <ErrorState message={state.error} onRetry={state.reload} compact />
      </section>
    )
  }
  if (!state.data || state.data.length === 0) return null
  return (
    <Carousel title={title} subtitle={subtitle} viewAllHref={viewAllHref}>
      {renderRow(state.data)}
    </Carousel>
  )
}

/* ----------------------------- genres grid ------------------------------ */

function GenresSection() {
  const { t } = useI18n()
  const genres = useAsync((s) => anilist.getGenres(s).then((r) => r.data), [])

  return (
    <section className="container-page py-8">
      <div className="mb-5">
        <h2 className="flex items-center gap-2.5 text-xl font-semibold tracking-wide text-white sm:text-2xl">
          <span className="h-6 w-1.5 rounded-full bg-white/80" aria-hidden="true" />
          {t('home.genres')}
        </h2>
        <p className="mt-0.5 text-sm text-slate-400">{t('home.genresSub')}</p>
      </div>
      {genres.loading && (
        <div className="no-scrollbar flex gap-3 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] w-28 shrink-0 rounded-2xl" />
          ))}
        </div>
      )}
      {genres.error && <ErrorState message={genres.error} onRetry={genres.reload} compact />}
      {genres.data && <GenreChips genres={genres.data.slice(0, 16)} />}
    </section>
  )
}

/* --------------------------- latest episodes ---------------------------- */

function LatestEpisodes() {
  const { t } = useI18n()
  const schedule = useAsync((s) => anilist.getSchedule(undefined, s).then((r) => r.data), [])

  if (schedule.loading) {
    return (
      <Carousel title={t('home.latest')} subtitle={t('home.latestSub')}>
        <AnimeCardSkeleton count={7} />
      </Carousel>
    )
  }
  if (schedule.error || !schedule.data) {
    return (
      <section className="container-page py-8">
        <h2 className="mb-4 flex items-center gap-2.5 text-xl font-semibold tracking-wide text-white sm:text-2xl">
          <span className="h-6 w-1.5 rounded-full bg-white/80" aria-hidden="true" />
          {t('home.latest')}
        </h2>
        <ErrorState message={schedule.error ?? ''} onRetry={schedule.reload} compact />
      </section>
    )
  }

  const entries = schedule.data.slice(0, 20)
  return (
    <Carousel
      title={t('home.latest')}
      subtitle={t('home.latestSub')}
      viewAllHref="/catalog?sort=episodes"
    >
      {entries.map((e) => (
        <CarouselItem key={e.mal_id}>
          <Link
            to={`/anime/${e.mal_id}`}
            className="group flex gap-3 rounded-2xl border border-night-700/70 bg-night-850/70 p-2 transition hover:border-slate-400/60 hover:shadow-glow-accent"
          >
            <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded-lg">
              {e.images?.jpg?.large_image_url || e.images?.jpg?.image_url ? (
                <img
                  src={e.images.jpg.large_image_url || e.images.jpg.image_url}
                  alt={e.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-night-850 text-slate-600">?</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 text-sm font-bold text-white">{e.title}</h3>
              {e.episodes && e.episodes[0] && (
                <p className="mt-1 text-xs text-slate-300">
                  {t('watch.episode')} {e.episodes[0].mal_id}
                </p>
              )}
              {e.broadcast?.string && (
                <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">{e.broadcast.string}</p>
              )}
            </div>
          </Link>
        </CarouselItem>
      ))}
    </Carousel>
  )
}

