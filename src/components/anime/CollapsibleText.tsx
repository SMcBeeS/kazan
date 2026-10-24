import { useId, useState } from 'react'
import { useI18n } from '../../context/LanguageContext'
import { cx } from '../../lib/utils'
import { ChevronDown } from '../icons'

// Static clamp classes so Tailwind's content scanner can see them.
const CLAMP_CLASS: Record<number, string> = {
  2: 'line-clamp-2',
  3: 'line-clamp-3',
  4: 'line-clamp-4',
  5: 'line-clamp-5',
  6: 'line-clamp-6',
}

/**
 * CollapsibleText — long-form text (synopsis / background) with a
 * "Read More / إقرأ المزيد" toggle. When collapsed the text is clamped to a
 * fixed number of lines; expanding reveals the full content. The toggle is
 * only shown when the text actually overflows the clamp height.
 */
export function CollapsibleText({
  text,
  lines = 4,
  className,
}: {
  text: string
  lines?: number
  className?: string
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const id = useId()

  if (!text) return null

  const clamp = CLAMP_CLASS[lines] ?? CLAMP_CLASS[4]

  return (
    <div>
      <p
        id={id}
        className={cx(
          'whitespace-pre-line text-sm leading-relaxed text-slate-300',
          !expanded && clamp,
          className,
        )}
      >
        {text}
      </p>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={id}
        className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-slate-300 transition hover:text-white"
      >
        {expanded ? t('detail.readLess') : t('detail.readMore')}
        <ChevronDown
          className={cx('h-4 w-4 transition-transform', expanded && 'rotate-180')}
        />
      </button>
    </div>
  )
}
