/**
 * LanguageProvider — manages active language + document direction (RTL/LTR).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { dictionaries, translate, LANGUAGES } from '../i18n'
import type { Dict, Lang } from '../i18n'

type Vars = Record<string, string | number>

interface LanguageContextValue {
  lang: Lang
  dir: 'rtl' | 'ltr'
  setLang: (lang: Lang) => void
  toggleLang: () => void
  t: (key: string, vars?: Vars) => string
  dict: Dict
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

const STORAGE_KEY = 'animeverse:lang'

function getInitialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'ar' || stored === 'en') return stored as Lang
  } catch {
    /* ignore */
  }
  return 'en' as Lang
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getInitialLang)
  const dir = LANGUAGES.find((l) => l.code === lang)?.dir ?? 'ltr'

  useEffect(() => {
    const html = document.documentElement
    html.lang = lang
    html.dir = dir
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      /* ignore */
    }
  }, [lang, dir])

  const setLang = useCallback((next: Lang) => setLangState(next), [])
  const toggleLang = useCallback(
    () => setLangState((prev) => (prev === 'ar' ? 'en' : 'ar')),
    [],
  )

  const dict = dictionaries[lang]
  const t = useCallback((key: string, vars?: Vars) => translate(dict, key, vars), [dict])

  const value = useMemo<LanguageContextValue>(
    () => ({ lang, dir, setLang, toggleLang, t, dict }),
    [lang, dir, setLang, toggleLang, t, dict],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useI18n(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useI18n must be used within a LanguageProvider')
  return ctx
}