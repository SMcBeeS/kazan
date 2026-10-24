import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '../context/LanguageContext'
import { useLibrary } from '../context/LibraryContext'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { anilist } from '../lib/anipub'
import { addToHistory, getComments, postComment } from '../lib/database'
import type { Comment } from '../lib/database'
import { useAsync } from '../hooks/useAsync'
import { resolveEpisodeSources } from '../lib/videoSources'
import { coverImage, formatLabel, formatRating, isMovie } from '../lib/utils'
import type { Episode } from '../lib/types'
import { Loading, Spinner } from '../components/ui/Feedback'
import { ErrorState } from '../components/ui/States'
import { VideoPlayer } from '../components/ui/VideoPlayer'
import type { SkipSegments } from '../components/ui/VideoPlayer'
import { ArrowLeft, SendIcon, StarIcon, SubtitlesIcon, ClockIcon } from '../components/icons'

/**
 * WatchPage — episode player screen.
 *
 * Resolves the authorized video sources for the episode via lib/videoSources,
 * renders the reusable VideoPlayer (source/quality/subtitle selection,
 * fullscreen, next/prev, local progress), records watch history, and shows a
 * side list of episodes for quick switching.
 */
export default function WatchPage() {
  const { id, episode } = useParams<{ id: string; episode: string }>()
  const animeId = Number(id)
  const episodeNumber = Math.max(1, parseInt(episode ?? '1', 10) || 1)
  const { t, lang } = useI18n()
  const { recordHistory, recordContinue } = useLibrary()
  const { user } = useAuth()
  const { settings } = useSettings()
  const navigate = useNavigate()

  const anime = useAsync((s) => anilist.getAnime(animeId, s).then((r) => r.data), [animeId])
  const episodes = useAsync((s) => anilist.getEpisodes(animeId, 1, s).then((r) => r.data), [animeId])

  const sources = useMemo(
    () => resolveEpisodeSources({ animeId, episode: episodeNumber }),
    [animeId, episodeNumber],
  )

  // Intro/outro skip segments for the current episode. Production wiring would
  // hit the AniSkip.io API (`/skip/{mal_id}/{episode}`); until an API key is
  // configured we fall back to a deterministic mock so the auto-skip feature
  // is demonstrable (intro ~5min in, outro ~24min in of a ~25min episode).
  const skipSegments = useMemo<SkipSegments | null>(() => {
    // TODO: replace with live AniSkip fetch when ANISKIP_API_KEY is set.
    return {
      intro: { start: 300, end: 355 },
      outro: { start: 1440, end: 1500 },
    }
  }, [])

  // For long-running series AniList leaves `episodes` null, so fall back to the
  // aired count derived from nextAiringEpisode (see lib/anilist.getEpisodes).
  const totalEpisodes =
    anime.data?.episodes ??
    (anime.data?.nextAiringEpisode ? Math.max(0, anime.data.nextAiringEpisode.episode - 1) : null) ??
    episodes.data?.length ??
    null
  const hasPrev = episodeNumber > 1
  const hasNext = totalEpisodes == null ? true : episodeNumber < totalEpisodes

  // Record this view in the *database* watch history for signed-in users
  // (background fire-and-forget; the local LibraryContext call below still runs
  // for everyone so the "Continue Watching" carousel works offline).
  useEffect(() => {
    if (!user || !anime.data) return
    void addToHistory(anime.data.mal_id, episodeNumber)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anime.data?.mal_id, episodeNumber, user])

  // Record this view in watch history + the "Continue Watching" carousel (#10).
  // Also feed the new-episode notification engine the moment an episode is
  // opened: if the title is a favorite, raise a notification when this episode
  // is newer than the last one we've seen for it.
  useEffect(() => {
    if (anime.data) {
      recordHistory(anime.data, {
        episode: episodeNumber,
        progress: totalEpisodes ? episodeNumber / totalEpisodes : undefined,
        format: anime.data.format ?? anime.data.type ?? null,
      })
      recordContinue({
        animeId: anime.data.mal_id,
        title: anime.data.title_english || anime.data.title,
        episode: episodeNumber,
        timestamp: Date.now(),
        coverImage: coverImage(anime.data),
        totalEpisodes,
        format: anime.data.type ?? null,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anime.data?.mal_id, episodeNumber])

  if (anime.loading) {
    return (
      <div className="container-page py-10">
        <Loading label={t('common.loading')} />
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
  const goPrev = () => hasPrev && navigate(`/watch/${animeId}/${episodeNumber - 1}`)
  const goNext = () => hasNext && navigate(`/watch/${animeId}/${episodeNumber + 1}`)

  // Auto-advance when the video ends (only when the setting is on).
  const handleEnded = () => {
    if (settings.autoNextEpisode && hasNext) {
      navigate(`/watch/${animeId}/${episodeNumber + 1}`)
    }
  }

  // Find metadata for the currently playing episode.
  const currentEpisode = episodes.data?.find((ep) => ep.mal_id === episodeNumber) ?? null

  return (
    <div className="container-page py-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4 flip-rtl" />
        {t('watch.backToAnime')}
      </button>

      <div className={`grid gap-6${detail.format === 'MOVIE' ? '' : ' lg:grid-cols-[1fr_320px]'}`}>
        {/* Player + info */}
        <div>
          <VideoPlayer
            sources={sources}
            animeId={animeId}
            episode={episodeNumber}
            onPrev={hasPrev ? goPrev : undefined}
            onNext={hasNext ? goNext : undefined}
            onEnded={handleEnded}
            skipSegments={skipSegments}
            poster={coverImage(detail)}
          />

          {/* Series + current episode metadata */}
          <div className="mt-4 flex gap-4">
            <Link to={`/anime/${animeId}`} className="hidden h-28 w-20 shrink-0 overflow-hidden rounded-lg border border-night-700 sm:block">
              {coverImage(detail) ? (
                <img
                  src={coverImage(detail)}
                  alt={detail.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-night-850 text-slate-600">?</div>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/anime/${animeId}`}
                  className="cursor-pointer text-lg font-bold text-white transition-colors hover:underline hover:text-teal-400 sm:text-xl"
                >
                  {detail.title_english || detail.title}
                </Link>
                {detail.score != null && (
                  <span className="flex items-center gap-1 rounded-lg bg-gold-500/15 px-2 py-0.5 text-xs font-bold text-gold-400">
                    <StarIcon filled className="h-3 w-3" />
                    {detail.score.toFixed(1)}
                  </span>
                )}
                {detail.rating && (
                  <span className="chip text-[10px]">{formatRating(detail.rating)}</span>
                )}
                {formatLabel(detail.type, lang) && (
                  <span className="chip text-[10px] font-bold">{formatLabel(detail.type, lang)}</span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-400">
                {isMovie(detail.type)
                  ? t('watch.watchMovie')
                  : `${t('watch.episode')} ${episodeNumber}${totalEpisodes != null ? ` / ${totalEpisodes}` : ''}`}
                {!isMovie(detail.type) && currentEpisode?.aired && ` · ${new Date(currentEpisode.aired).toLocaleDateString()}`}
              </p>
              {currentEpisode && (currentEpisode.title || currentEpisode.title_romanji) && (
                <p className="mt-0.5 truncate text-xs text-slate-500" dir="ltr">
                  {currentEpisode.title_romanji || currentEpisode.title}
                </p>
              )}
              {detail.synopsis && (
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-400">
                  {detail.synopsis}
                </p>
              )}
            </div>
          </div>

          {/* Episode discussion */}
          <EpisodeDiscussion animeId={animeId} episodeNumber={episodeNumber} isMovie={detail.format === 'MOVIE'} />
        </div>

        {/* Episode sidebar (hidden for movies) */}
        {detail.format !== 'MOVIE' && (
          <EpisodeSidebar
            animeId={animeId}
            current={episodeNumber}
            episodes={episodes.data}
            loading={episodes.loading}
            error={episodes.error}
          />
        )}
      </div>
    </div>
  )
}

/* ---------------------------- episode sidebar ---------------------------- */

/* -------------------------- episode discussion --------------------------- */

/** Format an ISO timestamp to a short, locale-aware date string. */
function formatCommentDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * EpisodeDiscussion — per-episode comment box rendered below the player.
 * Comments are persisted to Supabase (see lib/database.getComments / postComment)
 * and render the poster's avatar, username + timestamp. Guests see a
 * "Log in to comment" prompt instead of the input.
 */
function EpisodeDiscussion({ animeId, episodeNumber, isMovie }: { animeId: number; episodeNumber: number; isMovie?: boolean }) {
  const { t } = useI18n()
  const { user, email, supabaseConfigured, openAuthModal } = useAuth()
  const [draft, setDraft] = useState('')
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [posting, setPosting] = useState(false)

  const signedIn = !!user

  // Load this episode's comments on mount / when the episode changes.
  useEffect(() => {
    if (!supabaseConfigured || !user) {
      setComments([])
      return
    }
    let cancelled = false
    setComments(null)
    void (async () => {
      const res = await getComments(animeId, episodeNumber)
      if (cancelled) return
      setComments(res.data ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [animeId, episodeNumber, user, supabaseConfigured])

  // Wipe the draft when the session drops so the previous user's text
  // never lingers (data-ghosting on logout).
  useEffect(() => {
    if (!user) setDraft('')
  }, [user])

  const post = async () => {
    const text = draft.trim()
    if (!text || !user || posting) return
    setPosting(true)
    const res = await postComment(animeId, text, episodeNumber)
    setPosting(false)
    if (res.error || !res.data) {
      window.alert(`${t('common.error')}: ${res.error ?? 'Unable to post comment.'}`)
      return
    }
    // Stamp the current user's identity so it renders immediately (the profiles
    // join is already populated, but being explicit keeps the UI robust).
    const me: Comment = {
      ...res.data,
      author: {
        username: user.user_metadata?.username ?? email?.split('@')[0] ?? 'You',
        avatar_url: typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null,
      },
    }
    setComments((prev) => (prev ? [me, ...prev] : [me]))
    setDraft('')
  }

  return (
    <div className="mt-5 rounded-xl border border-night-700/70 bg-night-850/50 p-3">
      <div className="mb-3 flex items-center gap-2">
        <SubtitlesIcon className="h-4 w-4 text-slate-300" />
        <h2 className="text-sm font-bold text-white">
          {isMovie
            ? t('watch.discussThisMovie')
            : `${t('watch.discussThisEpisode')} ${t('watch.episode')} ${episodeNumber}`}
        </h2>
      </div>

      {signedIn ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void post()
            }}
            placeholder={t('watch.shareThoughts')}
            aria-label={t('watch.discussThisEpisode')}
            className="h-10 w-full min-w-0 rounded-full border border-night-600/80 bg-night-900/70 px-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-slate-400/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void post()}
            disabled={!draft.trim() || posting}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-teal-500 px-4 text-sm font-semibold text-night-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {posting ? <Spinner className="h-4 w-4" /> : <SendIcon className="h-4 w-4" />}
            {t('watch.post')}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-full border border-dashed border-night-600/80 bg-night-900/50 px-4 py-2.5">
          <span className="flex-1 text-sm text-slate-400">{t('watch.loginToComment')}</span>
          <button
            type="button"
            onClick={openAuthModal}
            disabled={!supabaseConfigured}
            className="shrink-0 text-xs font-bold text-teal-400 transition hover:text-teal-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('auth.tab.login')}
          </button>
        </div>
      )}

      {comments === null ? (
        <div className="mt-3 flex justify-center text-slate-500">
          <Spinner className="h-5 w-5" />
        </div>
      ) : comments.length === 0 ? (
        <div className="mt-3 rounded-xl border border-night-700/60 bg-night-900/50 px-4 py-5 text-center text-sm text-slate-500">
          {t('watch.noCommentsYet')}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-3 rounded-xl border border-night-700/60 bg-night-900/50 px-3 py-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-night-800 text-sm font-bold text-slate-300">
                {c.author?.avatar_url ? (
                  <img src={c.author.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  (c.author?.username ?? '?').slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-bold text-white">{c.author?.username ?? 'Anonymous'}</span>
                  <span className="flex shrink-0 items-center gap-1 text-[10px] text-slate-500">
                    <ClockIcon className="h-3 w-3" />
                    {formatCommentDate(c.created_at)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-200">{c.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EpisodeSidebar({
  animeId,
  current,
  episodes,
  loading,
  error,
}: {
  animeId: number
  current: number
  episodes?: Episode[] | null
  loading: boolean
  error: string | null
}) {
  const { t } = useI18n()
  return (
    <aside className="card-surface flex max-h-[70vh] flex-col p-3">
      <div className="mb-3 flex items-center gap-2 px-1">
        <SubtitlesIcon className="h-4 w-4 text-slate-300" />
        <h2 className="text-sm font-bold text-white">{t('watch.episodes')}</h2>
      </div>

      <div className="thin-scrollbar -mx-1 flex-1 space-y-1.5 overflow-y-auto px-1">
        {loading &&
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-night-800" />
          ))}

        {error && <p className="px-1 py-2 text-xs text-red-400">{error}</p>}

        {!loading && (!episodes || episodes.length === 0) && (
          <p className="px-1 py-2 text-xs text-slate-500">{t('detail.noEpisodes')}</p>
        )}

        {episodes?.map((ep) => {
          const active = ep.mal_id === current
          const upcoming = ep.upcoming === true
          // Upcoming episodes are shown but not clickable (#7).
          if (upcoming) {
            return (
              <div
                key={ep.mal_id}
                aria-disabled="true"
                className="flex cursor-not-allowed items-center gap-3 rounded-lg border border-transparent p-2 opacity-50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-night-800 text-xs font-bold text-slate-500">
                  {ep.mal_id}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-400">
                  {ep.title_romanji || ep.title || `${t('detail.episode')} ${ep.mal_id}`}
                </span>
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                  {t('detail.upcomingBadge')}
                </span>
              </div>
            )
          }
          return (
            <Link
              key={ep.mal_id}
              to={`/watch/${animeId}/${ep.mal_id}`}
              className={
                active
                  ? 'flex items-center gap-3 rounded-lg border border-slate-400/50 bg-white/10 p-2'
                  : 'flex items-center gap-3 rounded-lg border border-transparent p-2 transition hover:bg-night-800/70'
              }
            >
              <span
                className={
                  active
                    ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-xs font-bold text-night-900'
                    : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-night-800 text-xs font-bold text-slate-400'
                }
              >
                {ep.mal_id}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-slate-200">
                  {ep.title_romanji || ep.title || `${t('detail.episode')} ${ep.mal_id}`}
                </span>
              </span>
            </Link>
          )
        })}
      </div>
    </aside>
  )
}

