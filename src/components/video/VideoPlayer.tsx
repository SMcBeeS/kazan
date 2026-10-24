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

export interface VideoPlayerProps {
  sources: VideoSource[]
  animeId: number
  episode: number
  onPrev?: () => void
  onNext?: () => void
  poster?: string
  className?: string
}

export function VideoPlayer({
  sources,
  animeId,
  episode,
  onPrev,
  onNext,
  poster,
  className,
}: VideoPlayerProps) {
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
  poster,
}: {
  sources: VideoSource[]
  animeId: number
  episode: number
  onPrev?: () => void
  onNext?: () => void
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


  return (
    <div className="space-y-3">
      <SourceSelector sources={sources} activeId={active.id} onSelect={setActiveId} />

      <div
        ref={stageRef}
        className="group relative aspect-video w-full overflow-hidden rounded-2xl border border-night-700 bg-black"
      >
        <video
          ref={videoRef}
          poster={poster}
          className="h-full w-full"
          playsInline
          controls={false}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
          onEnded={() => onNext?.()}
          onClick={togglePlay}
          onDoubleClick={toggleFullscreen}
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

        {/* Hover control bar */}
        <div className="absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/90 to-transparent p-3 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">
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
            <button
              onClick={() => {
                const v = videoRef.current
                if (v) v.muted = !v.muted
              }}
              className="ctrl"
              aria-label={muted ? t('watch.unmute') : t('watch.mute')}
            >
              {muted ? <MuteIcon className="h-5 w-5" /> : <VolumeIcon className="h-5 w-5" />}
            </button>
            <span className="ms-auto" />
            <button onClick={toggleFullscreen} className="ctrl" aria-label={isFullscreen ? t('watch.exitFullscreen') : t('watch.fullscreen')}>
              {isFullscreen ? <ExitFullscreenIcon className="h-5 w-5" /> : <FullscreenIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>
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

