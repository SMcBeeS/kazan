/**
 * storage.ts — Persistence helpers built on localStorage.
 *
 * Backs the Favorites and Watch History features plus per-episode playback
 * progress. All writes are defensive: a corrupted or unavailable store never
 * crashes the UI, it simply behaves as if empty.
 */

import type { AnimeSummary } from './types'

const PREFIX = 'animeverse:'

export interface FavoriteItem {
  mal_id: number
  title: string
  image: string
  addedAt: number
}

export interface HistoryItem {
  mal_id: number
  title: string
  image: string
  /** Raw AniList format (e.g. "TV", "MOVIE") captured when recorded. */
  format?: string | null
  /** Last episode number watched (if any) */
  episode?: number
  episodeTitle?: string
  /** 0..1 progress fraction across the series (rough) */
  progress?: number
  /** Genre names for this title, captured when recorded (for taste recs) */
  genres?: string[]
  updatedAt: number
}

/**
 * A "Continue Watching" entry. Stored whenever a user opens an episode so the
 * home page can show a prominent resume carousel. Deliberately richer than
 * HistoryItem so we can deep-link straight back to the exact episode.
 */
export interface ContinueWatchingItem {
  animeId: number
  title: string
  episode: number
  /** epoch ms when the episode was last opened */
  timestamp: number
  coverImage: string
  /** Total episodes when known (for "Ep 5 / 24" style labels) */
  totalEpisodes?: number | null
  format?: string | null
}

export interface WatchProgress {
  /** Playback position in seconds */
  currentTime: number
  /** Total duration in seconds (if known) */
  duration: number
  updatedAt: number
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    window.dispatchEvent(new CustomEvent('animeverse:store-change', { detail: { key } }))
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

/* ------------------------------- favorites ------------------------------- */

export const favorites = {
  list(): FavoriteItem[] {
    return read<FavoriteItem[]>('favorites', [])
  },
  has(id: number): boolean {
    return favorites.list().some((f) => f.mal_id === id)
  },
  add(anime: Pick<AnimeSummary, 'mal_id' | 'title' | 'images'>) {
    const image = anime.images?.webp?.large_image_url || anime.images?.jpg?.large_image_url || ''
    const next: FavoriteItem = { mal_id: anime.mal_id, title: anime.title, image, addedAt: Date.now() }
    const all = favorites.list().filter((f) => f.mal_id !== next.mal_id)
    write('favorites', [next, ...all])
  },
  remove(id: number) {
    write('favorites', favorites.list().filter((f) => f.mal_id !== id))
  },
  toggle(anime: Pick<AnimeSummary, 'mal_id' | 'title' | 'images'>): boolean {
    if (favorites.has(anime.mal_id)) {
      favorites.remove(anime.mal_id)
      return false
    }
    favorites.add(anime)
    return true
  },
}

/* -------------------------------- history -------------------------------- */

export const history = {
  list(): HistoryItem[] {
    return read<HistoryItem[]>('history', []).sort((a, b) => b.updatedAt - a.updatedAt)
  },
  record(
    anime: Pick<AnimeSummary, 'mal_id' | 'title' | 'images'>,
    meta: {
      episode?: number
      episodeTitle?: string
      progress?: number
      genres?: string[]
      format?: string | null
    } = {},
  ) {
    const image = anime.images?.webp?.large_image_url || anime.images?.jpg?.large_image_url || ''
    const existing = read<HistoryItem[]>('history', [])
    const merged: HistoryItem = {
      mal_id: anime.mal_id,
      title: anime.title,
      image,
      format: meta.format ?? existing.find((h) => h.mal_id === anime.mal_id)?.format,
      episode: meta.episode ?? existing.find((h) => h.mal_id === anime.mal_id)?.episode,
      episodeTitle: meta.episodeTitle,
      progress: meta.progress,
      genres: meta.genres ?? existing.find((h) => h.mal_id === anime.mal_id)?.genres,
      updatedAt: Date.now(),
    }
    const rest = existing.filter((h) => h.mal_id !== anime.mal_id)
    write('history', [merged, ...rest])
  },
  remove(id: number) {
    write('history', read<HistoryItem[]>('history', []).filter((h) => h.mal_id !== id))
  },
  clear() {
    write('history', [])
  },
}

/* --------------------------- continue watching --------------------------- */

const MAX_CONTINUE = 20

export const continueWatching = {
  list(): ContinueWatchingItem[] {
    return read<ContinueWatchingItem[]>('continue', []).sort((a, b) => b.timestamp - a.timestamp)
  },
  record(entry: ContinueWatchingItem) {
    const existing = read<ContinueWatchingItem[]>('continue', [])
    const deduped = existing.filter((e) => e.animeId !== entry.animeId)
    write('continue', [entry, ...deduped].slice(0, MAX_CONTINUE))
  },
  remove(animeId: number) {
    write(
      'continue',
      read<ContinueWatchingItem[]>('continue', []).filter((e) => e.animeId !== animeId),
    )
  },
  clear() {
    write('continue', [])
  },
}

/**
 * Most-frequent genres across the user's continue-watching + history. Used to
 * power the "Animes Based on Your Taste" recommendations on the home page.
 * Returns genre names ordered by descending frequency.
 */
export function topGenresFromHistory(limit = 5): string[] {
  const counts = new Map<string, number>()
  const bump = (genres?: string[]) => {
    for (const g of genres ?? []) counts.set(g, (counts.get(g) ?? 0) + 1)
  }
  for (const item of history.list()) bump(item.genres)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name)
}

/* --------------------------- playback progress --------------------------- */

const progressKey = (animeId: number, episode: number) => `progress:${animeId}:${episode}`

export const watchProgress = {
  get(animeId: number, episode: number): WatchProgress | null {
    return read<WatchProgress | null>(progressKey(animeId, episode), null)
  },
  set(animeId: number, episode: number, currentTime: number, duration: number) {
    // Ignore meaningless updates (e.g. before metadata loads).
    if (!Number.isFinite(currentTime) || currentTime <= 1) return
    write(progressKey(animeId, episode), {
      currentTime,
      duration,
      updatedAt: Date.now(),
    } satisfies WatchProgress)
  },
  clear(animeId: number, episode: number) {
    try {
      localStorage.removeItem(PREFIX + progressKey(animeId, episode))
    } catch {
      /* ignore */
    }
  },
}
