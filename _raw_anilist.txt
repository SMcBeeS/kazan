/**
 * anilist.ts — GraphQL client for the official AniList API (https://anilist.co).
 */

import type {
  AnimeDetail,
  AnimeSummary,
  Episode,
  Genre,
  JikanAired,
  JikanAiredDate,
  JikanImage,
  JikanRelation,
  JikanRelationEntry,
  JikanStudio,
  JikanTrailer,
  Paginated,
  ScheduleEntry,
  SimpleList,
} from './types'

const BASE_URL = 'https://graphql.anilist.co'

const TTL = {
  default: 30 * 60 * 1000, // 30 minutes
  genres: 24 * 60 * 60 * 1000, // 24 hours
  season: 60 * 60 * 1000, // 60 minutes
}

const MIN_INTERVAL = 350
const MAX_RETRIES = 3

export class AniListError extends Error {
  status: number
  constructor(message: string, status = 0) {
    super(message)
    this.name = 'AniListError'
    this.status = status
  }
}

/* ------------------------------- throttling ------------------------------ */

let lastRequestAt = 0
const queue: Array<() => void> = []
let draining = false

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function drain() {
  if (draining) return
  draining = true
  while (queue.length > 0) {
    const now = Date.now()
    const wait = Math.max(0, MIN_INTERVAL - (now - lastRequestAt))
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
    const next = queue.shift()
    next?.()
  }
  draining = false
}

function schedule<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push(() => {
      task().then(resolve, reject)
    })
    void drain()
  })
}

/* --------------------- persistent localStorage caching ------------------- */

interface CacheEntry {
  value: unknown
  expires: number
}

const memoryCache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<unknown>>()

function readStorage(key: string, allowStale = false): unknown | undefined {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as CacheEntry
    if (!allowStale && Date.now() > parsed.expires) {
      return undefined
    }
    return parsed.value
  } catch {
    return undefined
  }
}

function writeStorage(key: string, value: unknown, ttl: number) {
  try {
    const entry: CacheEntry = { value, expires: Date.now() + ttl }
    localStorage.setItem(key, JSON.stringify(entry))
  } catch {
    /* non-fatal */
  }
}

function cacheGet<T>(key: string, allowStale = false): T | undefined {
  const mem = memoryCache.get(key)
  if (mem && (allowStale || Date.now() < mem.expires)) return mem.value as T
  const stored = readStorage(key, allowStale)
  if (stored !== undefined) {
    memoryCache.set(key, { value: stored, expires: Date.now() + TTL.default })
    return stored as T
  }
  return undefined
}

function cacheSet<T>(key: string, value: T, ttl: number) {
  memoryCache.set(key, { value, expires: Date.now() + ttl })
  writeStorage(key, value, ttl)
}

/* -------------------------------- requests ------------------------------- */

interface GqlOptions {
  variables?: Record<string, unknown>
  ttl?: number
  signal?: AbortSignal
}

function friendlyNetworkMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') return 'aborted'
  return 'Could not reach AniList right now. Please try again in a moment.'
}

async function gql<T>(query: string, opts: GqlOptions = {}): Promise<T> {
  const { variables, ttl = TTL.default, signal } = opts

  let hash = 0x811c9dc5
  const rawKey = `${query}::${JSON.stringify(variables ?? {})}`
  for (let i = 0; i < rawKey.length; i++) {
    hash ^= rawKey.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  const cacheKey = `kazan_cache_${(hash >>> 0).toString(36)}`

  const cached = cacheGet<T>(cacheKey, false)
  if (cached !== undefined) return cached

  const existing = inflight.get(cacheKey)
  if (existing) return existing as Promise<T>

  const requestPromise = (async (): Promise<T> => {
    let attempt = 0
    while (true) {
      try {
        return await schedule(async () => {
          const res = await fetch(BASE_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({ query, variables }),
            signal,
          })
          if (res.status === 429) throw new AniListError('rate-limited', 429)
          if (!res.ok) throw new AniListError(`AniList responded with ${res.status}`, res.status)
          const json = (await res.json()) as { data?: T; errors?: { message: string }[] }
          if (json.errors && json.errors.length > 0) {
            throw new AniListError(json.errors[0]?.message ?? 'GraphQL error', res.status)
          }
          if (!json.data) throw new AniListError('Empty response', res.status)
          cacheSet(cacheKey, json.data, ttl)
          return json.data
        })
      } catch (err) {
        if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          throw new AniListError('aborted', 0)
        }
        const status = err instanceof AniListError ? err.status : 0
        attempt += 1

        const retryable = status === 0 || status === 429 || (status >= 500 && status < 600)
        if (retryable && attempt <= MAX_RETRIES) {
          await sleep(1200 * attempt)
          continue
        }

        const stale = cacheGet<T>(cacheKey, true)
        if (stale !== undefined) return stale

        if (err instanceof AniListError) throw err
        throw new AniListError(friendlyNetworkMessage(err), 0)
      }
    }
  })()

  inflight.set(cacheKey, requestPromise)
  try {
    return await requestPromise
  } finally {
    inflight.delete(cacheKey)
  }
}

/* ------------------------------ AniList raw ------------------------------ */

interface AniListFuzzyDate {
  year: number | null
  month: number | null
  day: number | null
}

interface AniListCoverImage {
  extraLarge: string | null
  large: string | null
  medium: string | null
  color: string | null
}

interface AniListTitle {
  romaji: string | null
  english: string | null
  native: string | null
}

interface AniListTrailerRaw {
  id: string | null
  site: string | null
  thumbnail: string | null
}

interface AniListRanking {
  rank: number
  type: string
  allTime: boolean
  context: string
}

interface AniListNextAiringEpisode {
  episode: number
  airingAt: number
}

interface AniListMedia {
  id: number
  idMal: number | null
  title: AniListTitle
  description: string | null
  coverImage: AniListCoverImage
  bannerImage: string | null
  averageScore: number | null
  meanScore: number | null
  episodes: number | null
  duration: number | null
  status: string | null
  format: string | null
  season: string | null
  seasonYear: number | null
  genres: string[] | null
  popularity: number | null
  favourites: number | null
  isAdult: boolean | null
  siteUrl: string | null
  source: string | null
  startDate: AniListFuzzyDate
  endDate: AniListFuzzyDate
  synonyms: string[] | null
  trailer: AniListTrailerRaw | null
  studios: { nodes: { id: number; name: string }[] }
  rankings: AniListRanking[]
  nextAiringEpisode: AniListNextAiringEpisode | null
}

interface AniListRelationsNode {
  id: number
  siteUrl: string | null
  format: string | null
  coverImage: AniListCoverImage
  title: AniListTitle
}

interface PageInfo {
  total: number
  currentPage: number
  lastPage: number
  hasNextPage: boolean
  perPage: number
}

const MEDIA_CORE_FIELDS = `
  id
  idMal
  title { romaji english native }
  description(asHtml: false)
  coverImage { extraLarge large medium color }
  bannerImage
  averageScore
  meanScore
  episodes
  duration
  status
  format
  season
  seasonYear
  genres
  popularity
  favourites
  isAdult
  siteUrl
  source
  startDate { year month day }
  endDate { year month day }
  synonyms
  trailer { id site thumbnail }
  studios(isMain: true) { nodes { id name } }
  rankings { rank type allTime context }
  nextAiringEpisode { episode airingAt }
`

const KNOWN_GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Hentai',
  'Horror',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
]

const genreIdByName = new Map<string, number>()
const genreNameById = new Map<number, string>()
KNOWN_GENRES.forEach((name, i) => {
  const id = i + 1
  genreIdByName.set(name, id)
  genreNameById.set(id, name)
})
let nextGenreId = KNOWN_GENRES.length + 1

function genreId(name: string): number {
  const existing = genreIdByName.get(name)
  if (existing != null) return existing
  const id = nextGenreId++
  genreIdByName.set(name, id)
  genreNameById.set(id, name)
  return id
}

function genreName(id: number): string | null {
  return genreNameById.get(id) ?? null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const pad2 = (n: number): string => String(n).padStart(2, '0')

function fuzzyToIso(d?: AniListFuzzyDate | null): string | null {
  if (!d || !d.year) return null
  return `${d.year}-${pad2(d.month ?? 1)}-${pad2(d.day ?? 1)}`
}

function fuzzyToString(d?: AniListFuzzyDate | null): string {
  if (!d || !d.year) return ''
  const month = d.month ? MONTHS[d.month - 1] : ''
  if (month && d.day) return `${month} ${d.day}, ${d.year}`
  if (month) return `${month} ${d.year}`
  return String(d.year)
}

function mapAired(start?: AniListFuzzyDate | null, end?: AniListFuzzyDate | null): JikanAired {
  const fromStr = fuzzyToString(start)
  const toStr = fuzzyToString(end)
  let string: string
  if (fromStr && toStr) string = `${fromStr} to ${toStr}`
  else if (fromStr) string = `${fromStr} to ?`
  else string = toStr || '—'
  const toProp = (d?: AniListFuzzyDate | null): JikanAiredDate => ({
    day: d?.day ?? null,
    month: d?.month ?? null,
    year: d?.year ?? null,
  })
  return {
    from: fuzzyToIso(start),
    to: fuzzyToIso(end),
    string,
    prop: { from: toProp(start), to: toProp(end) },
  }
}

function mapStatus(status?: string | null): string | null {
  switch (status) {
    case 'RELEASING':
      return 'Currently Airing'
    case 'FINISHED':
      return 'Finished Airing'
    case 'NOT_YET_RELEASED':
      return 'Not yet aired'
    case 'CANCELLED':
      return 'Cancelled'
    case 'HIATUS':
      return 'On Hiatus'
    default:
      return status ?? null
  }
}

function humanizeEnum(value?: string | null): string {
  if (!value) return ''
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function cleanDescription(html?: string | null): string | null {
  if (!html) return null
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text || null
}

function coverImageToJikanImage(cover: AniListCoverImage): JikanImage {
  return {
    image_url: cover.large || cover.medium || '',
    small_image_url: cover.medium || cover.large || '',
    large_image_url: cover.extraLarge || cover.large || '',
  }
}

function pickRank(rankings?: AniListRanking[]): number | null {
  if (!rankings || rankings.length === 0) return null
  const best = rankings.find((r) => r.type === 'RATED' && r.allTime && /highest/i.test(r.context))
  if (best) return best.rank
  const anyRated = rankings.find((r) => r.type === 'RATED')
  return anyRated?.rank ?? null
}

function mapTrailer(trailer?: AniListTrailerRaw | null): JikanTrailer {
  if (trailer && trailer.id && trailer.site === 'youtube') {
    return {
      youtube_id: trailer.id,
      url: `https://www.youtube.com/watch?v=${trailer.id}`,
      embed_url: `https://www.youtube.com/embed/${trailer.id}`,
    }
  }
  return { youtube_id: null, url: null, embed_url: null }
}

function mapStudios(media: AniListMedia): JikanStudio[] {
  return (media.studios?.nodes ?? []).map((n) => ({ mal_id: n.id, name: n.name, type: 'studio' }))
}

function mapGenres(names?: string[] | null): Genre[] {
  return (names ?? []).map((name) => ({ mal_id: genreId(name), name }))
}

function mapSummary(m: AniListMedia): AnimeSummary {
  const images = { jpg: coverImageToJikanImage(m.coverImage) }
  return {
    mal_id: m.id,
    url: m.siteUrl || `https://anilist.co/anime/${m.id}`,
    images,
    approved: true,
    title: m.title.english || m.title.romaji || m.title.native || '',
    title_english: m.title.english,
    title_japanese: m.title.native,
    type: m.format ? m.format.replace(/_/g, ' ') : null,
    format: m.format ?? null,
    source: m.source ? humanizeEnum(m.source) : '',
    episodes: m.episodes ?? null,
    status: mapStatus(m.status),
    airing: m.status === 'RELEASING',
    aired: mapAired(m.startDate, m.endDate),
    duration: m.duration ? (m.format === 'MOVIE' ? `${m.duration} min` : `${m.duration} min per ep`) : '',
    rating: m.isAdult ? 'R - 17+' : null,
    score: m.averageScore != null ? m.averageScore / 10 : null,
    scored_by: null,
    rank: pickRank(m.rankings),
    popularity: m.popularity ?? null,
    members: null,
    favorites: m.favourites ?? null,
    synopsis: cleanDescription(m.description),
    season: m.season ? m.season.toLowerCase() : null,
    year: m.seasonYear ?? null,
    bannerImage: m.bannerImage ?? null,
    nextAiringEpisode: m.nextAiringEpisode
      ? { episode: m.nextAiringEpisode.episode, airingAt: m.nextAiringEpisode.airingAt }
      : null,
    studios: mapStudios(m),
    genres: mapGenres(m.genres),
  }
}

function mapDetail(m: AniListMedia): AnimeDetail {
  return {
    ...mapSummary(m),
    title_synonyms: m.synonyms ?? [],
    background: null,
    trailer: mapTrailer(m.trailer),
    producers: [],
    licensors: [],
    explicit: Boolean(m.isAdult),
    broadcast: { day: null, time: null, timezone: null, string: null },
  }
}

function isoFromUnix(seconds?: number | null): string | null {
  if (seconds == null) return null
  return new Date(seconds * 1000).toISOString()
}

function mapRelationEdges(
  edges: { relationType: string | null; node: AniListRelationsNode }[],
): JikanRelation[] {
  const groups = new Map<string, JikanRelationEntry[]>()
  for (const edge of edges) {
    const label = humanizeEnum(edge.relationType) || 'Related'
    const node = edge.node
    const entry: JikanRelationEntry = {
      mal_id: node.id,
      url: node.siteUrl || `https://anilist.co/anime/${node.id}`,
      images: { jpg: coverImageToJikanImage(node.coverImage) },
      name: node.title.english || node.title.romaji || node.title.native || '',
    }
    const list = groups.get(label) ?? []
    list.push(entry)
    groups.set(label, list)
  }
  return Array.from(groups, ([relation, entry]) => ({ relation, entry }))
}

function toPaginated(pageInfo: PageInfo, media: AniListMedia[]): Paginated<AnimeSummary> {
  const items = media.map(mapSummary)
  return {
    data: items,
    pagination: {
      last_visible_page: pageInfo.lastPage,
      has_next_page: pageInfo.hasNextPage,
      current_page: pageInfo.currentPage,
      items: { count: items.length, total: pageInfo.total, per_page: pageInfo.perPage },
    },
  }
}

const MEDIA_BY_ID_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      ${MEDIA_CORE_FIELDS}
    }
  }
`

const SEARCH_MEDIA_SELECTION = `
    Page(page: $page, perPage: $perPage) {
      pageInfo { total currentPage lastPage hasNextPage perPage }
      media(ARGS_PLACEHOLDER) {
        ${MEDIA_CORE_FIELDS}
      }
    }
`

const PROBE_MEDIA_SELECTION = SEARCH_MEDIA_SELECTION.replace(MEDIA_CORE_FIELDS, 'id')

interface SearchFilters {
  search?: string | null
  sort?: string[] | null
  status?: string | null
  format?: string[] | null
  genre?: string[] | null
  tags?: string[] | null
  season?: string | null
  seasonYear?: number | null
  minScore?: number | null
  isAdult?: boolean | null
}

function buildSearchQuery(f: SearchFilters, selection = SEARCH_MEDIA_SELECTION): string {
  const decls: string[] = ['$page: Int', '$perPage: Int']
  const args: string[] = ['type: ANIME']
  if (f.search != null && f.search !== '') {
    decls.push('$search: String')
    args.push('search: $search')
  }
  if (f.sort != null) {
    decls.push('$sort: [MediaSort]')
    args.push('sort: $sort')
  }
  if (f.status != null) {
    decls.push('$status: MediaStatus')
    args.push('status: $status')
  }
  if (f.format != null && f.format.length > 0) {
    decls.push('$format_in: [MediaFormat]')
    args.push('format_in: $format_in')
  }
  if (f.genre != null && f.genre.length > 0) {
    decls.push('$genre_in: [String]')
    args.push('genre_in: $genre_in')
  }
  if (f.tags != null && f.tags.length > 0) {
    decls.push('$tag_in: [String]')
    args.push('tag_in: $tag_in')
  }
  if (f.season != null) {
    decls.push('$season: MediaSeason')
    args.push('season: $season')
  }
  if (f.seasonYear != null) {
    decls.push('$seasonYear: Int')
    args.push('seasonYear: $seasonYear')
  }
  if (f.minScore != null) {
    decls.push('$minScore: Int')
    args.push('averageScore_greater: $minScore')
  }
  if (f.isAdult != null) {
    decls.push('$isAdult: Boolean')
    args.push('isAdult: $isAdult')
  }
  const body = selection.replace('ARGS_PLACEHOLDER', args.join(', '))
  return `query (${decls.join(', ')}) {\n${body}\n}`
}

function searchVariables(f: SearchFilters, page: number, perPage: number): Record<string, unknown> {
  const variables: Record<string, unknown> = { page, perPage }
  if (f.search != null && f.search !== '') variables.search = f.search
  if (f.sort != null) variables.sort = f.sort
  if (f.status != null) variables.status = f.status
  if (f.format != null && f.format.length > 0) variables.format_in = f.format
  if (f.genre != null && f.genre.length > 0) variables.genre_in = f.genre
  if (f.tags != null && f.tags.length > 0) variables.tag_in = f.tags
  if (f.season != null) variables.season = f.season
  if (f.seasonYear != null) variables.seasonYear = f.seasonYear
  if (f.minScore != null) variables.minScore = f.minScore
  if (f.isAdult != null) variables.isAdult = f.isAdult
  return variables
}

const MAX_SEARCH_PAGES = 208
const MAX_PAGE_PROBES = 12

interface ProbePage {
  pageInfo: PageInfo
  count: number
}

async function probeSearchPage(
  f: SearchFilters,
  page: number,
  perPage: number,
  signal?: AbortSignal,
): Promise<ProbePage | null> {
  interface Resp {
    Page: { pageInfo: PageInfo; media: { id: number }[] }
  }
  try {
    const r = await gql<Resp>(buildSearchQuery(f, PROBE_MEDIA_SELECTION), {
      variables: searchVariables(f, page, perPage),
      ttl: 60_000,
      signal,
    })
    return { pageInfo: r.Page.pageInfo, count: (r.Page.media ?? []).length }
  } catch {
    return null
  }
}

async function resolveTruePageInfo(
  f: SearchFilters,
  page: number,
  perPage: number,
  media: unknown[],
  raw: PageInfo,
  signal?: AbortSignal,
): Promise<PageInfo> {
  const withCurrent = (info: PageInfo): PageInfo => ({ ...info, currentPage: page, perPage })

  if (media.length > 0 && !raw.hasNextPage) return raw
  if (page === 1 && media.length === 0) return raw

  let probes = 0
  const probe = async (p: number): Promise<ProbePage | null> => {
    if (probes >= MAX_PAGE_PROBES || p < 1 || p > MAX_SEARCH_PAGES) return null
    probes += 1
    return probeSearchPage(f, p, perPage, signal)
  }

  let lo: number
  let hi: number

  if (media.length > 0) {
    lo = page
    let emptyAt: number | null = null
    for (let k = page * 2; k <= MAX_SEARCH_PAGES; k *= 2) {
      const pr = await probe(k)
      if (!pr) return raw
      if (pr.count === 0) {
        emptyAt = k
        break
      }
      if (!pr.pageInfo.hasNextPage) return withCurrent(pr.pageInfo)
      lo = k
    }
    if (emptyAt === null) {
      const edge = await probe(MAX_SEARCH_PAGES)
      if (edge && edge.count > 0 && !edge.pageInfo.hasNextPage) return withCurrent(edge.pageInfo)
      return raw
    }
    hi = emptyAt
  } else {
    hi = page
    const first = await probe(1)
    if (!first) return raw
    if (first.count === 0) {
      return withCurrent({ total: 0, currentPage: page, lastPage: 1, hasNextPage: false, perPage })
    }
    if (!first.pageInfo.hasNextPage) return withCurrent(first.pageInfo)
    lo = 1
  }

  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    const pr = await probe(mid)
    if (!pr) return raw
    if (pr.count === 0) {
      hi = mid
      continue
    }
    if (!pr.pageInfo.hasNextPage) return withCurrent(pr.pageInfo)
    lo = mid
  }

  const finalPr = await probe(lo)
  const finalCount = finalPr ? finalPr.count : perPage

  return withCurrent({
    total: (lo - 1) * perPage + finalCount,
    currentPage: page,
    lastPage: lo,
    hasNextPage: lo > page,
    perPage,
  })
}

function runSearch(
  filters: SearchFilters,
  page: number,
  perPage: number,
  signal?: AbortSignal,
  ttl?: number,
  verifyPageInfo = false,
): Promise<Paginated<AnimeSummary>> {
  interface Resp {
    Page: { pageInfo: PageInfo; media: AniListMedia[] }
  }
  const query = buildSearchQuery(filters)
  const variables = searchVariables(filters, page, perPage)
  return gql<Resp>(query, { variables, ttl, signal }).then(async (r) => {
    const media = r.Page.media ?? []
    const pageInfo = verifyPageInfo
      ? await resolveTruePageInfo(filters, page, perPage, media, r.Page.pageInfo, signal)
      : r.Page.pageInfo
    return toPaginated(pageInfo, media)
  })
}

const RELATIONS_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      relations {
        edges {
          relationType(version: 2)
          node {
            id
            siteUrl
            format
            coverImage { extraLarge large medium }
            title { romaji english native }
          }
        }
      }
    }
  }
`

const RECOMMENDATIONS_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      recommendations(perPage: 12, sort: RATING_DESC) {
        nodes { mediaRecommendation { ${MEDIA_CORE_FIELDS} } }
      }
    }
  }
`

const EPISODES_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      episodes
      status
      nextAiringEpisode { episode airingAt }
      airingSchedule(notYetAired: false, perPage: 50) {
        nodes { episode airingAt }
      }
    }
  }
`

const SCHEDULE_QUERY = `
  query ($perPage: Int, $airingAtGreater: Int, $airingAtLesser: Int) {
    Page(perPage: $perPage) {
      airingSchedules(
        airingAt_greater: $airingAtGreater
        airingAt_lesser: $airingAtLesser
        sort: TIME
      ) {
        airingAt
        episode
        media { ${MEDIA_CORE_FIELDS} }
      }
    }
  }
`

const UPCOMING_QUERY = `
  query ($perPage: Int) {
    Page(page: 1, perPage: $perPage) {
      media(status: NOT_YET_RELEASED, type: ANIME, sort: [TRENDING_DESC, POPULARITY_DESC]) {
        id
        title { romaji english native }
        coverImage { large }
        season
        seasonYear
      }
    }
  }
`

interface UpcomingNode {
  id: number
  title: AniListTitle
  coverImage: { large?: string | null } | null
  season?: string | null
  seasonYear?: number | null
}
interface UpcomingResp {
  Page: { media: UpcomingNode[] | null }
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

const GENRES_QUERY = `query { GenreCollection }`

const SUGGESTIONS_QUERY = `
  query ($search: String) {
    Page(page: 1, perPage: 20) {
      media(search: $search, type: ANIME, sort: [POPULARITY_DESC, SEARCH_MATCH]) {
        id
        title { romaji english native }
        coverImage { extraLarge large medium }
        format
        averageScore
        popularity
      }
    }
  }
`

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

function mapSort(orderBy?: string, dir: 'asc' | 'desc' = 'desc'): string[] {
  const desc = dir !== 'asc'
  switch (orderBy) {
    case 'title':
      return desc ? ['TITLE_ROMAJI_DESC'] : ['TITLE_ROMAJI']
    case 'start_date':
      return desc ? ['START_DATE_DESC'] : ['START_DATE']
    case 'episodes':
      return desc ? ['EPISODES_DESC'] : ['EPISODES']
    case 'favorites':
      return desc ? ['FAVOURITES_DESC'] : ['FAVOURITES']
    case 'popularity':
      return desc ? ['POPULARITY_DESC'] : ['POPULARITY']
    case 'score':
    case 'rank':
    default:
      return desc ? ['SCORE_DESC'] : ['SCORE']
  }
}

function mapStatusFilter(status?: string): string | null {
  switch (status) {
    case 'airing':
      return 'RELEASING'
    case 'complete':
      return 'FINISHED'
    case 'upcoming':
      return 'NOT_YET_RELEASED'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return null
  }
}

function mapIsAdult(rating?: string, sfw?: boolean): boolean | null {
  if (sfw) return false
  if (!rating) return null
  if (rating === 'r17' || rating === 'r' || rating === 'rx') return true
  if (rating === 'g' || rating === 'pg' || rating === 'pg13') return false
  return null
}

export const anilist = {
  searchAnime(params: ListParams = {}, signal?: AbortSignal): Promise<Paginated<AnimeSummary>> {
    const genreNames = new Set<string>()
    for (const name of (params.genre ?? '').split(',').map((s) => s.trim())) {
      if (name) genreNames.add(name)
    }
    for (const rawId of (params.genres ?? '').split(',').map((s) => s.trim())) {
      if (!rawId) continue
      const name = genreName(Number(rawId))
      if (name) genreNames.add(name)
    }
    const genreIn = [...genreNames]

    const tagIn = (params.tags ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const isFreeTextSearch = Boolean(params.q?.trim())
    const filters: SearchFilters = {
      search: params.q?.trim() ? params.q.trim() : null,
      // Free-text queries lead with POPULARITY then SEARCH_MATCH so the most
      // relevant, popular hits surface first. Explicit user picks still win.
      sort: isFreeTextSearch
        ? ['POPULARITY_DESC', 'SEARCH_MATCH']
        : mapSort(params.order_by, params.sort ?? 'desc'),
      status: mapStatusFilter(params.status),
      format: params.type ? [params.type.toUpperCase()] : null,
      genre: genreIn.length > 0 ? genreIn : null,
      tags: tagIn.length > 0 ? tagIn : null,
      minScore: params.min_score ? Math.round(params.min_score * 10) : null,
      isAdult: mapIsAdult(params.rating, params.sfw) ?? false,
      season: params.season ? params.season.toUpperCase() : null,
      seasonYear: params.season_year ?? null,
    }
    return runSearch(filters, params.page ?? 1, params.limit ?? 24, signal, undefined, params.verify_pagination === true)
  },

  searchSuggestions(search: string, signal?: AbortSignal): Promise<AnimeSuggestion[]> {
    interface Resp {
      Page: {
        media: {
          id: number
          title: AniListTitle
          coverImage: AniListCoverImage
          format: string | null
          averageScore: number | null
          popularity: number | null
        }[]
      } | null
    }
    const q = search.trim()
    return gql<Resp>(SUGGESTIONS_QUERY, { variables: { search: q }, ttl: 60_000, signal }).then((r) => {
      const mediaList = r.Page?.media ?? []
      const items = mediaList.map((m) => ({
        id: m.id,
        title: m.title.english || m.title.romaji || m.title.native || '',
        coverImage: m.coverImage.extraLarge || m.coverImage.large || m.coverImage.medium || '',
        format: m.format ?? null,
        averageScore: m.averageScore ?? null,
      }))
      if (!q) return items
      const qLower = q.toLowerCase()
      const isPrefix = (t: AniListTitle) =>
        Object.values(t)
          .filter(Boolean)
          .some((v) => v.toLowerCase().startsWith(qLower))
      return items.sort((a, b) => {
        const ma = mediaList.find((m) => m.id === a.id)
        const mb = mediaList.find((m) => m.id === b.id)
        const aPrefix = ma && isPrefix(ma.title) ? 0 : 1
        const bPrefix = mb && isPrefix(mb.title) ? 0 : 1
        if (aPrefix !== bPrefix) return aPrefix - bPrefix
        const popDiff = (mb?.popularity ?? 0) - (ma?.popularity ?? 0)
        if (popDiff !== 0) return popDiff
        return (mb?.averageScore ?? 0) - (ma?.averageScore ?? 0)
      })
    })
  },

  getAnime(id: number, signal?: AbortSignal): Promise<{ data: AnimeDetail }> {
    interface Resp {
      Media: AniListMedia
    }
    return gql<Resp>(MEDIA_BY_ID_QUERY, { variables: { id }, signal }).then((r) => ({
      data: mapDetail(r.Media),
    }))
  },

  getAnimeLite(id: number, signal?: AbortSignal): Promise<{ data: AnimeSummary }> {
    interface Resp {
      Media: AniListMedia
    }
    return gql<Resp>(MEDIA_BY_ID_QUERY, { variables: { id }, signal }).then((r) => ({
      data: mapSummary(r.Media),
    }))
  },

  getEpisodes(id: number, page = 1, signal?: AbortSignal): Promise<Paginated<Episode>> {
    const perPage = 50
    interface Resp {
      Media: {
        episodes: number | null
        status: string | null
        nextAiringEpisode: { episode: number; airingAt: number } | null
        airingSchedule: { nodes: { episode: number; airingAt: number }[] } | null
      }
    }
    return gql<Resp>(EPISODES_QUERY, { variables: { id }, ttl: TTL.season, signal }).then((r) => {
      const dateMap = new Map<number, string>()
      let maxScheduled = 0
      for (const node of r.Media.airingSchedule?.nodes ?? []) {
        const iso = isoFromUnix(node.airingAt)
        if (iso) dateMap.set(node.episode, iso)
        if (node.episode > maxScheduled) maxScheduled = node.episode
      }

      const nextEp = r.Media.nextAiringEpisode?.episode ?? null
      const declared = r.Media.episodes ?? null
      const airedCount =
        nextEp != null ? Math.max(0, nextEp - 1) : (declared ?? maxScheduled)

      const total = Math.max(
        0,
        declared ?? airedCount,
        maxScheduled,
      )

      const safePage = Math.max(1, page)
      const startIdx = (safePage - 1) * perPage
      const endIdx = Math.min(startIdx + perPage, total)
      const data: Episode[] = []
      for (let n = startIdx + 1; n <= endIdx; n++) {
        const upcoming = nextEp != null && n >= nextEp
        data.push({
          mal_id: n,
          title: null,
          title_japanese: null,
          title_romanji: null,
          aired: upcoming ? null : dateMap.get(n) ?? null,
          score: null,
          filler: false,
          recap: false,
          forum_url: null,
          url: null,
          upcoming,
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
    })
  },

  getRelations(id: number, signal?: AbortSignal): Promise<SimpleList<JikanRelation>> {
    interface Edge {
      relationType: string | null
      node: AniListRelationsNode
    }
    interface Resp {
      Media: { relations: { edges: Edge[] } | null }
    }
    return gql<Resp>(RELATIONS_QUERY, { variables: { id }, signal }).then((r) => ({
      data: mapRelationEdges(r.Media.relations?.edges ?? []),
    }))
  },

  getTopAnime(
    filter: 'airing' | 'upcoming' | 'bypopularity' | 'favorite' = 'bypopularity',
    page = 1,
    signal?: AbortSignal,
  ): Promise<Paginated<AnimeSummary>> {
    let sort: string[]
    let status: string | null = null
    switch (filter) {
      case 'airing':
        status = 'RELEASING'
        sort = ['POPULARITY_DESC']
        break
      case 'upcoming':
        status = 'NOT_YET_RELEASED'
        sort = ['POPULARITY_DESC']
        break
      case 'favorite':
        sort = ['FAVOURITES_DESC']
        break
      case 'bypopularity':
      default:
        sort = ['POPULARITY_DESC']
        break
    }
    return runSearch({ sort, status }, page, 24, signal, TTL.season)
  },

  getSeasonNow(page = 1, signal?: AbortSignal): Promise<Paginated<AnimeSummary>> {
    const { season, year } = currentSeason()
    return runSearch({ sort: ['POPULARITY_DESC'], season, seasonYear: year }, page, 24, signal, TTL.season)
  },

  getSchedule(
    day?: string,
    signal?: AbortSignal,
    range?: { start: number; end: number },
  ): Promise<SimpleList<ScheduleEntry>> {
    interface Node {
      airingAt: number
      episode: number
      media: AniListMedia
    }
    interface Resp {
      Page: { airingSchedules: Node[] }
    }
    // Default to the rolling window: start of today → end of 7 days from now.
    const start = range?.start
    const end = range?.end
    return gql<Resp>(SCHEDULE_QUERY, {
      variables: { perPage: 50, airingAtGreater: start, airingAtLesser: end },
      ttl: TTL.season,
      signal,
    }).then((r) => {
      let nodes = r.Page.airingSchedules ?? []
      if (day) {
        const target = day.charAt(0).toUpperCase() + day.slice(1).toLowerCase()
        nodes = nodes.filter((n) => WEEKDAYS[new Date(n.airingAt * 1000).getUTCDay()] === target)
      }
      const data: ScheduleEntry[] = nodes.map((n) => {
        const summary = mapSummary(n.media)
        const iso = isoFromUnix(n.airingAt)
        const d = new Date(n.airingAt * 1000)
        const weekday = WEEKDAYS[d.getUTCDay()]
        const time = d.toISOString().slice(11, 16)
        return {
          mal_id: n.media.id,
          title: summary.title,
          url: summary.url,
          images: { jpg: summary.images.jpg },
          synopsis: summary.synopsis,
          romaji: n.media.title?.romaji ?? null,
          english: n.media.title?.english ?? null,
          airingAt: n.airingAt,
          episodes: [
            {
              mal_id: n.episode,
              title: null,
              title_japanese: null,
              title_romanji: null,
              aired: iso,
              score: null,
              filler: false,
              recap: false,
              forum_url: null,
              url: null,
            },
          ],
          broadcast: { day: weekday, time, timezone: 'JST', string: `${weekday} at ${time} (JST)` },
        }
      })
      return { data }
    })
  },

  /**
   * Get the most-anticipated unreleased anime (status NOT_YET_RELEASED), ranked
   * by trending then popularity. Used by the Schedule page's announcements rail.
   */
  getUpcoming(limit = 10, signal?: AbortSignal): Promise<SimpleList<UpcomingAnime>> {
    return gql<UpcomingResp>(UPCOMING_QUERY, {
      variables: { perPage: limit },
      ttl: TTL.season,
      signal,
    }).then((r) => ({
      data: (r.Page?.media ?? []).map((n) => ({
        id: n.id,
        title: n.title.english || n.title.romaji || n.title.native || '',
        coverImage: n.coverImage?.large ?? null,
        season: n.season ?? null,
        seasonYear: n.seasonYear ?? null,
      })),
    }))
  },

  getGenres(signal?: AbortSignal): Promise<SimpleList<Genre>> {
    interface Resp {
      GenreCollection: string[]
    }
    return gql<Resp>(GENRES_QUERY, { ttl: TTL.genres, signal }).then((r) => ({
      data: (r.GenreCollection ?? []).map((name) => ({ mal_id: genreId(name), name })),
    }))
  },

  getRecommendations(
    id: number,
    signal?: AbortSignal,
  ): Promise<SimpleList<{ entry: AnimeSummary }>> {
    interface Node {
      mediaRecommendation: AniListMedia | null
    }
    interface Resp {
      Media: { recommendations: { nodes: Node[] } | null }
    }
    return gql<Resp>(RECOMMENDATIONS_QUERY, { variables: { id }, signal }).then((r) => ({
      data: (r.Media.recommendations?.nodes ?? [])
        .filter((n) => n.mediaRecommendation)
        .map((n) => ({ entry: mapSummary(n.mediaRecommendation as AniListMedia) })),
    }))
  },
}
export interface AnimeMeta {
  id: number
  title: string
  coverImage: string | null
}

/**
 * fetchAnimeMetadata — batch-resolve AniList ids into lightweight display
 * summaries (id + best title + large cover). Used by the profile list views to
 * replace the raw "Anime #<id>" placeholders with real titles and posters.
 *
 * Behaviour:
 *   - De-duplicates the input list and drops non-positive / non-integer ids.
 *   - Returns `[]` for an empty input.
 *   - Never throws: a failed/blocked request degrades to `null` so the caller
 *     can still fall back to its `#<id>` labels.
 */
export async function fetchAnimeMetadata(
  idList: number[],
  signal?: AbortSignal,
): Promise<AnimeMeta[] | null> {
  const ids = [...new Set(idList.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))]
  if (ids.length === 0) return []

  const query = `
    query ($ids: [Int!]!) {
      Page {
        media(id_in: $ids, type: ANIME) {
          id
          title { romaji english native }
          coverImage { large }
        }
      }
    }
  `
  interface Resp {
    Page: {
      media: { id: number; title: AniListTitle; coverImage: AniListCoverImage }[] | null
    } | null
  }
  try {
    const r = await gql<Resp>(query, { variables: { ids }, signal })
    const media = r.Page?.media ?? []
    return media.map((m) => ({
      id: m.id,
      title: m.title.english || m.title.romaji || m.title.native || '',
      coverImage: m.coverImage?.large ?? null,
    }))
  } catch {
    return null
  }
}