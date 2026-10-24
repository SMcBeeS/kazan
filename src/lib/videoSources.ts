/**
 * videoSources.ts — Reusable, authorization-aware video source registry.
 *
 * IMPORTANT / LEGAL:
 * This project does NOT scrape protected streaming sites, bypass paywalls, or
 * invent streaming URLs. Instead it provides a clean, typed registry where an
 * operator can plug in *authorized* sources (their own licensed CDN, an
 * approved embed partner, or a direct file URL they have the right to serve).
 *
 * Until a source is configured for a given episode, `resolveEpisodeSources`
 * returns an empty list and the UI shows a clearly-labelled "unavailable"
 * state — never a fake player and never a guessed URL.
 *
 * To add a real source, register it in the SOURCE_CATALOG below (or load it
 * from your own backend). Each source is one of:
 *   - kind: 'embed'  -> an iframe URL from a provider you are authorised to use
 *   - kind: 'direct' -> a progressive/HLS file URL (+ optional quality ladder)
 */

import type { VideoSource } from './types'

/** A registered, authorized provider. Add entries here as you onboard them. */
export interface SourceCatalogEntry {
  /** Stable id, e.g. 'cdn-a' */
  id: string
  /** Human label shown in the selector, e.g. "Server A (1080p)" */
  label: string
  kind: 'embed' | 'direct'
  /**
   * Build the URL for a given episode. Return null when this provider does not
   * carry that episode (the UI will then hide/disable the option).
   */
  buildUrl?: (ctx: EpisodeContext) => string | null
  /** Optional per-source quality ladder builder for direct sources. */
  buildQualities?: (ctx: EpisodeContext) => VideoSource['qualities']
  /** Optional subtitle builder. */
  buildSubtitles?: (ctx: EpisodeContext) => VideoSource['subtitles']
  note?: string
}

export interface EpisodeContext {
  animeId: number
  episode: number
  /** Optional override supplied by a backend/JSON manifest. */
  manifest?: Record<string, unknown>
}

/* ------------------------------------------------------------------------- *
 *  OPERATOR CONFIGURATION
 *
 *  These are DELIBERATE, CLEARLY-LABELLED PLACEHOLDERS. Replace the sample
 *  entries with your own authorized sources. When the catalog is empty (or an
 *  entry returns null for an episode), the watch page renders the built-in
 *  "no source configured" state.
 *
 *  The EXAMPLE_* entries below are DISABLED by default and demonstrate the
 *  exact shape of an authorized configuration — see docs/VIDEO_SOURCES.md.
 * ------------------------------------------------------------------------- */

/** Toggle this on only after you have added real, authorized sources. */
export const ENABLE_DEMO_SOURCES = false

const DEMO_CATALOG: SourceCatalogEntry[] = [
  // Example: a licensed HLS CDN you control. Disabled by default.
  // {
  //   id: 'cdn-a',
  //   label: 'Server A',
  //   kind: 'direct',
  //   buildUrl: (ctx) => `https://cdn.example.com/anime/${ctx.animeId}/${ctx.episode}/master.m3u8`,
  //   buildQualities: () => [
  //     { label: 'Auto', url: 'https://cdn.example.com/.../master.m3u8' },
  //     { label: '1080p', url: 'https://cdn.example.com/.../1080.m3u8', height: 1080 },
  //     { label: '720p', url: 'https://cdn.example.com/.../720.m3u8', height: 720 },
  //   ],
  //   buildSubtitles: () => [
  //     { srclang: 'ar', label: 'العربية', src: '/subs/ar.vtt', format: 'vtt', default: true },
  //     { srclang: 'en', label: 'English', src: '/subs/en.srt', format: 'srt' },
  //   ],
  // },
  // Example: an approved embed partner. Disabled by default.
  // {
  //   id: 'embed-partner',
  //   label: 'Partner Embed',
  //   kind: 'embed',
  //   buildUrl: (ctx) => `https://player.partner.example/e/${ctx.animeId}/${ctx.episode}`,
  // },
]

/** The active catalog. Swap DEMO_CATALOG for your own entries to go live. */
export const SOURCE_CATALOG: SourceCatalogEntry[] = ENABLE_DEMO_SOURCES
  ? DEMO_CATALOG
  : []

/**
 * Resolve the playable sources for an episode from the active catalog.
 * Returns an array of VideoSource; empty when nothing is configured.
 */
export function resolveEpisodeSources(ctx: EpisodeContext): VideoSource[] {
  const sources: VideoSource[] = []
  for (const entry of SOURCE_CATALOG) {
    let url: string | null = null
    try {
      url = entry.buildUrl ? entry.buildUrl(ctx) : null
    } catch {
      url = null
    }
    if (!url) continue
    const source: VideoSource = {
      id: entry.id,
      label: entry.label,
      kind: entry.kind,
      url,
      note: entry.note,
    }
    if (entry.buildQualities) {
      try {
        source.qualities = entry.buildQualities(ctx)
      } catch {
        /* ignore */
      }
    }
    if (entry.buildSubtitles) {
      try {
        source.subtitles = entry.buildSubtitles(ctx)
      } catch {
        /* ignore */
      }
    }
    sources.push(source)
  }
  return sources
}

/** Whether the catalog currently has any sources at all. */
export function hasAnySources(): boolean {
  return SOURCE_CATALOG.length > 0
}
