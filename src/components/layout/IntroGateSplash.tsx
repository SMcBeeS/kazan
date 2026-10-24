import { useCallback, useEffect, useRef, useState } from 'react'
import { BrandMark, BrandTitle, PortalEmblem } from './Sidebar'

export function IntroGateSplash({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)
  const resolved = useRef(false)

  const finish = useCallback(() => {
    if (resolved.current) return
    resolved.current = true
    setFadingOut(true)
    window.setTimeout(onDone, 950)
  }, [onDone])

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    const timer = window.setTimeout(() => {
      finish()
    }, 3000)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
  }, [finish])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finish])

  return (
    <div
      dir="ltr"
      onClick={finish}
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden select-none"
      style={{
        backgroundColor: '#030712',
        opacity: fadingOut ? 0 : 1,
        transition: 'opacity 950ms cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: fadingOut ? 'none' : 'auto',
      }}
      aria-hidden="true"
    >
      {/* 4 Layered Curved Blue Waves descending from Top (0%) to Middle (54%) of screen */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[55vh] w-full overflow-hidden"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(-24px)',
          transition: 'opacity 1100ms ease-out, transform 1200ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <svg
          viewBox="0 0 1440 540"
          preserveAspectRatio="none"
          className="h-full w-full block"
        >
          <defs>
            {/* Wave 4 (Deepest layer, blends into #030712 at middle of screen) */}
            <linearGradient id="kazan-wave-4" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#0f2952" stopOpacity="0.85" />
              <stop offset="70%" stopColor="#071329" stopOpacity="0.92" />
              <stop offset="100%" stopColor="#030712" stopOpacity="1" />
            </linearGradient>

            {/* Wave 3 (Mid-deep sapphire blue) */}
            <linearGradient id="kazan-wave-3" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#163e7a" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0b1d3d" stopOpacity="0.95" />
            </linearGradient>

            {/* Wave 2 (Rich ocean royal blue) */}
            <linearGradient id="kazan-wave-2" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#1d56b0" stopOpacity="0.92" />
              <stop offset="100%" stopColor="#123168" stopOpacity="0.95" />
            </linearGradient>

            {/* Wave 1 (Topmost most vibrant azure/cobalt blue) */}
            <linearGradient id="kazan-wave-1" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#1a4494" stopOpacity="0.95" />
            </linearGradient>
          </defs>

          {/* Band 4: Reaches down to the middle behind the Gate emblem */}
          <path
            fill="url(#kazan-wave-4)"
            d="M0,0 L1440,0 L1440,465 C1300,515 1140,420 940,455 C740,490 610,525 410,480 C220,435 110,500 0,465 Z"
          />

          {/* Band 3: Third curved wave */}
          <path
            fill="url(#kazan-wave-3)"
            d="M0,0 L1440,0 L1440,340 C1260,395 1100,285 900,335 C700,385 520,270 330,330 C170,380 80,350 0,320 Z"
          />

          {/* Band 2: Second curved wave */}
          <path
            fill="url(#kazan-wave-2)"
            d="M0,0 L1440,0 L1440,220 C1280,165 1120,270 910,215 C700,160 540,265 340,205 C180,155 85,235 0,200 Z"
          />

          {/* Band 1: Topmost vibrant wave */}
          <path
            fill="url(#kazan-wave-1)"
            d="M0,0 L1440,0 L1440,105 C1290,155 1130,55 920,110 C710,165 530,50 320,110 C160,155 75,95 0,115 Z"
          />
        </svg>
      </div>

      {/* Center Group: Fades in smoothly in place, lingers while dot orbits, never shifts sideways */}
      <div
        className="relative z-10 flex flex-col items-center gap-5"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1)' : 'scale(0.92)',
          transition: 'opacity 950ms cubic-bezier(0.22, 1, 0.36, 1), transform 950ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <PortalEmblem />

        <div className="inline-flex w-fit items-center gap-3 rounded-2xl border border-white/10 bg-night-900/55 px-4 py-2.5 backdrop-blur-md shadow-2xl">
          <BrandMark />
          <BrandTitle />
        </div>
      </div>
    </div>
  )
}