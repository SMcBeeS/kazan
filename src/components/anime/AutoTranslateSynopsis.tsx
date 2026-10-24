import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../context/LanguageContext'
import { cx, stripHtml } from '../../lib/utils'
import { translateToArabic } from '../../lib/translate'
import { LanguageIcon } from '../icons'
import { Spinner } from '../ui/Feedback'

/**
 * AutoTranslateSynopsis — shows an AniList (English) synopsis with an optional
 * "الترجمة التلقائية إلى العربية" toggle. When the Arabic UI is active the
 * user can request a machine translation via a free endpoint; the cleaned
 * English text is always available as a graceful fallback (#1).
 *
 * - The English text is run through stripHtml() so `<br>`/`<i>` never render as
 *   broken markup.
 * - Translation is best-effort: on any failure we keep showing the original.
 * - In-flight requests are aborted on unmount / when toggling back.
 */
export function AutoTranslateSynopsis({
  description,
  lines = 6,
  className,
}: {
  description: string | null | undefined
  lines?: number
  className?: string
}) {
  const { t, lang } = useI18n()
  const cleaned = stripHtml(description)
  const [translated, setTranslated] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTranslated, setShowTranslated] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  /** Abort any in-flight request. */
  const abort = () => {
    abortRef.current?.abort()
    abortRef.current = null
  }

  /** Fetch the Arabic translation for `source` and reveal it on success. */
  const fetchTranslation = async (source: string) => {
    abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)
    try {
      const result = await translateToArabic(source, controller.signal)
      if (!controller.signal.aborted) {
        if (result) {
          setTranslated(result)
          setShowTranslated(true)
        } else {
          setError(t('detail.translateError'))
        }
      }
    } catch {
      if (!controller.signal.aborted) setError(t('detail.translateError'))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  // Reset whenever the underlying synopsis changes — and auto-trigger the
  // translation when the UI language is Arabic, no manual click required (#3).
  // English UI shows the cleaned original synopsis by default.
  useEffect(() => {
    abort()
    setTranslated(null)
    setShowTranslated(false)
    setError(null)
    setLoading(false)
    if (lang === 'ar' && cleaned) void fetchTranslation(cleaned)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleaned, lang])

  const handleTranslate = () => {
    if (showTranslated) {
      // Toggle back to the original.
      setShowTranslated(false)
      return
    }
    if (translated) {
      setShowTranslated(true)
      return
    }
    void fetchTranslation(cleaned)
  }

  if (!cleaned) return null

  const displayText = showTranslated && translated ? translated : cleaned

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        {showTranslated && translated && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-slate-300">
            <LanguageIcon className="h-3.5 w-3.5" />
            {t('detail.translatedNote')}
          </span>
        )}
        <button
          type="button"
          onClick={handleTranslate}
          disabled={loading}
          aria-pressed={showTranslated}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition',
            showTranslated
              ? 'border-slate-400/60 bg-white/10 text-slate-200 hover:bg-white/20'
              : 'border-night-600/80 bg-night-800/70 text-slate-300 hover:border-slate-400/60 hover:text-white',
            loading && 'cursor-wait opacity-70',
          )}
        >
          {loading ? (
            <Spinner className="h-3.5 w-3.5" />
          ) : (
            <LanguageIcon className="h-3.5 w-3.5" />
          )}
          {loading
            ? t('detail.translating')
            : showTranslated
              ? t('detail.showOriginal')
              : t('detail.autoTranslate')}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-amber-400/90">{error}</p>}

      {/* clamp container */}
      <SynopsisClamp text={displayText} lines={lines} lang={lang} />
    </div>
  )
}

// Static clamp classes so Tailwind's content scanner can see them.
const CLAMP_CLASS: Record<number, string> = {
  2: 'line-clamp-2',
  3: 'line-clamp-3',
  4: 'line-clamp-4',
  5: 'line-clamp-5',
  6: 'line-clamp-6',
}

function SynopsisClamp({
  text,
  lines,
  lang,
}: {
  text: string
  lines: number
  lang: string
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const clamp = CLAMP_CLASS[Math.min(6, Math.max(2, lines))] ?? CLAMP_CLASS[4]
  return (
    <div className="mt-3">
      <p
        dir={lang}
        className={cx('whitespace-pre-line text-sm leading-relaxed text-slate-300', !expanded && clamp)}
      >
        {text}
      </p>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-slate-300 transition hover:text-white"
      >
        {expanded ? t('detail.readLess') : t('detail.readMore')}
      </button>
    </div>
  )
}
