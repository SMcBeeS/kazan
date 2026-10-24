import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useI18n } from '../context/LanguageContext'
import { translateGenre } from '../i18n'
import { anilist, currentSeason } from '../lib/anilist'
import type { ListParams } from '../lib/anilist'
import { useAsync } from '../hooks/useAsync'
import { debounce } from '../lib/utils'
import type { AnimeSummary } from '../lib/types'
import { AnimeCard, AnimeCardSkeleton } from '../components/anime/AnimeCard'
import { ErrorState, EmptyState } from '../components/ui/States'
import { Select, TextInput } from '../components/ui/Form'
import { Pagination } from '../components/ui/Pagination'
import { FilterIcon, SearchIcon } from '../components/icons'

const SORTS = ['score', 'popularity', 'rank', 'title', 'episodes', 'start_date']
/**
 * Filter values accepted by the AniList adapter (mapFormatFilter /
 * mapStatusFilter in lib/anilist). Deep links carrying any other value (e.g.
 * `?type=ona`) are appended dynamically so they stay visible/selectable.
 */
const TYPES = ['tv', 'movie', 'ova']
const STATUSES = ['complete', 'airing', 'upcoming', 'cancelled']
/**
 * "Target Audience" options — AniList models these as TAGS (it has no
 * MAL-style age-rating enums), so each value maps to a `tag_in` filter via
 * AUDIENCE_TAG (see lib/anilist). Empty string = no tag filter.
 */
const AUDIENCES = ['', 'shounen', 'seinen', 'shoujo', 'josei', 'kids']

const AUDIENCE_TAG: Record<string, string> = {
  shounen: 'Shounen',
  seinen: 'Seinen',
  shoujo: 'Shoujo',
  josei: 'Josei',
  kids: 'Kids',
}

const audienceLabelKey: Record<string, string> = {
  '': 'catalog.audience.all',
  shounen: 'catalog.audience.shounen',
  seinen: 'catalog.audience.seinen',
  shoujo: 'catalog.audience.shoujo',
  josei: 'catalog.audience.josei',
  kids: 'catalog.audience.kids',
}

const sortLabelKey: Record<string, string> = {
  score: 'catalog.sort.score',
  popularity: 'catalog.sort.popularity',
  rank: 'catalog.sort.rank',
  title: 'catalog.sort.title',
  episodes: 'catalog.sort.episodes',
  start_date: 'catalog.sort.startDate',
}

const typeLabelKey: Record<string, string> = {
  tv: 'catalog.type.tv',
  movie: 'catalog.type.movie',
  ova: 'catalog.type.ova',
}

const statusLabelKey: Record<string, string> = {
  complete: 'catalog.status.complete',
  airing: 'catalog.status.airing',
  upcoming: 'catalog.status.upcoming',
  cancelled: 'catalog.status.cancelled',
}

/** AniList season filter values (map to the `season` GraphQL arg). */
const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL']

const seasonLabelKey: Record<string, string> = {
  WINTER: 'catalog.season.winter',
  SPRING: 'catalog.season.spring',
  SUMMER: 'catalog.season.summer',
  FALL: 'catalog.season.fall',
}

/**
 * Descending list of recent calendar years for the YEAR filter, anchored at the
 * current year (from currentSeason so it always matches the live season).
 */
function buildYearOptions(tfn: (k: string) => string): { value: string; label: string }[] {
  const cur = currentSeason().year
  const opts: { value: string; label: string }[] = [{ value: '', label: tfn('catalog.all') }]
  for (let y = cur; y >= cur - 15; y--) opts.push({ value: String(y), label: String(y) })
  return opts
}

/**
 * CatalogPage — search + sort + filter + pagination.
 * State lives in the URL (?q=&page=&sort=&order=&type=&status=&genres=&min_score=)
 * so searches are shareable and the back button behaves as expected.
 */
export default function CatalogPage() {
  const { t, lang } = useI18n()
  const [params, setParams] = useSearchParams()

  const q = params.get('q') ?? ''
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1)
  const sort = params.get('sort') ?? 'popularity'
  const order = params.get('order') ?? 'desc'
  const type = params.get('type') ?? ''
  const status = params.get('status') ?? ''
  const audience = params.get('audience') ?? ''
  const genres = params.get('genres') ?? ''
  // Genre NAME deep-link, e.g. /catalog?genre=Action (#5)
  const genreNameParam = params.get('genre') ?? ''
  const minScore = params.get('min_score') ?? ''
  const season = params.get('season') ?? ''
  const year = params.get('year') ?? ''

  const [searchInput, setSearchInput] = useState(q)
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => setSearchInput(q), [q])

  // Auto-open the filter panel when a genre deep-link is present so the user
  // can see (and clear) the active genre filter.
  useEffect(() => {
    if (genreNameParam || genres) setShowFilters(true)
  }, [genreNameParam, genres])

  const commitSearch = useMemo(
    () =>
      debounce((value: string) => {
        setParams(
          (prev) => {
            const next = new URLSearchParams(prev)
            if (value) next.set('q', value)
            else next.delete('q')
            next.delete('page')
            return next
          },
          { replace: true },
        )
      }, 300),
    [setParams],
  )

  const update = (key: string, value: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        if (key !== 'page') next.delete('page')
        return next
      },
      { replace: true },
    )
  }

  const queryParams: ListParams = useMemo(
    () => ({
      q: q || undefined,
      page,
      order_by: sort,
      sort: order as 'asc' | 'desc',
      type: type || undefined,
      status: status || undefined,
      tags: AUDIENCE_TAG[audience] || undefined,
      genre: genreNameParam || undefined,
      genres: genres || undefined,
      min_score: minScore ? Number(minScore) : undefined,
      season: season || undefined,
      season_year: year ? Number(year) : undefined,
      sfw: true,
      // AniList reports placeholder totals (5000/208) for multi-page result
      // sets; ask the adapter to reconcile the REAL total / last page so the
      // results badge and pagination are truthful and never reach empty pages.
      verify_pagination: true,
    }),
    [q, page, sort, order, type, status, audience, genreNameParam, genres, minScore, season, year],
  )

  const result = useAsync((s) => anilist.searchAnime(queryParams, s).then((r) => r), [queryParams])
  const genresList = useAsync((s) => anilist.getGenres(s).then((r) => r.data), [])

  // Deep links (or stale URLs) can point past the real last page — snap back
  // instead of showing an empty result set.
  useEffect(() => {
    const data = result.data
    if (!data) return
    const lastVisible = data.pagination.last_visible_page
    if (data.data.length === 0 && page > 1 && page > lastVisible) {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('page', String(Math.max(1, lastVisible)))
          return next
        },
        { replace: true },
      )
    }
  }, [result.data, page, setParams])

  const totalPages = result.data?.pagination.last_visible_page ?? 1
  const totalItems = result.data?.pagination.items.total
  // Never display a page number beyond the real last page while clamping.
  const displayPage = Math.min(page, Math.max(1, totalPages))

  return (
    <div className="container-page py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-wide text-white sm:text-3xl">{t('catalog.title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('catalog.subtitle')}</p>
      </header>

      <SearchBar
        value={searchInput}
        showFilters={showFilters}
        onSearch={(v) => {
          setSearchInput(v)
          commitSearch(v)
        }}
        onToggleFilters={() => setShowFilters((v) => !v)}
      />

      {showFilters && (
        <FiltersPanel
          values={{ sort, order, type, status, audience, genres, minScore, season, year }}
          genres={genresList.data}
          onChange={update}
          onReset={() => setParams(new URLSearchParams(), { replace: true })}
        />
      )}

      {/* Active genre deep-link chip (#5) */}
      {genreNameParam && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm text-slate-400">{t('catalog.genres')}:</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-400/50 bg-white/10 px-3 py-1 text-sm font-semibold text-slate-200">
            {translateGenre(genreNameParam, lang)}
            <button
              type="button"
              onClick={() => {
                setParams(
                  (prev) => {
                    const next = new URLSearchParams(prev)
                    next.delete('genre')
                    next.delete('page')
                    return next
                  },
                  { replace: true },
                )
              }}
              aria-label={t('common.close')}
              className="text-slate-300 transition hover:text-white"
            >
              ×
            </button>
          </span>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between text-sm text-slate-400">
        <span>
          {result.data ? `${t('catalog.results')}: ${totalItems ?? 0}` : t('common.loading')}
        </span>
        {totalPages > 1 && (
          <span>
            {t('catalog.page')} {displayPage} {t('catalog.of')} {totalPages}
          </span>
        )}
      </div>

      <Results
        loading={result.loading}
        error={result.error}
        items={result.data?.data}
        hasData={Boolean(result.data)}
        onRetry={result.reload}
      />

      {result.data && result.data.data.length > 0 && (
        <Pagination
          page={displayPage}
          totalPages={totalPages}
          onChange={(p) => {
            update('page', String(p))
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        />
      )}
    </div>
  )
}

/* ------------------------------- search bar ------------------------------ */

function SearchBar({
  value,
  showFilters,
  onSearch,
  onToggleFilters,
}: {
  value: string
  showFilters: boolean
  onSearch: (v: string) => void
  onToggleFilters: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <SearchIcon className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="search"
          value={value}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t('catalog.searchPlaceholder')}
          aria-label={t('catalog.searchPlaceholder')}
          className="w-full rounded-xl border border-night-700/70 bg-night-850 py-3 pe-3 ps-9 text-sm text-slate-100 placeholder:text-slate-500 focus:border-white/40"
        />
      </div>
      <button onClick={onToggleFilters} className="btn-ghost" aria-expanded={showFilters}>
        <FilterIcon className="h-4 w-4" />
        {showFilters ? t('catalog.hideFilters') : t('catalog.showFilters')}
      </button>
    </div>
  )
}

/* ----------------------------- filters panel ----------------------------- */

function FiltersPanel({
  values,
  genres,
  onChange,
  onReset,
}: {
  values: {
    sort: string
    order: string
    type: string
    status: string
    audience: string
    genres: string
    season: string
    year: string
    minScore: string
  }
  genres?: { mal_id: number; name: string }[] | null
  onChange: (key: string, value: string) => void
  onReset: () => void
}) {
  const { t, lang } = useI18n()
  // Localised option lists for format/status (Arabic ⇄ English).
  const typeOptions = [
    { value: '', label: t('catalog.all') },
    ...TYPES.map((x) => ({ value: x, label: t(typeLabelKey[x]) })),
  ]
  const statusOptions = [
    { value: '', label: t('catalog.all') },
    ...STATUSES.map((x) => ({ value: x, label: t(statusLabelKey[x]) })),
  ]
  // Keep unknown deep-linked values (e.g. legacy `?type=ona`) selectable.
  if (values.type && !typeOptions.some((o) => o.value === values.type)) {
    typeOptions.push({ value: values.type, label: values.type.toUpperCase() })
  }
  if (values.status && !statusOptions.some((o) => o.value === values.status)) {
    statusOptions.push({ value: values.status, label: values.status })
  }
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 rounded-2xl border border-night-700/70 bg-night-850/60 p-4 sm:grid-cols-3 lg:grid-cols-6">
      {/* YEAR + SEASON — the primary "Browse Anime" filters, rendered like
          the other grid inputs (no extra wrapper box). */}
      <Select
        label={t('catalog.year')}
        value={values.year}
        onChange={(v) => onChange('year', v)}
        options={buildYearOptions(t)}
      />
      <Select
        label={t('catalog.season')}
        value={values.season}
        onChange={(v) => onChange('season', v)}
        options={[
          { value: '', label: t('catalog.all') },
          ...SEASONS.map((s) => ({ value: s, label: t(seasonLabelKey[s]) })),
        ]}
      />
      <Select
        label={t('catalog.sort')}
        value={values.sort}
        onChange={(v) => onChange('sort', v)}
        options={SORTS.map((s) => ({ value: s, label: t(sortLabelKey[s]) }))}
      />
      <Select
        label={t('catalog.order')}
        value={values.order}
        onChange={(v) => onChange('order', v)}
        options={[
          { value: 'desc', label: t('catalog.desc') },
          { value: 'asc', label: t('catalog.asc') },
        ]}
      />
      <Select
        label={t('catalog.type')}
        value={values.type}
        onChange={(v) => onChange('type', v)}
        options={typeOptions}
      />
      <Select
        label={t('catalog.status')}
        value={values.status}
        onChange={(v) => onChange('status', v)}
        options={statusOptions}
      />
      <Select
        label={t('catalog.audience')}
        value={values.audience}
        onChange={(v) => onChange('audience', v)}
        options={AUDIENCES.map((x) => ({ value: x, label: t(audienceLabelKey[x]) }))}
      />
      <TextInput
        label={t('catalog.minScore')}
        type="number"
        value={values.minScore}
        onChange={(v) => onChange('min_score', v)}
        placeholder="0"
      />
      {genres && (
        <Select
          label={t('catalog.genres')}
          value={values.genres}
          onChange={(v) => onChange('genres', v)}
          options={[
            { value: '', label: '—' },
            ...genres.map((g) => ({ value: String(g.mal_id), label: translateGenre(g.name, lang) })),
          ]}
        />
      )}
      <div className="col-span-full flex justify-center mt-2">
        <button onClick={onReset} className="btn-ghost w-48">
          {t('catalog.reset')}
        </button>
      </div>
    </div>
  )
}

/* -------------------------------- results -------------------------------- */

function Results({
  loading,
  error,
  items,
  hasData,
  onRetry,
}: {
  loading: boolean
  error: string | null
  items?: AnimeSummary[]
  hasData: boolean
  onRetry: () => void
}) {
  const { t } = useI18n()
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        <AnimeCardSkeleton count={18} />
      </div>
    )
  }
  if (error && !hasData) return <ErrorState message={error} onRetry={onRetry} />
  if (items && items.length === 0) {
    return <EmptyState title={t('catalog.noResults')} hint={t('catalog.noResultsHint')} />
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items?.map((a) => (
        <AnimeCard key={a.mal_id} anime={a} />
      ))}
    </div>
  )
}

