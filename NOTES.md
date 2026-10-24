# Phase 1 — AniPub data-layer rebuild (anipub-rebuild branch)

## Checklist
- [x] Step 0 — snapshot repo state (branch anipub-rebuild, baseline commit taken)
- [x] Step 1 — report state: no .git existed → initialized on `anipub-rebuild`;
      src/lib/anipub.ts did NOT exist (fresh start, not half-written); node_modules present
- [x] Step 2 — write src/lib/anipub.ts (throttle + 429 retry, no failed caching)
- [ ] Step 2b — re-point the 10 files importing lib/anilist to lib/anipub
- [ ] Step 3 — delete temp files (`_*.ps1/_raw_*.txt/_ap_*, _real*.txt, _sigs*.txt`, …)
- [ ] Step 4 — run type-check (npm run lint = tsc --noEmit) and show result
- [ ] Step 5 — write test instructions + list of unverified items

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