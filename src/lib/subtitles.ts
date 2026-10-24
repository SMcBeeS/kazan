/**
 * subtitles.ts — Client-side subtitle parsing / conversion.
 *
 * Browsers only natively render WebVTT via <track>. Many Arabic subtitle files
 * circulate as SRT or ASS. This module converts SRT -> VTT and does a
 * best-effort ASS dialogue extraction -> VTT so the native player can display
 * them without any extra dependency.
 */

import type { SubtitleTrack } from './types'

/** Convert SRT timestamp "00:01:02,500" -> VTT "00:01:02.500". */
function srtTimeToVtt(t: string): string {
  return t.trim().replace(',', '.')
}

/** Convert an SRT string to a WebVTT blob URL. */
export function srtToVtt(srt: string): string {
  const blocks = srt.replace(/\r/g, '').split('\n\n')
  const cues: string[] = []
  for (const block of blocks) {
    const lines = block.split('\n').filter(Boolean)
    if (lines.length < 2) continue
    // Find the timing line (contains '-->')
    const timeIndex = lines.findIndex((l) => l.includes('-->'))
    if (timeIndex === -1) continue
    const timing = lines[timeIndex].split('-->').map((s) => srtTimeToVtt(s))
    const text = lines.slice(timeIndex + 1).join('\n')
    cues.push(`${timing[0]} --> ${timing[1] ?? timing[0]}\n${text}`)
  }
  const vtt = `WEBVTT\n\n${cues.join('\n\n')}\n`
  return URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }))
}

/**
 * Best-effort ASS/SSA dialogue -> WebVTT. We ignore override tags and styling
 * so the text is readable; complex karaoke effects are not preserved.
 */
export function assToVtt(ass: string): string {
  const eventsIndex = ass.indexOf('[Events]')
  if (eventsIndex === -1) return 'WEBVTT\n\n'
  const events = ass.slice(eventsIndex).split('\n')
  // Resolve Format field order (Start, End, Style, Text ...)
  let format: string[] = []
  const dialogues: string[] = []
  for (const line of events) {
    const t = line.trim()
    if (t.toLowerCase().startsWith('format:')) {
      format = t.slice(7).split(',').map((s) => s.trim().toLowerCase())
      continue
    }
    if (t.toLowerCase().startsWith('dialogue:')) {
      dialogues.push(t.slice(9))
    }
  }
  const startIdx = Math.max(0, format.indexOf('start'))
  const endIdx = Math.max(0, format.indexOf('end'))
  const cues: string[] = []
  let n = 0
  for (const d of dialogues) {
    // Dialogue lines are comma-separated; text is everything after the Nth comma.
    const parts = d.split(',')
    if (parts.length <= Math.max(startIdx, endIdx)) continue
    const start = parts[startIdx].trim()
    const end = parts[endIdx].trim()
    const text = parts.slice(Math.max(startIdx, endIdx) + 1).join(',').trim()
    const clean = text.replace(/\{[^}]*\}/g, '').replace(/\\N|\\n/g, '\n')
    n += 1
    cues.push(`${n}\n${assTimeToVtt(start)} --> ${assTimeToVtt(end)}\n${clean}`)
  }
  return `WEBVTT\n\n${cues.join('\n\n')}\n`
}

/** Convert ASS timestamp "0:01:02.50" -> VTT "00:01:02.500". */
function assTimeToVtt(t: string): string {
  const m = t.match(/(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,2})/)
  if (!m) return '00:00:00.000'
  const h = (m[1] ?? '0').padStart(2, '0')
  const min = m[2].padStart(2, '0')
  const sec = m[3]
  const cs = (m[4] + '00').slice(0, 3)
  return `${h}:${min}:${sec}.${cs}`
}

/** Read a text file and return it as a string (used to fetch SRT/ASS). */
export async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Failed to fetch subtitles: ${res.status}`)
  return res.text()
}

/**
 * Given a SubtitleTrack, produce a blob URL the <track> element can use.
 * VTT is passed through; SRT and ASS are converted on the fly.
 */
export async function trackToVttBlobUrl(
  track: SubtitleTrack,
  signal?: AbortSignal,
): Promise<{ src: string; dispose: () => void }> {
  if (track.format === 'vtt') {
    return { src: track.src, dispose: () => {} }
  }
  const text = await fetchText(track.src, signal)
  const vtt = track.format === 'srt' ? srtToVtt(text) : assToVtt(text)
  const url = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }))
  return { src: url, dispose: () => URL.revokeObjectURL(url) }
}
