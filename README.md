# AnimeVerse أنييفيرس

A professional, **Arabic-first (RTL)** anime streaming frontend built with **React + TypeScript + Tailwind CSS**, using **real metadata** from the [AniList](https://anilist.co) GraphQL API.

> **Video note:** AnimeVerse ships with **no bundled video content** and does **not** scrape
> protected sites. Playback sources are clearly-labelled **placeholders** until you configure
> your own **authorized** sources. See [`docs/VIDEO_SOURCES.md`](docs/VIDEO_SOURCES.md).

## Features

- 🌙 Premium dark, anime-inspired interface
- 🌍 **Arabic (RTL, default)** and **English (LTR)** with instant switching + persistence
- 📱 Fully responsive (desktop + mobile)
- 🏠 **Homepage** — hero banner, trending, latest episodes, seasonal, top-rated, genres
- 📚 **Catalog** — search, sorting, filters (type/status/rating/genre/score) + pagination
- 📄 **Detail page** — poster, synopsis, genres, rating, stats, episode list, recommendations
- ▶️ **Watch page** — reusable player: multi-source selector, quality, Arabic/English subtitles
  (SRT/VTT/ASS), fullscreen, next/prev episode, and **local playback-progress resume**
- ❤️ **Favorites** and 🕘 **Watch History** (persisted in `localStorage`)
- ⚡ AniList GraphQL client with throttling, caching, 429/5xx-retry, and graceful loading/error states

## Tech stack

| Concern | Choice |
| --- | --- |
| Framework | React 18 + TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS (dark, custom theme) |
| Routing | React Router v6 |
| Video | Native `<video>` + [hls.js](https://github.com/video-dev/hls.js) for HLS |
| Data | AniList GraphQL API (direct, CORS-enabled) |

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server (http://localhost:5173)
npm run dev

# 3. Type-check / build for production
npm run build
npm run preview
```

> On this machine Node.js was installed via `winget install OpenJS.NodeJS.LTS`. If `npm` is
> blocked by PowerShell execution policy, use `npm.cmd` instead of `npm`.

## Project structure

```
src/
  components/
    layout/        Navbar, Footer, RootLayout
    ui/            Feedback (spinner/skeleton), States (error/empty), Form, Pagination
    anime/         AnimeCard, Carousel, HeroBanner, GenreGrid
    video/         VideoPlayer (reusable playback engine)
    icons.tsx      Inline SVG icons (no icon dependency)
  context/         LanguageContext (i18n + RTL/LTR), LibraryContext (favorites/history)
  hooks/           useAsync (loading/error/reload)
  lib/             anilist (GraphQL client), videoSources, subtitles, storage, types, utils
  i18n/            translations (ar + en) and helpers
  pages/           Home, Catalog, AnimeDetail, Watch, Favorites, History, NotFound
  main.tsx, App.tsx, index.css
```

## Configuring video sources

By default the catalog has **no** sources, so the watch page shows an "unavailable" state.
Add your authorized sources in [`src/lib/videoSources.ts`](src/lib/videoSources.ts)
(or load them from your backend and pass them to `<VideoPlayer sources={...} />`).
Full guide: [`docs/VIDEO_SOURCES.md`](docs/VIDEO_SOURCES.md).

## Attribution

Anime metadata is provided by the [AniList API](https://anilist.co).
This project hosts no media and is intended as a frontend/UX layer.
