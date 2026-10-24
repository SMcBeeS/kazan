import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../context/LanguageContext'
import { cx } from '../../lib/utils'
import { ChevronLeft, ChevronRight } from '../icons'

/**
 * AnimeCarousel — horizontal scroller with directional arrow buttons that are
 * RTL-aware (in RTL, "next" scrolls leftward). Includes a section header and
 * optional "view all" link.
 */
export function Carousel({
  title,
  subtitle,
  viewAllHref,
  children,
}: {
  title: string
  subtitle?: string
  viewAllHref?: string
  children: ReactNode
}) {
  const { t, dir } = useI18n()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const update = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    // In RTL, scrollLeft is negative; normalize with absolute value.
    const pos = Math.abs(el.scrollLeft)
    setAtStart(pos <= 4)
    setAtEnd(pos >= max - 4)
  }, [])

  useEffect(() => {
    update()
    const el = scrollerRef.current
    if (!el) return
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [update])

  const scrollBy = (direction: 1 | -1) => {
    const el = scrollerRef.current
    if (!el) return
    // Amount ~ one "page" of the visible width.
    const amount = el.clientWidth * 0.85
    // Flip direction for RTL so arrows feel natural.
    const sign = dir === 'rtl' ? -direction : direction
    el.scrollBy({ left: amount * sign, behavior: 'smooth' })
  }

  const NextIcon = dir === 'rtl' ? ChevronLeft : ChevronRight
  const PrevIcon = dir === 'rtl' ? ChevronRight : ChevronLeft

  return (
    <section className="py-6">
      <div className="container-page">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2.5 text-xl font-semibold tracking-wide text-white sm:text-2xl">
              <span className="h-6 w-1.5 rounded-full bg-white" aria-hidden="true" />
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {viewAllHref && (
              <Link
                to={viewAllHref}
                className="hidden rounded-full border border-night-600/70 px-3.5 py-1.5 text-xs font-bold text-slate-200 transition hover:border-slate-400/60 hover:text-white sm:block"
              >
                {t('home.viewAll')}
              </Link>
            )}
            <div className="hidden items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={() => scrollBy(-1)}
                disabled={atStart}
                aria-label={t('catalog.prev')}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-night-600/80 bg-night-800/70 text-slate-200 transition hover:border-slate-400/60 hover:text-white disabled:opacity-30 disabled:hover:border-night-600/80"
              >
                <PrevIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollBy(1)}
                disabled={atEnd}
                aria-label={t('catalog.next')}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-night-600/80 bg-night-800/70 text-slate-200 transition hover:border-slate-400/60 hover:text-white disabled:opacity-30 disabled:hover:border-night-600/80"
              >
                <NextIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        ref={scrollerRef}
        // GPU-composited horizontal scroller: promotes the scroller to its own
        // compositor layer so wheel/touch/arrow scrolling stays off the main
        // thread. `scroll-smooth` (on `html`/scroll containers) handles the
        // smooth wheel & arrow-scroll behavior.
        style={{
          willChange: 'scroll-position',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
        }}
        className={cx(
          'no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 touch-pan-x',
          'container-page',
        )}
      >
        {children}
      </div>
    </section>
  )
}

/** A fixed-width snap child for use inside <Carousel>. */
export function CarouselItem({ children }: { children: ReactNode }) {
  return (
    <div className="w-[150px] shrink-0 snap-start sm:w-[172px] lg:w-[186px]">{children}</div>
  )
}
