/**
 * VideoPlayer.tsx — the reusable playback engine for the watch page.
 *
 * Features:
 *   - Multiple authorized source selector (embed iframes OR direct URLs).
 *   - Quality selector for direct/HLS sources (hls.js when available).
 *   - Arabic/English subtitle selection with SRT/VTT/ASS client-side handling.
 *   - Fullscreen playback.
 *   - Prev/next episode navigation callbacks.
 *   - Local playback-progress persistence + resume prompt.
 *
 * When no authorized source exists for an episode, it renders a clearly
 * labelled "unavailable" state — never a fake player or guessed URL.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Hls from 'hls.js/dist/hls.js'
import { useI18n } from '../../context/LanguageContext'
import { useSettings } from '../../context/SettingsContext'
import type { VideoQuality, VideoSource } from '../../lib/types'
import { trackToVttBlobUrl } from '../../lib/subtitles'
import { watchProgress } from '../../lib/storage'
import { cx, formatTime } from '../../lib/utils'
import {
  ExitFullscreenIcon,
  FullscreenIcon,
  MuteIcon,
  PauseIcon,
  PlayIcon,
  SkipNextIcon,
  SkipPrevIcon,
  SubtitlesIcon,
  VolumeIcon,
} from '../icons'

export type SkipSegment = { start: number; end: number }

export interface SkipSegments {
  intro?: SkipSegment | null
  outro?: SkipSegment | null
}

export interface VideoPlayerProps {
  sources: VideoSource[]
  animeId: number
  episode: number
  onPrev?: () => void
  onNext?: () => void
  poster?: string
  className?: string
  /** Fired on the <video> 'ended' event (auto-next hook for the watch page). */
  onEnded?: () => void
  /**
   * Intro/outro segments as [start, end] seconds. When provided (from the
   * AniSkip API or mock data supplied by the watch page) and the global
   * `autoSkipIntro` setting is on, the player jumps to `end` as soon as
   * playback passes `start`.
   */
  skipSegments?: SkipSegments | null
}

export function VideoPlayer({
  sources,
  animeId,
  episode,
  onPrev,
  onNext,
  poster,
  className,
  onEnded,
  skipSegments,
}: VideoPlayerProps) {
  const { settings } = useSettings()
  return (
    <div className={cx('w-full', className)}>
      {sources.length === 0 ? (
        <NoSourceState />
      ) : (
        <Player
          sources={sources}
          animeId={animeId}
          episode={episode}
          onPrev={onPrev}
          onNext={onNext}
          poster={poster}
          onEnded={onEnded}
          autoSkipIntro={settings.autoSkipIntro}
          skipSegments={skipSegments}
        />
      )}
    </div>
  )
}

/** Clearly-labelled state shown when no authorized source is configured. */
function NoSourceState() {
  const { t } = useI18n()
  return (
    <div className="relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-night-600 bg-night-900/70 p-6 text-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(53,87,246,0.08),transparent_60%)]" />
      <div className="relative z-10 max-w-md">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-night-800 text-slate-300">
          <PlayIcon className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-white">{t('watch.noSourceTitle')}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{t('watch.noSourceBody')}</p>
        <p className="mt-3 text-xs text-slate-500">{t('watch.noSourceHint')}</p>
      </div>
    </div>
  )
}

/** Horizontal source selector (pills). */
function SourceSelector({
  sources,
  activeId,
  onSelect,
}: {
  sources: VideoSource[]
  activeId: string
  onSelect: (id: string) => void
}) {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-slate-400">{t('watch.sources')}</span>
      {sources.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect(s.id)}
          className={cx(
            'rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
            s.id === activeId
              ? 'border-white/40 bg-white/10 text-white'
              : 'border-night-600/80 bg-night-800/60 text-slate-300 hover:border-slate-400/60 hover:text-white',
          )}
          title={s.note}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Player — renders either an embed iframe (kind: 'embed') or a native <video>
 * element (kind: 'direct') with HLS support via hls.js, quality ladder,
 * subtitle tracks, fullscreen, prev/next, and local progress persistence.
 */
function Player({
  sources,
  animeId,
  episode,
  onPrev,
  onNext,
  onEnded,
  autoSkipIntro,
  skipSegments,
  poster,
}: {
  sources: VideoSource[]
  animeId: number
  episode: number
  onPrev?: () => void
  onNext?: () => void
  onEnded?: () => void
  autoSkipIntro: boolean
  skipSegments?: SkipSegments | null
  poster?: string
}) {
  const { t } = useI18n()
  const [activeId, setActiveId] = useState(sources[0]?.id ?? '')
  const active = useMemo(
    () => sources.find((s) => s.id === activeId) ?? sources[0],
    [sources, activeId],
  )

  const videoRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const hlsRef = useRef<InstanceType<typeof Hls> | null>(null)

  const [quality, setQuality] = useState<VideoQuality | null>(null)
  const [subtitleLang, setSubtitleLang] = useState<string>('off')
  const [resolvedSubs, setResolvedSubs] = useState<Record<string, string>>({})
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [resumePrompt, setResumePrompt] = useState<number | null>(null)

  // --- Custom control bar state ---
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [volumeSliderOpen, setVolumeSliderOpen] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(false)
  const hideControlsTimer = useRef<number | null>(null)
  /** Toast-style nudge shown for keyboard seeks/volume changes. */
  const [activity, setActivity] = useState<{ key: string; value: number } | null>(null)
  const activityTimer = useRef<number | null>(null)
  /** Segments already skipped this session (prevents re-trigger loops). */
  const skippedSegments = useRef<Set<string>>(new Set())

  const isHls = active?.kind === 'direct' && /\.m3u8(\?|$)/i.test(active.url)

  // Restore saved progress for this episode (direct sources only).
  useEffect(() => {
    if (active?.kind !== 'direct') return
    const saved = watchProgress.get(animeId, episode)
    if (saved && saved.currentTime > 5 && saved.duration > 0) {
      const pct = saved.currentTime / saved.duration
      if (pct < 0.97) setResumePrompt(saved.currentTime)
    }
  }, [active, animeId, episode])

  // Attach / switch the media source (direct only). Handles HLS + progressive.
  useEffect(() => {
    if (active?.kind !== 'direct') return
    const video = videoRef.current
    if (!video) return

    // Clean up any previous HLS instance.
    hlsRef.current?.destroy()
    hlsRef.current = null

    const qualityUrl = quality?.url ?? active.url

    if (isHls) {
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true })
        hlsRef.current = hls
        hls.loadSource(qualityUrl)
        hls.attachMedia(video)
        hls.on(Hls.Events.ERROR, ((_event: unknown, data: { fatal?: boolean }) => {
          if (data.fatal) hls.destroy()
        }) as (...args: unknown[]) => void)
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        video.src = qualityUrl
      }
    } else {
      video.src = qualityUrl
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.url, quality, isHls])

  // Persist playback progress periodically + on unload.
  useEffect(() => {
    if (active?.kind !== 'direct') return
    const video = videoRef.current
    if (!video) return
    const save = () => {
      if (video.duration) watchProgress.set(animeId, episode, video.currentTime, video.duration)
    }
    const interval = window.setInterval(save, 5000)
    video.addEventListener('timeupdate', save)
    return () => {
      window.clearInterval(interval)
      video.removeEventListener('timeupdate', save)
      save()
    }
  }, [active?.kind, animeId, episode])

  // Fullscreen change tracking.
  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  // Resolve subtitle files (SRT/ASS -> VTT blob URLs).
  useEffect(() => {
    const controller = new AbortController()
    const subs = active?.subtitles ?? []
    Promise.all(
      subs.map(async (s) => {
        try {
          const { src } = await trackToVttBlobUrl(s, controller.signal)
          return [s.srclang, src] as const
        } catch {
          return null
        }
      }),
    ).then((entries) => {
      const map: Record<string, string> = {}
      for (const e of entries) if (e) map[e[0]] = e[1]
      setResolvedSubs(map)
    })
    return () => controller.abort()
  }, [active?.subtitles])


  const toggleFullscreen = useCallback(() => {
    const el = stageRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen?.()
    else el.requestFullscreen?.().catch(() => {})
  }, [])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play().catch(() => {})
    else video.pause()
  }, [])

  const seekTo = (seconds: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = seconds
    setResumePrompt(null)
    void video.play().catch(() => {})
  }

  const applySubtitle = (lang: string) => {
    setSubtitleLang(lang)
    const video = videoRef.current
    if (!video) return
    const tracks = video.textTracks
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = tracks[i].language === lang ? 'showing' : 'disabled'
    }
  }

  /* ---------------------- custom control helpers ---------------------- */

  /** Keep the control bar / overlays visible while the pointer roams. */
  const pokeControls = useCallback(() => {
    setControlsVisible(true)
    if (hideControlsTimer.current != null) window.clearTimeout(hideControlsTimer.current)
    hideControlsTimer.current = window.setTimeout(() => setControlsVisible(false), 2600)
  }, [])

  useEffect(() => {
    return () => {
      if (hideControlsTimer.current != null) window.clearTimeout(hideControlsTimer.current)
      if (activityTimer.current != null) window.clearTimeout(activityTimer.current)
    }
  }, [])

  /** Briefly flash a "keyboard action" nudge over the video surface. */
  const flashActivity = (key: string, value: number) => {
    setActivity({ key, value })
    if (activityTimer.current != null) window.clearTimeout(activityTimer.current)
    activityTimer.current = window.setTimeout(() => setActivity(null), 1200)
  }

  /**
   * Auto-Skip: while `autoSkipIntro` is on, jump past any intro/outro segment
   * once playback reaches its start. Each segment fires at most once per
   * load (tracked in `skippedSegments`) so a manual seek-back can re-trigger.
   */
  const handleTimeUpdate = useCallback(
    (video: HTMLVideoElement) => {
      if (!autoSkipIntro || !skipSegments) return
      const time = video.currentTime
      const segments: SkipSegment[] = []
      if (skipSegments.intro) segments.push(skipSegments.intro)
      if (skipSegments.outro) segments.push(skipSegments.outro)
      for (const seg of segments) {
        if (!seg) continue
        if (time + 2 >= seg.start && time < seg.end) {
          video.currentTime = seg.end
          setCurrentTime(seg.end)
          skippedSegments.current.add(`${seg.start}-${seg.end}`)
          flashActivity('skip', seg.end)
        }
      }
    },
    [autoSkipIntro, skipSegments],
  )

  /** Nudge playback by `delta` seconds, clamped to [0, duration]. */
  const seekBy = useCallback((delta: number, label: string) => {
    const video = videoRef.current
    if (!video) return
    const target = Math.min(Math.max(0, video.currentTime + delta), video.duration || video.currentTime + delta)
    video.currentTime = target
    setCurrentTime(target)
    if (video.paused) void video.play().catch(() => {})
    flashActivity(label, target)
  }, [])

  /** Steps the volume by `delta`, clamped to [0, 1]. */
  const changeVolume = useCallback((delta: number, label: string) => {
    const video = videoRef.current
    if (!video) return
    const next = Math.min(1, Math.max(0, Math.round((video.volume + delta) * 10) / 10))
    video.volume = next
    video.muted = next === 0
    setVolume(next)
    setMuted(video.muted)
    flashActivity(label, next)
  }, [])

  /**
   * Keyboard shortcuts, mapped to videoRef.
   *   → = +5s   ← = -5s   ↑ = +0.1 vol   ↓ = -0.1 vol
   * Listens on `document` but only acts while the player stage (or the video
   * element itself) is focused, and always preventDefaults so the arrows
   * never scroll the page. Space/Enter toggle play when the video is focused.
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const video = videoRef.current
      if (!video) return
      const stage = stageRef.current
      const target = e.target as Node | null
      const isFocused =
        target === video ||
        (stage != null && target != null && stage.contains(target))
      if (!isFocused) return

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault()
          seekBy(5, 'forward')
          break
        case 'ArrowLeft':
          e.preventDefault()
          seekBy(-5, 'backward')
          break
        case 'ArrowUp':
          e.preventDefault()
          changeVolume(0.1, 'volume')
          break
        case 'ArrowDown':
          e.preventDefault()
          changeVolume(-0.1, 'volume')
          break
        case ' ':
        case 'Enter':
          e.preventDefault()
          togglePlay()
          break
        default:
          break
      }
      pokeControls()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [seekBy, changeVolume, togglePlay, pokeControls])

  const qualities = active?.qualities ?? []

  /* ----------------------------- render ----------------------------- */

  if (active?.kind === 'embed') {
    return (
      <div className="space-y-3">
        <SourceSelector sources={sources} activeId={active.id} onSelect={setActiveId} />
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-night-700 bg-black">
          <iframe
            key={active.url}
            src={active.url}
            title={active.label}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="no-referrer"
          />
        </div>
        <p className="text-xs text-slate-500">{t('watch.embedNotice')}</p>
        <EpisodeNav onPrev={onPrev} onNext={onNext} />
      </div>
    )
  }


  const volumePct = `${Math.round((muted ? 0 : volume) * 100)}%`
  const bufferedPct = duration > 0 ? `${Math.min(100, (buffered / duration) * 100).toFixed(3)}%` : '0%'
  const progressPct = duration > 0 ? `${((Math.min(currentTime, duration) / duration) * 100).toFixed(3)}%` : '0%'
  const showControls = controlsVisible || !playing
  const barVisible = showControls || stageRef.current?.matches(':hover')
  /** Readable label for the keyboard-nudge toast. */
  const activityLabel =
    activity == null
      ? ''
      : activity.key === 'skip'
        ? `${t('watch.skipAhead')} · ${formatTime(activity.value)}`
        : activity.key === 'forward'
          ? `+5s · ${formatTime(activity.value)}`
          : activity.key === 'backward'
            ? `-5s · ${formatTime(activity.value)}`
            : activity.value > 0.5
              ? t('watch.volumeUp')
              : t('watch.volumeDown')

  return (
    <div className="space-y-3">
      <SourceSelector sources={sources} activeId={active.id} onSelect={setActiveId} />

      <div
        ref={stageRef}
        onPointerMove={pokeControls}
        className="group relative aspect-video w-full overflow-hidden rounded-2xl border border-night-700 bg-black"
      >
        <video
          ref={videoRef}
          poster={poster}
          tabIndex={0}
          className="h-full w-full outline-none"
          playsInline
          controls={false}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onVolumeChange={(e) => {
            const v = e.currentTarget
            setVolume(v.volume)
            setMuted(v.muted)
            pokeControls()
          }}
          onTimeUpdate={(e) => {
            const v = e.currentTarget
            setCurrentTime(v.currentTime)
            if (v.buffered.length > 0) {
              setBuffered(v.buffered.end(v.buffered.length - 1))
            }
            handleTimeUpdate(v)
          }}
          onProgress={(e) => {
            const v = e.currentTarget
            if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1))
          }}
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
          onEnded={(e) => {
            const v = e.currentTarget
            if (!v.seeking) onEnded?.()
          }}
          onClick={togglePlay}
          onDoubleClick={toggleFullscreen}
          onPointerMove={pokeControls}
        >
          {active.subtitles?.map((s) => (
            <track
              key={s.srclang}
              kind="subtitles"
              src={resolvedSubs[s.srclang] ?? s.src}
              srcLang={s.srclang}
              label={s.label}
              default={Boolean(s.default) && subtitleLang === s.srclang}
            />
          ))}
        </video>

        {/* Center play overlay */}
        {!playing && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <button
              type="button"
              onClick={togglePlay}
              className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-night-900 shadow-glow-accent transition hover:scale-105"
              aria-label={t('watch.play')}
            >
              <PlayIcon className="ms-1 h-7 w-7" />
            </button>
          </div>
        )}

        {/* Resume prompt */}
        {resumePrompt != null && (
          <div className="absolute bottom-20 start-4 rounded-xl border border-night-600 bg-night-900/90 p-3 backdrop-blur-sm">
            <p className="mb-2 text-xs text-slate-300">
              {t('watch.resumeAt', { time: formatTime(resumePrompt) })}
            </p>
            <div className="flex gap-2">
              <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => seekTo(resumePrompt)}>
                {t('history.continue')}
              </button>
              <button
                className="btn-ghost px-3 py-1.5 text-xs"
                onClick={() => {
                  setResumePrompt(null)
                  seekTo(0)
                }}
              >
                {t('watch.restart')}
              </button>
            </div>
          </div>
        )}

        {/* Custom control bar — fades in on hover / pause, or stays visible while
          a slider is open. */}
        <div
          className={`absolute inset-x-0 bottom-0 flex flex-col justify-end gap-1 bg-gradient-to-t from-black/85 via-black/60 to-transparent px-3 pb-2 pt-8 transition-opacity duration-300 ${
            barVisible ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-2'
          }`}
        >
          {/* Timeline: dual-range slider with buffer shading + click-to-seek */}
          <input
            type="range"
            className="slider"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onChange={(e) => seekTo(parseFloat(e.target.value))}
            disabled={duration <= 0}
            style={{ '--buffered': bufferedPct, '--progress': progressPct } as React.CSSProperties}
            aria-label={t('watch.timeline')}
          />

          <div className="flex items-center gap-2">
            <button onClick={togglePlay} className="ctrl" aria-label={playing ? t('watch.pause') : t('watch.play')}>
              {playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
            </button>
            <button onClick={onPrev} disabled={!onPrev} className="ctrl disabled:opacity-40" aria-label={t('watch.prevEpisode')}>
              <SkipPrevIcon className="h-5 w-5" />
            </button>
            <button onClick={onNext} disabled={!onNext} className="ctrl disabled:opacity-40" aria-label={t('watch.nextEpisode')}>
              <SkipNextIcon className="h-5 w-5" />
            </button>

            <span className="ms-2 hidden font-mono text-[11px] tracking-wider text-slate-200/90 sm:inline">
              {formatTime(Math.min(currentTime, duration || 0))} / {formatTime(duration)}
            </span>

            <span className="ms-auto" />

            {/* Volume cluster with a pop-out slider (hidden on touch, keeps mute + click) */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const v = videoRef.current
                  if (v) v.muted = !v.muted
                }}
                className={`ctrl !bg-transparent focus-visible:!ring-transparent ${
                  volumeSliderOpen ? 'opacity-100' : ''
                }`}
                aria-label={muted ? t('watch.unmute') : t('watch.mute')}
                onFocus={() => setVolumeSliderOpen(true)}
                onBlur={() => volumeSliderOpen && setVolumeSliderOpen(false)}
              >
                {muted || volume === 0 ? <MuteIcon className="h-5 w-5" /> : <VolumeIcon className="h-5 w-5" />}
              </button>
              <div
                className={`relative h-8 w-28 md:w-32 ${
                  volumeSliderOpen ? 'opacity-100 pointer-events-auto scale-100' : 'hidden md:block md:opacity-0 md:scale-90 group-hover:opacity-100 group-hover:scale-100 pointer-events-none group-hover:pointer-events-auto'
                } transition-all duration-200`}
                onPointerEnter={() => setVolumeSliderOpen(true)}
                onFocusCapture={() => setVolumeSliderOpen(true)}
                onBlurCapture={() => setVolumeSliderOpen(false)}
              >
                <input
                  type="range"
                  className="slider !w-full pointer-events-auto"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    const v = videoRef.current
                    const nv = parseFloat(e.target.value)
                    if (v) {
                      v.volume = nv
                      v.muted = nv === 0
                    }
                  }}
                  style={{ '--progress': volumePct, '--buffered': volumePct } as React.CSSProperties}
                  aria-label={t('watch.volume')}
                />
              </div>
            </div>

            <button onClick={toggleFullscreen} className="ctrl" aria-label={isFullscreen ? t('watch.exitFullscreen') : t('watch.fullscreen')}>
              {isFullscreen ? <ExitFullscreenIcon className="h-5 w-5" /> : <FullscreenIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Keyboard nudge toast — announces seek/volume/skip actions */}
        {activity != null && (
          <div className="pointer-events-none absolute inset-x-0 bottom-24 flex items-center justify-center">
            <span className="rounded-full border border-white/15 bg-black/65 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-sm transition-all">
              {activityLabel}
            </span>
          </div>
        )}
      </div>


      {/* Below-player selectors: quality + subtitles */}
      <div className="flex flex-wrap items-center gap-3">
        {qualities.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <span>{t('watch.quality')}</span>
            <select
              value={quality?.label ?? 'Auto'}
              onChange={(e) => setQuality(qualities.find((x) => x.label === e.target.value) ?? null)}
              className="rounded-lg border border-night-600 bg-night-800 px-2 py-1.5 text-xs text-slate-100"
            >
              {qualities.map((q) => (
                <option key={q.label} value={q.label}>
                  {q.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {active.subtitles && active.subtitles.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <SubtitlesIcon className="h-4 w-4" />
            <span>{t('watch.subtitles')}</span>
            <select
              value={subtitleLang}
              onChange={(e) => applySubtitle(e.target.value)}
              className="rounded-lg border border-night-600 bg-night-800 px-2 py-1.5 text-xs text-slate-100"
            >
              <option value="off">{t('watch.off')}</option>
              {active.subtitles.map((s) => (
                <option key={s.srclang} value={s.srclang}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <EpisodeNav onPrev={onPrev} onNext={onNext} />
    </div>
  )
}

/** Prev / next episode navigation buttons. */
function EpisodeNav({
  onPrev,
  onNext,
}: {
  onPrev?: () => void
  onNext?: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="flex items-center justify-between gap-3">
      <button onClick={onPrev} disabled={!onPrev} className="btn-ghost disabled:opacity-40">
        <SkipPrevIcon className="h-4 w-4 flip-rtl" />
        {t('watch.prevEpisode')}
      </button>
      <button onClick={onNext} disabled={!onNext} className="btn-primary disabled:opacity-40">
        {t('watch.nextEpisode')}
        <SkipNextIcon className="h-4 w-4 flip-rtl" />
      </button>
    </div>
  )
}

