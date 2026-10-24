import { cx } from '../../lib/utils'

/** Inline SVG spinner. */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx('animate-spin', className)}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Centered loading block with optional label. */
export function Loading({ label }: { label?: string }) {
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-slate-400"
      role="status"
      aria-live="polite"
    >
      <Spinner className="h-8 w-8 text-slate-300" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  )
}

/** Shimmering placeholder box. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton rounded-xl', className)} aria-hidden="true" />
}
