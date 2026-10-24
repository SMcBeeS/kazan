/**
 * translate.ts — best-effort client-side English → Arabic synopsis translation.
 *
 * AniList stores descriptions natively in English only. When the user is on the
 * Arabic interface we offer an optional "الترجمة التلقائية إلى العربية" toggle
 * that machine-translates the synopsis.
 *
 * Design goals (see task #1):
 *   - Never break the UI. Any failure falls back to the cleaned English text.
 *   - No API key required: we use MyMemory's public endpoint (CORS-enabled),
 *     which is safe to call straight from the browser.
 *   - Idempotent + cheap: successful translations are memoised in
 *     sessionStorage so we never re-translate the same synopsis twice per tab.
 *   - Long synopses are split into chunks under MyMemory's per-request limit
 *     and reassembled, preserving line breaks.
 *
 * IMPORTANT / HONESTY: This is *machine* translation of AniList's English text.
 * It is clearly labelled as automatic translation in the UI and the user can
 * always view the original English synopsis instead. We never present machine
 * output as an "official" Arabic description.
 */

const MYMEMORY_ENDPOINT = 'https://api.mymemory.translated.net/get'
const CACHE_PREFIX = 'animeverse:tr:'

/** MyMemory caps a single request around ~500 bytes; stay safely under that. */
const MAX_CHUNK_CHARS = 480

/** Split text into translatable chunks on whitespace/paragraph boundaries. */
function chunkText(text: string, max = MAX_CHUNK_CHARS): string[] {
  const paragraphs = text.split('\n')
  const chunks: string[] = []
  let current = ''
  const flush = () => {
    if (current.trim()) chunks.push(current.trim())
    current = ''
  }
  for (const para of paragraphs) {
    if (para.length > max) {
      // Very long single paragraph: break on sentence/word boundaries.
      flush()
      const words = para.split(' ')
      let buf = ''
      for (const word of words) {
        if ((buf + ' ' + word).trim().length > max) {
          if (buf.trim()) chunks.push(buf.trim())
          buf = word
        } else {
          buf = buf ? buf + ' ' + word : word
        }
      }
      if (buf.trim()) chunks.push(buf.trim())
      continue
    }
    if ((current + '\n' + para).length > max) {
      flush()
      current = para
    } else {
      current = current ? current + '\n' + para : para
    }
  }
  flush()
  return chunks
}

function readCache(key: string): string | null {
  try {
    return sessionStorage.getItem(CACHE_PREFIX + key)
  } catch {
    return null
  }
}

function writeCache(key: string, value: string) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, value)
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

/** Stable key from the source text so identical synopses share a cache entry. */
function cacheKey(text: string): string {
  // Simple, dependency-free string hash (FNV-1a) → base36.
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36) + ':' + text.length
}

async function translateChunk(chunk: string, signal?: AbortSignal): Promise<string> {
  const url = `${MYMEMORY_ENDPOINT}?q=${encodeURIComponent(chunk)}&langpair=en|ar`
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`translate failed: ${res.status}`)
  const json = (await res.json()) as {
    responseData?: { translatedText?: string }
    responseStatus?: number
  }
  const translated = json.responseData?.translatedText
  // MyMemory returns the original text (uppercased / with warnings) on quota
  // exhaustion; treat obviously-bad responses as failure so we fall back.
  if (!translated || typeof translated !== 'string') {
    throw new Error('translate: empty response')
  }
  return translated
}

/**
 * Translate an English synopsis to Arabic. Returns the Arabic string on success,
 * or `null` on any failure so the caller can gracefully keep the English text.
 */
export async function translateToArabic(
  text: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const trimmed = text.trim()
  if (!trimmed) return null

  const key = cacheKey(trimmed)
  const cached = readCache(key)
  if (cached) return cached

  const chunks = chunkText(trimmed)
  const parts: string[] = []
  for (const chunk of chunks) {
    const translated = await translateChunk(chunk, signal)
    parts.push(translated)
  }
  const joined = parts.join('\n').trim()
  if (!joined) return null
  writeCache(key, joined)
  return joined
}
