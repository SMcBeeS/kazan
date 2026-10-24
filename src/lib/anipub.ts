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
  Paginated,
  ScheduleEntry,
  SimpleList,
} from './types'

const BASE = 'https://anipub.org'

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
  opts: { ttlMs: number; signal?: AbortSignal; noCache?: boolean } = { ttlMs: TTL_LIST },
): Promise<unknown> {
  if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (!opts.noCache) {
    const hit = cacheGet(path, opts.ttlMs)
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

/** AniPub URLs for detail/search use the `finder` slug. */
function detailUrl(item: APBase): string {
  const slug = asStr(item.finder)
  if (!slug) return ''
  return `https://anipub.org/details/${slug}`
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
  return { status: status, airing: false }
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
  const month = parseAiredRange(item.Aired)?.from.month ?? null
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
    mal_id: item.Id,
    url: `/anime/${item.Id}`,
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