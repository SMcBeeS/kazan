import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useI18n } from '../../context/LanguageContext'
import { SearchBox } from './SearchBox'
import { BrandMark, BrandTitle } from './Sidebar'
import { ArrowLeft, LanguageIcon } from '../icons'
import { NotificationBell } from '../Notifications'

/**
 * Dashboard top header bar inside the content canvas: pill search with the
 * cascading dropdown, language toggle, notifications placeholder, and avatar.
 */
export function HeaderBar() {
  const { t, lang, toggleLang } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const notifBoxRef = useRef<HTMLDivElement>(null)

  // Show a back button in the header row only on the anime detail page.
  const showBack = /^\/anime\/[^/]+$/.test(location.pathname)
  const handleBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

  // Global "/" shortcut focuses the search field.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (e.key === '/' && !typing) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // Close the notifications popover on Escape.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNotifOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // Dismiss the notifications popover when clicking outside its trigger box.
  useEffect(() => {
    if (!notifOpen) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      const inNotif = notifBoxRef.current?.contains(target) ?? false
      if (!inNotif) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [notifOpen])

  return (
    <div className="flex items-center gap-1.5 sm:gap-2.5">
      {/* Back button (anime detail only) — sits in the top header row, above the banner card */}
      {showBack && (
        <button
          type="button"
          onClick={handleBack}
          className="relative z-30 inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-night-600/70 bg-night-850/70 px-2.5 py-1.5 text-sm font-semibold text-slate-100 shadow-card backdrop-blur-md transition hover:border-slate-400/60 hover:bg-night-800 hover:text-white active:scale-95"
        >
          <ArrowLeft className="h-4 w-4 flip-rtl" />
          <span className="hidden sm:inline">{t('detail.back')}</span>
        </button>
      )}

      {/* Compact brand for mobile (sidebar is a bottom bar there) */}
      <div className="flex items-center gap-2 lg:hidden">
        <BrandMark size="sm" />
        <BrandTitle compact />
      </div>

      <SearchBox
        inputRef={inputRef}
        showShortcut
        className="relative z-30 ms-auto hidden w-full max-w-md flex-1 sm:block"
      />
      {/* Mobile search sits on its own row below */}
      <SearchBox className="relative z-30 order-3 mt-2 basis-full sm:hidden" />

      <div className="ms-auto flex shrink-0 items-center gap-2 sm:ms-0">
        <button
          type="button"
          onClick={toggleLang}
          className="flex h-11 items-center gap-1.5 rounded-full border border-night-600/60 bg-slate-900/60 px-3.5 text-xs font-bold text-slate-200 backdrop-blur-md transition hover:border-slate-400/60 hover:text-white"
          aria-label={t('nav.language')}
          title={t('nav.language')}
        >
          <LanguageIcon className="h-4 w-4" />
          {lang === 'ar' ? 'EN' : 'ع'}
        </button>

        {/* Notifications popover — live new-episode alerts for the favorites list. */}
        <NotificationBell open={notifOpen} onToggle={setNotifOpen} boxRef={notifBoxRef} />

      </div>
    </div>
  )
}
