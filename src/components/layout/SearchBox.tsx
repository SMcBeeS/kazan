import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../context/LanguageContext'
import { anilist, type AnimeSuggestion } from '../../lib/anipub'
import { cx, formatLabel, formatScore } from '../../lib/utils'
import { CloseIcon, SearchIcon, StarIcon } from '../icons'

/** Debounce before firing a live-search request while typing. */
const SEARCH_DEBOUNCE_MS = 250

/**
 * Live AniList search box. Typing (debounced 250ms) opens a floating dropdown of
 * suggestions; clicking a row opens its detail page. Enter navigates to the
 * catalog search results page for the query (/catalog?q=...).
 */
export function SearchBox({
  className,
  inputRef,
  showShortcut = false,
}: {
  className?: string
  inputRef?: RefObject<HTMLInputElement>
  showShortcut?: boolean
}) {
  const { t, lang } = useI18n()
  const wrapRef = useRef<HTMLFormElement>(null)
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<AnimeSuggestion[]>([])
  const requestIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const trimmed = query.trim()

  // Debounced live suggestions. Stale responses are dropped via a request id;
  // each new fetch aborts the previous in-flight one.
  useEffect(() => {
    const requestId = ++requestIdRef.current
    if (!trimmed) {
      abortRef.current?.abort()
      setSuggestions([])
      setLoading(false)
      return
    }
    const timer = setTimeout(() => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      anilist
        .searchSuggestions(trimmed, controller.signal)
        .then((items) => {
          if (requestId !== requestIdRef.current) return
          setSuggestions(items)
          setLoading(false)
        })
        .catch(() => {
          if (requestId === requestIdRef.current) setLoading(false)
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [trimmed])

  // Dismiss the dropdown on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open ])

  // Abort any in-flight suggestion fetch on unmount.
  useEffect(() => () => abortRef.current?.abort(), [])

  const showDropdown = open && trimmed.length > 0

  return (
    <form
      ref={wrapRef}
      role="search"
      className={className}
      onSubmit={(e) => {
        e.preventDefault()
        setOpen(false)
        if (trimmed) {
          window.location.assign(`/catalog?q=${encodeURIComponent(trimmed)}`)
        }
      }}
    >
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={showShortcut ? `${t('nav.search')}  ( / )` : t('nav.search')}
          aria-label={t('nav.search')}
          aria-expanded={showDropdown}
          aria-controls={listId}
          role="combobox"
          autoComplete="off"
          className="h-11 w-full rounded-full border border-night-600/60 bg-slate-900/60 pe-9 ps-10 text-sm text-slate-100 shadow-inner backdrop-blur-md transition placeholder:text-slate-500 hover:border-night-600 focus:border-slate-400/70 focus:outline-none focus:ring-2 focus:ring-slate-500/40"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setSuggestions([])
            }}
            aria-label={t('common.close')}
            className="absolute end-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-night-700 hover:text-white"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute inset-x-0 top-full z-50 pt-2">
          <div
            id={listId}
            role="listbox"
            className="card-surface max-h-80 overflow-y-auto p-1.5 shadow-card"
          >
            {loading && suggestions.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-slate-500">{t('common.loading')}</p>
            )}
            {!loading && suggestions.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-slate-500">
                {t('catalog.noResults')}
              </p>
            )}
            {suggestions.map((s) => (
              <Link
                key={s.id}
                to={`/anime/${s.id}`}
                role="option"
                aria-selected="false"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-night-700/60"
              >
                <img
                  src={s.coverImage}
                  alt=""
                  loading="lazy"
                  className="h-12 w-9 shrink-0 rounded-md object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">
                    {s.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                    {s.format && (
                      <span className="rounded bg-night-700 px-1.5 py-px font-semibold uppercase">
                        {formatLabel(s.format, lang)}
                      </span>
                    )}
                    {s.averageScore != null && (
                      <span className={cx('flex items-center gap-0.5 font-semibold text-gold-400')}>
                        <StarIcon filled className="h-3 w-3" />
                        {formatScore(s.averageScore)}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </form>
  )
}
