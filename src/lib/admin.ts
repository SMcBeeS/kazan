/**
 * admin.ts — allow-list of admin accounts.
 *
 * Phase 1 gating is intentionally static: only accounts whose verified email
 * appears in `ADMIN_EMAILS` can see / use the Admin tab on the sidebar. This
 * list is the source of truth for both `Sidebar` and `AuthContext.isAdmin`.
 *
 * TODO: replace the placeholder below with your own verified email. Until
 * then no signed-in user will see the Admin tab (which is the desired safe-
 * default behaviour).
 */

export const ADMIN_EMAILS: string[] = ['mohamdmajid222@gmail.com']

/** Case-insensitive membership test against ADMIN_EMAILS. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  return ADMIN_EMAILS.some((a) => a.trim().toLowerCase() === normalized)
}