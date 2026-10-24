import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../context/LanguageContext'
import { coverImage, formatLabel } from '../lib/utils'
import { anilist, type UpcomingAnime } from '../lib/anilist'
import { useAsync } from '../hooks/useAsync'
import { ErrorState } from '../components/ui/States'
import { Skeleton } from '../components/ui/Feedback'
import { CalendarIcon, PlayIcon, SearchIcon, SparkleIcon } from '../components/icons'
import type { ScheduleEntry } from '../lib/types'

/** Number of days in the rolling window: today plus the following 6 days. */
const WINDOW_DAYS = 7

const DAY_SHORT: Record<string, { en: string; ar: string }> = {
  Monday: { en: 'Mon', ar: 'الاثنين' },
  Tuesday: { en: 'Tue', ar: 'الثلاثاء' },
  Wednesday: { en: 'Wed', ar: 'الأربعاء' },
  Thursday: { en: 'Thu', ar: 'الخميس' },
  Friday: { en: 'Fri', ar: 'الجمعة' },
  Saturday: { en: 'Sat', ar: 'السبت' },
  Sunday: { en: 'Sun', ar: 'الأحد' },
}

/** Local weekday names indexed by `Date.getDay()` (0 = Sunday .. 6 = Saturday). */
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

type EntryStatus = 'live' | 'aired' | 'upcoming'

/** Asia/Baghdad runs on UTC+3 with no daylight saving. */
const IRAQ_UTC_OFFSET_MIN = 3 * 60

/** Convert the source (UTC) HH:MM broadcast time to Iraq wall time (minutes-from-midnight). */
function toIraqMinutes(time: string): { minutes: number; dayShift: number } {
  const [h, m] = (time || '00:00').split(':').map(Number)
  let total = (h || 0) * 60 + (m || 0) + IRAQ_UTC_OFFSET_MIN
  let dayShift = 0
  if (total >= 1440) {
    total -= 1440
    dayShift = 1
  } else if (total < 0) {
    total += 1440
    dayShift = -1
  }
  return { minutes: total, dayShift }
}

/** Format the source broadcast time as an HH:MM string in Iraq time. */
function formatIraqTime(time: string): string {
  const { minutes } = toIraqMinutes(time)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Current wall-clock time in minutes-from-midnight for the Asia/Baghdad timezone. */
function iraqNowMinutes(now: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Baghdad',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(now))
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

/** Compute a display status + countdown string for an entry relative to Iraq time. */
function entryStatus(entry: ScheduleEntry, now: number): { status: EntryStatus; countdown: string } {
  const airMinutes = toIraqMinutes(entry.broadcast?.time ?? '').minutes
  const minutesNow = iraqNowMinutes(now)
  const minutesSince = minutesNow - airMinutes

  if (minutesSince >= 0 && minutesSince < 90) {
    // Treat ~90 minutes after the air time as the "live window".
    return { status: 'live', countdown: '' }
  }
  if (minutesSince >= 0) {
    return { status: 'aired', countdown: '' }
  }
  const diff = airMinutes - minutesNow
  const h = Math.floor(diff / 60)
  const m = diff % 60
  return { status: 'upcoming', countdown: `${h > 0 ? `${h}h ` : ''}${m}m` }
}

/** Post-air prune window (ms): an episode stays listed for 1 hour after airing. */
const POST_AIR_WINDOW_MS = 60 * 60 * 1000

/**
 * True when an entry is still worth showing. Upcoming episodes are always in;
 * aired ones linger for POST_AIR_WINDOW_MS past their `airingAt` (seconds) so
 * they disappear exactly an hour after broadcast.
 */
function isStillRelevant(entry: ScheduleEntry, now: number): boolean {
  if (entry.airingAt == null) return true
  return entry.airingAt * 1000 + POST_AIR_WINDOW_MS > now
}

/** Lower-cased title match used for the schedule search highlight. */
function matchesSearch(entry: ScheduleEntry, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  return (
    (entry.romaji ?? entry.title ?? '').toLowerCase().includes(q) ||
    (entry.english ?? '').toLowerCase().includes(q)
  )
}

/** Human-facing season badge, e.g. "Winter 2026", or null when not specified. */
function seasonBadge(season: string | null, year: number | null, lang: 'ar' | 'en'): string | null {
  if (!season && year == null) return null
  const label = formatLabel(season ?? null, lang)
  if (!season && year == null) return null
  if (label && year != null) return `${label} ${year}`
  return (label ?? String(year ?? '')) || null
}

/**
 * Build the rolling schedule window: the next WINDOW_DAYS days starting from
 * today (local midnight through UTC), plus a matching UNIX-second timestamp
 * range to hand to AniList's `airingAt_greater` / `airingAt_lesser` filter.
 */
interface ScheduleWindow {
  /** Day-of-week name (local), Today first, in order. Drives the columns. */
  days: string[]
  /** Calendar day-of-month (local) aligned 1:1 with `days`. */
  dateNums: number[]
  /** Same index as `days`; true only for the current local day. */
  isToday: boolean[]
  /** Start-of-today UNIX seconds (API `airingAt_greater`). */
  start: number
  /** End of the final day UNIX seconds (API `airingAt_lesser`). */
  end: number
}

function getScheduleWindow(): ScheduleWindow {
  const startOfTodayLocal = new Date()
  startOfTodayLocal.setHours(0, 0, 0, 0)
  const start = Math.floor(startOfTodayLocal.getTime() / 1000)
  // `end` is the moment the window closes (start of the day AFTER the last one),
  // so the lesser-boundary includes every episode airing on the 7th day.
  const end = start + WINDOW_DAYS * 86400

  const days: string[] = []
  const dateNums: number[] = []
  const isToday: boolean[] = []
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = new Date(startOfTodayLocal)
    d.setDate(startOfTodayLocal.getDate() + i)
    days.push(WEEKDAY_NAMES[d.getDay()])
    dateNums.push(d.getDate())
    isToday.push(i === 0)
  }
  return { days, dateNums, isToday, start, end }
}

function ScheduleHeader() {
  const { t } = useI18n()
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-wide text-white sm:text-3xl">{t('schedule.title')}</h1>
      <p className="mt-1 text-sm text-slate-400">{t('schedule.subtitle')}</p>
      <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-400">
        <CalendarIcon className="h-3.5 w-3.5" />
        {t('schedule.timeZone')}
      </p>
    </header>
  )
}
/** SchedulePage — rolling 7-day airing schedule with a live status and local search. */
export default function SchedulePage() {
  const { t, lang } = useI18n()
  const window_ = useMemo(() => getScheduleWindow(), [])
  const schedule = useAsync(
    (s) => anilist.getSchedule(undefined, s, { start: window_.start, end: window_.end }).then((r) => r.data),
    [window_.start, window_.end],
  )
  const upcoming = useAsync((s) => anilist.getUpcoming(10, s).then((r) => r.data), [])
  const [now, setNow] = useState(() => Date.now())
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const byDay = useMemo(() => {
    const map: Record<string, ScheduleEntry[]> = {}
    for (const e of schedule.data ?? []) {
      // Drop episodes that aired more than 1 hour ago (see isStillRelevant).
      if (!isStillRelevant(e, now)) continue
      // Group by the local calendar date so a UTC airing near midnight lands on
      // the same column the user's clock names "today".
      const key = e.airingAt != null ? WEEKDAY_NAMES[new Date(e.airingAt * 1000).getDay()] : (e.broadcast?.day ?? '')
      if (!map[key]) map[key] = []
      map[key]?.push(e)
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.broadcast?.time ?? '').localeCompare(b.broadcast?.time ?? ''))
    }
    return map
  }, [schedule.data, now])

  // Only keep days that actually have matching entries; the window array is
  // already ordered Today-first, so the current day naturally stays first.
  const visibleDays = useMemo(
    () =>
      window_.days
        .map((day, idx) => ({ day, idx, items: byDay[day] ?? [] }))
        .filter((d) => d.items.length > 0),
    [byDay, window_.days],
  )

  const dayLabel = (day: string) =>
    lang === 'ar' ? (DAY_SHORT[day]?.ar ?? day) : (DAY_SHORT[day]?.en ?? day)

  if (schedule.loading) {
    return (
      <div className="container-page py-8">
        <ScheduleHeader />
        <div className="mb-4 max-w-md">
          <Skeleton className="h-11" />
        </div>
        <div className="mb-8">
          <Skeleton className="h-64" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      </div>
    )
  }

  if (schedule.error) {
    return (
      <div className="container-page py-8">
        <ScheduleHeader />
        <ErrorState message={schedule.error} onRetry={schedule.reload} />
      </div>
    )
  }

  return (
    <div className="container-page py-8">
      <ScheduleHeader />

      {/* Schedule-specific search — highlights matching titles (no hiding). */}
      <div className="relative mb-6 max-w-md">
        <SearchIcon className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('schedule.searchPlaceholder')}
          aria-label={t('schedule.searchPlaceholder')}
          className="w-full rounded-xl border border-night-700/70 bg-night-850 py-3 pe-3 ps-9 text-sm text-slate-100 placeholder:text-slate-500 focus:border-white/40"
        />
      </div>

      {/* News & Upcoming Announcements — full-width scrolling belt above the grid. */}
      <div className="mb-8">
        <UpcomingMarquee
          data={upcoming.data ?? []}
          loading={upcoming.loading}
          error={upcoming.error}
          onRetry={upcoming.reload}
          lang={lang}
        />
      </div>

      {/* Full-width week grid (no search filtering — search highlights only). */}
      {visibleDays.length === 0 ? (
        <p className="rounded-2xl border border-night-700/70 bg-night-850/50 px-4 py-12 text-center text-sm text-slate-500">
          {t('schedule.none')}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {visibleDays.map(({ day, idx, items }) => {
            const isToday = window_.isToday[idx]
            return (
              <section
                key={day}
                className="min-w-0 rounded-2xl border border-night-700/70 bg-night-850/50 p-3 shadow-card"
              >
                <header className="mb-3 flex items-center gap-2 border-b border-night-700/50 pb-2">
                  <CalendarIcon className="h-4 w-4 text-slate-400" />
                  <h2 className="text-sm font-bold text-white">
                    {isToday ? t('schedule.today') : dayLabel(day)}{' '}
                    <span className="text-xs font-semibold text-slate-500">{window_.dateNums[idx]}</span>
                  </h2>
                  <span className="ms-auto rounded-full bg-night-800 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                    {items.length}
                  </span>
                </header>
                <ul className="space-y-2">
                  {items.map((e) => (
                    <ScheduleRow
                      key={`${e.mal_id}-${e.airingAt ?? e.broadcast?.time ?? ''}`}
                      entry={e}
                      now={now}
                      highlighted={matchesSearch(e, searchQuery)}
                    />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
/**
 * Horizontal scrolling "highly anticipated" belt rendered at the very top of the
 * page (below search, above the schedule). A single `flex animate-marquee` track
 * holds two copies of the item list back-to-back so the -100% translateX loop is
 * seamless. Pauses on hover.
 */
function UpcomingMarquee({
  data,
  loading,
  error,
  onRetry,
  lang,
}: {
  data: UpcomingAnime[]
  loading: boolean
  error: string | null
  onRetry: () => void
  lang: 'ar' | 'en'
}) {
  const { t } = useI18n()

  if (loading && data.length === 0) {
    return <Skeleton className="h-72" />
  }
  if (error && data.length === 0) {
    return <ErrorState message={error} onRetry={onRetry} />
  }
  if (data.length === 0) return null

  // Duplicate the list once so the track covers 2x the viewport and the loop
  // point (translateX 0% -> -100%) is continuous with no visible jump.
  const items = [...data, ...data]

  return (
    <div className="rounded-2xl border border-night-700/70 bg-night-900/40 p-3 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <SparkleIcon className="h-4 w-4 text-gold-400" />
        <h2 className="text-sm font-bold text-white">{t('schedule.announcements')}</h2>
        <span className="hidden text-xs text-slate-400 sm:inline">{t('schedule.announcementsHint')}</span>
      </div>

      <div className="overflow-hidden">
        <div className="flex w-max animate-marquee gap-4 whitespace-nowrap hover:[animation-play-state:paused]">
          {items.map((a, i) => {
            const badge = seasonBadge(a.season, a.seasonYear, lang)
            return (
              <Link
                key={`${a.id}-${i}`}
                to={`/anime/${a.id}`}
                className="group relative block h-64 w-48 shrink-0 overflow-hidden rounded-xl border border-night-700/70 bg-night-850 transition hover:border-gold-400/60"
              >
                {a.coverImage ? (
                  <img
                    src={a.coverImage}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-3xl text-slate-700">?</div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-night-950 via-night-950/40 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <span className="mb-1.5 inline-flex items-center rounded-full bg-gold-400/20 px-2 py-0.5 text-[10px] font-bold text-gold-400">
                    {badge ?? t('schedule.early')}
                  </span>
                  <p className="truncate text-sm font-bold text-white" title={a.title}>
                    {a.title}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
/** Row for a single airing entry with a status badge (live / aired / upcoming). */
function ScheduleRow({
  entry,
  now,
  highlighted = false,
}: {
  entry: ScheduleEntry
  now: number
  highlighted?: boolean
}) {
  const { t } = useI18n()
  const { status, countdown } = entryStatus(entry, now)
  const img = coverImage(entry)
  const time = entry.broadcast?.time ?? ''
  const episodeNo = entry.episodes?.[0]?.mal_id

  // Gold highlight classes are applied only when the row's title matches the
  // schedule-level search query (see matchesSearch in SearchController).
  const cardClasses = highlighted
    ? 'group relative flex items-center gap-3 rounded-xl border-0 bg-night-800/60 p-2 ring-2 ring-[#FFD700] shadow-[0_0_15px_#ffd700/50] scale-105 transition-all'
    : 'group relative flex items-center gap-3 rounded-xl border border-night-700/50 bg-night-800/40 p-2 transition hover:border-slate-400/40'

  return (
    <li className={cardClasses}>
      <div className="relative h-14 w-11 shrink-0 overflow-hidden rounded-lg bg-night-900">
        {img ? (
          <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-slate-600">?</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-100" title={entry.title}>
          {entry.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span dir="ltr">{formatIraqTime(time)}</span>
          <span className="text-sky-400/80">{t('schedule.iraqTag')}</span>
          {episodeNo != null && (
            <span className="text-slate-500">{t('schedule.episode', { n: episodeNo })}</span>
          )}
        </div>
      </div>
      <div className="shrink-0">
        {status === 'live' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2 py-1 text-[10px] font-bold text-red-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            {t('schedule.live')}
          </span>
        )}
        {status === 'aired' && (
          <span className="inline-flex items-center rounded-full bg-slate-500/15 px-2 py-1 text-[10px] font-bold text-slate-300">
            {t('schedule.aired')}
          </span>
        )}
        {status === 'upcoming' && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-1 text-[10px] font-bold text-sky-400"
            title={countdown}
          >
            <PlayIcon className="h-3 w-3" />
            <span dir="ltr">{t('schedule.airsIn', { time: countdown })}</span>
          </span>
        )}
      </div>
      <Link
        to={`/anime/${entry.mal_id}`}
        aria-label={entry.title}
        className="shrink-0 rounded-lg border border-night-600/60 bg-night-800/60 p-1.5 text-slate-300 transition hover:text-white"
      >
        <PlayIcon className="h-4 w-4" />
      </Link>
    </li>
  )
}