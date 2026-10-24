/**
 * PublicProfilePage.tsx — the public profile viewer (Phase 4).
 *
 * Reached via `/user/:username`, this page lets *anyone* view another member's
 * profile: avatar, username, and bio, plus their public Favorites and Watch
 * History lists. Data comes from the public helpers in `lib/database.ts`:
 *   - `getProfileByUsername` resolves the profile (or a "user not found" state),
 *   - `getPublicFavorites` / `getPublicHistory` resolve to *empty* arrays when
 *     the owner's privacy toggle is off (RLS withholds the rows), so this page
 *     renders a clean "…are private" / "nothing to show" message instead of erroring.
 */

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useI18n } from '../context/LanguageContext'
import {
  getProfileByUsername,
  getPublicFavorites,
  getPublicHistory,
  getPublicWatchlist,
} from '../lib/database'
import type { Profile, Favorite, HistoryEntry, WatchlistEntry, WatchlistStatus } from '../lib/database'
import { fetchAnimeMetadata } from '../lib/anipub'
import type { AnimeMeta } from '../lib/anipub'
import { EmptyState } from '../components/ui/States'
import { Spinner } from '../components/ui/Feedback'
import { cx } from '../lib/utils'
import {
  AvatarIcon,
  HeartIcon,
  HistoryIcon,
  ListIcon,
  CalendarPlusIcon,
  CheckIcon,
  PauseCircleIcon,
  XCircleIcon,
} from '../components/icons'

/** Format an ISO timestamp to a short, locale-aware date string. */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * One public-list entry rendered as a compact row: poster thumbnail (or
 * placeholder), real AniList title (or the `#<id>` fallback), a secondary line,
 * and a timestamp. The whole row links to the title's detail page.
 */
function Row({
  title,
  meta,
  secondary,
  time,
}: {
  title: string
  meta?: AnimeMeta
  secondary?: string
  time: string
}) {
  const displayTitle = meta?.title ? meta.title : title
  const cover = meta?.coverImage
  return (
    <Link
      to={`/anime/${meta?.id ?? 0}`}
      className="group flex items-center gap-4 rounded-2xl border border-night-700/70 bg-night-850/60 p-3 transition hover:border-slate-400/50"
    >
      <div className="flex h-16 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-night-700/70 bg-night-800 text-slate-500">
        {cover ? (
          <img
            src={cover}
            alt={displayTitle}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <ListIcon className="h-5 w-5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-white group-hover:text-white">{displayTitle}</p>
        {secondary && <p className="mt-0.5 text-xs text-slate-300">{secondary}</p>}
      </div>
      <p className="shrink-0 text-[11px] text-slate-500">{formatDate(time)}</p>
    </Link>
  )
}

/** A public list panel: loading / (private-and-empty) / (public-and-empty) / rows. */
function PublicList<T>(props: {
  items: T[]
  loading: boolean
  icon: JSX.Element
  /** Shown when the owner's toggle hides this list (it may still contain items). */
  privateTitle: string
  privateHint: string
  /** Shown when the toggle is public but there genuinely is nothing. */
  emptyTitle: string
  emptyHint: string
  /** Whether the owner has marked this list public (drives private vs empty copy). */
  isPublic: boolean
  renderItem: (item: T) => JSX.Element
}) {
  const { items, loading, icon, privateTitle, privateHint, emptyTitle, emptyHint, isPublic, renderItem } = props

  if (loading) {
    return (
      <div className="flex min-h-[22vh] items-center justify-center text-slate-400">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }
  if (items.length === 0) {
    const title = isPublic ? emptyTitle : privateTitle
    const hint = isPublic ? emptyHint : privateHint
    return <EmptyState icon={icon} title={title} hint={hint} />
  }
  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div key={idx}>{renderItem(item)}</div>
      ))}
    </div>
  )
}
export default function PublicProfilePage() {
  const { username = '' } = useParams<{ username: string }>()
  const { t } = useI18n()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([])
  const [listsLoading, setListsLoading] = useState(false)
  // AniList metadata (title + poster) resolved for anime ids seen in the lists,
  // keyed by anime_id. Missing entries fall back to the "Anime #<id>" label.
  const [metaMap, setMetaMap] = useState<Record<number, AnimeMeta>>({})

  // Resolve the profile for this username on mount / when the route param changes.
  useEffect(() => {
    let cancelled = false
    async function load() {
      setProfile(null)
      setLoading(true)
      const res = await getProfileByUsername(username)
      if (cancelled) return
      setProfile(res.data)
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [username])

  // Once we know the profile id, pull the two public lists (may come back empty
  // when the owner's privacy toggles are off — a valid, handled state).
  useEffect(() => {
    let cancelled = false
    if (!profile) {
      setFavorites([])
      setHistory([])
      setWatchlist([])
      setListsLoading(false)
      return
    }
    setListsLoading(true)
    const favId = profile.id
    void Promise.all([
      getPublicFavorites(favId),
      getPublicHistory(favId),
      getPublicWatchlist(favId),
    ]).then(async ([f, h, w]) => {
      if (cancelled) return
      if (f.data) setFavorites(f.data)
      if (h.data) setHistory(h.data)
      if (w.data) setWatchlist(w.data)
      // Resolve AniList titles + posters for every distinct anime id across all
      // three lists. A graceful failure (network / rate-limit) yields null, and
      // rows fall back to their "Anime #<id>" label — never an error.
      const ids = [
        ...(f.data ?? []).map((e) => e.anime_id),
        ...(h.data ?? []).map((e) => e.anime_id),
        ...(w.data ?? []).map((e) => e.anime_id),
      ]
      const meta = await fetchAnimeMetadata(ids)
      if (cancelled || !meta) return
      setMetaMap((prev) => {
        const next = { ...prev }
        for (const m of meta) next[m.id] = m
        return next
      })
      setListsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [profile])

  // Loading state — still resolving the username.
  if (loading) {
    return (
      <div className="container-page flex min-h-[40vh] items-center justify-center py-12 text-slate-400">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  // Username did not resolve to a profile -> clean "user not found" screen.
  if (!profile) {
    return (
      <div className="container-page flex min-h-[55vh] flex-col items-center justify-center py-16 text-center">
        <EmptyState
          icon={<AvatarIcon className="h-8 w-8" />}
          title={t('profile.notFoundTitle', { name: username })}
          hint={t('profile.notFoundHint')}
          action={
            <Link to="/catalog" className="btn-primary mt-4">
              {t('nav.catalog')}
            </Link>
          }
        />
      </div>
    )
  }

  const avatarUrl = profile.avatar_url?.trim() ? profile.avatar_url : null
  const name = profile.username?.trim() ? profile.username : username
  const initials = name.slice(0, 2).toUpperCase()

  return (
    <div className="container-page py-8">
      {/* profile header card */}
      <section className="rounded-2xl border border-night-700/70 bg-night-850/60 p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-night-600/70 bg-night-800 text-2xl font-bold text-white">
            {avatarUrl ? (
              <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-semibold tracking-wide text-white">
              {profile.username}
            </h1>
            {profile.bio ? (
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{profile.bio}</p>
            ) : (
              <p className="mt-1 text-sm text-slate-500">{t('profile.noBio')}</p>
            )}
            {profile.created_at && (
              <p className="mt-2 text-[11px] text-slate-500">
                {t('profile.memberSince')}: {formatDate(profile.created_at)}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* public watch history */}
      <section className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-white">
          <HistoryIcon className="h-5 w-5" />
          {t('nav.history')}
        </h2>
        <PublicList
          items={history}
          loading={listsLoading}
          icon={<HistoryIcon className="h-7 w-7" />}
          privateTitle={t('profile.historyPrivate')}
          privateHint={t('profile.historyPrivateHint')}
          emptyTitle={t('profile.noHistory')}
          emptyHint={t('profile.noHistoryHint')}
          isPublic={profile.is_watchlist_public}
          renderItem={(item) => (
            <Row
              title={`${t('profile.animeUnknown')} #${item.anime_id}`}
              meta={metaMap[item.anime_id]}
              secondary={
                item.episode_number != null
                  ? t('profile.watchedEpisode', { n: item.episode_number })
                  : t('profile.fullWatch')
              }
              time={item.watched_at}
            />
          )}
        />
      </section>

      {/* public favorites */}
      <section className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-white">
          <HeartIcon className="h-5 w-5" />
          {t('nav.favorites')}
        </h2>
        <PublicList
          items={favorites}
          loading={listsLoading}
          icon={<HeartIcon className="h-7 w-7" />}
          privateTitle={t('profile.favoritesPrivate')}
          privateHint={t('profile.favoritesPrivateHint')}
          emptyTitle={t('profile.noFavorites')}
          emptyHint={t('profile.noFavoritesHint')}
          isPublic={profile.is_favorites_public}
          renderItem={(item) => (
            <Row
              title={`${t('profile.animeUnknown')} #${item.anime_id}`}
              meta={metaMap[item.anime_id]}
              secondary={t('profile.favorited')}
              time={item.created_at}
            />
          )}
        />
      </section>

      {/* public watchlist (gated by the same is_watchlist_public toggle) */}
      <section className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-white">
          <ListIcon className="h-5 w-5" />
          {t('profile.watchlist')}
        </h2>
        <PublicWatchlistGrid
          items={watchlist}
          loading={listsLoading}
          metaMap={metaMap}
          isPublic={profile.is_watchlist_public}
        />
      </section>
    </div>
  )
}

const PUBLIC_STATUS_META: Record<
  WatchlistStatus,
  { labelKey: 'detail.statusWatching' | 'detail.statusPlanToWatch' | 'detail.statusCompleted' | 'detail.statusOnHold' | 'detail.statusDropped'; color: string; Icon: typeof ListIcon }
> = {
  CURRENTLY_WATCHING: { labelKey: 'detail.statusWatching', color: 'text-teal-400', Icon: ListIcon },
  PLAN_TO_WATCH: { labelKey: 'detail.statusPlanToWatch', color: 'text-sky-400', Icon: CalendarPlusIcon },
  COMPLETED: { labelKey: 'detail.statusCompleted', color: 'text-emerald-400', Icon: CheckIcon },
  ON_HOLD: { labelKey: 'detail.statusOnHold', color: 'text-amber-400', Icon: PauseCircleIcon },
  DROPPED: { labelKey: 'detail.statusDropped', color: 'text-red-400', Icon: XCircleIcon },
}

/**
 * Public view of another user's watchlist: grouped by status as a grid of
 * poster cards. Resolves to a clean "private / nothing to show" state when the
 * owner's `is_watchlist_public` toggle is off or the list is genuinely empty.
 */
function PublicWatchlistGrid({
  items,
  loading,
  metaMap,
  isPublic,
}: {
  items: WatchlistEntry[]
  loading: boolean
  metaMap: Record<number, AnimeMeta>
  isPublic: boolean
}) {
  const { t } = useI18n()

  if (loading) {
    return (
      <div className="flex min-h-[22vh] items-center justify-center text-slate-400">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ListIcon className="h-7 w-7" />}
        title={isPublic ? t('profile.noWatchlist') : t('profile.watchlistPrivate')}
        hint={isPublic ? t('profile.noWatchlistHint') : t('profile.watchlistPrivateHint')}
      />
    )
  }

  const order: WatchlistStatus[] = [
    'CURRENTLY_WATCHING',
    'PLAN_TO_WATCH',
    'COMPLETED',
    'ON_HOLD',
    'DROPPED',
  ]
  const groups: Record<WatchlistStatus, WatchlistEntry[]> = {
    CURRENTLY_WATCHING: [],
    PLAN_TO_WATCH: [],
    COMPLETED: [],
    ON_HOLD: [],
    DROPPED: [],
  }
  for (const entry of items) groups[entry.status].push(entry)

  return (
    <div className="space-y-8">
      {order
        .filter((status) => groups[status].length > 0)
        .map((status) => {
          const meta = PUBLIC_STATUS_META[status]
          return (
            <section key={status}>
              <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-white">
                <meta.Icon className={cx('h-5 w-5 shrink-0', meta.color)} />
                {t(meta.labelKey)}
                <span className="text-sm font-normal text-slate-500">· {groups[status].length}</span>
              </h3>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {groups[status].map((entry) => {
                  const m = metaMap[entry.anime_id]
                  const title = m?.title ? m.title : `${t('profile.animeUnknown')} #${entry.anime_id}`
                  const cover = m?.coverImage
                  return (
                    <Link
                      key={entry.id}
                      to={`/anime/${m?.id ?? entry.anime_id}`}
                      className="group block overflow-hidden rounded-xl border border-night-700/70 bg-night-850/60 transition hover:border-slate-400/50"
                    >
                      <div className="relative aspect-[2/3] overflow-hidden bg-night-800">
                        {cover ? (
                          <img
                            src={cover}
                            alt={title}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-slate-600">
                            <ListIcon className="h-7 w-7" />
                          </div>
                        )}
                        <div className={cx('absolute start-2 top-2', meta.color)}>
                          <meta.Icon className="h-4 w-4 drop-shadow" />
                        </div>
                      </div>
                      <p className="truncate px-2 py-2 text-xs font-semibold text-white group-hover:text-white">
                        {title}
                      </p>
                    </Link>
                  )
                })}
              </div>
            </section>
          )
        })}
    </div>
  )
}