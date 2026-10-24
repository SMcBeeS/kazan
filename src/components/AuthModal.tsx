/**
 * AuthModal — dark-themed shared sign-in / sign-up modal (Supabase auth).
 *
 * Opened via `useAuth().openAuthModal()`. Signup enforces allowed email
 * domains (@gmail/@outlook/@yahoo) and matching confirm-password; on success
 * shows the "verification link sent" note (Supabase sends the email itself).
 */

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useI18n } from '../context/LanguageContext'
import { useAuth, isAllowedEmailDomain, ALLOWED_EMAIL_DOMAINS } from '../context/AuthContext'
import { Modal } from './ui/Modal'
import { Spinner } from './ui/Feedback'
import { cx } from '../lib/utils'
import { AvatarIcon } from './icons'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 8
type Mode = 'login' | 'signup'

/** Single shared instance (mounted once in main.tsx). */
export function AuthModal() {
  const { t } = useI18n()
  const { login, signup, authModalOpen, closeAuthModal } = useAuth()

  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)

  // Reset transient state each time the modal opens.
  useEffect(() => {
    if (authModalOpen) {
      setError('')
      setSuccess('')
      setPassword('')
      setConfirm('')
    }
  }, [authModalOpen])

  const emailValue = email.trim().toLowerCase()
  const emailInvalid =
    email.length > 0 && (!EMAIL_RE.test(emailValue) || !isAllowedEmailDomain(emailValue))
  const passwordInvalid = password.length > 0 && password.length < MIN_PASSWORD
  const confirmInvalid = mode === 'signup' && confirm.length > 0 && confirm !== password

  const switchMode = (next: Mode) => {
    if (next === mode) return
    setMode(next)
    setError('')
    setSuccess('')
    setPassword('')
    setConfirm('')
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!emailValue) return setError(t('auth.email.required'))
    if (!EMAIL_RE.test(emailValue)) return setError(t('auth.email.invalid'))
    if (!isAllowedEmailDomain(emailValue)) {
      return setError(
        `${t('auth.email.domainError')}\n${ALLOWED_EMAIL_DOMAINS.map((d) => '@' + d).join('  ·  ')}`,
      )
    }
    if (password.length < MIN_PASSWORD) return setError(t('auth.password.short', { n: MIN_PASSWORD }))
    if (mode === 'signup' && password !== confirm) return setError(t('auth.password.mismatch'))

    setBusy(true)
    try {
      if (mode === 'login') {
        const res = await login(emailValue, password)
        if (res.error) setError(res.error)
        else closeAuthModal() // onAuthStateChange updates `user` globally
      } else {
        const res = await signup(emailValue, password)
        if (res.ok) {
          setSuccess(t('auth.signup.sent'))
          setPassword('')
          setConfirm('')
        } else {
          setError(res.error ?? t('common.error'))
        }
      }
    } catch {
      setError(t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const field = (invalid: boolean) =>
    cx(
      'rounded-xl border bg-night-850 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 transition outline-none',
      invalid ? 'border-rose-500/70 focus:border-rose-400' : 'border-night-600/80 focus:border-white/40',
    )

  return (
    <Modal open={authModalOpen} onClose={closeAuthModal} title={t('auth.title')} size="md">
      <div className="flex flex-col gap-4">
        {/* Brand */}
        <div className="flex flex-col items-center gap-2 pb-1 pt-1">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-night-700 bg-night-800 text-slate-200">
            <AvatarIcon className="h-5 w-5" />
          </div>
          <p className="text-center text-xs leading-relaxed text-slate-400">{t('auth.subtitle')}</p>
        </div>

        {/* Mode tabs */}
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-night-700/70 bg-night-850/80 p-1">
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={cx(
                'rounded-lg px-3 py-2 text-xs font-bold transition',
                mode === m ? 'bg-white text-night-900 shadow' : 'text-slate-400 hover:text-white',
              )}
            >
              {t(m === 'login' ? 'auth.tab.login' : 'auth.tab.signup')}
            </button>
          ))}
        </div>

        {/* Success / error banners */}
        {success && (
          <div className="whitespace-pre-line rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs leading-relaxed text-emerald-200">
            {success}
          </div>
        )}
        {error && !success && (
          <div
            role="alert"
            className="whitespace-pre-line rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs leading-relaxed text-rose-200"
          >
            {error}
          </div>
        )}

        <form className="flex flex-col gap-3" onSubmit={onSubmit} noValidate>
          <label className="flex flex-col gap-1.5" htmlFor="auth-email">
            <span className="text-xs font-semibold text-slate-400">{t('auth.email.label')}</span>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@gmail.com"
              autoComplete="email"
              className={field(emailInvalid)}
            />
            {emailInvalid && (
              <span className="text-[11px] leading-snug text-rose-300">{t('auth.email.domainError')}</span>
            )}
          </label>

          <label className="flex flex-col gap-1.5" htmlFor="auth-password">
            <span className="text-xs font-semibold text-slate-400">{t('auth.password.label')}</span>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className={field(passwordInvalid)}
            />
            {passwordInvalid && (
              <span className="text-[11px] text-rose-300">{t('auth.password.short', { n: MIN_PASSWORD })}</span>
            )}
          </label>

          {mode === 'signup' && (
            <label className="flex flex-col gap-1.5" htmlFor="auth-confirm">
              <span className="text-xs font-semibold text-slate-400">{t('auth.password.confirmLabel')}</span>
              <input
                id="auth-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className={field(confirmInvalid)}
              />
              {confirmInvalid && <span className="text-[11px] text-rose-300">{t('auth.password.mismatch')}</span>}
            </label>
          )}

          <div className="rounded-xl border border-night-700/60 bg-night-850/60 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
            {t('auth.password.hint', {
              n: MIN_PASSWORD,
              domains: ALLOWED_EMAIL_DOMAINS.map((d) => '@' + d).join(' / '),
            })}
          </div>

          <button
            type="submit"
            disabled={busy}
            className="btn-primary flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && <Spinner className="h-4 w-4" />}
            {t(mode === 'login' ? 'auth.tab.login' : 'auth.tab.signup')}
          </button>
        </form>
      </div>
    </Modal>
  )
}