/**
 * AuthContext.tsx — Supabase-backed auth state for the whole app.
 *
 * `useAuth()` provides `{ user, session, loading, email, isAdmin, login,
 * signup, logout, supabaseConfigured, authModalOpen, openAuthModal,
 * closeAuthModal }`.
 *
 * The provider seeds its state from `supabase.auth.getSession()` on first
 * render and then subscribes to `onAuthStateChange`, so returning devices
 * are auto-logged in transparently (the Supabase client persists the
 * session in localStorage between visits).
 *
 * The shared login/sign-up modal's open/close flag also lives here so that
 * every surface (sidebar profile card, header account button) toggles the
 * same single modal instance rendered in main.tsx.
 *
 * Email-confirmation deep links are handled explicitly (see
 * `handleAuthHash`): the client is created with `detectSessionInUrl: false`
 * and this provider consumes the `#access_token=` / `#error_description=`
 * hash itself — stripping the raw fragment from the URL and raising a clean
 * toast when a link has expired or was already used.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { isAdminEmail } from '../lib/admin'
import { notifyToast } from '../components/ui/Toast'
import { getProfile } from '../lib/database'

/** Email domains accepted for signup (enforced in UI + before the request). */
export const ALLOWED_EMAIL_DOMAINS = ['gmail.com', 'outlook.com', 'yahoo.com']

/** Case-insensitive domain allow-list check (blocks look-alike domains). */
export function isAllowedEmailDomain(email: string): boolean {
  const at = email.lastIndexOf('@')
  if (at <= 0 || at === email.length - 1) return false
  const domain = email.slice(at + 1).trim().toLowerCase()
  return ALLOWED_EMAIL_DOMAINS.includes(domain)
}

export type LoginResult = { error: string | null }
export type SignupResult = { ok: boolean; error: string | null }

interface AuthContextValue {
  /** Signed-in user or `null` (also `null` while `loading` is still true). */
  user: User | null
  session: Session | null
  /** True until `supabase.auth.getSession()` resolves (or env is missing). */
  loading: boolean
  /** The user's verified email, or `null` when logged out. */
  email: string | null
  /** The user's profile `username` (from Supabase `profiles`), or `null` when absent / not yet loaded. */
  username: string | null
  /** True when `user.email` is in ADMIN_EMAILS (see lib/admin.ts). */
  isAdmin: boolean
  supabaseConfigured: boolean
  login: (email: string, password: string) => Promise<LoginResult>
  signup: (email: string, password: string) => Promise<SignupResult>
  logout: () => Promise<void>
  authModalOpen: boolean
  openAuthModal: () => void
  closeAuthModal: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [username, setUsername] = useState<string | null>(null)

  /**
   * Load the signed-in user's `username` from the Supabase `profiles` table on
   * mount and whenever the session user changes. Exposed via `useAuth()` so the
   * header dropdown and sidebar profile card can show the username (with the
   * email as a fallback) instead of the raw email. Reset to `null` on logout so
   * the previous user's name never "ghosts" onto the next session.
   */
  useEffect(() => {
    if (!supabaseConfigured || !session?.user) {
      setUsername(null)
      return
    }
    let cancelled = false
    const id = session.user.id
    void (async () => {
      const res = await getProfile(id)
      if (cancelled) return
      const name = res.data?.username?.trim()
      setUsername(name ? name : null)
    })()
    return () => {
      cancelled = true
    }
  }, [session?.user])

  /**
   * Consume the hash fragment Supabase appends after an email-link redirect
   * back to `window.location.origin` (set via `emailRedirectTo`):
   *  - `#error_description=...` → expired / already-used link: strip the hash
   *    so the raw API error never shows in the URL, then raise a clean toast.
   *  - `#access_token=...` (email-confirmation / implicit sign-in link) →
   *    apply the returned tokens via `setSession` (the onAuthStateChange
   *    subscription updates the `session` state as usual) and strip the hash.
   */
  const handleAuthHash = useCallback(() => {
    const hash = window.location.hash
    if (!hash || (!hash.includes('access_token') && !hash.includes('error_description'))) return
    // Clear the fragment before anything renders it (URL bar stays clean).
    if (window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    } else {
      window.location.hash = ''
    }
    const params = new URLSearchParams(hash.replace(/^#\/?/, ''))
    if (params.has('access_token')) {
      // Valid link: apply the fresh tokens immediately — the session that
      // follows is confirmed, so the app logs the user in right away.
      void supabase
        .auth.setSession({
          access_token: params.get('access_token') ?? '',
          refresh_token: params.get('refresh_token') ?? '',
        })
        .catch(() => notifyToast('auth.link.invalid'))
    } else {
      // `error_description` (expired / already-used OTP): clean UI notice.
      notifyToast('auth.link.invalid')
    }
  }, [])

  // Persistent auto-login + email-link hash handling on mount.
  useEffect(() => {
    // Consume a pending email-link hash FIRST so a confirmation redirect
    // never races the restored stored session.
    handleAuthHash()

    if (!supabaseConfigured) {
      setLoading(false)
      return
    }
    let cancelled = false
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return
      setSession(nextSession)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [handleAuthHash])

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    if (!supabaseConfigured) return { error: 'Supabase is not configured in this environment.' }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }, [])

  const signup = useCallback(async (email: string, password: string): Promise<SignupResult> => {
    if (!supabaseConfigured) return { ok: false, error: 'Supabase is not configured in this environment.' }
    if (!isAllowedEmailDomain(email)) {
      return { ok: false, error: `Only @${ALLOWED_EMAIL_DOMAINS.join(' / @')} emails are allowed.` }
    }
    // emailRedirectTo (nested under `options` in supabase-js ≥ 2.1xx) pins
    // Supabase's confirmation / reset email links to this live site (Vercel)
    // so users always return to the app — never to a raw API error page.
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, error: null }
  }, [])

  const logout = useCallback(async () => {
    if (supabaseConfigured) await supabase.auth.signOut()
  }, [])

  const openAuthModal = useCallback(() => setAuthModalOpen(true), [])
  const closeAuthModal = useCallback(() => setAuthModalOpen(false), [])

  const user = session?.user ?? null
  const email = user?.email ?? null
  // Role gate: ADMIN_EMAILS allow-list (case-insensitive).
  const isAdmin = isAdminEmail(email)

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      email,
      username,
      isAdmin,
      supabaseConfigured,
      login,
      signup,
      logout,
      authModalOpen,
      openAuthModal,
      closeAuthModal,
    }),
    [user, session, loading, email, username, isAdmin, login, signup, logout, authModalOpen, openAuthModal, closeAuthModal],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}