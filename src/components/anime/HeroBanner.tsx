/// <reference types="node" />

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { AnimeSummary } from '../../lib/types'
import { useI18n } from '../../context/LanguageContext'
import { coverImage, cx } from '../../lib/utils'
import { ArrowLeft, ArrowRight, PlayIcon } from '../icons'
import { Skeleton } from '../ui/Feedback'

/**
 * Shared GPU-compositing hint for the crossfading slide layers:
 * `will-change: opacity` promotes each layer to its own compositor layer,
 * and `transform: translateZ(0)` forces GPU compositing so the 700ms
 * crossfade never triggers layout/paint on the main thread.
 */
const SLIDE_LAYER_STYLE: CSSProperties = {
  willChange: 'opacity',
  transform: 'translateZ(0)',
  backfaceVisibility: 'hidden',
}

/** How long each slide stays visible before auto-advancing (#1). */
const SLIDE_INTERVAL_MS = 7000

/** Banners narrower than this are treated as low-res and never stretched. */

/**
 * HeroBanner â€” auto-rotating cinematic carousel spotlighting the top
 * seasonal anime (top 5â€“8 items): smooth crossfade transitions, auto-advance
 * every 7 seconds, left/right arrows, bottom dots, pause-on-hover (#1).
 */
export function HeroBanner({ items }: { items: AnimeSummary[] }) {
  const { t } = useI18n()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  // Whether the banner is actually on screen. The 7s auto-advance timer is
  // paused while it is scrolled out of view so hidden slides never churn.
  const sectionRef = useRef<HTMLElement | null>(null)
  const [inView, setInView] = useState(true)
  // Mal ids whose wide banner measured below the high-res threshold on load.
  const [lowResBanners, setLowResBanners] = useState<Set<number>>(() => new Set())
  const markLowRes = (malId: number, width: number) => {
    if (width >= 1280) return
    setLowResBanners((prev) => {
      if (prev.has(malId)) return prev
      const next = new Set(prev)
      next.add(malId)
      return next
    })
  }

  const count = items.length

  // Keep the active index in range if the list shrinks.
  useEffect(() => {
    if (index >= count) setIndex(0)
  }, [count, index])

  // Stop the auto-advance timer entirely when the banner scrolls out of view.
  useEffect(() => {
    const el = sectionRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(
      (entries) => setInView(entries.some((e) => e.isIntersecting)),
      { threshold: 0.25 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [count])

  // Auto-advance while not hovered/focused AND actually visible.
  // The interval is cleared on unmount and whenever the banner leaves the
  // viewport, so no background slide re-renders happen off-screen.
  useEffect(() => {
    if (count <= 1 || paused || !inView) return
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % count)
    }, SLIDE_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [count, paused, inView])

  if (count === 0) {
    return (
      <div className="container-page pt-5">
        <div className="relative h-[54vh] min-h-[380px] w-full overflow-hidden rounded-3xl bg-night-900">
          <Skeleton className="h-full w-full rounded-none" />
        </div>
      </div>
    )
  }

  const active = Math.min(index, count - 1)
  const anime = items[active]
  const go = (next: number) => setIndex((next + count) % count)

  const title = anime.title_english || anime.title
  const synopsis = anime.synopsis
    ? anime.synopsis.length > 240
      ? anime.synopsis.slice(0, 240).trimEnd() + 'â€¦'
      : anime.synopsis
    : ''

  return (
    <div className="w-full pt-5">
    <div className="container-page relative">
    <section
      ref={sectionRef}
      className="relative isolate h-[54vh] min-h-[380px] w-full overflow-hidden rounded-3xl shadow-card ring-1 ring-night-700/60"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carousel"
    >
      {/*
        Crossfading backgrounds â€” every slide fills the container edge-to-edge.
        A wide bannerImage renders with object-cover; when a banner is missing
        or narrow, the container is filled with a blurred scale-110 crop of the
        coverImage and the crisp poster artwork is placed gracefully to the side.
        No empty black pillarbars are ever rendered.
      */}
      {items.map((a, i) => {
        const banner = a.bannerImage || ''
        const lowRes = lowResBanners.has(a.mal_id)
        const wide = Boolean(banner) && !lowRes
        const cover = coverImage(a)
        const src = wide ? banner : (cover || banner)
        if (!src) return null
        const loading = i === 0 ? 'eager' : 'lazy'
        return (
          <div
            key={a.mal_id}
            aria-hidden="true"
            style={SLIDE_LAYER_STYLE}
            className={cx(
              "absolute inset-0 transition-opacity duration-700 ease-in-out",
              i === active ? "opacity-100" : "opacity-0",
            )}
          >
            {/* Ambient blurred backdrop Ã¢â‚¬â€ always fills edge-to-edge */}
            <img
              src={wide ? banner : cover}
              alt=""
              loading={loading}
              decoding="async"
              className="absolute inset-0 h-full w-full scale-110 object-cover object-center blur-2xl opacity-40"
            />
            {wide ? (
              <img
                src={src}
                alt=""
                loading={loading}
                decoding="async"
                onLoad={(e) => markLowRes(a.mal_id, e.currentTarget.naturalWidth)}
                className="absolute inset-0 h-full w-full object-cover object-center"
              />
            ) : (
              <img
                src={src}
                alt=""
                loading={loading}
                decoding="async"
                className="relative block h-full max-w-[60%] object-contain object-right"
              />
            )}
          </div>
        )
      })}

      <div className="absolute inset-0 bg-gradient-to-t from-[#030712]/80 via-[#030712]/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#030712] via-[#030712]/60 to-transparent rtl:bg-gradient-to-l" />

      {/* Content â€” keyed so the fade-up animation replays per slide */}
      <div className="relative flex h-full flex-col justify-end px-5 pb-16 pt-24 sm:px-8 sm:pb-16">
        <div key={anime.mal_id} className="max-w-2xl animate-fade-up">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-300">
            {t('hero.featured')}
          </p>

          <h2 className="mt-2 text-3xl font-semibold leading-tight tracking-wide text-white text-shadow-lg sm:text-5xl">
            {title}
          </h2>

          {synopsis && (
            <p className="mt-3 line-clamp-2 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
              {synopsis}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              to={`/watch/${anime.mal_id}/1`}
              className="btn-primary rounded-full px-7 py-3 text-base"
            >
              <PlayIcon className="h-5 w-5" />
              {t('hero.watchNow')}
            </Link>
            <Link
              to={`/anime/${anime.mal_id}`}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 bg-white/10 px-6 py-3 text-base font-semibold text-white backdrop-blur-md transition hover:border-white/40 hover:bg-white/20 active:scale-[0.98]"
            >
              {t('hero.moreInfo')}
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom pill indicators */}
      {count > 1 && (
        <div className="absolute inset-x-0 bottom-5 z-10 flex items-center justify-center gap-1.5">
          {items.map((a, i) => (
            <button
              key={a.mal_id}
              type="button"
              aria-label={`${t('hero.goToSlide')} ${i + 1}`}
              aria-current={i === active ? 'true' : undefined}
              onClick={() => go(i)}
              className={cx(
                'h-1.5 rounded-full transition-all duration-300',
                i === active ? 'w-8 bg-white shadow' : 'w-3 bg-white/35 hover:bg-white/70',
              )}
            />
          ))}
        </div>
      )}
    </section>

    {/* Navigation arrows — placed outside the card, in the side void */}
    {count > 1 && (
      <>
        <button
          type="button"
          aria-label={t('hero.prev')}
          onClick={() => go(active - 1)}
          className="absolute z-10 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-night-950/60 text-slate-200 backdrop-blur-sm transition hover:border-slate-400/60 hover:text-white -start-3"
        >
          <ArrowLeft className="h-5 w-5 flip-rtl" />
        </button>
        <button
          type="button"
          aria-label={t('hero.next')}
          onClick={() => go(active + 1)}
          className="absolute z-10 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-night-950/60 text-slate-200 backdrop-blur-sm transition hover:border-slate-400/60 hover:text-white -end-3"
        >
          <ArrowRight className="h-5 w-5 flip-rtl" />
        </button>
      </>
    )}
    </div>
    </div>
  )
}


