/**
 * LibraryContext — reactive Favorites + Watch History backed by localStorage.
 *
 * It listens for the 'animeverse:store-change' event fired by lib/storage so
 * every consumer (navbar badges, cards, pages) stays in sync instantly.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  favorites as favoritesStore,
  history as historyStore,
  continueWatching as continueStore,
} from '../lib/storage'
import type { ContinueWatchingItem, FavoriteItem, HistoryItem } from '../lib/storage'
import type { AnimeSummary } from '../lib/types'

interface LibraryContextValue {
  favorites: FavoriteItem[]
  history: HistoryItem[]
  /** Continue-watching entries (most-recent first). */
  continueWatching: ContinueWatchingItem[]
  isFavorite: (id: number) => boolean
  toggleFavorite: (anime: Pick<AnimeSummary, 'mal_id' | 'title' | 'images'>) => void
  removeFavorite: (id: number) => void
  recordHistory: (
    anime: Pick<AnimeSummary, 'mal_id' | 'title' | 'images' | 'genres'>,
    meta?: {
      episode?: number
      episodeTitle?: string
      progress?: number
      genres?: string[]
      format?: string | null
    },
  ) => void
  removeHistory: (id: number) => void
  clearHistory: () => void
  /** Record/resume state for the "Continue Watching" carousel. */
  recordContinue: (entry: ContinueWatchingItem) => void
  removeContinue: (animeId: number) => void
  clearContinue: () => void
}

const LibraryContext = createContext<LibraryContextValue | null>(null)

const STORE_EVENT = 'animeverse:store-change'

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => favoritesStore.list())
  const [history, setHistory] = useState<HistoryItem[]>(() => historyStore.list())
  const [continueWatching, setContinueWatching] = useState<ContinueWatchingItem[]>(() =>
    continueStore.list(),
  )

  const refresh = useCallback(() => {
    setFavorites(favoritesStore.list())
    setHistory(historyStore.list())
    setContinueWatching(continueStore.list())
  }, [])

  useEffect(() => {
    window.addEventListener(STORE_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(STORE_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [refresh])

  const value = useMemo<LibraryContextValue>(
    () => ({
      favorites,
      history,
      continueWatching,
      isFavorite: (id) => favorites.some((f) => f.mal_id === id),
      toggleFavorite: (anime) => {
        favoritesStore.toggle(anime)
        refresh()
      },
      removeFavorite: (id) => {
        favoritesStore.remove(id)
        refresh()
      },
      recordHistory: (anime, meta) => {
        const genres = meta?.genres ?? anime.genres?.map((g) => g.name)
        historyStore.record(anime, meta ? { ...meta, genres } : { genres })
        refresh()
      },
      removeHistory: (id) => {
        historyStore.remove(id)
        refresh()
      },
      clearHistory: () => {
        historyStore.clear()
        refresh()
      },
      recordContinue: (entry) => {
        continueStore.record(entry)
        refresh()
      },
      removeContinue: (animeId) => {
        continueStore.remove(animeId)
        refresh()
      },
      clearContinue: () => {
        continueStore.clear()
        refresh()
      },
    }),
    [favorites, history, continueWatching, refresh],
  )

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext)
  if (!ctx) throw new Error('useLibrary must be used within a LibraryProvider')
  return ctx
}
