import { useState } from 'react'
import { useI18n } from '../context/LanguageContext'
import { useRole } from '../context/RoleContext'
import { EmptyState } from '../components/ui/States'
import {
  ShieldAlertIcon,
  SettingsIcon,
} from '../components/icons'
import { anilist } from '../lib/anilist'
import { useAsync } from '../hooks/useAsync'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** AdminPage — restricted dashboard for admin-role accounts. */
export default function AdminPage() {
  const { t } = useI18n()
  const { isAdmin, setRole } = useRole()
  const [adminEnabled, setAdminEnabled] = useState(() => isAdmin)

  // Fetch a small set of trending titles to populate the "manage featured" row.
  const trending = useAsync(
    (s) => anilist.getTopAnime('airing', 1, s).then((r) => r.data),
    [],
  )

  // ---- Restricted / locked view — shown to non-admins ----
  if (!adminEnabled) {
    return (
      <div className="container-page py-12">
        <EmptyState
          icon={<ShieldAlertIcon className="h-7 w-7" />}
          title={t('admin.locked')}
          hint={t('admin.lockedHint')}
          action={
            <button
              type="button"
              onClick={() => {
                setAdminEnabled(true)
                setRole('admin')
              }}
              className="btn-primary"
            >
              <ShieldAlertIcon className="h-4 w-4" />
              {t('admin.enableAdmin')}
            </button>
          }
        />
      </div>
    )
  }

  // ---- Admin dashboard ----
  return (
    <div className="container-page py-8">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-wide text-white sm:text-3xl">{t('admin.title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('admin.subtitle')}</p>
        <p className="mt-1 text-xs text-slate-500 italic">{t('admin.mockNote')}</p>
      </header>

      {/* Content management section */}
      <section className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-white">
          <SettingsIcon className="h-5 w-5 text-slate-400" />
          {t('admin.content')}
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Featured titles */}
          <div className="rounded-2xl border border-night-700/70 bg-night-850/60 p-5">
            <h3 className="mb-3 text-sm font-bold text-slate-200">{t('admin.manageFeatured')}</h3>
            {trending.loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-night-700/40" />
                ))}
              </div>
            ) : trending.error ? (
              <p className="text-xs text-red-400">{t('detail.relationsError')}</p>
            ) : (
              <ul className="space-y-2">
                {(trending.data ?? []).slice(0, 4).map((a) => (
                  <li key={a.mal_id} className="flex items-center gap-3">
                    <img
                      src={a.images.jpg.small_image_url ?? a.images.jpg.image_url}
                      alt=""
                      className="h-10 w-7 rounded object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-100">
                        {a.title_english || a.title}
                      </p>
                      <p className="text-[10px] text-slate-500">{a.episodes ?? '—'} eps</p>
                    </div>
                    <button
                      type="button"
                      aria-label={t('admin.toggle')}
                      className="rounded-lg border border-night-600/60 bg-night-800/60 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:text-white"
                    >
                      {t('admin.toggle')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Schedule management */}
          <div className="rounded-2xl border border-night-700/70 bg-night-850/60 p-5">
            <h3 className="mb-3 text-sm font-bold text-slate-200">{t('admin.manageSchedule')}</h3>
            <div className="space-y-3">
              {DAYS.map((day) => (
                <div
                  key={day}
                  className="flex items-center justify-between rounded-lg border border-night-700/40 bg-night-800/40 px-3 py-2"
                >
                  <span className="text-xs font-semibold text-slate-200">{day}</span>
                  <button
                    type="button"
                    className="rounded-lg border border-night-600/60 bg-night-800/60 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:text-white"
                  >
                    {t('admin.toggle')}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Genre / review queue */}
          <div className="rounded-2xl border border-night-700/70 bg-night-850/60 p-5">
            <h3 className="mb-3 text-sm font-bold text-slate-200">{t('admin.manageGenres')}</h3>
            <div className="mb-4 flex flex-wrap gap-2">
              {['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Sci-Fi'].map((g) => (
                <span
                  key={g}
                  className="rounded-full border border-night-600/60 bg-night-800/60 px-3 py-1 text-xs font-semibold text-slate-200"
                >
                  {g}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}