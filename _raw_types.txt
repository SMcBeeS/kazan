/**
 * Kazan — Shared domain types
 *
 * These are the normalized shapes the UI relies on. They were originally modeled
 * on the Jikan v4 API (hence the `Jikan*` type names, kept for continuity); the
 * data layer now sources them from the AniList GraphQL API via `lib/anilist.ts`.
 */

export interface JikanImage {
  image_url: string
  small_image_url?: string
  large_image_url?: string
}

export interface JikanTitle {
  type: string
  title: string
}

export interface JikanAiredDate {
  day: number | null
  month: number | null
  year: number | null
}

export interface JikanAired {
  from: string | null
  to: string | null
  string?: string
  prop: { from: JikanAiredDate; to: JikanAiredDate }
}

export interface JikanGenre {
  mal_id: number
  name: string
  url?: string
  count?: number
}

/** A genre / category entry (from /genres/anime, or a genre on an anime). */
export type Genre = JikanGenre

export interface JikanStudio {
  mal_id: number
  name: string
  type?: string
  url?: string
}

export interface JikanTrailer {
  youtube_id: string | null
  url: string | null
  embed_url: string | null
  images?: JikanImage
}

/** Summary item returned by list endpoints (/anime, /top/anime, /seasons/now …) */
export interface AnimeSummary {
  mal_id: number
  url: string
  images: { webp?: JikanImage; jpg: JikanImage }
  approved?: boolean
  titles?: JikanTitle[]
  title: string
  title_english: string | null
  title_japanese: string | null
  type: string | null
  /**
   * Raw AniList format enum (e.g. "TV", "MOVIE", "OVA", "SPECIAL"). Used by the
   * UI to special-case movies (runtime instead of episode counts).
   */
  format?: string | null
  source: string
  episodes: number | null
  status: string | null
  airing: boolean
  aired: JikanAired
  duration: string
  rating: string | null
  score: number | null
  scored_by: number | null
  rank: number | null
  popularity: number | null
  members: number | null
  favorites: number | null
  synopsis: string | null
  season: string | null
  year: number | null
  studios: JikanStudio[]
  genres: JikanGenre[]
  themes?: JikanGenre[]
  demographics?: JikanGenre[]
  /**
   * Wide cinematic banner image (AniList `bannerImage`) when available. Preferred
   * for hero/backdrop backgrounds; falls back to the poster via utils.bannerImage().
   */
  bannerImage?: string | null
  /**
   * Next episode scheduled to air (AniList `nextAiringEpisode`). Used to
   * distinguish already-released episodes from upcoming ones.
   */
  nextAiringEpisode?: { episode: number; airingAt: number | null } | null
}

/** Full anime detail returned by /anime/{id}/full */
export interface AnimeDetail extends AnimeSummary {
  title_synonyms: string[]
  background: string | null
  trailer: JikanTrailer
  producers: JikanStudio[]
  licensors: JikanStudio[]
  explicit: boolean
  broadcast: { day: string | null; time: string | null; timezone: string | null; string: string | null }
}

export interface Episode {
  mal_id: number
  title: string | null
  title_japanese: string | null
  title_romanji: string | null
  aired: string | null
  score: number | null
  filler: boolean
  recap: boolean
  forum_url: string | null
  url: string | null
  /**
   * True when this episode has not aired yet (its number is at or beyond the
   * series' `nextAiringEpisode.episode`). Derived in lib/anilist so the UI can
   * badge upcoming episodes and disable clicking them.
   */
  upcoming?: boolean
}

/**
 * A single related title as returned by /anime/{id}/relations.
 * Relations entries are lightweight summaries (no score/episodes), so they use
 * a dedicated compact shape rather than AnimeSummary.
 */
export interface JikanRelationEntry {
  mal_id: number
  url: string
  images: { jpg: JikanImage; webp?: JikanImage }
  name: string
}

/** A relation group, e.g. "Sequel", "Prequel", "Side Story", "Parent Story". */
export interface JikanRelation {
  relation: string
  entry: JikanRelationEntry[]
}

/** A single picture returned by /anime/{id}/pictures. */
export interface JikanPicture {
  jpg: JikanImage
  webp?: JikanImage
}

export interface ScheduleEntry {
  mal_id: number
  title: string
  url: string
  images: { jpg: JikanImage }
  synopsis: string | null
  episodes?: Episode[]
  /** Broadcast metadata unique to schedule entries */
  broadcast?: { day: string | null; time: string | null; timezone: string | null; string: string | null }
  /** Raw title forms carried by schedule entries so pages can filter locally. */
  romaji?: string | null
  english?: string | null
  /** UNIX seconds (UTC) of the aired timestamp for precise day grouping. */
  airingAt?: number | null
}

/** Generic paginated API envelope (data + pagination) */
export interface Paginated<T> {
  data: T[]
  pagination: {
    last_visible_page: number
    has_next_page: boolean
    current_page: number
    items: { count: number; total: number; per_page: number }
  }
}

/** Envelope without pagination (e.g. /genres/anime) */
export interface SimpleList<T> {
  data: T[]
}

/* ---------- Video-source domain types (see lib/videoSources.ts) ---------- */

export type VideoSourceKind = 'embed' | 'direct'

export type VideoQuality = {
  /** Human label e.g. "1080p", "720p", "Auto" */
  label: string
  /** Direct URL for this rendition (only meaningful for `direct` sources) */
  url?: string
  /** Height in px when known (used for sorting / hls.js level matching) */
  height?: number
}

export type SubtitleTrack = {
  /** ISO-ish code, e.g. "ar", "en" */
  srclang: string
  label: string
  /** URL to the subtitle file (.vtt preferred; .srt/.ass converted client-side) */
  src: string
  /** Original file format for conversion handling */
  format: 'vtt' | 'srt' | 'ass'
  default?: boolean
}

export type VideoSource = {
  id: string
  /** Display name of the provider, e.g. "Server 1", "Primary CDN" */
  label: string
  kind: VideoSourceKind
  /** For embed sources: iframe src. For direct sources: default/highest rendition URL. */
  url: string
  /** Optional poster override */
  poster?: string
  /** Available qualities (direct sources); embeds manage their own quality UI */
  qualities?: VideoQuality[]
  /** Subtitle tracks attached to this source */
  subtitles?: SubtitleTrack[]
  /** Notes such as licensing/availability reasons, shown to the user */
  note?: string
}
