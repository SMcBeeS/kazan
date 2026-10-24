import { useCallback, useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { RootLayout } from './components/layout/RootLayout'
import { notifications } from './lib/notifications'
import { IntroGateSplash } from './components/layout/IntroGateSplash'
import HomePage from './pages/HomePage'
import CatalogPage from './pages/CatalogPage'
import AnimeDetailPage from './pages/AnimeDetailPage'
import WatchPage from './pages/WatchPage'
import FavoritesPage from './pages/FavoritesPage'
import HistoryPage from './pages/HistoryPage'
import SchedulePage from './pages/SchedulePage'
import AdminPage from './pages/AdminPage'
import SettingsPage from './pages/SettingsPage'
import ProfilePage from './pages/ProfilePage'
import PublicProfilePage from './pages/PublicProfilePage'
import NotFoundPage from './pages/NotFoundPage'

const INTRO_SEEN_KEY = 'kazan_intro_seen'

/** True when the intro has already played this browser session. */
function hasSeenIntro(): boolean {
  try {
    return sessionStorage.getItem(INTRO_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

/** Application routes. */
export default function App() {
  // Play the brand intro once per session — not on internal navigation.
  const [showIntro, setShowIntro] = useState(() => !hasSeenIntro())

  // New-episode notification engine: sweep airing favorites on mount, then
  // re-sweep every 10 min while the tab is visible to catch fresh episode
  // pointers. WatchPage additionally fires `maybeNotifyNewEpisode` per open
  // (the freshest signal), so these sweeps mainly de-dupe over time.
  useEffect(() => {
    const sweep = () => {
      if (document.visibilityState !== 'visible') return
      const ctrl = new AbortController()
      void notifications.checkAiringFavorites(ctrl.signal)
    }
    sweep()
    const iv = window.setInterval(sweep, 10 * 60 * 1000)
    return () => window.clearInterval(iv)
  }, [])

  const handleIntroDone = useCallback(() => {
    setShowIntro(false)
    try {
      sessionStorage.setItem(INTRO_SEEN_KEY, '1')
    } catch {
      /* ignore */
    }
  }, [])

  return (
    <>
      <Routes>
        <Route element={<RootLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/anime/:id" element={<AnimeDetailPage />} />
          <Route path="/watch/:id/:episode" element={<WatchPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/user/:username" element={<PublicProfilePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>

      {showIntro && <IntroGateSplash onDone={handleIntroDone} />}
    </>
  )
}
