/**
 * Toast.tsx — minimal app-level toast (single visible slot, auto-dismiss).
 *
 * `notifyToast(key, vars?)` is a module-level emitter so any provider —
 * including AuthContext, which sits ABOVE <ToastProvider> in the tree —
 * can raise a message. The viewport resolves labels through i18n, so
 * <ToastProvider> must be mounted below <LanguageProvider> (see main.tsx).
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useI18n } from '../../context/LanguageContext'
import { cx } from '../../lib/utils'

export interface ToastEntry {
  key: string
  vars?: Record<string, string | number>
  /** Monotonic id so repeat messages re-trigger the animation. */
  id: number
}

const listeners = new Set<(t: ToastEntry | null) => void>()
let current: ToastEntry | null = null
let idSeq = 0
let timer: ReturnType<typeof setTimeout> | undefined

const TOAST_TTL = 8000

/** Raise a toast by i18n key (`t` resolves the label in the viewport). */
export function notifyToast(key: string, vars?: Record<string, string | number>) {
  current = { key, vars, id: ++idSeq }
  listeners.forEach((l) => l(current))
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    current = null
    listeners.forEach((l) => l(null))
  }, TOAST_TTL)
}

/** Mount once (inside LanguageProvider, above App — see main.tsx). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastEntry | null>(null)
  useEffect(() => {
    const listener = (t: ToastEntry | null) => setToast(t)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return (
    <>
      {children}
      <ToastViewport toast={toast} />
    </>
  )
}

function ToastViewport({ toast }: { toast: ToastEntry | null }) {
  const { t } = useI18n()
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex justify-center px-4 lg:bottom-6"
      aria-live="polite"
    >
      {toast && (
        <div
          key={toast.id}
          role="alert"
          className={cx(
            'pointer-events-auto max-w-md animate-fade-in rounded-2xl border border-rose-500/40 bg-night-850/95 px-4 py-3',
            'text-center text-sm leading-relaxed text-rose-100 shadow-card backdrop-blur-md',
          )}
        >
          {t(toast.key, toast.vars)}
        </div>
      )}
    </div>
  )
}