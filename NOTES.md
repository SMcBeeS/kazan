# Phase 1 — AniPub data-layer rebuild (anipub-rebuild branch)

## Checklist
- [x] Step 0 — snapshot repo state (branch anipub-rebuild, baseline commit taken)
- [x] Step 1 — report state: no .git existed → initialized on `anipub-rebuild`;
      src/lib/anipub.ts did NOT exist (fresh start, not half-written); node_modules present
- [x] Step 2 — write src/lib/anipub.ts (throttle + 429 retry, no failed caching)
- [x] Step 2b — re-point the 10 files importing lib/anilist to lib/anipub
      (verified 2026-10-24: no `from '...lib/anilist'` imports remain anywhere in src;
      only stale comments in anipub.ts/types.ts/AnimeDetailPage/CatalogPage/WatchPage mention it)
- [x] Step 3 — delete temp files (`_*.ps1/_raw_*.txt/_ap_*, _real*.txt, _sigs*.txt`, …)
      (all `_*.txt/_*.ps1/_*.cjs/_ap_*` etc. removed from project root; src untouched)
- [x] Step 4 — run type-check; `node node_modules/typescript/bin/tsc --noEmit` → exit code 0
- [x] Step 5 — test instructions + unverified items documented below

## Manual test plan (Phase 1, data layer only)
1. Run `npm run dev` in F:\kazan-master\kazan-master.
2. Home page: "Top rated" / "Continuing" rails should populate (first load may take a
   while — requests are queue-spaced ~32 s apart to respect the AniPub rate limit).
3. Catalog: load grid, try search, genre chips, type/status filters, sort; check
   ?genres= deep links from detail-page chips.
4. SearchBox in the header: type a title, autocomplete should use /api/search.
5. Open a show page: cover, banner, description, genres, score, relations/recommendations
   (same-genre), schedule entry.
6. Open an episode page: episode side-list renders 1..N from the AniPub episode count;
   video source logic is Phase 2 and unchanged.
7. Schedule page intentionally shows an empty state (AniPub has no schedule endpoint).

## Could NOT verify without running the app
- Actual AniPub response shapes at runtime (probes are stale — the _ap_*.txt files
  were removed in cleanup; mappings are documented in the table above).
- Rate-limit behavior under real bursts (32 s queue interval + 429 retry are code-
  only verified).
- Image URL resolution for every endpoint variant (relative vs absolute ImagePath).
- Whether in-memory paging + localStorage cache survive a real session (quota, tab
  refresh), and that failed requests are never cached.
- Search suggestion typing UX, debounce latency, and per-page load times under the
  ~32 s min interval (home fires several requests, so later rails load serially).
- Watch page video playback (Phase 2 by design; only the type-level episode count
  fix was in scope).
- Profile "Continue watching" / metadata resolution (fetchAnimeMetadata) with real
  stored AniPub ids.

## API mapping (only documented endpoints used)
| method | AniPub endpoint | notes |
|---|---|---|
| searchAnime | /api/searchall/:name? (plain search), /api/findbyGenre/:genre (genre), /api/findbyrating (?min_score, sort 'score') | pagination from array length (page full ⇒ next) |
| searchSuggestions | /api/search/:name | items lack score → averageScore null |
| getAnime / getAnimeLite | /api/info/:id | |
| getEpisodes | /api/info/:id (epCount) + local pagination | no airing dates |
| getTopAnime | /api/findbyrating (all page ranks), airing/upcoming → findbyrating fallbacks | |
| getSeasonNow | /api/findbyrating fallback (documented endpoints have no season filter) | |
| getSchedule | NOT DOCUMENTED → returns empty list (fallback decision recorded in module comments) | |
| getUpcoming | /api/getlast, /api/searchall/:slug for recent titles | |
| getGenres | static documented genre list (docs list no genre-collection endpoint beyond /api/findbyGenre) | |
| getRecommendations | /api/findbyGenre/:genre using the title's own genres | same-genre recs |
| getRelations | /api/findbyGenre/:first-word heuristic fallback (no relations endpoint documented) | |
| fetchAnimeMetadata | /api/info/:id per id (batch via local cache, in-memory + localStorage) | |
| currentSeason | pure local date math (same as before) | |

Image rule: relative ImagePath → `https://anipub.org/` + path.