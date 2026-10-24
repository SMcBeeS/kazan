/**
 * database.ts — Supabase data layer for Phase 2 user features.
 *
 * Thin, defensive async helpers over the tables defined in
 * `supabase/schema.sql` (profiles, favorites, watch_history, ratings,
 * watchlist, comments). Every function is safe to call from the UI:
 *   - returns `{ data: null, error: '...' }` instead of throwing when
 *     Supabase isn't configured or the user is signed out, so the UI can just
 *     render its normal "not configured / sign in" states, and
 *   - coerces Postgres `bigint` values back to JS `number` for `anime_id`
 *     (the frontend keys anime by these numeric AniList IDs see `types.ts`).
 *
 * Row access is enforced server-side by the RLS policies in schema.sql; these
 * helpers just set `user_id` from the active auth session.
 */

import { supabase, supabaseConfigured } from './supabase'

/* --------------------------------- helpers --------------------------------- */

/** Uniform result envelope reused across every helper in this file. */
export interface DbResult<T> {
  data: T
  error: string | null
}

/**
 * Idempotently make sure a `profiles` row exists for the given auth user.
 * The signup trigger in schema.sql already creates one, but users created
 * before that trigger was attached need a backfill. Safe to call on first
 * access (INSERT ... ON CONFLICT DO NOTHING).
 */
async function ensureProfile(userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('profiles').upsert(
    { id: userId },
    { onConflict: 'id' },
  )
  return { error: error?.message ?? null }
}

/**
 * Fetch the current auth user id, or `null` when signed out / not configured.
 * `getProfile` and the write-paths all rely on this.
 */
async function currentUserId(): Promise<string | null> {
  if (!supabaseConfigured) return null
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

/** Postgres returns `bigint` columns as strings; normalise them to `number`. */
function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return 0
}

/* ----------------------------------- types ---------------------------------- */

export interface Profile {
  id: string
  username: string | null
  avatar_url: string | null
  bio: string | null
  is_watchlist_public: boolean
  is_favorites_public: boolean
  created_at: string
  updated_at: string
}

export interface ProfilePatch {
  username?: string | null
  avatar_url?: string | null
  bio?: string | null
  is_watchlist_public?: boolean
  is_favorites_public?: boolean
}

/** A favorite: the user's AniList id + the AniList media id they favorited. */
export interface Favorite {
  id: string
  user_id: string
  anime_id: number
  created_at: string
}

/** A single watch-history row (one per watched episode/visit). */
export interface HistoryEntry {
  id: string
  user_id: string
  anime_id: number
  episode_number: number | null
  watched_at: string
}

/** One user's rating of one title. */
export interface Rating {
  id: string
  user_id: string
  anime_id: number
  /** 1..10 */
  score: number
  created_at: string
}

/** A comment on an anime (episode_number null = general / series-level). */
export interface Comment {
  id: string
  user_id: string
  anime_id: number
  episode_number: number | null
  content: string
  created_at: string
  /**
   * Populated by `getComments` via a `profiles` join so the UI can render the
   * poster's name + avatar. Rows returned by `postComment` carry no author.
   */
  author?: { username: string | null; avatar_url: string | null } | null
}

/** Average score summary for one title (community rating). */
export interface AverageRating {
  anime_id: number
  avg: number
  count: number
}

/** The tracking states a watchlist entry can carry (see `watchlist.status`). */
export type WatchlistStatus =
  | 'PLAN_TO_WATCH'
  | 'CURRENTLY_WATCHING'
  | 'COMPLETED'
  | 'ON_HOLD'
  | 'DROPPED'

/** One tracked title on a user's watchlist, with its current status. */
export interface WatchlistEntry {
  id: string
  user_id: string
  anime_id: number
  status: WatchlistStatus
  created_at: string
  updated_at: string
}

/* ---------------------------------- profile --------------------------------- */

/**
 * Fetch a profile by auth user id (defaults to the current user). Returns
 * `data: null, error: null` when none exists yet — the profile row is created
 * on first update (or by the signup trigger).
 */
export async function getProfile(userId?: string): Promise<DbResult<Profile | null>> {
  if (!supabaseConfigured) return { data: null, error: 'Supabase is not configured.' }
  const id = userId ?? (await currentUserId())
  if (!id) return { data: null, error: 'Not signed in.' }
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle<Profile>()
  if (error) return { data: null, error: error.message }
  return { data: (data as Profile | null) ?? null, error: null }
}

/**
 * Fetch a public profile by its (unique) username. Used by the public profile
 * viewer to render another user's card. Returns `data: null, error: null` when
 * no profile matches that username — the caller renders a "user not found"
 * state. Row visibility still obeys the `profiles` select RLS policy, so this
 * is only resolvable for authenticated visitors.
 */
export async function getProfileByUsername(username: string): Promise<DbResult<Profile | null>> {
  if (!supabaseConfigured) return { data: null, error: 'Supabase is not configured.' }
  const name = username.trim()
  if (!name) return { data: null, error: null }
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', name)
    .maybeSingle<Profile>()
  if (error) return { data: null, error: error.message }
  return { data: (data as Profile | null) ?? null, error: null }
}

/**
 * Fetch another user's public favorites. Unlike `getFavorites` this targets a
 * specific `userId` regardless of the caller and — crucially — never errors
 * when the target's `is_favorites_public` toggle is off: the RLS policy simply
 * withholds the rows, so we resolve to an empty array. The caller uses that
 * empty result to show a "favorites are private / nothing to show" state.
 */
export async function getPublicFavorites(userId: string): Promise<DbResult<Favorite[]>> {
  if (!supabaseConfigured) return { data: [], error: null }
  if (!userId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('favorites')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  // RLS can legitimately return zero rows here (toggle is private); treat that
  // as a successful empty list rather than an error.
  const raw = data as unknown as Array<Omit<Favorite, 'anime_id'> & { anime_id: number | string }> | null
  const rows = (raw ?? []).map((r) => ({ ...r, anime_id: toNumber(r.anime_id) }))
  return { data: error ? [] : rows, error: null }
}

/**
 * Fetch another user's public watch history. Same contract as
 * `getPublicFavorites`: a private `is_watchlist_public` toggle (or RLS blocking
 * anonymous access) resolves to an empty array instead of an error, letting the
 * public viewer show a clean "history is private / nothing to show" state.
 */
export async function getPublicHistory(userId: string, limit = 200): Promise<DbResult<HistoryEntry[]>> {
  if (!supabaseConfigured) return { data: [], error: null }
  if (!userId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('watch_history')
    .select('*')
    .eq('user_id', userId)
    .order('watched_at', { ascending: false })
    .limit(limit)
  const raw =
    data as unknown as Array<Omit<HistoryEntry, 'anime_id'> & { anime_id: number | string }> | null
  const rows = (raw ?? []).map((r) => ({ ...r, anime_id: toNumber(r.anime_id) }))
  return { data: error ? [] : rows, error: null }
}

/**
 * Create (if needed) and/or update the caller's own profile. Pass an explicit
 * `userId` only to backfill a specific account; otherwise the active session
 * is used. Returns the upserted row.
 */
export async function updateProfile(
  patch: ProfilePatch,
  userId?: string,
): Promise<DbResult<Profile>> {
  if (!supabaseConfigured) return { data: null as unknown as Profile, error: 'Supabase is not configured.' }
  const id = userId ?? (await currentUserId())
  if (!id) return { data: null as unknown as Profile, error: 'Not signed in.' }

  await ensureProfile(id)
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ ...patch, id }, { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) return { data: null as unknown as Profile, error: error.message }
  // Result is a records-like object; cast to Profile (keys match the table).
  return { data: ((data as unknown as Profile) ?? ({ id } as Profile)), error: null }
}

/* ---------------------------------- favorites -------------------------------- */

/**
 * Toggle a favorite for the current user. Returns the new favourite state
 * (`data: true` = now favorited, `false` = removed).
 */
export async function toggleFavorite(animeId: number): Promise<DbResult<boolean>> {
  if (!supabaseConfigured) return { data: false, error: 'Supabase is not configured.' }
  const uid = await currentUserId()
  if (!uid) return { data: false, error: 'Not signed in.' }

  const { data: existing } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', uid)
    .eq('anime_id', animeId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase.from('favorites').delete().eq('id', existing.id)
    if (error) return { data: false, error: error.message }
    return { data: false, error: null }
  }

  const { error } = await supabase
    .from('favorites')
    .insert({ user_id: uid, anime_id: animeId })
  if (error) return { data: false, error: error.message }
  return { data: true, error: null }
}

/** List a user's favorites, most-recent first (defaults to the current user). */
export async function getFavorites(userId?: string): Promise<DbResult<Favorite[]>> {
  if (!supabaseConfigured) return { data: [], error: 'Supabase is not configured.' }
  const id = userId ?? (await currentUserId())
  if (!id) return { data: [], error: 'Not signed in.' }
  const { data, error } = await supabase
    .from('favorites')
    .select('*')
    .eq('user_id', id)
    .order('created_at', { ascending: false })
  if (error) return { data: [], error: error.message }
  const raw = data as unknown as Array<Omit<Favorite, 'anime_id'> & { anime_id: number | string }> | null
  const rows = (raw ?? []).map((r) => ({ ...r, anime_id: toNumber(r.anime_id) }))
  return { data: rows, error: null }
}

/* --------------------------------- watch history ---------------------------- */

/**
 * Record a watched episode for the current user. `episodeNumber` may be `null`
 * for titles where the episode number is unknown (e.g. movies).
 */
export async function addToHistory(
  animeId: number,
  episodeNumber: number | null = null,
): Promise<DbResult<HistoryEntry>> {
  if (!supabaseConfigured) return { data: null as unknown as HistoryEntry, error: 'Supabase is not configured.' }
  const uid = await currentUserId()
  if (!uid) return { data: null as unknown as HistoryEntry, error: 'Not signed in.' }
  const { data, error } = await supabase
    .from('watch_history')
    .insert({ user_id: uid, anime_id: animeId, episode_number: episodeNumber })
    .select()
    .maybeSingle()
  if (error) return { data: null as unknown as HistoryEntry, error: error.message }
  const row = data as unknown as HistoryEntry
  return { data: { ...row, anime_id: toNumber(row.anime_id) }, error: null }
}

/**
 * A user's watch history, most-recent first (defaults to the current user).
 * `limit` caps how many recent rows are returned.
 */
export async function getHistory(
  userId?: string,
  limit = 200,
): Promise<DbResult<HistoryEntry[]>> {
  if (!supabaseConfigured) return { data: [], error: 'Supabase is not configured.' }
  const id = userId ?? (await currentUserId())
  if (!id) return { data: [], error: 'Not signed in.' }
  const { data, error } = await supabase
    .from('watch_history')
    .select('*')
    .eq('user_id', id)
    .order('watched_at', { ascending: false })
    .limit(limit)
  if (error) return { data: [], error: error.message }
  const raw = data as unknown as Array<Omit<HistoryEntry, 'anime_id'> & { anime_id: number | string }> | null
  const rows = (raw ?? []).map((r) => ({ ...r, anime_id: toNumber(r.anime_id) }))
  return { data: rows, error: null }
}

/* ---------------------------------- watchlist ------------------------------- */

/** The five statuses the `watchlist.status` column accepts. */
const WATCHLIST_STATUSES: readonly WatchlistStatus[] = [
  'PLAN_TO_WATCH',
  'CURRENTLY_WATCHING',
  'COMPLETED',
  'ON_HOLD',
  'DROPPED',
]

/** Coerce an unknown value into a valid status, defaulting to `PLAN_TO_WATCH`. */
function toStatus(value: unknown): WatchlistStatus {
  return (WATCHLIST_STATUSES as readonly string[]).includes(value as string)
    ? (value as WatchlistStatus)
    : 'PLAN_TO_WATCH'
}

/**
 * Add the current user's title to their watchlist (or update its status when it
 * already exists). Uses the unique `(user_id, anime_id)` constraint, so re-adding
 * a title just overwrites its status. Returns the stored row.
 */
export async function addToWatchlist(
  animeId: number,
  status: WatchlistStatus = 'PLAN_TO_WATCH',
): Promise<DbResult<WatchlistEntry>> {
  if (!supabaseConfigured)
    return { data: null as unknown as WatchlistEntry, error: 'Supabase is not configured.' }
  const uid = await currentUserId()
  if (!uid) return { data: null as unknown as WatchlistEntry, error: 'Not signed in.' }
  const { data, error } = await supabase
    .from('watchlist')
    .upsert(
      { user_id: uid, anime_id: animeId, status: toStatus(status) },
      { onConflict: 'user_id,anime_id' },
    )
    .select()
    .maybeSingle()
  if (error) return { data: null as unknown as WatchlistEntry, error: error.message }
  const row = data as unknown as WatchlistEntry
  return { data: { ...row, anime_id: toNumber(row.anime_id) }, error: null }
}

/**
 * Change the current user's status for a title already in their watchlist. No-op
 * (no error) when the title isn't tracked. Returns the updated row, or
 * `data: null` when there was nothing to update.
 */
export async function updateWatchlistStatus(
  animeId: number,
  status: WatchlistStatus,
): Promise<DbResult<WatchlistEntry | null>> {
  if (!supabaseConfigured)
    return { data: null, error: 'Supabase is not configured.' }
  const uid = await currentUserId()
  if (!uid) return { data: null, error: 'Not signed in.' }
  const { data, error } = await supabase
    .from('watchlist')
    .update({ status: toStatus(status) })
    .eq('user_id', uid)
    .eq('anime_id', animeId)
    .select()
    .maybeSingle()
  if (error) return { data: null, error: error.message }
  const row = data as unknown as WatchlistEntry | null
  return row
    ? { data: { ...row, anime_id: toNumber(row.anime_id) }, error: null }
    : { data: null, error: null }
}

/** Remove a title from the current user's watchlist. */
export async function removeFromWatchlist(animeId: number): Promise<DbResult<void>> {
  if (!supabaseConfigured) return { data: undefined, error: 'Supabase is not configured.' }
  const uid = await currentUserId()
  if (!uid) return { data: undefined, error: 'Not signed in.' }
  const { error } = await supabase
    .from('watchlist')
    .delete()
    .eq('user_id', uid)
    .eq('anime_id', animeId)
  if (error) return { data: undefined, error: error.message }
  return { data: undefined, error: null }
}

/** The current user's watchlist (defaults to the active session). */
export async function getWatchlist(userId?: string): Promise<DbResult<WatchlistEntry[]>> {
  if (!supabaseConfigured) return { data: [], error: 'Supabase is not configured.' }
  const id = userId ?? (await currentUserId())
  if (!id) return { data: [], error: 'Not signed in.' }
  const { data, error } = await supabase
    .from('watchlist')
    .select('*')
    .eq('user_id', id)
    .order('updated_at', { ascending: false })
  if (error) return { data: [], error: error.message }
  const raw =
    data as unknown as Array<Omit<WatchlistEntry, 'anime_id' | 'status'> & { anime_id: number | string; status: string }> | null
  const rows = (raw ?? []).map((r) => ({
    ...r,
    anime_id: toNumber(r.anime_id),
    status: toStatus(r.status),
  }))
  return { data: rows, error: null }
}

/**
 * Fetch another user's public watchlist. Same contract as `getPublicFavorites`:
 * when the owner's `is_watchlist_public` toggle is off, RLS withholds the rows
 * and this resolves to an *empty* array (never an error), so the public viewer
 * can show its "private / nothing to show" state.
 */
export async function getPublicWatchlist(userId: string): Promise<DbResult<WatchlistEntry[]>> {
  if (!supabaseConfigured) return { data: [], error: null }
  if (!userId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('watchlist')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  // RLS can legitimately return zero rows here (toggle is private); treat that
  // as a successful empty list rather than an error.
  const raw =
    data as unknown as Array<Omit<WatchlistEntry, 'anime_id' | 'status'> & { anime_id: number | string; status: string }> | null
  const rows = error
    ? []
    : (raw ?? []).map((r) => ({
        ...r,
        anime_id: toNumber(r.anime_id),
        status: toStatus(r.status),
      }))
  return { data: rows, error: null }
}

/* ----------------------------------- ratings -------------------------------- */

/**
 * Set (or update) the current user's score for a title. Uses the unique
 * `(user_id, anime_id)` constraint so re-rating overwrites the previous score.
 * `score` should be 1..10 (enforced by a DB CHECK constraint).
 */
export async function submitRating(animeId: number, score: number): Promise<DbResult<Rating>> {
  if (!supabaseConfigured) return { data: null as unknown as Rating, error: 'Supabase is not configured.' }
  const uid = await currentUserId()
  if (!uid) return { data: null as unknown as Rating, error: 'Not signed in.' }
  const { data, error } = await supabase
    .from('ratings')
    .upsert(
      { user_id: uid, anime_id: animeId, score: Math.round(clampScore(score)) },
      { onConflict: 'user_id,anime_id' },
    )
    .select()
    .maybeSingle()
  if (error) return { data: null as unknown as Rating, error: error.message }
  const row = data as unknown as Rating
  return { data: { ...row, anime_id: toNumber(row.anime_id) }, error: null }
}

/**
 * Community rating summary for one title: average score + vote count.
 * Note: this reflects rows the caller's RLS context can read (own + any users
 * whose watchlist is public). Returned `anime_id` is normalised to a number.
 */
export async function getAverageRating(animeId: number): Promise<DbResult<AverageRating | null>> {
  if (!supabaseConfigured) return { data: null, error: 'Supabase is not configured.' }
  const { data, error } = await supabase
    .from('ratings')
    .select('score')
    .eq('anime_id', animeId)
  if (error) return { data: null, error: error.message }
  const scores = ((data as unknown as { score: number }[]) ?? []).map((r) => r.score)
  const count = scores.length
  const total = scores.reduce((sum, s) => sum + s, 0)
  return {
    data: { anime_id: animeId, avg: count > 0 ? Math.round((total / count) * 10) / 10 : 0, count },
    error: null,
  }
}

/**
 * Fetch a single user's rating for one title (defaults to the current user).
 * Returns `data: null, error: null` when the user hasn't rated it yet.
 */
export async function getRating(animeId: number, userId?: string): Promise<DbResult<Rating | null>> {
  if (!supabaseConfigured) return { data: null, error: 'Supabase is not configured.' }
  const id = userId ?? (await currentUserId())
  if (!id) return { data: null, error: 'Not signed in.' }
  const { data, error } = await supabase
    .from('ratings')
    .select('*')
    .eq('user_id', id)
    .eq('anime_id', animeId)
    .maybeSingle<Rating>()
  if (error) return { data: null, error: error.message }
  const row = (data as unknown as Rating | null) ?? null
  return { data: row ? { ...row, anime_id: toNumber(row.anime_id) } : null, error: null }
}

/** -------------------------------- comments -------------------------------- */

/**
 * Post a comment. `episodeNumber` may be `null` for a general / series-level
 * comment. Content must be non-empty (enforced by a DB CHECK constraint).
 */
export async function postComment(
  animeId: number,
  content: string,
  episodeNumber: number | null = null,
): Promise<DbResult<Comment>> {
  if (!supabaseConfigured) return { data: null as unknown as Comment, error: 'Supabase is not configured.' }
  const uid = await currentUserId()
  if (!uid) return { data: null as unknown as Comment, error: 'Not signed in.' }
  const trimmed = content.trim()
  if (!trimmed) return { data: null as unknown as Comment, error: 'Comment cannot be empty.' }
  const { data, error } = await supabase
    .from('comments')
    .insert({ user_id: uid, anime_id: animeId, episode_number: episodeNumber, content: trimmed })
    .select()
    .maybeSingle()
  if (error) return { data: null as unknown as Comment, error: error.message }
  const row = data as unknown as Comment
  return { data: { ...row, anime_id: toNumber(row.anime_id) }, error: null }
}

/**
 * Comments for one title (episode comments when `episodeNumber` is given,
 * otherwise general / series-level comments), newest first.
 */
export async function getComments(
  animeId: number,
  episodeNumber: number | null = null,
  limit = 200,
): Promise<DbResult<Comment[]>> {
  if (!supabaseConfigured) return { data: [], error: 'Supabase is not configured.' }
  // Join the poster's profile (always publicly readable for authenticated users)
  // so the UI can render author name + avatar alongside each comment.
  let query = supabase
    .from('comments')
    .select('*, author:profiles(username, avatar_url)')
    .eq('anime_id', animeId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (episodeNumber != null) query = query.eq('episode_number', episodeNumber)
  else query = query.is('episode_number', null)
  const { data, error } = await query
  if (error) return { data: [], error: error.message }
  const raw =
    data as unknown as Array<Omit<Comment, 'author'> & { anime_id: number | string; author: Comment['author'] }> | null
  const rows = (raw ?? []).map((r) => ({ ...r, anime_id: toNumber(r.anime_id) }))
  return { data: rows, error: null }
}

/* --------------------------------- misc utils -------------------------------- */

/** Clamp a score into the 1..10 range expected by the DB CHECK constraint. */
function clampScore(score: number): number {
  const n = Number.isFinite(score) ? score : 0
  return Math.min(10, Math.max(1, n))
}