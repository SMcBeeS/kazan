/**
 * notifications.ts — "My Favorites" new-episode notification engine.
 *
 * Watches the user's favorites (anilist ids, stored by storage.ts) and raises
 * a notification when a favorited show airs/updates a new episode. The bell
 * (HeaderBar) surfaces these behind a prominent dot; timestamps render in the
 * Asia/Baghdad frame. Detection is offline-friendly:
 *  - WatchPage calls `maybeNotifyNewEpisode` whenever an episode is opened
 *    (the freshest signal), and
 *  - `checkAiringFavorites` sweeps airing favorites on app mount to catch a
 *    pointer that advanced since the last run.
 * Every step is defensive: network/storage failures never throw to the UI.
 */
import { favorites } from './storage'
import { anilist } from './anilist'

const NS = 'animeverse:'
const MAX = 30
const TZ = 'Asia/Baghdad'

export interface AppNotification {
  id: string
  /** Dedupe key — one notification per (show, aired episode). */
  key: string
  animeId: number
  title: string
  image: string
  /** The episode that (just) aired. */
  episode: number
  /** epoch ms. */
  timestamp: number
  read: boolean
}

type Seen = Record<number, number>

function read<T>(k: string, f: T): T {
  try {
    const raw = localStorage.getItem(NS + k)
    return raw ? (JSON.parse(raw) as T) : f
  } catch {
    return f
  }
}

function write(k: string, v: unknown) {
  try {
    localStorage.setItem(NS + k, JSON.stringify(v))
    window.dispatchEvent(new CustomEvent('animeverse:store-change', { detail: { k } }))
  } catch {
    /* quota / privacy mode */
  }
}

function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
export function subscribeNotifications(cb: (detail: { k: string }) => void): () => void {
  const handler = (e: Event) => {
    const k = (e as CustomEvent).detail?.k as string | undefined
    if (k === 'notifications' || k === 'seen') cb({ k })
  }
  window.addEventListener('animeverse:store-change', handler)
  return () => window.removeEventListener('animeverse:store-change', handler)
}

export const notifications = {
  list(): AppNotification[] {
    return read<Partial<AppNotification>[]>('notifications', [])
      .filter((n): n is AppNotification => Boolean(n && n.id && n.animeId != null))
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
  },

  unread(): number {
    return read<AppNotification[]>('notifications', []).filter((n) => n.read === false).length
  },

  save(list: AppNotification[]) {
    write('notifications', list.slice(0, MAX))
  },

  addNotification(item: AppNotification) {
    const existing = read<AppNotification[]>('notifications', [])
    const deduped = existing.filter(
      (n) => n.key !== item.key && !(n.animeId === item.animeId && n.episode === item.episode),
    )
    this.save([item, ...deduped])
  },

  markRead(id: string) {
    this.save(
      read<AppNotification[]>('notifications', []).map((n) => (n.id === id ? { ...n, read: true } : n)),
    )
  },

  clearAll() {
    this.save([])
  },

  /**
   * Called by WatchPage the moment an episode is opened/recorded. Creates a
   * "new episode aired" notification only when the episode is newer than (or
   * the first) one we've seen for that show. Always updates the seen map.
   */
  maybeNotifyNewEpisode({
    animeId,
    episode,
    title,
    image = '',
  }: {
    animeId: number
    episode: number
    title: string
    image?: string
  }): 'added' | 'none' {
    const seen = read<Seen>('seen', {})
    const prev = seen[animeId]
    let added: 'added' | 'none' = 'none'
    if (episode > 0 && (prev == null || episode > prev)) {
      added = 'added'
      this.addNotification({
        id: uid(),
        key: `ep:${animeId}:${episode}`,
        animeId,
        title,
        image,
        episode,
        timestamp: Date.now(),
        read: false,
      })
    }
    seen[animeId] = episode
    write('seen', seen)
    return added
  },

  /**
   * On mount: for every favored series with a RELEASING status / positive
   * nextAiringEpisode pointer, check whether that pointer has advanced since
   * the last recorded value. When it has, raise a notification for the
   * episode that just aired (nextAiring − 1, i.e. the one before the pending).
   */
  async checkAiringFavorites(signal?: AbortSignal): Promise<'added' | 'none'> {
    const favs = favorites.list()
    if (favs.length === 0) return 'none'
    const seen = read<Seen>('seen', {})
    let added = false
    for (const fav of favs) {
      try {
        const det = await anilist.getAnime(fav.mal_id, signal)
        const d = det.data
        if (!d) continue
        const nextAiring = d.nextAiringEpisode?.episode ?? null
        // Only consider shows that are actively releasing.
        const isAiring = d.airing === true && (nextAiring ?? 0) > 1
        if (!isAiring || nextAiring == null) continue
        const prev = seen[d.mal_id]
        if (prev == null || nextAiring > prev) {
          added = true
          this.addNotification({
            id: uid(),
            key: `ep:${d.mal_id}:${nextAiring! - 1}`,
            animeId: d.mal_id,
            title: d.title,
            image: d.images?.jpg?.large_image_url || d.images?.jpg?.image_url || '',
            episode: nextAiring! - 1,
            timestamp: d.nextAiringEpisode?.airingAt ? d.nextAiringEpisode.airingAt * 1000 : Date.now(),
            read: false,
          })
        }
        seen[d.mal_id] = nextAiring!
      } catch {
        /* network / parse error: skip this title for this pass */
      }
    }
    write('seen', seen)
    return added ? 'added' : 'none'
  },
}

/* ------------------------------ time formatting ------------------------------ */

/** Relative Baghdad time, e.g. "3 min ago". Returns "" for missing/invalid. */
export function formatRelativeBaghdad(ts: number, lang: 'ar' | 'en' = 'en'): string {
  if (!Number.isFinite(ts) || ts <= 0) return ''
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  const hrs = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  const ar = lang === 'ar'
  if (mins < 1) return ar ? 'التو' : 'just now'
  if (mins < 60) return ar ? `قبل ${mins} دقيقة` : `${mins} min ago`
  if (hrs < 24) return ar ? `قبل ${hrs} ساعة` : `${hrs} hr${hrs > 1 ? 's' : ''} ago`
  return ar ? `قبل ${days} يوم` : `${days} day${days > 1 ? 's' : ''} ago`
}

/** Full localized Baghdad-time string, e.g. "3:45 PM, Jul 14". */
export function formatBaghdadClock(ts: number, lang: 'ar' | 'en' = 'en'): string {
  try {
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-IQ' : 'en-US', {
      timeZone: TZ,
      hour: 'numeric',
      minute: '2-digit',
      day: 'numeric',
      month: 'short',
    }).format(new Date(ts))
  } catch {
    return new Date(ts).toLocaleString()
  }
}