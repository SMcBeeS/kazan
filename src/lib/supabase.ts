/**
 * supabase.ts — single shared Supabase client.
 *
 * Reads the project URL + anon (publishable) key from Vite env. The client
 * tolerates missing env values at module scope (so the app still renders in a
 * dev environment that lacks them) and exposes them via `supabaseConfigured`.
 */

import { createClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

/** True when both required env vars are present — gate any auth call on this. */
export const supabaseConfigured = Boolean(url && anonKey)

// detectSessionInUrl: false (nested under `auth` in supabase-js ≥ 2.1xx) →
// AuthContext takes over the email-link hash (#access_token /
// #error_description) so expired or already-used links produce a clean
// toast instead of a raw API error fragment in the URL bar.
export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder', {
  auth: {
    detectSessionInUrl: false,
  },
})