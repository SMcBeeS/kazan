import { useId, useEffect, useRef, useState } from 'react'
import { cx } from '../../lib/utils'

/**
 * Styled labeled select control.
 *
 * Custom React dropdown (button + floating <ul>) instead of a native
 * <select>, so the options can be animated, rounded and re-themed with the
 * site palette instead of the primitives' default OS blue highlight.
 */
export function Select({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close when clicking anywhere outside the control.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = options.find((o) => o.value === value)

  return (
    <div
      ref={rootRef}
      // Establish a stacking context on the outermost wrapper so the floating
      // <ul> always paints above sibling filter boxes in the grid. The z-index
      // is bumped while open so the active dropdown wins over its neighbours.
      className={cx('relative flex flex-col gap-1.5', open ? 'z-[100]' : 'z-10', className)}
    >
      <label htmlFor={id} className="text-xs font-semibold text-slate-400">
        {label}
      </label>
      <div className="relative z-[100]">
        <button
          id={id}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 rounded-2xl border border-night-600/80 bg-night-850 px-3 py-2.5 text-left text-sm text-slate-100 transition-colors hover:border-white/40 focus:border-white/40 focus:outline-none"
        >
          <span className="truncate">
            {selected ? selected.label : options.length ? options[0].label : '—'}
          </span>
          <svg
            className={cx(
              'h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200',
              open && 'rotate-180',
            )}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <ul
            role="listbox"
            className="absolute right-0 z-[100] mt-2 max-h-60 w-full min-w-[10rem] overflow-y-auto rounded-2xl border border-night-700 bg-night-900 p-1 shadow-xl animate-slide-down"
          >
            {options.map((o) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
                className={cx(
                  'cursor-pointer truncate rounded-xl px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-white/10 hover:text-white',
                  o.value === value && 'bg-white/5 text-white',
                )}
              >
                {o.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** Styled labeled text input. */
export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  className?: string
}) {
  const id = useId()
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-xs font-semibold text-slate-400">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-2xl border border-night-600/80 bg-night-850 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-white/40"
      />
    </div>
  )
}
