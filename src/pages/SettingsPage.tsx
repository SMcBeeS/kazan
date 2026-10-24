import { useState } from 'react'
import { useI18n } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { cx } from '../lib/utils'
import { PlayIcon, SubtitlesIcon, LogOutIcon } from '../components/icons'

type SubtitleChoice = 'off' | 'english' | 'arabic'

const SUBTITLE_KEY = 'animeverse:default-subtitles'
const AUTOPLAY_KEY = 'animeverse:autoplay'
const REMEMBER_KEY = 'animeverse:remember-position'

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    if (v === '1') return true
    if (v === '0') return false
  } catch {
    /* ignore */
  }
  return fallback
}

function readSubtitle(): SubtitleChoice {
  try {
    const v = localStorage.getItem(SUBTITLE_KEY)
    if (v === 'off' || v === 'english' || v === 'arabic') return v as SubtitleChoice
  } catch {
    /* ignore */
  }
  return 'off'
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

/** Toggle switch used throughout the settings card. */
function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
        checked ? 'bg-emerald-500' : 'bg-night-700',
      )}
    >
      <span
        className={cx(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200',
          checked ? 'start-[22px]' : 'start-0.5',
        )}
      />
    </button>
  )
}

/** SettingsPage — interface language switcher + essential playback preferences. */
export default function SettingsPage() {
  const { t } = useI18n()
  const { user, logout } = useAuth()
  const { settings, updateSettings } = useSettings()
  const [autoplay, setAutoplay] = useState(() => readBool(AUTOPLAY_KEY, true))
  const [remember, setRemember] = useState(() => readBool(REMEMBER_KEY, true))
  const [subtitles, setSubtitles] = useState<SubtitleChoice>(() => readSubtitle())

  const subtitleLabel: Record<SubtitleChoice, string> = {
    off: t('settings.subtitle.off'),
    english: t('settings.subtitle.english'),
    arabic: t('settings.subtitle.arabic'),
  }

  return (
    <div className="container-page py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-wide text-white sm:text-3xl">{t('settings.title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('settings.subtitle')}</p>
      </header>

      <div className="mx-auto grid max-w-2xl gap-5">
        {/* Playback card */}
        <section className="overflow-hidden rounded-2xl border border-night-700/70 bg-night-850/60 shadow-card">
          <div className="flex items-center gap-3 border-b border-night-700/60 px-5 py-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-night-800 text-slate-200">
              <PlayIcon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-white">{t('settings.playbackCard')}</h2>
              <p className="text-xs text-slate-400">{t('settings.playbackHint')}</p>
            </div>
          </div>

          <div className="divide-y divide-night-700/50">
            {/* Autoplay next episode */}
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-100">{t('settings.autoplay')}</p>
                <p className="mt-0.5 text-xs text-slate-400">{t('settings.autoplayHint')}</p>
              </div>
              <ToggleSwitch
                checked={autoplay}
                label={t('settings.autoplay')}
                onChange={(next) => {
                  setAutoplay(next)
                  write(AUTOPLAY_KEY, next ? '1' : '0')
                }}
              />
            </div>

            {/* Remember playback position */}
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-100">{t('settings.rememberPosition')}</p>
                <p className="mt-0.5 text-xs text-slate-400">{t('settings.rememberPositionHint')}</p>
              </div>
              <ToggleSwitch
                checked={remember}
                label={t('settings.rememberPosition')}
                onChange={(next) => {
                  setRemember(next)
                  write(REMEMBER_KEY, next ? '1' : '0')
                }}
              />
            </div>

            {/* Auto-Skip Intros/Outros */}
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-100">{t('settings.autoSkipIntro')}</p>
                <p className="mt-0.5 text-xs text-slate-400">{t('settings.autoSkipIntroHint')}</p>
              </div>
              <ToggleSwitch
                checked={settings.autoSkipIntro}
                label={t('settings.autoSkipIntro')}
                onChange={(next) => updateSettings({ autoSkipIntro: next })}
              />
            </div>

            {/* Auto-Play Next Episode */}
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-100">{t('settings.autoNextEpisode')}</p>
                <p className="mt-0.5 text-xs text-slate-400">{t('settings.autoNextEpisodeHint')}</p>
              </div>
              <ToggleSwitch
                checked={settings.autoNextEpisode}
                label={t('settings.autoNextEpisode')}
                onChange={(next) => updateSettings({ autoNextEpisode: next })}
              />
            </div>

            {/* Default subtitles */}
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <SubtitlesIcon className="h-4 w-4 text-slate-400" />
                  {t('settings.defaultSubtitles')}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">{t('settings.defaultSubtitlesHint')}</p>
              </div>
              <select
                value={subtitles}
                aria-label={t('settings.defaultSubtitles')}
                onChange={(e) => {
                  const next = e.target.value as SubtitleChoice
                  setSubtitles(next)
                  write(SUBTITLE_KEY, next)
                }}
                className="shrink-0 rounded-xl border border-night-600/70 bg-night-800/60 px-3 py-2 text-sm font-semibold text-slate-100 outline-none transition focus:border-slate-400/70"
              >
                <option value="off">{subtitleLabel.off}</option>
                <option value="english">{subtitleLabel.english}</option>
                <option value="arabic">{subtitleLabel.arabic}</option>
              </select>
            </div>
          </div>
        </section>

          {/* Account card — sign out from here (the sidebar no longer hosts it). */}
          {user && (
            <section className="overflow-hidden rounded-2xl border border-night-700/70 bg-night-850/60 shadow-card">
              <div className="flex items-center gap-3 border-b border-night-700/60 px-5 py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-night-800 text-slate-200">
                  <LogOutIcon className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-white">{t('header.profile')}</h2>
                  <p className="text-xs text-slate-400">
                    {user?.email ? user.email : t('auth.loggedin')}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">{t('auth.logout')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-rose-500/90 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400/50"
                >
                  <LogOutIcon className="h-4 w-4" />
                  {t('auth.logout')}
                </button>
              </div>
            </section>
          )}
      </div>
    </div>
  )
}