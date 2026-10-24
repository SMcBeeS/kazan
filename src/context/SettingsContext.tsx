/**
 * SettingsContext — global, persisted playback preferences.
 *
 * Hosts boolean toggles that the whole app can react to (e.g. the custom
 * video player auto-skips intros and chains to the next episode based on
 * these values). State is backed by localStorage so it survives reloads,
 * and cross-tab 'storage' events keep other tabs in sync.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export interface PlaybackSettings {
  /** Jump past intros/outros while playing (used by the video player). */
  autoSkipIntro: boolean
  /** Start the next episode automatically when the current one ends. */
  autoNextEpisode: boolean
}

export type SettingsUpdate = Partial<PlaybackSettings>

const DEFAULTS: PlaybackSettings = {
  autoSkipIntro: false,
  autoNextEpisode: false,
}

const SETTINGS_KEY = 'animeverse:playback-settings'

function loadSettings(): PlaybackSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PlaybackSettings>
      return {
        autoSkipIntro: !!parsed.autoSkipIntro,
        autoNextEpisode: !!parsed.autoNextEpisode,
      }
    }
  } catch {
    /* corrupted/unsupported store -> fall back to defaults */
  }
  return { ...DEFAULTS }
}

function persist(settings: PlaybackSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* ignore quota/availability errors */
  }
}

interface SettingsContextValue {
  settings: PlaybackSettings
  updateSettings: (patch: SettingsUpdate) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PlaybackSettings>(loadSettings)

  // Keep other open tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SETTINGS_KEY) setSettings(loadSettings())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const updateSettings = useCallback((patch: SettingsUpdate) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      persist(next)
      return next
    })
  }, [])

  const value = useMemo<SettingsContextValue>(() => ({ settings, updateSettings }), [settings, updateSettings])

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within a <SettingsProvider>')
  return ctx
}