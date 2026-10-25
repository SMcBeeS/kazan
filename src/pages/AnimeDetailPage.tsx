import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../context/LanguageContext'
import { translateGenre } from '../i18n'
import { useLibrary } from '../context/LibraryContext'
import { useAuth } from '../context/AuthContext'
import {
  getFavorites,
  toggleFavorite as dbToggleFavorite,
  getRating,
  submitRating,
  addToWatchlist,
  removeFromWatchlist,
  getWatchlist,
} from '../lib/database'
import type { Favorite, WatchlistStatus } from '../lib/database'
import { anilist } from '../lib/anipub'
import { useAsync } from '../hooks/useAsync'
import { coverImage, cx, formatCount, formatLabel, formatScore, formatSeason, airingStatus, isMovie } from '../lib/utils'
import type { AnimeDetail, Episode } from '../lib/types'
import { Skeleton } from '../components/ui/Feedback'
import { ErrorState } from '../components/ui/States'
import { AnimeCard } from '../components/anime/AnimeCard'
import { TrailerModal } from '../components/anime/TrailerModal'
import { AutoTranslateSynopsis } from '../components/anime/AutoTranslateSynopsis'
import { CollapsibleText } from '../components/anime/CollapsibleText'
import { RelationsSection } from '../components/anime/RelationsSection'
import {
  HeartIcon,
  PlayIcon,
  StarIcon,
  SubtitlesIcon,
  ClockIcon,
  ChevronDown,
  CheckIcon,
  CalendarPlusIcon,
  ListIcon,
  LockIcon,
  PauseCircleIcon,
  XCircleIcon,
  SendIcon,
  LaurelLeftIcon,
  LaurelRightIcon,
} from '../components/icons'

const MIN_BANNER_WIDTH = 1280

type WatchStatus = 'watching' | 'plan' | 'completed' | 'onhold' | 'dropped'

/**
 * Map the UI's watch-status ids onto the `watchlist.status` column values and
 * back. `completed` is an *earned* state reached by finishing a series, so it is
 * stored as `COMPLETED` and re-derived below (see `isCompleted`).
 */
const UI_TO_DB: Record<WatchStatus, WatchlistStatus> = {
  watching: 'CURRENTLY_WATCHING',
  plan: 'PLAN_TO_WATCH',
  completed: 'COMPLETED',
  onhold: 'ON_HOLD',
  dropped: 'DROPPED',
}
const DB_TO_UI: Record<WatchlistStatus, WatchStatus> = {
  CURRENTLY_WATCHING: 'watching',
  PLAN_TO_WATCH: 'plan',
  COMPLETED: 'completed',
  ON_HOLD: 'onhold',
  DROPPED: 'dropped',
}

/**
 * Crunchyroll Anime Award "wins", keyed by AniList media id.
 *
 * AniList's API does not return Crunchyroll award data, so this is a small
 * hardcoded look-alike of the real winners (+ a few more for variety). In this
 * app the route id and the `mal_id` field on an anime are actually the AniList
 * media id (see lib/anilist.ts -> mapMedia, `mal_id: m.id`), so we key by that.
 * Anything not listed here (e.g. Wistoria: Wand and Sword) is a non-winner and
 * simply renders no badge.
 */
const ANIMELIST_AWARD_WINNERS = new Map<number, number>([
  [120377, 3], // Cyberpunk: Edgerunners -- Anime of 2022, Best Original, Best Action
  [101922, 3], // Demon Slayer: Kimetsu no Yaiba -- 2021 Best Action + 2022 fan vote
  [154587, 2], // Frieren: Beyond Journey's End (Sousou no Frieren)
  [113415, 2], // Jujutsu Kaisen
  [16498, 2], // Attack on Titan (Shingeki no Kyojin)
  [21, 2], // One Piece
  [21087, 2], // One Punch Man
  [21827, 1], // Violet Evergarden (2019 Best Original Score)
  [21355, 1], // Re:Zero Kara Hajimeru Isekai Seikatsu
  [101348, 1], // Vinland Saga (2020 Best Action)
  [101921, 1], // Kaguya-sama: Love Is War
  [1535, 1], // Death Note (2018 anime of the future)
])

/**
 * Premium "Anime Awards" badge. Entirely gold/amber. Only rendered when the
 * current anime is a known Crunchyroll Anime Award winner (see above).
 */
function AwardBadge({ wins }: { wins: number }) {
  return (
    <div className="flex items-center gap-6 text-[#e5b85a]" title="Crunchyroll Anime Award">
      {/* [Left laurel] [centered 3-line wordmark] [right laurel] */}
      <div className="flex items-center gap-4">
        <LaurelLeftIcon className="h-16 w-auto shrink-0" />
        <div className="flex flex-col items-center leading-none">
          <span className="mb-1 text-[8px] font-bold uppercase tracking-[0.4em]">CRUNCHYROLL</span>
          <span className="text-3xl font-bold uppercase leading-none">ANIME</span>
          <span className="text-lg font-normal uppercase leading-tight tracking-[0.2em]">AWARDS</span>
        </div>
        <LaurelRightIcon className="h-16 w-auto shrink-0" />
      </div>
      {/* Win count */}
      <span className="whitespace-nowrap text-2xl font-bold uppercase text-yellow-400/90">
        {wins} {wins === 1 ? 'Win' : 'Wins'}
      </span>
    </div>
  )
}

export default function AnimeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const malId = Number(id)
  const { t, lang } = useI18n()
  const { history, continueWatching, toggleFavorite: toggleLocalFavorite } = useLibrary()
  const { user, supabaseConfigured, openAuthModal } = useAuth()
  const [bannerLowRes, setBannerLowRes] = useState(false)
  const [watchStatus, setWatchStatus] = useState<WatchStatus | null>(null)
  const [userRating, setUserRating] = useState(0)
  const [reviewDraft, setReviewDraft] = useState('')
  const [reviews, setReviews] = useState<string[]>([])
  // The set of AniList ids the signed-in user has favorited (loaded from the
  // database so it reflects the real account, not just this device's storage).
  const [favSet, setFavSet] = useState<Set<number>>(() => new Set())
  useEffect(() => setBannerLowRes(false), [malId])

  // Reset per-anime ephemeral state when navigating between titles.
  useEffect(() => {
    setWatchStatus(null)
    setUserRating(0)
    setReviewDraft('')
    setReviews([])
  }, [malId])

  // Load the user's favorites for this account on mount / on auth change.
  useEffect(() => {
    if (!supabaseConfigured || !user) {
      setFavSet(new Set())
      return
    }
    let cancelled = false
    void (async () => {
      const res = await getFavorites(user.id)
      if (cancelled) return
      setFavSet(new Set((res.data ?? []).map((f: Favorite) => f.anime_id)))
    })()
    return () => {
      cancelled = true
    }
  }, [user, supabaseConfigured])

  // Load the user's existing rating for this title, if any.
  useEffect(() => {
    if (!supabaseConfigured || !user || !malId) {
      setUserRating(0)
      return
    }
    let cancelled = false
    void (async () => {
      const res = await getRating(malId, user.id)
      if (cancelled) return
      setUserRating(res.data?.score ?? 0)
    })()
    return () => {
      cancelled = true
    }
  }, [malId, user, supabaseConfigured])

  // Load the user's persisted watchlist status for this title, if any, so the
  // dropdown reflects what they last saved (not just this device's session).
  // `completed` here is applied verbatim; the "earned by finishing" derivation
  // (`isCompleted`) ors in the watched-to-end state separately downstream.
  useEffect(() => {
    if (!supabaseConfigured || !user || !malId) return
    let cancelled = false
    void (async () => {
      const res = await getWatchlist(user.id)
      if (cancelled) return
      const entry = (res.data ?? []).find((e) => e.anime_id === malId)
      if (!entry) return
      setWatchStatus(DB_TO_UI[entry.status])
    })()
    return () => {
      cancelled = true
    }
  }, [malId, user, supabaseConfigured])

  /** Pick a watchlist status from the dropdown: prompts guests to log in, then
   *  persists the choice to the user's cloud watchlist. */
  const handleWatchSelect = (status: WatchStatus) => {
    if (!user) {
      // Guests can preview the option but must sign in to actually track it.
      setWatchStatus(status)
      openAuthModal()
      return
    }
    setWatchStatus(status)
    // "Completed" from the dropdown is a no-op for tracking: it's earned by
    // watching every episode. Persist every other choice so it survives reloads.
    if (status !== 'completed') void addToWatchlist(malId, UI_TO_DB[status])
  }

  /** Drop this title from the user's watchlist entirely (guests are prompted). */
  const handleWatchRemove = () => {
    if (!user) {
      openAuthModal()
      return
    }
    setWatchStatus(null)
    void removeFromWatchlist(malId)
  }

  /** Handle a 1..10 click from the "Your Rating" control (0 = clear). */
  const handleRatingClick = (value: number) => {
    if (!user) {
      openAuthModal()
      return
    }
    if (value === 0) {
      // Clearing a rating clears the local UI; the DB row is left for the next
      // pick (submitRating upserts on top of it).
      setUserRating(0)
      return
    }
    // Optimistic: reflect the pick before the write resolves.
    setUserRating(value)
    void submitRating(malId, value)
  }

  /** Toggle the database favorite for this title (guests are prompted to log in). */
  const handleFavoriteToggle = async () => {
    if (!user) {
      openAuthModal()
      return
    }
    const currentlyFav = favSet.has(malId)
    // Optimistic flip so the heart reacts instantly.
    setFavSet((prev) => {
      const next = new Set(prev)
      if (currentlyFav) next.delete(malId)
      else next.add(malId)
      return next
    })
    const res = await dbToggleFavorite(malId)
    if (res.error) {
      // Roll back on failure.
      setFavSet((prev) => {
        const next = new Set(prev)
        if (currentlyFav) next.add(malId)
        else next.delete(malId)
        return next
      })
    } else if (res.data) {
      // Now favorited: also add to the local (device) library so nav badges +
      // the new-episode notification engine stay in sync.
      if (anime.data) toggleLocalFavorite(anime.data)
    }
  }

  const anime = useAsync((s) => anilist.getAnime(malId, s).then((r) => r.data), [malId])

  if (anime.loading) {
    return (
      <div className="container-page py-10">
        <DetailSkeleton />
      </div>
    )
  }

  if (anime.error || !anime.data) {
    return (
      <div className="container-page py-10">
        <ErrorState message={anime.error ?? ''} onRetry={anime.reload} />
      </div>
    )
  }

  const detail = anime.data
  const fav = favSet.has(detail.mal_id)
  const img = coverImage(detail)

  // Completed is an *earned* state: it is only reached once the user has
  // actually watched the final episode of the series. Derived reactively from
  // the watch history / continue-watching data (WatchPage records the last
  // viewed episode + total whenever an episode is opened).
  const histEntry = history.find((h) => h.mal_id === detail.mal_id)
  const contEntry = continueWatching.find((c) => c.animeId === detail.mal_id)
  // Auto-complete gate: the watched count must equal the *true* API total
  // (`detail.episodes`). The earlier `>=` check, combined with a stale
  // `contEntry.totalEpisodes` captured from a 50-row paginated list, made long
  // series flip to "Completed" at episode 50. Now:
  //   - if the API total is null/unknown → only an explicitly stored `completed`
  //     status wins (we never infer completion), and
  //   - `watchedEp` must be exactly the true total, not ≥ it (no overshoot).
  const apiTotal = detail.episodes
  const watchedEp = histEntry?.episode ?? contEntry?.episode ?? 0
  const isCompleted =
    apiTotal != null && apiTotal > 0 && watchedEp === apiTotal
      ? true
      : watchStatus === 'completed'

  // Award badge is rendered only for known Crunchyroll Anime Award winners
  // (see ANIMELIST_AWARD_WINNERS). Non-winners get nothing in that slot.
  const awardWins = ANIMELIST_AWARD_WINNERS.get(detail.mal_id)

  // The final discussion is gated behind BOTH completing the series and giving
  // a rating. (This applies only to this anime page — the per-episode
  // discussion on WatchPage is intentionally left open.)
  const reviewsUnlocked = isCompleted && userRating > 0
  const banner = detail.bannerImage || ''
  const hasTrailer = Boolean(detail.trailer && (detail.trailer.embed_url || detail.trailer.youtube_id))
  const airing = airingStatus(detail.status)
  const bannerUsable = Boolean(banner) && !bannerLowRes
  const heroSrc = bannerUsable ? banner : img || banner

  return (
    <div className="isolate -mt-20 sm:-mt-24">
      {/* Full-bleed top hero banner — pulled up behind the header to fill the top void */}
      <div className="relative -z-10 h-[380px] w-full overflow-hidden bg-night-950 md:h-[460px]">
        {heroSrc && (
          <>
            <img
              src={heroSrc}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover object-center blur-2xl opacity-30"
            />
            {bannerUsable ? (
              <img
                src={heroSrc}
                alt=""
                aria-hidden="true"
                onLoad={(e) => {
                  const w = e.currentTarget.naturalWidth
                  if (w > 0 && w < MIN_BANNER_WIDTH) setBannerLowRes(true)
                }}
                className="pointer-events-none relative block h-full w-full object-cover object-center"
              />
            ) : (
              <img
                src={heroSrc}
                alt=""
                aria-hidden="true"
                className="pointer-events-none relative mx-auto block h-full w-auto max-w-none object-contain"
              />
            )}
          </>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-night-950/55 via-night-950/20 to-night-950" />
      </div>

      <div className="container-page relative z-10 -mt-32 pb-12">
        <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
          <div className="space-y-4">
            <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-night-700 bg-night-850 shadow-card">
              {img ? (
                <img
                  src={img}
                  alt={detail.title}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-600">
                  ?
                </div>
              )}
            </div>
            <Link to={`/watch/${detail.mal_id}/1`} className="btn-primary w-full py-3">
              <PlayIcon className="h-5 w-5" />
              {isMovie(detail.type) ? t('detail.watchMovie') : t('detail.watchNow')}
            </Link>
            {hasTrailer && (
              <TrailerButton detail={detail} />
            )}
            <button
              onClick={() => void handleFavoriteToggle()}
              className={cx('btn-ghost w-full py-3', fav && 'border-white/50 text-white')}
            >
              <HeartIcon filled={fav} className="h-5 w-5" />
              {fav ? t('detail.removeFavorite') : t('detail.addFavorite')}
            </button>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-wide text-white sm:text-4xl">
                {detail.title_english || detail.title}
              </h1>
              {formatLabel(detail.type, lang) && (
                <span className="rounded-lg bg-white/15 px-2.5 py-1 text-xs font-bold text-white ring-1 ring-white/20">
                  {formatLabel(detail.type, lang)}
                </span>
              )}
            </div>
            {detail.title_japanese && (
              <p className="mt-1 text-sm text-slate-400" dir="ltr">
                {detail.title_japanese}
              </p>
            )}

            {airing !== 'unknown' && (
              <div className="mt-2">
                <span
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
                    airing === 'airing' && 'bg-emerald-500/15 text-emerald-400',
                    airing === 'finished' && 'bg-slate-500/15 text-slate-300',
                    airing === 'upcoming' && 'bg-white/10 text-slate-300',
                  )}
                >
                  {airing === 'airing' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                  {airing === 'airing' && t('detail.airing')}
                  {airing === 'finished' && t('detail.finished')}
                  {airing === 'upcoming' && t('detail.upcoming')}
                </span>
              </div>
            )}

            <StatsRow detail={detail} />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <WatchlistDropdown
                selected={watchStatus}
                onSelect={handleWatchSelect}
                onRemove={handleWatchRemove}
                completedByCompletion={isCompleted}
              />
              <YourRating value={userRating} onChange={handleRatingClick} draft={reviewDraft} onDraftChange={setReviewDraft} />
              {awardWins != null && <AwardBadge wins={awardWins} />}
            </div>

            <FinalDiscussion
              unlocked={reviewsUnlocked}
              isCompleted={isCompleted}
              rating={userRating}
              reviews={reviews}
              draft={reviewDraft}
              onDraftChange={setReviewDraft}
              onPost={(text) => setReviews((prev) => [...prev, text])}
            />

            <section className="mt-6">
              <h2 className="mb-2 text-lg font-bold text-white">{t('detail.synopsis')}</h2>
              {detail.synopsis ? (
                <AutoTranslateSynopsis description={detail.synopsis} lines={4} />
              ) : (
                <p className="text-sm text-slate-400">{t('detail.noSynopsis')}</p>
              )}
            </section>

            {detail.background && (
              <section className="mt-4">
                <h2 className="mb-2 text-lg font-bold text-white">{t('detail.background')}</h2>
                <CollapsibleText text={detail.background} lines={3} />
              </section>
            )}

            <TagsRow detail={detail} />

            {!isMovie(detail.type) && (
              <EpisodesSection
                animeId={detail.mal_id}
                totalEpisodes={detail.episodes}
                nextAiringEpisode={detail.nextAiringEpisode?.episode ?? null}
                image={detail.bannerImage || img}
              />
            )}

            <RelationsSection key={detail.mal_id} animeId={detail.mal_id} />
          </div>
        </div>

        <Recommendations animeId={detail.mal_id} />
      </div>
    </div>
  )
}

interface WatchlistDropdownProps {
  selected: WatchStatus | null
  onSelect: (s: WatchStatus) => void
  /** Invoked to drop this title from the watchlist entirely. */
  onRemove: () => void
  /** True when the user has actually watched all episodes (auto-completion). */
  completedByCompletion: boolean
}

/**
 * Watchlist status dropdown (Watching / Plan to Watch / Completed / On Hold /
 * Dropped). Each option carries a color-coded icon; "Completed" is a locked,
 * earned state — it can only be reached by watching every episode, never by
 * clicking it.
 */
function WatchlistDropdown({ selected, onSelect, onRemove, completedByCompletion }: WatchlistDropdownProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const options = [
    { id: 'watching', label: t('detail.statusWatching'), Icon: ListIcon, color: 'text-teal-400', locked: false },
    { id: 'plan', label: t('detail.statusPlanToWatch'), Icon: CalendarPlusIcon, color: 'text-sky-400', locked: false },
    { id: 'completed', label: t('detail.statusCompleted'), Icon: CheckIcon, color: 'text-emerald-400', locked: true },
    { id: 'onhold', label: t('detail.statusOnHold'), Icon: PauseCircleIcon, color: 'text-amber-400', locked: false },
    { id: 'dropped', label: t('detail.statusDropped'), Icon: XCircleIcon, color: 'text-red-400', locked: false },
  ] as const

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const current = options.find((o) => o.id === selected)
  const isCompletedSelected = current?.id === 'completed' && completedByCompletion

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'btn-ghost py-3',
          current &&
            (isCompletedSelected
              ? 'border-emerald-500/60 text-emerald-300'
              : 'border-teal-500/60 text-teal-300'),
        )}
      >
        {current ? (
          <current.Icon className={cx('h-5 w-5 shrink-0', current.color)} />
        ) : (
          <ListIcon className="h-5 w-5 shrink-0" />
        )}
        <span>
          {current?.label ?? t('detail.addToWatchlist')}
          {isCompletedSelected && <LockIcon className="ms-1 inline h-3.5 w-3.5 opacity-70" />}
        </span>
        <ChevronDown className={cx('h-4 w-4 shrink-0 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute start-0 top-full z-30 mt-2 w-max min-w-55 overflow-hidden rounded-xl border border-night-600/80 bg-night-850 py-1 shadow-card">
          {options.map(({ id, label, Icon, color, locked }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                if (locked) return
                onSelect(id)
                setOpen(false)
              }}
              aria-disabled={locked}
              className={cx(
                'flex w-full items-center gap-2.5 px-3 py-2 text-start text-sm transition',
                locked
                  ? 'cursor-not-allowed opacity-50'
                  : 'hover:bg-night-800',
                selected === id && !locked ? 'font-semibold text-teal-300' : 'text-slate-200',
              )}
            >
              <Icon className={cx('h-4 w-4 shrink-0', color)} />
              <span className="flex-1">{label}</span>
              {locked && <LockIcon className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
            </button>
          ))}
          {/* Only meaningful when the title is already tracked. */}
          {selected != null && (
            <>
              <div className="my-1 h-px bg-night-700/70" />
              <button
                type="button"
                onClick={() => {
                  onRemove()
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-start text-sm text-red-300 transition hover:bg-night-800"
              >
                <XCircleIcon className="h-4 w-4 shrink-0 text-red-400" />
                <span className="flex-1">{t('detail.removeFromWatchlist')}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

interface YourRatingProps {
  value: number
  onChange: (v: number) => void
  draft: string
  onDraftChange: (v: string) => void
}

/**
 * Your Rating — selectable 1..10 scale. Once the user picks a rating, a comment
 * field is revealed right below it so they can jot down their final thoughts.
 */
function YourRating({ value, onChange, draft, onDraftChange }: YourRatingProps) {
  const { t } = useI18n()
  const rated = value > 0
  return (
    <div className="min-w-0 flex-1">
      <div className="inline-block max-w-full rounded-xl border border-night-600/80 bg-night-900/60 px-3 py-2">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {t('detail.yourRating')}
      </span>
      <div className="flex items-center gap-2">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const hot = value >= n
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(value === n ? 0 : n)}
              title={`${n} / 10`}
              className={cx(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold transition',
                hot ? 'bg-gold-500 text-night-950' : 'text-slate-400 hover:bg-night-700 hover:text-white',
              )}
            >
              {n}
            </button>
          )
        })}
      </div>
      {/* Revealed once a rating is chosen (final thoughts, pre-discussion). */}
      {rated && (
        <div className="mt-3 border-t border-night-700/70 pt-3">
          <textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            rows={2}
            placeholder={t('detail.writeFinalThoughts')}
            aria-label={t('detail.finalDiscussion')}
            className="w-full resize-none rounded-lg border border-night-600/80 bg-night-950/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-slate-400/60 focus:outline-none"
          />
        </div>
      )}
      </div>
    </div>
  )
}

interface FinalDiscussionProps {
  unlocked: boolean
  isCompleted: boolean
  rating: number
  reviews: string[]
  draft: string
  onDraftChange: (v: string) => void
  onPost: (text: string) => void
}

/**
 * Final Discussion — the main anime review box. Locked until the user has BOTH
 * completed the series and selected a rating. Deliberately independent from the
 * per-episode discussion on the Watch page (which stays open).
 */
function FinalDiscussion({
  unlocked,
  isCompleted,
  rating,
  reviews,
  draft,
  onDraftChange,
  onPost,
}: FinalDiscussionProps) {
  const { t } = useI18n()
  const publish = () => {
    const text = draft.trim()
    if (!text || !unlocked) return
    onPost(text)
    onDraftChange('')
  }
  return (
    <section className="mt-5 rounded-xl border border-night-700/70 bg-night-850/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <StarIcon className={cx('h-4 w-4', unlocked ? 'text-gold-400' : 'text-slate-500')} />
        <h2 className="text-sm font-bold text-white">{t('detail.finalDiscussion')}</h2>
      </div>

      {unlocked ? (
        <>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <CheckIcon className="h-3.5 w-3.5 text-emerald-400" />
            {t('detail.statusCompleted')}
            <span className="text-slate-600">•</span>
            <StarIcon className="h-3.5 w-3.5 text-gold-400" />
            {rating} / 10
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') publish()
              }}
              placeholder={t('detail.writeFinalThoughts')}
              aria-label={t('detail.finalDiscussion')}
              className="h-10 w-full min-w-0 rounded-full border border-night-600/80 bg-night-900/70 px-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-slate-400/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={publish}
              disabled={!draft.trim()}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-teal-500 px-4 text-sm font-semibold text-night-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <SendIcon className="h-4 w-4" />
              {t('detail.publish')}
            </button>
          </div>
          {reviews.length === 0 ? (
            <div className="mt-3 rounded-xl border border-night-700/60 bg-night-900/50 px-4 py-5 text-center text-sm text-slate-500">
              {t('detail.noReviewsYet')}
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {reviews.map((c, i) => (
                <div key={i} className="rounded-xl border border-night-700/60 bg-night-900/50 px-4 py-2.5 text-sm text-slate-200">
                  {c}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-dashed border-night-600/80 bg-night-900/40 px-4 py-5 text-sm text-slate-400">
          <LockIcon className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
          <div>
            <p>{t('detail.reviewLocked')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs',
                  isCompleted ? 'bg-emerald-500/15 text-emerald-400' : 'bg-night-800 text-slate-500',
                )}
              >
                {isCompleted ? <CheckIcon className="h-3.5 w-3.5" /> : <LockIcon className="h-3.5 w-3.5" />}
                {t('detail.statusCompleted')}
              </span>
              <span
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs',
                  rating > 0 ? 'bg-gold-500/15 text-gold-400' : 'bg-night-800 text-slate-500',
                )}
              >
                {rating > 0 ? <StarIcon className="h-3.5 w-3.5" /> : <LockIcon className="h-3.5 w-3.5" />}
                {t('detail.yourRating')}
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function TrailerButton({ detail }: { detail: AnimeDetail }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-ghost w-full py-3 border-white/30 text-slate-200 hover:border-slate-400/60"
      >
        <PlayIcon className="h-5 w-5" />
        {t('detail.playTrailer')}
      </button>
      <TrailerModal open={open} onClose={() => setOpen(false)} trailer={detail.trailer} />
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-night-700/70 bg-night-850/60 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-bold text-white">{value}</div>
    </div>
  )
}

function StatsRow({ detail }: { detail: AnimeDetail }) {
  const { t } = useI18n()
  const [scoresOpen, setScoresOpen] = useState(false)
  const scoreRef = useRef<HTMLDivElement>(null)

  // Close the external-ratings dropdown on tap/click outside (mobile).
  useEffect(() => {
    if (!scoresOpen) return
    const onClick = (e: Event) => {
      if (scoreRef.current && !scoreRef.current.contains(e.target as Node)) setScoresOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('touchstart', onClick)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('touchstart', onClick)
    }
  }, [scoresOpen])

  return (
    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {/* Score metric — interactive trigger: hover (desktop) or tap (mobile)
          reveals the external ratings dropdown below. */}
      <div
        ref={scoreRef}
        className="relative group cursor-pointer"
        onClick={() => setScoresOpen((o) => !o)}
      >
        <div className="rounded-xl border border-gold-500/30 bg-gold-500/10 px-3 py-2 transition hover:border-gold-400/60 hover:bg-gold-500/15">
          <div className="text-[11px] uppercase tracking-wide text-gold-400">{t('detail.score')}</div>
          <div className="mt-0.5 flex items-center gap-1 text-sm font-bold text-gold-400">
            <StarIcon filled className="h-3.5 w-3.5" />
            {formatScore(detail.score)}
            {detail.scored_by != null && (
              <span className="text-[10px] font-normal text-slate-500">
                ({formatCount(detail.scored_by)})
              </span>
            )}
            <ChevronDown className="ms-auto h-3.5 w-3.5 shrink-0 text-gold-400/70 transition-transform group-hover:rotate-180" />
          </div>
        </div>

        {/* External ratings dropdown (IMDb / Crunchyroll Anime Awards / MyAnimeList) */}
        <div
          className={cx(
            'absolute top-full left-0 mt-2 w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50',
            scoresOpen && 'opacity-100 visible',
          )}
        >
          <div className="overflow-hidden rounded-xl border border-gold-500/20 bg-night-950/95 p-2 shadow-card ring-1 ring-gold-500/10 backdrop-blur-sm">
            <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {t('detail.externalRatings')}
            </p>
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/5">
              <span
                className="flex h-6 min-w-10 shrink-0 items-center justify-center rounded-md bg-[#f5c518] px-1 text-[10px] font-bold tracking-tight text-night-950"
                dir="ltr"
              >
                IMDb
              </span>
              <span className="ms-auto text-sm font-bold text-gold-400" dir="ltr">
                8.8 / 10
              </span>
            </div>
            <div className="mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/5">
              <span
                className="flex h-6 min-w-9 shrink-0 items-center justify-center rounded-md bg-[#2e589e] px-1 text-[10px] font-bold tracking-tight text-white"
                dir="ltr"
              >
                MAL
              </span>
              <span className="ms-auto text-sm font-bold text-sky-400" dir="ltr">
                8.65 / 10
              </span>
            </div>
          </div>
        </div>
      </div>
      {detail.format !== 'MOVIE' && (
        <Stat label={t('detail.episodes')} value={detail.episodes != null ? String(detail.episodes) : '?'} />
      )}
      <Stat label={t('detail.status')} value={detail.status ?? '—'} />
      <Stat label={t('detail.aired')} value={detail.aired?.string ?? '—'} />
      <Stat label={t('detail.season')} value={formatSeason(detail.season, detail.year)} />
      <Stat label={t('detail.studios')} value={detail.studios?.map((s) => s.name).join(', ') || '—'} />
    </div>
  )
}

function TagList({ title, items }: { title: string; items?: { mal_id: number; name: string }[] }) {
  const { lang } = useI18n()
  if (!items || items.length === 0) return null
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {items.map((g) => (
          <Link
            key={g.mal_id}
            to={`/catalog?genre=${encodeURIComponent(g.name)}`}
            className="chip hover:border-slate-400/60 hover:text-white"
          >
            {translateGenre(g.name, lang)}
          </Link>
        ))}
      </div>
    </div>
  )
}

function TagsRow({ detail }: { detail: AnimeDetail }) {
  const { t } = useI18n()
  return (
    <div>
      <TagList title={t('detail.genres')} items={detail.genres} />
      <TagList title={t('detail.themes')} items={detail.themes} />
    </div>
  )
}

const EPISODES_PER_BATCH = 50

function EpisodesSection({
  animeId,
  totalEpisodes,
  nextAiringEpisode,
  image,
}: {
  animeId: number
  totalEpisodes: number | null
  nextAiringEpisode: number | null
  image: string
}) {
  const { t } = useI18n()
  const [page, setPage] = useState(1)
  const episodes = useAsync((s) => anilist.getEpisodes(animeId, page, s, { perPage: 50 }).then((r) => r), [animeId, page])

  const total =
    episodes.data?.pagination.items.total ??
    totalEpisodes ??
    (nextAiringEpisode != null ? Math.max(0, nextAiringEpisode - 1) : null)
  const lastPage = episodes.data?.pagination.last_visible_page ?? 1
  const currentCount = episodes.data?.pagination.items.count ?? 0
  const rangeFrom = (page - 1) * EPISODES_PER_BATCH + 1
  const rangeTo = (page - 1) * EPISODES_PER_BATCH + currentCount

  const batches: { page: number; label: string }[] = []
  const source = total ?? 0
  for (let p = 1; p <= Math.max(1, lastPage); p++) {
    const from = (p - 1) * EPISODES_PER_BATCH + 1
    const to = Math.min(p * EPISODES_PER_BATCH, source)
    batches.push({ page: p, label: `${from}–${to}` })
  }

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SubtitlesIcon className="h-5 w-5 text-slate-300" />
        <h2 className="text-lg font-bold text-white">{t('detail.episodeList')}</h2>
        {total != null && <span className="text-sm text-slate-500">({total})</span>}
      </div>

      {total != null && total > EPISODES_PER_BATCH && (
        <>
          <p className="mb-2 text-xs text-slate-500">{t('detail.episodeListHint')}</p>
          <div className="thin-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1">
            {batches.map((b) => (
              <button
                key={b.page}
                type="button"
                onClick={() => setPage(b.page)}
                aria-current={b.page === page ? 'true' : undefined}
                className={
                  b.page === page
                    ? 'shrink-0 rounded-full border border-white/40 bg-white/10 px-3 py-1 text-xs font-semibold text-white'
                    : 'shrink-0 rounded-full border border-night-600/80 bg-night-800/60 px-3 py-1 text-xs font-semibold text-slate-300 transition hover:border-slate-400/60 hover:text-white'
                }
              >
                {b.label}
              </button>
            ))}
          </div>
        </>
      )}

      {episodes.loading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      )}
      {episodes.error && <ErrorState message={episodes.error} onRetry={episodes.reload} compact />}
      {episodes.data && episodes.data.data.length === 0 && (
        <p className="rounded-xl border border-night-700/70 bg-night-850/60 p-4 text-sm text-slate-400">
          {t('detail.noEpisodes')}
        </p>
      )}

      {episodes.data && episodes.data.data.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {episodes.data.data.map((ep) => (
              <EpisodeRow key={ep.mal_id} animeId={animeId} episode={ep} image={image} />
            ))}
          </div>
          {batches.length > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn-ghost disabled:opacity-40"
              >
                {t('catalog.prev')}
              </button>
              <span className="text-slate-500">
                {t('detail.episodeRange', { from: rangeFrom, to: rangeTo })}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(batches.length, p + 1))}
                disabled={page >= batches.length}
                className="btn-ghost disabled:opacity-40"
              >
                {t('catalog.next')}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/**
 * Episode thumbnail: shows the anime's main artwork (banner image, falling
 * back to the cover image) as the background for every episode in the grid.
 */
function EpisodeThumb({ episode, image }: { episode: Episode; image: string }) {
  if (episode.upcoming === true) {
    return (
      <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-night-800/80">
        {image && (
          <img
            src={image}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <span className="absolute inset-0 bg-black/60" />
        <span className="absolute inset-0 flex items-center justify-center">
          <ClockIcon className="h-7 w-7 text-slate-200" />
        </span>
      </div>
    )
  }

  return (
    <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-night-800/80">
      {image && (
        <img
          src={image}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-night-900/50 opacity-0 transition group-hover:opacity-100">
        <PlayIcon className="h-7 w-7 text-white" />
      </span>
      <span className="absolute bottom-1.5 start-1.5 rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-bold text-white/90">
        {episode.mal_id}
      </span>
    </div>
  )
}

function EpisodeRow({ animeId, episode, image }: { animeId: number; episode: Episode; image: string }) {
  const { t } = useI18n()
  const title = episode.title || episode.title_romanji || episode.title_japanese
  const romanji = episode.title_romanji && episode.title_romanji !== title ? episode.title_romanji : null
  // Duration is not part of the current Episode contract; render the header
  // number plus a placeholder-free label now and the duration (e.g. "23:40")
  // automatically appears the moment an API source starts providing `duration`.
  const duration = (episode as Episode & { duration?: number | string }).duration
  const durationLabel =
    typeof duration === 'number' && duration > 0
      ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`
      : typeof duration === 'string' && duration.length > 0
        ? duration
        : null

  const upcoming = episode.upcoming === true
  const header = [t('detail.episode') + ' ' + episode.mal_id, durationLabel].filter(Boolean).join(' · ')

  if (upcoming) {
    return (
      <div
        aria-disabled="true"
        className="pointer-events-none flex items-start gap-3 rounded-xl border border-night-700/50 bg-night-850/40 p-3 opacity-50"
      >
        <EpisodeThumb episode={episode} image={image} />

        {/* Metadata column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{header}</p>
          <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-400">
            {title ?? `${t('detail.episode')} ${episode.mal_id}`}
          </p>
          {romanji && (
            <p className="mt-0.5 truncate text-xs text-slate-500" dir="ltr">
              {romanji}
            </p>
          )}
          <span className="mt-auto flex items-center gap-1.5 pt-2 text-[11px] font-semibold text-cyan-400">
            <ClockIcon className="h-3.5 w-3.5" />
            {t('detail.comingSoon')}
          </span>
        </div>
      </div>
    )
  }

  return (
    <Link
      to={`/watch/${animeId}/${episode.mal_id}`}
      className="group flex items-start gap-3 rounded-xl border border-night-700/70 bg-night-850/50 p-3 transition hover:border-slate-400/60 hover:bg-night-800/70"
    >
      <EpisodeThumb episode={episode} image={image} />

      {/* Metadata column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{header}</p>
        <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-100">
          {title ?? `${t('detail.episode')} ${episode.mal_id}`}
        </p>
        {romanji && (
          <p className="mt-0.5 truncate text-xs text-slate-500" dir="ltr">
            {romanji}
          </p>
        )}
        <span className="mt-auto flex items-center gap-1.5 pt-2 text-[11px] font-medium text-slate-400">
          <span className="inline-block h-2.5 w-2.5 rounded-full border border-slate-500" />
          {t('detail.notWatched')}
        </span>
      </div>
    </Link>
  )
}

function Recommendations({ animeId }: { animeId: number }) {
  const { t } = useI18n()
  const recs = useAsync((s) => anilist.getRecommendations(animeId, s).then((r) => r.data), [animeId])

  if (recs.loading) {
    return (
      <section className="mt-12">
        <h2 className="mb-4 text-xl font-semibold tracking-wide text-white">{t('detail.recommendations')}</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3]" />
          ))}
        </div>
      </section>
    )
  }

  if (!recs.data || recs.data.length === 0) return null
  const items = recs.data.slice(0, 12).map((r) => r.entry)

  return (
    <section className="mt-12">
      <h2 className="mb-4 text-xl font-semibold tracking-wide text-white">{t('detail.recommendations')}</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {items.map((a) => (
          <AnimeCard key={a.mal_id} anime={a} />
        ))}
      </div>
    </section>
  )
}

function DetailSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
      <Skeleton className="aspect-[2/3] w-full rounded-2xl" />
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-5 w-1/3" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  )
}