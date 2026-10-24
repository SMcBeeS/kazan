/**
 * ProfilePage.tsx — the signed-in user's profile (Phase 2 frontend).
 *
 * Shows the profile header (avatar, username, bio, email, member-since) with
 * inline editing, two privacy toggles (watchlist / favorites visibility) that
 * write straight to the `profiles` row, and tabs for watch History, Favorites
 * and the (still-to-come) Watchlist. Data comes from `lib/database.ts`; while
 * the anime-catalog mapping isn't wired in yet, history/favorites entries
 * render their AniList id as "Anime #<id>" — full titles arrive once the
 * profile list view joins against the stored AniList media.
 *
 * Fully defensive: when Supabase isn't configured or the user is signed out
 * it renders a clean sign-in prompt rather than erroring.
 */

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../context/LanguageContext'
import { getProfile, updateProfile, getFavorites, getHistory, getWatchlist } from '../lib/database'
import type { Profile, Favorite, HistoryEntry, WatchlistEntry, WatchlistStatus } from '../lib/database'
import { fetchAnimeMetadata } from '../lib/anilist'
import type { AnimeMeta } from '../lib/anilist'
import { TextInput } from '../components/ui/Form'
import { EmptyState } from '../components/ui/States'
import { Spinner } from '../components/ui/Feedback'
import {
  AvatarIcon,
  HistoryIcon,
  HeartIcon,
  SettingsIcon,
  ListIcon,
  EyeIcon,
  CalendarPlusIcon,
  CheckIcon,
  PauseCircleIcon,
  XCircleIcon,
} from '../components/icons'
import { cx } from '../lib/utils'

type Tab = 'history' | 'favorites' | 'watchlist'

/** Format an ISO timestamp to a short, locale-aware date string. */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function ProfilePage() {
  const { t } = useI18n()
  const { user, email, loading: authLoading, supabaseConfigured, openAuthModal } = useAuth()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  // Inline-edit form for the header.
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ username: '', bio: '', avatar_url: '' })
  const [saving, setSaving] = useState(false)

  // Active tab + the two data lists driven off the database.
  const [tab, setTab] = useState<Tab>('history')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([])
  const [listLoading, setListLoading] = useState(false)
  // AniList metadata (title + poster) resolved for anime ids seen in the lists,
  // keyed by anime_id. Empty / missing entries fall back to "Anime #<id>".
  const [metaMap, setMetaMap] = useState<Record<number, AnimeMeta>>({})

  const signedIn = !!user

  // Load the profile row on mount / when the signed-in user changes.
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!supabaseConfigured || !user) {
        if (!cancelled) {
          setProfile(null)
          // Wipe the inline-edit form + flag so the previous user's details/logged-in
          // editing state don't carry over (data-ghosting on logout).
          setEditing(false)
          setForm({ username: '', bio: '', avatar_url: '' })
          setLoading(false)
        }
        return
      }
      setLoading(true)
      const res = await getProfile(user.id)
      if (cancelled) return
      setProfile(res.data)
      setForm({
        username: res.data?.username ?? email?.split('@')[0] ?? '',
        bio: res.data?.bio ?? '',
        avatar_url: res.data?.avatar_url ?? '',
      })
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user, supabaseConfigured, email])

  // Load the active list tab's data when the tab, or the user, changes.
  const loadTab = useCallback(async () => {
    // Signed out (or Supabase unavailable): clear any data we previously held so
    // the previous user's favorites/history never "ghost" onto the next view.
    if (!supabaseConfigured || !user) {
      setHistory([])
      setFavorites([])
      setWatchlist([])
      setMetaMap({})
      setListLoading(false)
      return
    }
    setListLoading(true)
    const [h, f, w] = await Promise.all([
      getHistory(user.id),
      getFavorites(user.id),
      getWatchlist(user.id),
    ])
    if (h.data) setHistory(h.data)
    if (f.data) setFavorites(f.data)
    if (w.data) setWatchlist(w.data)
    // Resolve AniList titles + posters for every distinct anime id across all
    // three lists. A graceful failure (network / rate-limit) leaves metaMap
    // sparse, and the rows simply fall back to their "Anime #<id>" label.
    const ids = [
      ...(h.data ?? []).map((e) => e.anime_id),
      ...(f.data ?? []).map((e) => e.anime_id),
      ...(w.data ?? []).map((e) => e.anime_id),
    ]
    const meta = await fetchAnimeMetadata(ids)
    if (meta) {
      setMetaMap((prev) => {
        const next = { ...prev }
        for (const m of meta) next[m.id] = m
        return next
      })
    }
    setListLoading(false)
  }, [tab, user, supabaseConfigured])

  useEffect(() => {
    void loadTab()
  }, [loadTab])

  const saveProfile = useCallback(async () => {
    if (!user) return
    setSaving(true)
    const res = await updateProfile({
      username: form.username.trim() || null,
      bio: form.bio.trim() || null,
      avatar_url: form.avatar_url.trim() || null,
    })
    setSaving(false)
    if (res.error) {
      window.alert(`${t('common.error')}: ${res.error}`)
      return
    }
    setProfile((prev) => ({
      ...(prev ?? {
        id: user.id,
        username: null,
        avatar_url: null,
        bio: null,
        is_watchlist_public: true,
        is_favorites_public: true,
        created_at: '',
        updated_at: '',
      }),
      username: form.username.trim() || null,
      bio: form.bio.trim() || null,
      avatar_url: form.avatar_url.trim() || null,
    }))
    setEditing(false)
  }, [user, form, t])

  const togglePrivacy = useCallback(
    async (key: 'is_watchlist_public' | 'is_favorites_public') => {
      if (!user || !profile) return
      const nextValue = !profile[key]
      // Update local state immediately so the switch reflects the click before
      // the async write resolves (avoids the "stuck" feel).
      setProfile((prev) => (prev ? { ...prev, [key]: nextValue } : prev))
      setSaving(true)
      const res = await updateProfile({ [key]: nextValue })
      setSaving(false)
      if (res.error) {
        window.alert(`${t('common.error')}: ${res.error}`)
        // Roll back to whatever the server last confirmed on failure.
        setProfile((prev) => (prev ? { ...prev, [key]: !nextValue } : prev))
        return
      }
    },
    [user, profile, t],
  )

  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>
  const avatarUrl =
    (profile?.avatar_url?.trim() ? profile.avatar_url : null) ??
    (typeof metadata.avatar_url === 'string' && metadata.avatar_url ? String(metadata.avatar_url) : null)
  const displayName =
    (profile?.username?.trim() ? profile.username : null) ??
    (email ? email.split('@')[0] : t('header.profile'))
  const initials = displayName.slice(0, 2).toUpperCase()

  if (authLoading || loading) {
    return (
      <div className="container-page flex min-h-[40vh] items-center justify-center py-12 text-slate-400">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (!supabaseConfigured || !signedIn) {
    return (
      <div className="container-page py-12">
        <EmptyState
          icon={<AvatarIcon className="h-7 w-7" />}
          title={t('profile.notSignedIn')}
          hint={t('profile.notSignedInSub')}
          action={
            <button className="btn-primary" onClick={openAuthModal} disabled={!supabaseConfigured}>
              {supabaseConfigured ? t('profile.signin') : t('common.unavailable')}
            </button>
          }
        />
      </div>
    )
  }

  return (
    <div className="container-page py-8">
      {/* profile header card */}
      <section className="rounded-2xl border border-night-700/70 bg-night-850/60 p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-night-600/70 bg-night-800 text-2xl font-bold text-white">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>

          <div className="min-w-0 flex-1">
            {!editing ? (
              <>
                <h1 className="truncate text-2xl font-semibold tracking-wide text-white">{displayName}</h1>
                {profile?.bio ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{profile.bio}</p>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">{t('profile.noBio')}</p>
                )}
                <p className="mt-2 text-[11px] text-slate-500">
                  {email}
                  {profile?.created_at
                    ? ` · ${t('profile.memberSince')}: ${formatDate(profile.created_at)}`
                    : ''}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setEditing(true)} className="btn-ghost text-sm">
                    <SettingsIcon className="h-4 w-4" />
                    {t('profile.edit')}
                  </button>
                  {profile?.username?.trim() ? (
                    <Link
                      to={`/user/${encodeURIComponent(profile.username)}`}
                      className="btn-ghost flex items-center gap-2 text-sm"
                      title={t('profile.viewPublicProfileHint')}
                    >
                      <EyeIcon className="h-4 w-4" />
                      {t('profile.viewPublicProfile')}
                    </Link>
                  ) : null}
                </div>
              </>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  void saveProfile()
                }}
              >
                <TextInput
                  label={t('profile.username')}
                  value={form.username}
                  onChange={(v) => setForm((f) => ({ ...f, username: v }))}
                  placeholder={email?.split('@')[0] ?? ''}
                />
                <TextInput
                  label={t('profile.avatarUrl')}
                  type="url"
                  value={form.avatar_url}
                  onChange={(v) => setForm((f) => ({ ...f, avatar_url: v }))}
                  placeholder="https://…"
                />
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-slate-400">{t('profile.bio')}</span>
                  <textarea
                    value={form.bio}
                    onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                    rows={2}
                    placeholder={t('profile.bioPlaceholder')}
                    className="rounded-xl border border-night-600/80 bg-night-850 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-white/40"
                  />
                </label>
                <div className="flex items-center gap-2">
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? <Spinner className="h-4 w-4" /> : t('profile.save')}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setEditing(false)} disabled={saving}>
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* privacy toggles */}
        <div className="mt-5 flex flex-col gap-3 border-t border-night-700/70 pt-5 sm:flex-row">
          {(['is_watchlist_public', 'is_favorites_public'] as const).map((key) => (
            <label
              key={key}
              className="flex flex-1 items-center justify-between gap-3 rounded-xl border border-night-700/70 bg-night-900/50 px-3 py-2"
            >
              <span className="text-sm text-slate-300">
                {key === 'is_watchlist_public'
                  ? t('profile.watchlistPublic')
                  : t('profile.favoritesPublic')}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={!!profile?.[key]}
                onClick={() => void togglePrivacy(key)}
                disabled={saving}
                className={cx(
                  'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                  profile?.[key] ? 'bg-emerald-500' : 'bg-night-600',
                  saving && 'opacity-60',
                )}
              >
                <span
                  className={cx(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all',
                    profile?.[key] ? 'left-[22px]' : 'left-0.5',
                  )}
                />
              </button>
            </label>
          ))}
        </div>
      </section>

      {/* tabs */}
      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-night-700/70">
        {(
          [
            { id: 'history', label: t('nav.history'), Icon: HistoryIcon },
            { id: 'favorites', label: t('nav.favorites'), Icon: HeartIcon },
            { id: 'watchlist', label: t('profile.watchlist'), Icon: ListIcon },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cx(
              'flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition',
              tab === id ? 'border-white text-white' : 'border-transparent text-slate-400 hover:text-white',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {/* tab panels */}
      <div className="mt-5">
        {tab === 'history' && (
          <ListTab
            items={history}
            loading={listLoading}
            empty={<HistoryIcon className="h-7 w-7" />}
            emptyTitle={t('history.empty')}
            emptyHint={t('history.emptyHint')}
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
        )}

        {tab === 'favorites' && (
          <ListTab
            items={favorites}
            loading={listLoading}
            empty={<HeartIcon className="h-7 w-7" />}
            emptyTitle={t('profile.noFavorites')}
            emptyHint={t('profile.noFavoritesHint')}
            renderItem={(item) => (
              <Row
                title={`${t('profile.animeUnknown')} #${item.anime_id}`}
                meta={metaMap[item.anime_id]}
                secondary={t('profile.favorited')}
                time={item.created_at}
              />
            )}
          />
        )}

        {tab === 'watchlist' && (
          <WatchlistTab
            items={watchlist}
            loading={listLoading}
            metaMap={metaMap}
          />
        )}
      </div>
    </div>
  )
}

/**
 * The watchlist tab: the signed-in user's tracked titles grouped by their
 * status (Currently Watching / Plan to Watch / Completed / On Hold / Dropped).
 * Each group is a grid of poster cards linking to the title's detail page.
 */
function WatchlistTab({
  items,
  loading,
  metaMap,
}: {
  items: WatchlistEntry[]
  loading: boolean
  metaMap: Record<number, AnimeMeta>
}) {
  const { t } = useI18n()

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center text-slate-400">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ListIcon className="h-7 w-7" />}
        title={t('profile.noWatchlist')}
        hint={t('profile.noWatchlistHint')}
      />
    )
  }

  // Group the entries by status, preserving a sensible display order.
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
        .map((status) => (
          <WatchlistSection key={status} status={status} entries={groups[status]} metaMap={metaMap} />
        ))}
    </div>
  )
}

const STATUS_META: Record<
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
 * A single watchlist status section: a labelled group header plus a responsive
 * grid of poster cards.
 */
function WatchlistSection({
  status,
  entries,
  metaMap,
}: {
  status: WatchlistStatus
  entries: WatchlistEntry[]
  metaMap: Record<number, AnimeMeta>
}) {
  const { t } = useI18n()
  const meta = STATUS_META[status]
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-white">
        <meta.Icon className={cx('h-5 w-5 shrink-0', meta.color)} />
        {t(meta.labelKey)}
        <span className="text-sm font-normal text-slate-500">· {entries.length}</span>
      </h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {entries.map((entry) => {
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
}

/** Generic list panel: loading spinner / empty state / rows. */
function ListTab<T>({
  items,
  renderItem,
  empty,
  emptyTitle,
  emptyHint,
  loading,
}: {
  items: T[]
  renderItem: (item: T) => JSX.Element
  empty: JSX.Element
  emptyTitle: string
  emptyHint: string
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center text-slate-400">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }
  if (items.length === 0) return <EmptyState icon={empty} title={emptyTitle} hint={emptyHint} />
  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div key={idx}>{renderItem(item)}</div>
      ))}
    </div>
  )
}

/**
 * A single profile list row: poster thumbnail (or placeholder), title (real
 * AniList title when `meta` is present, else the `#<id>` fallback), a secondary
 * line, and a timestamp. The whole row links to the title's detail page.
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