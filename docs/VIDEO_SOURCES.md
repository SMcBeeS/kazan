# Configuring Authorized Video Sources

AnimeVerse **does not** scrape protected streaming sites, bypass paywalls, or invent
streaming URLs. Instead it exposes a clean, typed registry where you plug in sources
you are **legally authorized** to serve (your own licensed CDN, an approved embed
partner, or direct file URLs you have the right to host).

All configuration lives in **`src/lib/videoSources.ts`**.

## How it works

- `resolveEpisodeSources({ animeId, episode })` returns a list of `VideoSource` objects
  for a given episode.
- If the list is empty (the default), the watch page shows a clear
  **"No playback source configured"** state — never a fake player or a guessed URL.
- Each source is either:
  - `kind: 'embed'` — an `<iframe>` URL from a provider you are authorized to embed, or
  - `kind: 'direct'` — a progressive (`.mp4`) or HLS (`.m3u8`) file URL, optionally with a
    quality ladder and subtitle tracks.

## Adding a source

1. Open `src/lib/videoSources.ts`.
2. Set `ENABLE_DEMO_SOURCES` to `false` (keep it false) and add your entry to
   `SOURCE_CATALOG` (or replace the demo catalog entirely).
3. Provide a `buildUrl(ctx)` that returns the authorized URL for the episode, or `null`
   when that provider doesn't carry the episode (the UI will hide/disable it).

### Example — licensed HLS CDN (direct)

```ts
export const SOURCE_CATALOG: SourceCatalogEntry[] = [
  {
    id: 'cdn-a',
    label: 'Server A',
    kind: 'direct',
    buildUrl: (ctx) => `https://cdn.example.com/anime/${ctx.animeId}/${ctx.episode}/master.m3u8`,
    buildQualities: () => [
      { label: 'Auto', url: 'https://cdn.example.com/.../master.m3u8' },
      { label: '1080p', url: 'https://cdn.example.com/.../1080.m3u8', height: 1080 },
      { label: '720p', url: 'https://cdn.example.com/.../720.m3u8', height: 720 },
    ],
    buildSubtitles: () => [
      { srclang: 'ar', label: 'العربية', src: '/subs/ar.vtt', format: 'vtt', default: true },
      { srclang: 'en', label: 'English', src: '/subs/en.srt', format: 'srt' },
    ],
  },
]
```

### Example — approved embed partner

```ts
{
  id: 'embed-partner',
  label: 'Partner Embed',
  kind: 'embed',
  buildUrl: (ctx) => `https://player.partner.example/e/${ctx.animeId}/${ctx.episode}`,
}
```

## Loading sources from a backend

For a real deployment you'll usually want to fetch the source list per episode from your
own API instead of hardcoding it. `EpisodeContext.manifest` is provided for exactly this:

```ts
// In WatchPage.tsx (or a hook), fetch and inject:
const sources = await fetch(`/api/anime/${id}/ep/${ep}/sources`).then(r => r.json())
// then pass them straight into <VideoPlayer sources={sources} ... />
```

Because `<VideoPlayer>` takes `sources` as a prop, you can bypass the static catalog
entirely and feed it whatever your backend returns — the UI (source/quality/subtitle
selection, fullscreen, next/prev, progress) works identically.

## Subtitles

- `.vtt` files are used directly.
- `.srt` and `.ass` files are converted to WebVTT in the browser
  (see `src/lib/subtitles.ts`) so the native `<track>` element can display them.
- Subtitle selection supports Arabic and English (or any language you configure).

## Legal reminder

Only add sources you have the right to use. This project is a **frontend/UX layer** and
intentionally ships with no bundled video content.
