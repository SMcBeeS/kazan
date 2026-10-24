import { useEffect, useRef } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useI18n } from '../../context/LanguageContext'
import { useLibrary } from '../../context/LibraryContext'
import { useAuth } from '../../context/AuthContext'
import { cx } from '../../lib/utils'
import {
  AvatarIcon,
  GridIcon,
  HeartIcon,
  HistoryIcon,
  HomeIcon,
  CalendarIcon,
  SettingsIcon,
  ShieldAlertIcon,
} from '../icons'

/** Small white badge for counts. */
function Badge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="absolute -end-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-night-900">
      {count > 99 ? '99+' : count}
    </span>
  )
}

/** Kazan brand mark — Torii gate glyph on solid monochrome slate. */
export function BrandMark({ size = 'md' }: { size?: 'md' | 'sm' }) {
  const box = size === 'sm' ? 'h-9 w-9' : 'h-10 w-10'
  const glyph = size === 'sm' ? 17 : 20
  return (
    <span
      className={`flex ${box} shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-night-800 text-slate-100`}
    >
      <svg
        width={glyph}
        height={glyph}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M2.5 5.4C6.8 7 17.2 7 21.5 5.4" />
        <path d="M4.8 9h14.4" />
        <path d="M6.6 6.1v12.9" />
        <path d="M17.4 6.1v12.9" />
        <path d="M12 7.1v1.9" />
      </svg>
    </span>
  )
}

export function BrandTitle({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n()
  return (
    <span className="leading-tight">
      <span className={`block font-semibold tracking-wide text-white ${compact ? 'text-base' : 'text-lg'}`}>
        {t('app.name')}
      </span>
      {!compact && (
        <span className="block text-[11px] font-medium text-slate-400">{t('app.tagline')}</span>
      )}
    </span>
  )
}

/**
 * 3-Ring Orbital Portal:
 * - Outer Ring (144px): Bright glowing white star orb (slowest stabilized speed: 8 deg/s)
 * - Middle Ring (112px): Dimmer silver-slate orb (medium stabilized speed: 14 deg/s)
 * - Innermost Ring (80px): Black-hole singularity with photon ring (fastest stabilized speed: 22 deg/s)
 *
 * Boost behavior:
 * Actual route/page navigation changes and window/tab focus or visibility
 * switches trigger a 3.2-second surge that whips all 3 orbs around for
 * 2.5–3.5 full spins before smoothly decelerating back to their slow static
 * speeds. Clicking or typing in the search bar (or any static click) does
 * NOT trigger a surge.
 */
export function PortalEmblem() {
  const location = useLocation()

  const outerOrbitRef = useRef<HTMLDivElement>(null)
  const midOrbitRef = useRef<HTMLDivElement>(null)
  const innerOrbitRef = useRef<HTMLDivElement>(null)

  const stateRef = useRef({
    outerAngle: 140,
    midAngle: 25,
    innerAngle: 270,
    boostStartAt: performance.now(),
    boostDuration: 3200, // 3.2 seconds total spin-up + multi-spin + smooth settle
    boostPeak: 920,      // Peak extra deg/s (~2.5 to 3.5 full rotations)
  })

  const triggerBoost = (peak = 920, duration = 3200) => {
    const s = stateRef.current
    s.boostStartAt = performance.now()
    s.boostPeak = peak
    s.boostDuration = duration
  }

  // 1. Trigger boost ONLY on actual route / page / query navigation.
  // NOTE: no global 'pointerdown' / 'focusin' listeners — clicking or typing
  // in the search bar (or any static UI click) never disturbs the rings,
  // which stay locked to their calm stabilized base speeds.
  useEffect(() => {
    triggerBoost(960, 3300)
  }, [location.pathname, location.search, location.key])

  // NOTE: window 'focus' / document 'visibilitychange' boosts were intentionally
  // removed — re-focusing the tab (e.g. switching back from another app in
  // Chrome) was re-triggering the 3.2s orb surge, which felt unwanted. Only
  // genuine route/page navigation (see above) now initiates a spin boost.

  // 3. 60fps kinematic animation loop
  useEffect(() => {
    let rafId = 0
    let lastTime = performance.now()

    // Calm, slow stabilized speeds when sitting on a static page (degrees per second)
    const BASE_OUTER = 8   // 45s per revolution
    const BASE_MID = 14    // ~25s per revolution
    const BASE_INNER = 22  // ~16s per revolution

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000))
      lastTime = now

      const s = stateRef.current
      const elapsed = now - s.boostStartAt

      // Smooth surge envelope:
      // Ramps up over first 12% of duration, then smoothly decelerates with cubic ease-out
      let extraSpeed = 0
      if (elapsed >= 0 && elapsed < s.boostDuration) {
        const progress = elapsed / s.boostDuration
        if (progress < 0.12) {
          // Smooth spin-up
          const t = progress / 0.12
          extraSpeed = s.boostPeak * (t * (2 - t))
        } else {
          // Long, smooth stabilization tail
          const t = (progress - 0.12) / 0.88
          extraSpeed = s.boostPeak * Math.pow(1 - t, 2.4)
        }
      }

      // Each ring has its own base speed and its own boost multiplier
      s.outerAngle = (s.outerAngle + (BASE_OUTER + extraSpeed * 0.95) * dt) % 360
      s.midAngle = (s.midAngle + (BASE_MID + extraSpeed * 1.18) * dt) % 360
      s.innerAngle = (s.innerAngle + (BASE_INNER + extraSpeed * 1.45) * dt) % 360

      if (outerOrbitRef.current) {
        outerOrbitRef.current.style.transform = `rotate(${s.outerAngle}deg)`
      }
      if (midOrbitRef.current) {
        midOrbitRef.current.style.transform = `rotate(${s.midAngle}deg)`
      }
      if (innerOrbitRef.current) {
        innerOrbitRef.current.style.transform = `rotate(${s.innerAngle}deg)`
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <div className="relative flex h-36 w-36 items-center justify-center select-none" aria-hidden="true">
      {/* Ambient background glow */}
      <div className="animate-portal-pulse absolute h-32 w-32 rounded-full bg-slate-400/10 blur-xl" />

      {/* RING 1 (Outer — 144px) */}
      <div
        className="animate-portal-spin absolute rounded-full"
        style={{
          width: 144,
          height: 144,
          border: '1px dashed rgba(100, 116, 139, 0.45)',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 144,
          height: 144,
          border: '1px solid rgba(255, 255, 255, 0.14)',
        }}
      />

      {/* RING 2 (Middle — 112px) */}
      <div
        className="animate-portal-spin-rev absolute rounded-full"
        style={{
          width: 112,
          height: 112,
          border: '1px dashed rgba(100, 116, 139, 0.4)',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 112,
          height: 112,
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      />

      {/* RING 3 (Innermost — 80px disc with Torii Gate) */}
      <div
        className="animate-portal-float relative flex items-center justify-center rounded-full backdrop-blur-sm"
        style={{
          width: 80,
          height: 80,
          backgroundColor: 'rgba(11, 17, 32, 0.78)',
          border: '1.5px solid rgba(255, 255, 255, 0.2)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-9 w-9 text-slate-200"
        >
          <path d="M2.5 5.4C6.8 7 17.2 7 21.5 5.4" />
          <path d="M4.8 9h14.4" />
          <path d="M6.6 6.1v12.9" />
          <path d="M17.4 6.1v12.9" />
          <path d="M12 7.1v1.9" />
        </svg>
      </div>

      {/* ORB 1: Outer Ring (144px) — Bright White Star */}
      <div
        ref={outerOrbitRef}
        className="pointer-events-none absolute"
        style={{ width: 144, height: 144, willChange: 'transform' }}
      >
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            width: 9,
            height: 9,
            transform: 'translate(-50%, -50%)',
            borderRadius: '9999px',
            backgroundColor: '#ffffff',
            boxShadow: '0 0 10px 2px rgba(255, 255, 255, 0.95), 0 0 18px 4px rgba(56, 189, 248, 0.45)',
          }}
        />
      </div>

      {/* ORB 2: Middle Ring (112px) — Dimmer Muted Orb */}
      <div
        ref={midOrbitRef}
        className="pointer-events-none absolute"
        style={{ width: 112, height: 112, willChange: 'transform' }}
      >
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            width: 7,
            height: 7,
            transform: 'translate(-50%, -50%)',
            borderRadius: '9999px',
            backgroundColor: 'rgba(148, 163, 184, 0.72)',
            boxShadow: '0 0 6px 1.5px rgba(148, 163, 184, 0.4)',
          }}
        />
      </div>

      {/* ORB 3: Innermost Ring (80px) — Black Hole Singularity */}
      <div
        ref={innerOrbitRef}
        className="pointer-events-none absolute"
        style={{ width: 80, height: 80, willChange: 'transform' }}
      >
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            width: 14,
            height: 14,
            transform: 'translate(-50%, -50%)',
            borderRadius: '9999px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background:
              'radial-gradient(circle, #000000 42%, rgba(226, 232, 240, 0.9) 56%, rgba(56, 189, 248, 0.45) 72%, rgba(0, 0, 0, 0) 100%)',
            boxShadow: '0 0 8px 1.5px rgba(15, 23, 42, 0.95), 0 0 7px 1px rgba(148, 163, 184, 0.5)',
          }}
        >
          {/* Pitch-black Event Horizon Core */}
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '9999px',
              backgroundColor: '#000000',
              boxShadow: 'inset 0 0 4px #000000',
            }}
          />
        </span>
      </div>
    </div>
  )
}

export function Sidebar() {
  const { t } = useI18n()
  const { favorites, history } = useLibrary()
  const { user, email, username, isAdmin, openAuthModal } = useAuth()
  const navigate = useNavigate()

  const navItems = [
    { to: '/', end: true, label: t('nav.home'), icon: HomeIcon },
    { to: '/catalog', end: false, label: t('nav.catalog'), icon: GridIcon },
    { to: '/favorites', end: true, label: t('nav.favorites'), icon: HeartIcon, count: favorites.length },
    { to: '/history', end: true, label: t('nav.history'), icon: HistoryIcon, count: history.length },
  ]

  const secondaryNav = [
    { to: '/schedule', end: false, label: t('nav.schedule'), icon: CalendarIcon },
    { to: '/settings', end: false, label: t('nav.settings'), icon: SettingsIcon },
    // Role gate: the Admin tab is only rendered for signed-in users whose
    // email is on the ADMIN_EMAILS allow-list (see lib/admin.ts). Hidden
    // completely for guests and regular signed-in users.
    ...(user && isAdmin ? [{ to: '/admin', end: true, label: t('nav.admin'), icon: ShieldAlertIcon }] : []),
  ]

  return (
    <>
      <aside className="sticky top-0 z-40 hidden h-screen w-56 shrink-0 flex-col gap-2 overflow-y-auto border-e border-night-700/70 bg-night-900/60 px-3 py-5 backdrop-blur-lg lg:flex xl:w-60">
        <div id="kazan-brand-target" className="inline-flex w-fit items-center gap-3 px-2">
          <BrandMark />
          <BrandTitle />
        </div>

        <nav className="mt-6 flex flex-col gap-1.5" aria-label={t('nav.menu')}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold transition',
                  isActive
                    ? 'bg-white text-night-900 shadow-glow-accent'
                    : 'text-slate-300 hover:bg-night-800/70 hover:text-white',
                )
              }
            >
              <span className="relative">
                <item.icon className="h-5 w-5" />
                <Badge count={item.count ?? 0} />
              </span>
              {item.label}
            </NavLink>
          ))}

          <div className="mt-3 mb-1 border-t border-night-700/60 pt-3" role="presentation" />
          {secondaryNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold transition',
                  isActive
                    ? 'bg-white text-night-900 shadow-glow-accent'
                    : 'text-slate-300 hover:bg-night-800/70 hover:text-white',
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-8 px-2">
          {user ? (
            // Logged in — clickable profile: routes to /profile.
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-night-700/60 bg-night-850/70 p-3 text-start transition hover:border-slate-400/40 hover:bg-night-800/70"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-night-700 text-white">
                <AvatarIcon className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white" title={email ?? ''}>
                  {username?.trim() ? username : (email ?? t('header.profile'))}
                </p>
                <p className="truncate text-[10px] text-slate-400">
                  {t('auth.loggedin')} · {t('favorites.count', { n: favorites.length })}
                </p>
              </div>
            </button>
          ) : (
            // Logged out — "Log In / Sign Up" CTA opens the shared modal.
            <button
              type="button"
              onClick={openAuthModal}
              className="btn-primary w-full px-3 py-3 text-sm font-bold"
            >
              {t('auth.loginCta')}
            </button>
          )}
        </div>

        <div className="mt-auto flex flex-col items-center gap-6 px-2 pb-2">
          <div id="kazan-gate-target">
            <PortalEmblem />
          </div>

          <div className="w-full">
            <div className="relative overflow-hidden rounded-2xl border border-night-700/60 bg-night-900/60 p-4">
              <p className="text-xs font-semibold leading-relaxed text-slate-200">
                “{t('sidebar.quote')}”
              </p>
              <div className="pointer-events-none absolute -bottom-8 -end-8 h-24 w-24 rounded-full bg-slate-500/10 blur-2xl" />
            </div>
          </div>
        </div>
      </aside>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-night-700/70 bg-night-900/90 backdrop-blur-lg lg:hidden"
        aria-label={t('nav.menu')}
      >
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1 px-3 py-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx(
                  'relative flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold transition',
                  isActive ? 'bg-night-800 text-white' : 'text-slate-400 hover:text-white',
                )
              }
            >
              <span className="relative">
                <item.icon className="h-5 w-5" />
                <Badge count={item.count ?? 0} />
              </span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  )
}