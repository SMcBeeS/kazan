/**
 * RoleContext — a lightweight mock role state (Viewer / Admin).
 *
 * Backed by localStorage so the choice persists across reloads. It exists
 * purely to gate the Admin page and drive the role switcher; there is no
 * real authentication in this static front-end.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type Role = 'viewer' | 'admin'

interface RoleContextValue {
  role: Role
  isAdmin: boolean
  setRole: (role: Role) => void
  toggleRole: () => void
}

const RoleContext = createContext<RoleContextValue | null>(null)

const STORAGE_KEY = 'animeverse:role'

function getInitialRole(): Role {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'admin' || stored === 'viewer') return stored as Role
  } catch {
    /* ignore */
  }
  return 'viewer'
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(getInitialRole)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, role)
    } catch {
      /* ignore */
    }
  }, [role])

  const setRole = useCallback((next: Role) => setRoleState(next), [])
  const toggleRole = useCallback(() => setRoleState((prev) => (prev === 'admin' ? 'viewer' : 'admin')), [])

  const value = useMemo<RoleContextValue>(
    () => ({ role, isAdmin: role === 'admin', setRole, toggleRole }),
    [role, setRole, toggleRole],
  )

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext)
  if (!ctx) throw new Error('useRole must be used within a RoleProvider')
  return ctx
}