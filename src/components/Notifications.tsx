/**
 * Notifications.tsx — the header bell + new-episode alert list.
 *
 * Driven by the favorites new-episode engine in ./lib/notifications. Watches
 * the user's "My Favorites" list; when a favored show airs/updates a new
 * episode a notification is raised, a prominent dot appears on the bell, and the
 * popover lists the alerts with relative Baghdad timestamps. Controlled by the
 * HeaderBar (open state + outside-click ref) so it integrates with the existing
 * escape / click-dismiss behavior.
 */
import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../context/LanguageContext'
import { BellIcon } from './icons'
import { notifications, subscribeNotifications, formatRelativeBaghdad } from '../lib/notifications'
import type { AppNotification } from '../lib/notifications'

interface NotificationBellProps {
  open: boolean
  onToggle: (open: boolean) => void
  /** HeaderBar's popover box — the ref that governs outside-click dismissal. */
  boxRef: RefObject<HTMLDivElement>
}

export function NotificationBell({ open, onToggle, boxRef }: NotificationBellProps) {
  const { t, lang } = useI18n()
  const navigate = useNavigate()

  const [items, setItems] = useState<AppNotification[]>(() => notifications.list())
  const [unread, setUnread] = useState<number>(() => notifications.unread())

  // Re-read whenever the notification/seen stores change (a new episode, a read,
  // or a clear) so the dot and list stay in sync.
  useEffect(
    () =>
      subscribeNotifications(() => {
        setItems(notifications.list())
        setUnread(notifications.unread())
      }),
    [],
  )

  const refresh = () => {
    setItems(notifications.list())
    setUnread(notifications.unread())
  }

  const openItem = (n: AppNotification) => {
    notifications.markRead(n.id)
    navigate(`/anime/${n.animeId}`)
    onToggle(false)
    refresh()
  }

  return (
    <div className="relative" ref={boxRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => onToggle(!open)}
        aria-label={t('header.notifications')}
        title={t('header.notifications')}
        aria-expanded={open}
        aria-live="polite"
        className="relative flex h-11 w-11 items-center justify-center rounded-full border border-night-600/60 bg-slate-900/60 text-slate-300 backdrop-blur-md transition hover:border-slate-400/60 hover:text-white"
      >
        <BellIcon className="h-6 w-6" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -end-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-night-950">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute end-0 mt-2 w-[330px] max-w-[calc(100vw-2rem)] rounded-2xl border border-night-700/70 bg-night-850/90 shadow-card backdrop-blur-md z-50 animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-night-700/50 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">{t('header.notifications')}</h3>
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  notifications.clearAll()
                  refresh()
                }}
                className="rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
              >
                {t('notifications.clearAll')}
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-slate-400">{t('notifications.empty')}</div>
          ) : (
            <ul className="max-h-[360px] overflow-y-auto no-scrollbar">
              {items.map((n) => (
                <li key={n.id} className="border-b border-night-700/40 last:border-0">
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className="flex w-full items-center gap-3 p-3 text-start transition hover:bg-white/5"
                  >
                    <div className="relative h-14 w-11 shrink-0 overflow-hidden rounded-lg bg-night-800 ring-1 ring-night-700/60">
                      {n.image ? (
                        <img src={n.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-600">
                          <BellIcon className="h-5 w-5" />
                        </div>
                      )}
                      <span className="absolute bottom-0 end-0 m-1 rounded bg-[#f5c518] px-1 text-[9px] font-bold leading-tight text-night-950">
                        EP {n.episode}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[13px] font-medium leading-snug text-white">
                        {t('notifications.newEpisode', { title: n.title, n: n.episode })}
                      </p>
                      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {formatRelativeBaghdad(n.timestamp, lang)}
                      </p>
                    </div>
                    {!n.read && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-hidden="true" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}