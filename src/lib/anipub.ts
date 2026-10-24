/*
 * anipub.ts
 * ---------
 * Data layer for Kakazan. This module is a drop-in replacement for the
 * previous `anilist.ts` client, but instead of the AniList GraphQL API it
 * talks to the official public JSON API at https://anipub.org (no API key
 * required). Every function takes the same parameters and returns the same
 * Jikan-shaped interfaces defined in `types.ts`, so the rest of the app
 * (components, store, UI kit) needs no changes beyond swapping the import
 * path from `@/lib/anilist` to `@/lib/anipub`.
 *
 * Endpoint mapping (see probes _ap_*.txt):
 *   search-all  -> /api/searchall/:name      { currentPage, AniData[] }
 *   suggest     -> /api/search/:name         [ { Name, Image, finder, Id } ]
 *   rating      -> /api/findbyrating[:/q]    { currentPage, AniData[] }
 *   by-genre    -> /api/findbyGenre/:slug    { currentPage, wholePage[] }
 *   detail      -> /api/info/:id             single object (rich)
 *   sort        -> /api/sort                 [ total, items[] ]
 *   last-id     -> /api/getlast              number
 *
 * Gaps handled with a graceful fallback (no hard crash, just degraded data):
 *   - AniPub has no real "season" concept  -> currentSeason == "all"
 *   - AniPub has no popularity/sort order  -> top/upcoming use /findbyrating
 *   - AniPub has no scheduled-weeks        -> getSchedule() returns []
 *   - AniPub has no standalone genre list  -> built from DEFAULT_GENRES
 *   - AniPub recommendations not per-id    -> derived from the anime's genre
 *   - AniPub has no per-request pagination -> we page in memory over the
 *     single response page the server returns.
 *
 * Resilience (ported from the old client, kept for slow / free endpoints):
 *   1. every network call runs through a single global queue spaced by
 *      ANIPUB_MIN_INTERVAL (milliseconds) so bursts never hammer the API;
 *   2. 429 / 5xx responses are retried with backoff (x3); a `Retry-After`
 *      header is honored when present;
 *   3. in-memory + localStorage response cache in front of the network
 *      (short TTL) so duplicate requests / remounts on a burst-heavy page
 *      (home fires ~5 requests at once) don't hit the API again. Failed
 *      responses are NEVER cached, so a temporary 429 always retries fresh.
 */

import type {
  AnimeDetail,
  AnimeSummary,
  Episode,
  Genre,
  JikanAired,
  JikanGenre,
  JikanRelation,
  JikanRelationEntry,
  JikanStudio,
  JikanTitle,
  Paginated,
  ScheduleEntry,
  SimpleList,
} from './types'

const BASE = 'https://anipub.org'

/**
 * Compatibility export. The old GraphQL client surfaced a typed error class;
 * keep the same name available so anything catching `AniListError` still compiles.
 */
export class AniListError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'AniListError'
    this.status = status
  }
}

/* ============================================================================
 * Raw-API type mirrors (only the keys we actually read from the network)
 * ========================================================================== */
interface APBase {
  _id: number
  Name: string
  ImagePath?: string | null
  Cover?: string | null
  finder?: string | null
  MALScore?: string | number | null
  RatingsNum?: number | null
  DescripTion?: string | null
  Genres?: string[] | string | null
  Status?: string | null
  Aired?: string | null
  Premiered?: string | number | null
  Duration?: string | null
  epCount?: number | null
  Synonyms?: string[] | string | null
  /* AniPub mixes free-form comma-strings and arrays across endpoints, so both. */
  Studios?: string[] | string | null
  Producers?: string[] | string | null
  Banner?: string | null
  [k: string]: unknown
}
interface APSearchHit { Name: string; Image: string | null; finder: string | null; Id: number }
/** Some endpoints answer `{ currentPage, AniData[] }`, some `{ currentPage, wholePage[] }`. */
interface APListResp { currentPage: number; wholePage?: unknown[]; AniData?: unknown[] }

/* ============================================================================
 * Small pure helpers
 * ========================================================================== */
function toScore(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}
function asStr(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s.length ? s : null
}
function toInt(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : null
}
function parseList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(x => String(x)).filter(s => s.length > 0)
  if (typeof v === 'string' && v.trim()) return [v.trim()]
  return []
}
/* Build a full image URL from whatever AniPub hands us (may be a relative
 * `/poster.webp` path or an absolute CDN URL). */
function resolvePic(v: unknown): string | null {
  const raw = asStr(v)
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  try { return new URL(raw, BASE).toString() } catch { return (BASE + raw.replace(/^\/+/, '')) }
}
/* Best-effort season/year from a few possible source fields. */
function deriveAired(item: APBase): number | null {
  if (item.Premiered != null) {
    const n = toInt(item.Premiered)
    if (n != null && n > 1000) return n
    const y = String(item.Premiered).match(/\d{4}/)?.[0]
    if (y) return parseInt(y, 10)
  }
  const aired = asStr(item.Aired)
  if (aired) {
    const y = aired.match(/\d{4}/)?.[0]
    if (y) return parseInt(y, 10)
  }
  return null
}
function imagesFromUrl(pic: string | null): AnimeSummary['images'] {
  const u = pic ?? ''
  return {
    jpg: {
      image_url: u,
      small_image_url: u,
      large_image_url: u,
    },
    webp: {
      image_url: u,
      small_image_url: u,
      large_image_url: u,
    },
  }
}
const GENERICRE_CAP: Record<string, string> = {
  harem: 'Harem', 'isekai': 'Isekai', 'mecha': 'Mecha', 'slg': 'SLG',
  'tragedy': 'Tragedy', 'work': 'Work',
}
/* Canonicalise slug → display name (`sci-fi` → `Sci-Fi`) for Jikan `name` fields. */
function genreDisplay(s: string): string {
  const slug = String(s).toLowerCase().trim()
  if (!slug) return ''
  if (GENERICRE_CAP[slug]) return GENERICRE_CAP[slug]
  return slug
    .split('-')
    .map(w => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}
function genreSlug(s: string): string {
  return String(s).trim().toLowerCase().replace(/[\s_]+/g, '-')
}

/* Stable mal_id per genre name. Anime `genres[]` and the `getGenres()`
 * catalog list share these ids so `?genres=<id>` catalog filters resolve
 * consistently and the detail-page genre chips deep-link to the same filter
 * state that produced the card. */
const genreMalIdByName = new Map<string, number>()
let NEXT_GENRE_ID = 0

/* The flat Jikan genre list the app can offer. AniPub has no standalone
 * genre endpoint, so this is the union of names we've seen live across
 * anime + a sane base set. mal_ids are assigned here (1-based) and seeded
 * into the shared id map. */
const DEFAULT_GENRE_NAMES: string[] = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Martial Arts', 'Mecha',
  'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life',
  'Sports', 'Supernatural', 'Thriller',
  'Seinen', 'Shounen', 'Ecchi', 'Hentai', 'Horror', 'Historical', 'Parody',
  'Gore', 'Isekai',
]
const DEFAULT_GENRES: JikanGenre[] = Array.from(
  new Map(DEFAULT_GENRE_NAMES.map((n) => [genreSlug(n), genreDisplay(genreSlug(n))])).values(),
).map((name, i) => {
  const mal_id = i + 1
  genreMalIdByName.set(name, mal_id)      // shared with buildGenres()
  NEXT_GENRE_ID = Math.max(NEXT_GENRE_ID, mal_id)
  return { mal_id, name, url: `/genres/${genreSlug(name)}` }
})

/* ---- list-result helpers ------------------------------------------------ */
function listFromResp(r: unknown): APBase[] {
  const o = r as APListResp | APBase[] | null | undefined
  if (Array.isArray(o)) return o as APBase[]
  if (o && typeof o === 'object') {
    const a = Array.isArray(o.AniData) ? o.AniData : Array.isArray(o.wholePage) ? o.wholePage : null
    if (a) return a as APBase[]
  }
  return []
}
/** Slice one page out of an in-memory results array. */
function paginate<T>(entries: T[], page: number, limit: number): Paginated<T> {
  const per = Math.max(1, Math.floor(limit) || 24)
  const total = entries.length
  const lastPage = Math.max(1, Math.ceil(total / per))
  const safePage = Math.max(1, Math.min(Math.floor(page) || 1, lastPage))
  const start = (safePage - 1) * per
  return {
    data: entries.slice(start, start + per),
    pagination: {
      last_visible_page: lastPage,
      has_next_page: safePage < lastPage,
      current_page: safePage,
      items: { count: Math.min(per, Math.max(0, total - start)), total, per_page: per },
    },
  }
}

/* ============================================================================
 * Queue / throttle
 *
 * AniPub's documented rate limit is roughly 1 request / 30s (an early probe
 * hit 429s within a burst). We serialise every network call through one queue
 * and make sure two actually-dispatched requests are at least 32s apart. The
 * app fires only a handful of requests per page visit, so a generous interval
 * keeps us far from 429 territory without hurting UX. Callers can pass an
 * AbortSignal to cancel an in-flight request; aborts never poison the queue.
 * ========================================================================== */
const ANIPUB_MIN_INTERVAL = 32_000 // ms between two actually-dispatched requests
let lastRequestAt = 0
let chain: Promise<unknown> = Promise.resolve()

function sleep(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms))
}

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const next = chain.then(async () => {
    const wait = lastRequestAt + ANIPUB_MIN_INTERVAL - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
    return work()
  })
  // A rejection inside work must not break subsequent queued entries.
  chain = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

/* ============================================================================
 * Cache
 *
 * Two-layer: in-memory (this tab) + localStorage (across tabs/refreshes).
 * Only successful (HTTP 2xx) bodies are cached; failures are never cached
 * so a transient 429 can always be retried fresh on the next call.
 * ========================================================================== */
const CACHE_KEY_PREFIX = 'anipub:v1:'
const MEMORY = new Map<string, { at: number; body: unknown }>()

function cacheGet(key: string, ttlMs: number): unknown | undefined {
  const now = Date.now()
  const mem = MEMORY.get(key)
  if (mem && now - mem.at < ttlMs) return mem.body
  try {
    const raw = window.localStorage.getItem(CACHE_KEY_PREFIX + key)
    if (raw) {
      const parsed = JSON.parse(raw) as { at: number; body: unknown }
      if (now - parsed.at < ttlMs) return parsed.body
    }
  } catch {
    /* localStorage unavailable; ignore */
  }
  return undefined
}

function cacheSet(key: string, body: unknown): void {
  const entry = { at: Date.now(), body }
  MEMORY.set(key, entry)
  try {
    window.localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify(entry))
  } catch {
    /* quota / blocked storage; ignore */
  }
}

/** List endpoints (search/top/ratings/genre/upcoming) live longer. */
const TTL_LIST = 10 * 60 * 1000
/** Detail payloads are refreshed a bit more aggressively. */
const TTL_DETAIL = 5 * 60 * 1000

const RETRY_ATTEMPTS = 3

function backoffMs(attempt: number): number {
  return Math.min(30_000, 10_000 * Math.pow(2.5, attempt))
}

async function httpGet(
  path: string,
  opts: { ttlMs?: number; signal?: AbortSignal; noCache?: boolean } = {},
): Promise<unknown> {
  const ttl = opts.ttlMs ?? TTL_LIST
  if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (!opts.noCache) {
    const hit = cacheGet(path, ttl)
    if (hit !== undefined) return hit
  }
  return enqueue(async () => {
    let attempt = 0
    for (;;) {
      if (attempt >= RETRY_ATTEMPTS)
        throw new Error(`AniPub: request to ${path} failed after ${RETRY_ATTEMPTS} attempts`)
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      let res: Response
      try {
        res = await fetch(BASE + path, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: opts.signal,
          cache: 'no-store',
        })
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err
        attempt++
        await sleep(backoffMs(attempt))
        continue
      }
      if (res.ok) {
        const body = await res.json()
        cacheSet(path, body)
        return body
      }
      const retryable = res.status === 429 || res.status >= 500
      if (!retryable) throw new Error(`AniPub: ${res.status} on ${path}`)
      const retryAfter = res.headers.get('Retry-After')
      const retryMs = retryAfter ? Number(retryAfter) * 1000 : 0
      attempt++
      await sleep(Math.max(Number.isFinite(retryMs) && retryMs > 0 ? retryMs : 0, backoffMs(attempt)))
    }
  })
}

/* ============================================================================
 * Mappers — AniPub (loose, inconsistent JSON)  →  Jikan-shaped `types.ts`
 *
 * Everything a page renders goes through these so the rest of the app keeps
 * working with a single, predictable shape. Fields AniPub doesn't provide are
 * coerced to `null` / empty rather than guessed.
 * ========================================================================== */
const pad2 = (n: number): string => String(n).padStart(2, '0')

/** Poster (card) — AniPub `ImagePath` is the poster; `Cover` is the key-art banner. */
function posterOf(item: APBase): string {
  return resolvePic(item.ImagePath) || resolvePic(item.Cover) || ''
}
/** Key-art / banner (hero background) when available. */
function bannerOf(item: APBase): string | null {
  return resolvePic(item.Banner) || (asStr(item.Cover) ? resolvePic(item.Cover) : null)
}

/** AniPub gives a single canonical name (no EN/JP split). Use it everywhere. */
function nameOf(item: APBase): string {
  return asStr(item.Name) ?? ''
}

/** Jikan-ish stable `mal_id` — AniPub's numeric id is used as-is. */
function idOf(item: APBase): number {
  return toInt(item._id) ?? 0
}

/** Get-or-assign a stable mal_id for a genre name. Used by `buildGenres()`. */
function genreMalId(name: string): number {
  const hit = genreMalIdByName.get(name)
  if (hit != null) return hit
  const id = ++NEXT_GENRE_ID
  genreMalIdByName.set(name, id)
  return id
}

/** Map AniPub free-form status to the Jikan `status` string the UI
 *  expects ("Currently Airing" / "Finished Airing" / "Not yet aired" /
 *  "Cancelled"). Anything else passes through unchanged. */
function mapStatus(status: string | null | undefined): { status: string | null; airing: boolean } {
  const s = (status ?? '').toLowerCase()
  if (!s) return { status: null, airing: false }
  if (/releas|airing|ongoing|on.?air|currently/.test(s)) return { status: 'Currently Airing', airing: true }
  if (/finish|completed|complete/.test(s)) return { status: 'Finished Airing', airing: false }
  if (/upcoming|not.?yet|announc/.test(s)) return { status: 'Not yet aired', airing: false }
  if (/cancel/.test(s)) return { status: 'Cancelled', airing: false }
  return { status: status ?? null, airing: false }
}

/** AniPub `Aired` is a human string ("Feb 15, 2007 to Mar 23, 2017"). */
function parseAiredRange(str: string | null | undefined) {
  if (!str) return null
  const MONTH: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  }
  const tokens = str.split(/\s+to\s+/i)
  const parseOne = (t: string): { day: number | null; month: number | null; year: number | null } => {
    const year = t.match(/(19|20)\d{2}/)?.[0] ? parseInt(t.match(/(19|20)\d{2}/)![0], 10) : null
    const m = t.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i)
    const month = m ? MONTH[m[1].slice(0, 3).toLowerCase()] : null
    const day = t.match(/\b\d{1,2}\b/)?.[0] ? parseInt(t.match(/\b\d{1,2}\b/)![0], 10) : null
    return { day, month, year }
  }
  const from = parseOne(tokens[0] ?? '')
  const to = tokens.length > 1 ? parseOne(tokens[1]) : null
  const iso = (d: { day: number | null; month: number | null; year: number | null } | null) =>
    d?.year ? `${d.year}-${pad2(d.month ?? 1)}-${pad2(d.day ?? 1)}` : null
  return { from: iso(from), to: iso(to), prop: { from, to: to ?? { day: null, month: null, year: null } }, raw: str }
}

function buildAired(item: APBase): JikanAired {
  const parsed = parseAiredRange(item.Aired)
  const empty: JikanAired = {
    from: null, to: null, string: '',
    prop: { from: { day: null, month: null, year: null }, to: { day: null, month: null, year: null } },
  }
  if (parsed) return {
    from: parsed.from, to: parsed.to, string: parsed.raw, prop: parsed.prop,
  }
  // Fall back to just the premiere year, if any.
  const year = deriveAired(item)
  if (year) return {
    from: null, to: null, string: String(year),
    prop: { from: { day: null, month: null, year }, to: { day: null, month: null, year: null } },
  }
  return empty
}

function buildGenres(item: APBase): JikanGenre[] {
  return parseList(item.Genres).map((slug) => {
    const name = genreDisplay(slug)
    return { mal_id: genreMalId(name), name, url: `/genres/${genreSlug(name)}` }
  }).filter((g) => g.name)
}

function buildStudios(item: APBase): JikanStudio[] {
  const list = parseList(item.Studios)
  return list.map((name, i) => ({ mal_id: i + 1, name, type: 'studio' }))
}

function buildProducers(item: APBase): JikanStudio[] {
  const list = parseList(item.Producers)
  return list.map((name, i) => ({ mal_id: i + 1, name, type: 'producer' }))
}

/* ---------------- AniPub → Jikan mappers ---------------- */

function buildTitles(item: APBase): {
  title: string
  title_english: string | null
  title_japanese: string | null
  titles: JikanTitle[]
} {
  const romaji = asStr(item.Romaji) || asStr(item.Name) || asStr(item.English) || 'Unknown'
  const english = asStr(item.English) || (asStr(item.Name) && asStr(item.Name) !== romaji ? asStr(item.Name) : null)
  const japanese = asStr(item.Name)
  const hasKana = (s: string | null): boolean => !!(s && /[\u3040-\u30ff\u4e00-\u9fff]/.test(s))
  return {
    title: romaji,
    title_english: english && english !== romaji ? english : null,
    title_japanese: hasKana(japanese) ? japanese : null,
    titles: [
      { type: 'Default', title: romaji },
      ...(english && english !== romaji ? [{ type: 'English', title: english }] : []),
      ...(hasKana(japanese) && japanese && japanese !== romaji ? [{ type: 'Japanese', title: japanese! }] : []),
    ].slice(0, 5) as JikanTitle[],
  }
}

function buildDescription(item: APBase): string | null {
  const desc = asStr(item.Desc) || asStr(item.Summary) || null
  if (!desc) return null
  return desc.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim() || null
}

function seasonAndYear(item: APBase): { season: string | null; year: number | null } {
  const year = deriveAired(item)
  const month = parseAiredRange(item.Aired)?.prop.from.month ?? null
  if (month == null) return { season: null, year }
  if (month <= 3) return { season: 'winter', year }
  if (month <= 6) return { season: 'spring', year }
  if (month <= 9) return { season: 'summer', year }
  return { season: 'fall', year }
}

function toSummary(item: APBase): AnimeSummary {
  const img = posterOf(item)
  const banner = bannerOf(item)
  const { title, title_english, title_japanese, titles } = buildTitles(item)
  const { status, airing } = mapStatus(item.Status)
  const { season, year } = seasonAndYear(item)
  const score = toScore(item.Score)
  const durationMin = toInt(item.Duration)
  const durationStr = durationMin && durationMin > 0 ? `${durationMin} min` : (asStr(item.Rating) ?? '')
  return {
    mal_id: idOf(item),
    url: `/anime/${idOf(item)}`,
    images: imagesFromUrl(img),
    approved: true,
    titles,
    title,
    title_english,
    title_japanese,
    type: asStr(item.Type) || null,
    format: asStr(item.Type) ?? null,
    source: asStr(item.Source) || 'Unknown',
    episodes: toInt(item.EpisodeCount) ?? toInt(item.Ep),
    status,
    airing,
    aired: buildAired(item),
    duration: durationStr,
    rating: asStr(item.Rating),
    score,
    scored_by: toInt(item.Scoring) ?? null,
    rank: toInt(item.Rank),
    popularity: null,
    members: null,
    favorites: toInt(item.Favorite) ?? null,
    synopsis: buildDescription(item),
    season,
    year,
    studios: buildStudios(item),
    genres: buildGenres(item),
    themes: [],
    demographics: [],
    bannerImage: banner,
    nextAiringEpisode: null,
  }
}

/* ---------------- AniPub → Jikan mappers (detail / episodes) ---------------- */

function toDetail(item: APBase): AnimeDetail {
  const summary = toSummary(item)
  const synonyms = parseList(item.Synonyms)
  const explicit = ['r', 'r+', 'rx', '17+', '18+', 'hentai'].includes((summary.rating ?? '').toLowerCase())
  return {
    ...summary,
    title_synonyms: synonyms,
    background: summary.synopsis,
    trailer: { youtube_id: null, url: null, embed_url: null },
    producers: buildProducers(item),
    licensors: [],
    explicit,
    broadcast: { day: null, time: null, timezone: null, string: null },
  }
}

function toEpisodes(item: APBase, page: number): Paginated<Episode> {
  const perPage = 50
  const total = toInt(item.epCount) ?? 0
  const safePage = Math.max(1, page)
  const startIdx = (safePage - 1) * perPage
  const endIdx = Math.min(startIdx + perPage, total)
  const data: Episode[] = []
  for (let n = startIdx + 1; n <= endIdx; n++) {
    data.push({
      mal_id: n,
      title: null,
      title_japanese: null,
      title_romanji: null,
      aired: null,
      score: null,
      filler: false,
      recap: false,
      forum_url: null,
      url: null,
      upcoming: false,
    })
  }
  const lastPage = Math.max(1, Math.ceil(total / perPage))
  return {
    data,
    pagination: {
      last_visible_page: lastPage,
      has_next_page: safePage < lastPage,
      current_page: safePage,
      items: { count: data.length, total, per_page: perPage },
    },
  }
}

/* ============================================================================
 * Public Types & Utilities (drop-in replacements for anilist.ts exports)
 * ========================================================================== */

export interface AnimeSuggestion {
  id: number
  title: string
  coverImage: string
  format: string | null
  averageScore: number | null
}

export interface ListParams {
  q?: string
  page?: number
  limit?: number
  order_by?: string
  sort?: 'asc' | 'desc'
  type?: string
  status?: string
  rating?: string
  genres?: string
  genre?: string
  tags?: string
  min_score?: number
  max_score?: number
  start_date?: string
  end_date?: string
  sfw?: boolean
  letter?: string
  verify_pagination?: boolean
  /** AniList season, e.g. 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL'. */
  season?: string
  /** Calendar year (4-digit). Paired with `season` to narrow a specific season. */
  season_year?: number
}

export interface UpcomingAnime {
  id: number
  /** Best available title (english → romaji → native). */
  title: string
  /** Large poster URL (may be null for unreleased titles). */
  coverImage: string | null
  /** e.g. "WINTER", or null when an exact season hasn't been set. */
  season: string | null
  seasonYear: number | null
}

export function currentSeason(): { season: string; year: number } {
  const now = new Date()
  const month = now.getMonth()
  const year = now.getFullYear()
  let season: string
  if (month <= 1 || month === 11) season = 'WINTER'
  else if (month <= 4) season = 'SPRING'
  else if (month <= 7) season = 'SUMMER'
  else season = 'FALL'
  return { season, year }
}

/* ============================================================================
 * Public API — drop-in replacement for the `anilist` object (anilist.ts)
 * ========================================================================== */

const enc = (s: string): string => encodeURIComponent(s)

/** Fetch a full AniPub detail object by numeric id. */
async function detailOf(id: number, signal?: AbortSignal): Promise<APBase> {
  const raw = await httpGet(`/api/info/${id}`, { ttlMs: TTL_DETAIL, signal })
  return raw as APBase
}

/** Alias for the list-shape normaliser used throughout the public API. */
function toList(raw: unknown): APBase[] {
  return listFromResp(raw)
}

export const anilist = {
  /* ---- search / catalog --------------------------------------------------- */

  searchAnime(
    params: ListParams = {},
    signal?: AbortSignal,
  ): Promise<Paginated<AnimeSummary>> {
    const { q, genre, min_score, page, limit } = params
    const limitVal = limit ?? 24
    const pageVal = page ?? 1
    // Route to the AniPub endpoint best matching the filter type:
    //   free-text   → /api/searchall/:name
    //   genre       → /api/findbyGenre/:slug  (primary genre only)
    //   score-based → /api/findbyrating[?min_score=]
    let path: string
    if (q && q.trim()) {
      path = `/api/searchall/${enc(q.trim())}`
    } else if (genre && genre.trim()) {
      const slugs = genre
        .split(',')
        .map((s) => genreSlug(s.trim()))
        .filter(Boolean)
      path = slugs.length > 0 ? `/api/findbyGenre/${enc(slugs[0])}` : '/api/findbyrating'
    } else {
      path = '/api/findbyrating'
      if (min_score != null && min_score > 0) path += `?min_score=${min_score}`
    }
    return httpGet(path, { signal }).then(
      (raw) => paginate(toList(raw).map(toSummary), pageVal, limitVal),
    )
  },

  searchSuggestions(search: string, signal?: AbortSignal): Promise<AnimeSuggestion[]> {
    const q = search.trim()
    if (!q) return Promise.resolve([])
    // /api/search/:name returns lightweight items with no score → null
    return httpGet(`/api/search/${enc(q)}`, { ttlMs: 60_000, signal }).then(
      (raw): AnimeSuggestion[] => {
        const arr = Array.isArray(raw) ? (raw as APSearchHit[]) : []
        return arr.slice(0, 10).map((h) => ({
          id: h.Id ?? 0,
          title: h.Name ?? '',
          coverImage: resolvePic(h.Image) ?? '',
          format: h.finder ?? null,
          averageScore: null,
        }))
      },
    )
  },

  /* ---- single-title lookups ---------------------------------------------- */

  getAnime(id: number, signal?: AbortSignal): Promise<{ data: AnimeDetail }> {
    return detailOf(id, signal).then((item) => ({ data: toDetail(item) }))
  },

  getAnimeLite(id: number, signal?: AbortSignal): Promise<{ data: AnimeSummary }> {
    return detailOf(id, signal).then((item) => ({ data: toSummary(item) }))
  },

  getEpisodes(id: number, page = 1, signal?: AbortSignal): Promise<Paginated<Episode>> {
    // AniPub provides the total episode count (epCount) but no per-episode
    // metadata; toEpisodes() generates placeholder rows accordingly.
    return detailOf(id, signal).then((item) => toEpisodes(item, page))
  },

  /* ---- relations / recommendations ---------------------------------------- */

  getRelations(id: number, signal?: AbortSignal): Promise<SimpleList<JikanRelation>> {
    // AniPub has no relations endpoint. Best-effort fallback: resolve the
    // title's primary genre, then list same-genre peers as a "Similar" group.
    return detailOf(id, signal)
      .then((item) => {
        const slugs = parseList(item.Genres).map(genreSlug)
        if (slugs.length === 0) return { data: [] as JikanRelation[] }
        return httpGet(`/api/findbyGenre/${enc(slugs[0])}`, { signal }).then(
          (raw) => {
            const peers: JikanRelationEntry[] = toList(raw)
              .filter((p) => p._id !== item._id)
              .slice(0, 20)
              .map((p) => ({
                mal_id: idOf(p),
                url: `/anime/${idOf(p)}`,
                images: imagesFromUrl(posterOf(p)),
                name: nameOf(p),
              }))
            return { data: [{ relation: 'Similar', entry: peers }] as JikanRelation[] }
          },
        )
      })
      .catch(() => ({ data: [] as JikanRelation[] }))
  },

  getRecommendations(
    id: number,
    signal?: AbortSignal,
  ): Promise<SimpleList<{ entry: AnimeSummary }>> {
    // Same-genre peers as a standalone recommendation feed.
    return detailOf(id, signal)
      .then((item) => {
        const slugs = parseList(item.Genres).map(genreSlug)
        if (slugs.length === 0) return { data: [] as { entry: AnimeSummary }[] }
        return httpGet(`/api/findbyGenre/${enc(slugs[0])}`, { signal }).then(
          (raw) => {
            const peers = toList(raw)
              .filter((p) => p._id !== item._id)
              .slice(0, 12)
              .map(toSummary)
            return { data: peers.map((entry) => ({ entry })) }
          },
        )
      })
      .catch(() => ({ data: [] as { entry: AnimeSummary }[] }))
  },

  /* ---- list / season endpoints ------------------------------------------ */

  getTopAnime(
    filter: 'airing' | 'upcoming' | 'bypopularity' | 'favorite' = 'bypopularity',
    page = 1,
    signal?: AbortSignal,
  ): Promise<Paginated<AnimeSummary>> {
    // /findbyrating is the only ranked list in AniPub. Narrow by status where
    // the filter calls for it; bypopularity/favorite return the full list.
    return httpGet('/api/findbyrating', { signal }).then((raw) => {
      const all = toList(raw).map(toSummary)
      const narrowed =
        filter === 'airing'
          ? all.filter((a) => a.airing)
          : filter === 'upcoming'
            ? all.filter((a) => a.status === 'Not yet aired')
            : all
      return paginate(narrowed, page, 24)
    })
  },

  getSeasonNow(page = 1, signal?: AbortSignal): Promise<Paginated<AnimeSummary>> {
    // AniPub has no explicit season filter. Approximate "this season" as
    // currently-airing titles that premiered in the current calendar year.
    const { year } = currentSeason()
    return httpGet('/api/findbyrating', { signal }).then((raw) => {
      const matching = toList(raw)
        .map(toSummary)
        .filter((a) => a.airing && (a.year ?? 0) === year)
      return paginate(matching, page, 24)
    })
  },

  /**
   * AniPub has no airing-schedule endpoint → always resolves to an empty
   * list. The Schedule page handles the empty state gracefully.
   */
  getSchedule(
    _day?: string,
    _signal?: AbortSignal,
    _range?: { start: number; end: number },
  ): Promise<SimpleList<ScheduleEntry>> {
    return Promise.resolve({ data: [] as ScheduleEntry[] })
  },

  getUpcoming(limit = 10, signal?: AbortSignal): Promise<SimpleList<UpcomingAnime>> {
    // /api/getlast returns the numeric id of the most recently added title.
    // Resolve it into a single-entry "newly added" rail; empty on error.
    return httpGet('/api/getlast', { signal }).then(async (raw) => {
      const lastId = toInt(raw)
      if (lastId == null || lastId <= 0) return { data: [] as UpcomingAnime[] }
      try {
        const item = await detailOf(lastId, signal)
        const s = toSummary(item)
        const entry: UpcomingAnime = {
          id: s.mal_id,
          title: s.title,
          coverImage: s.images.jpg.image_url || null,
          season: s.season,
          seasonYear: s.year,
        }
        return { data: [entry].slice(0, limit) }
      } catch {
        return { data: [] as UpcomingAnime[] }
      }
    })
  },

  getGenres(_signal?: AbortSignal): Promise<SimpleList<Genre>> {
    return Promise.resolve({ data: DEFAULT_GENRES })
  },
}

/* ============================================================================
 * AnimeMeta / fetchAnimeMetadata
 * Drop-in replacement for the equivalent exports in anilist.ts.
 * ========================================================================== */

export interface AnimeMeta {
  id: number
  title: string
  coverImage: string | null
}

/** Per-tab in-memory cache so the same id is never re-fetched. */
const metaCache = new Map<number, AnimeMeta>()

/**
 * Batch-resolve AniPub ids into lightweight display summaries
 * (id + best title + large cover). Used by the profile list views.
 *
 * - De-duplicates input and drops non-positive / non-integer ids.
 * - Returns `[]` for empty input.
 * - Never throws: a blocked / failed request for a single id degrades to an
 *   empty entry so the caller can fall back to its `#<id>` labels.
 */
export async function fetchAnimeMetadata(
  idList: number[],
  signal?: AbortSignal,
): Promise<AnimeMeta[] | null> {
  const ids = [
    ...new Set(idList.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)),
  ]
  if (ids.length === 0) return []
  const result: AnimeMeta[] = []
  for (const id of ids) {
    const cached = metaCache.get(id)
    if (cached) {
      result.push(cached)
      continue
    }
    try {
      const item = await detailOf(id, signal)
      const meta: AnimeMeta = {
        id,
        title: nameOf(item),
        coverImage: posterOf(item) || null,
      }
      metaCache.set(id, meta)
      result.push(meta)
    } catch {
      // Degrade to an empty entry; caller knows how to show "#<id>"
      result.push({ id, title: '', coverImage: null })
    }
  }
  return result
}