/**
 * utils.ts — small formatting / helper functions used across the UI.
 */

import type { AnimeSummary, JikanRelationEntry, JikanTrailer } from './types'

/** Best available poster/cover image for an anime summary. */
export function coverImage(anime: Pick<AnimeSummary, 'images'>): string {
  const webp = anime.images?.webp
  const jpg = anime.images?.jpg
  return (
    webp?.large_image_url ||
    webp?.image_url ||
    jpg?.large_image_url ||
    jpg?.image_url ||
    ''
  )
}

/**
 * Best available wide banner/backdrop image. Prefers AniList's dedicated
 * `bannerImage` (a true cinematic wide shot); falls back to the poster so a
 * hero/backdrop is never blank.
 */
export function bannerImage(anime: Pick<AnimeSummary, 'images' | 'bannerImage'>): string {
  return anime.bannerImage || coverImage(anime) || ''
}

/**
 * Safely strip AniList's HTML-ish markup (`<br>`, `<i>`, `<b>`, `<p>`, …) from a
 * synopsis down to clean, readable text. Newlines from `<br>`/paragraph breaks
 * are preserved; entities are decoded. Never throws.
 */
export function stripHtml(html?: string | null): string {
  if (!html) return ''
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text
}

/** Best available image for a lightweight relations entry (no webp guaranteed). */
export function relationImage(entry: Pick<JikanRelationEntry, 'images'>): string {
  const webp = entry.images?.webp
  const jpg = entry.images?.jpg
  return (
    webp?.large_image_url ||
    webp?.image_url ||
    jpg?.large_image_url ||
    jpg?.image_url ||
    ''
  )
}

/**
 * Resolve a playable YouTube embed URL from a Jikan trailer object.
 * Prefers the canonical embed_url; falls back to building one from youtube_id.
 */
export function trailerEmbedUrl(trailer?: JikanTrailer | null): string | null {
  if (!trailer) return null
  if (trailer.embed_url) return trailer.embed_url
  if (trailer.youtube_id) return `https://www.youtube.com/embed/${trailer.youtube_id}`
  return null
}

/**
 * Human-friendly content rating label. Jikan returns verbose strings like
 * "PG-13 - Teens 13 or older" or "R - 17+ (violence & profanity)"; we keep only
 * the rating code (before the first " - "), e.g. "PG-13", "R", "Rx".
 */
export function formatRating(rating?: string | null): string {
  if (!rating) return '—'
  // Split on the first " - " that separates the code from the description.
  const code = rating.split(/\s+-\s+/)[0].trim()
  return code || rating.trim()
}

/** Compact airing status derived from the MAL `status` string. */
export function airingStatus(status?: string | null): 'airing' | 'finished' | 'upcoming' | 'unknown' {
  const s = (status ?? '').toLowerCase()
  if (s.includes('currently airing') || s === 'airing') return 'airing'
  if (s.includes('finished') || s === 'complete') return 'finished'
  if (s.includes('not yet aired') || s === 'upcoming') return 'upcoming'
  return 'unknown'
}

/** Compact integer formatting: 1200 -> 1.2K, 3_400_000 -> 3.4M. */
export function formatCount(n?: number | null): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}

/** Score with one decimal, or a dash. */
export function formatScore(score?: number | null): string {
  if (score == null) return '—'
  return score.toFixed(1)
}

/** Seconds -> "h:mm:ss" / "m:ss" for player time display. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds % 60)
  const m = Math.floor((seconds / 60) % 60)
  const h = Math.floor(seconds / 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** Season + year, e.g. "Fall 2024". */
export function formatSeason(season?: string | null, year?: number | null): string {
  if (!season && !year) return '—'
  return `${season ?? ''} ${year ?? ''}`.trim()
}

/** Debounce a function by `wait` ms. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: A) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
}

/** Join truthy class names. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/**
 * Map an AniList format string (e.g. "TV", "MOVIE", "TV_SHORT") to the i18n key
 * that holds its bilingual label, or null when we don't have a friendly label.
 */
export function formatLabelKey(type?: string | null): string | null {
  if (!type) return null
  const norm = type.replace(/[\s_]+/g, '_').toUpperCase()
  switch (norm) {
    case 'TV':
      return 'format.tv'
    case 'TV_SHORT':
      return 'format.tvShort'
    case 'MOVIE':
      return 'format.movie'
    case 'OVA':
      return 'format.ova'
    case 'ONA':
      return 'format.ona'
    case 'SPECIAL':
      return 'format.special'
    case 'MUSIC':
      return 'format.music'
    default:
      return null
  }
}

/**
 * Per-language labels for an AniList format, used by formatLabel() so badges
 * show ONLY the active language (e.g. "مسلسل" in Arabic, "TV" in English)
 * instead of the old combined "مسلسل / TV" strings (#5).
 */
const FORMAT_AR: Record<string, string> = {
  TV: 'مسلسل',
  TV_SHORT: 'مسلسل قصير',
  MOVIE: 'فيلم',
  OVA: 'حلقة خاصة',
  ONA: 'أونا',
  SPECIAL: 'سبيشل',
  MUSIC: 'موسيقى',
}

const FORMAT_EN: Record<string, string> = {
  TV: 'TV',
  TV_SHORT: 'TV Short',
  MOVIE: 'Movie',
  OVA: 'OVA',
  ONA: 'ONA',
  SPECIAL: 'Special',
  MUSIC: 'Music',
}

/**
 * Localized label for an AniList format, e.g. "مسلسل" / "TV",
 * "فيلم" / "Movie", "حلقة خاصة" / "OVA". Never combines both languages.
 * Falls back to a title-cased version of the raw format string
 * (underscores → spaces) when we don't have a known label (#5, #9).
 */
export function formatLabel(type: string | null | undefined, lang: 'ar' | 'en'): string | null {
  if (!type) return null
  const norm = type.replace(/[\s_]+/g, '_').toUpperCase()
  const map = lang === 'ar' ? FORMAT_AR : FORMAT_EN
  if (map[norm]) return map[norm]
  return type.replace(/_/g, ' ').toUpperCase()
}

/** True when the AniList format is a movie. */
export function isMovie(type?: string | null): boolean {
  return !!type && type.replace(/[\s_]+/g, '_').toUpperCase() === 'MOVIE'
}
