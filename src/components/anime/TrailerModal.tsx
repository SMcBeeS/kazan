import { useEffect, useState } from 'react'
import { useI18n } from '../../context/LanguageContext'
import type { JikanTrailer } from '../../lib/types'
import { trailerEmbedUrl } from '../../lib/utils'
import { Modal } from '../ui/Modal'
import { Spinner } from '../ui/Feedback'

/**
 * TrailerModal — responsive backdrop player for the official YouTube trailer.
 *
 * Uses trailer.embed_url (falling back to youtube_id) and shows a shimmer
 * skeleton until the iframe finishes loading. The iframe is only mounted once
 * the modal opens so we never autoplay/load in the background.
 */
export function TrailerModal({
  open,
  onClose,
  trailer,
}: {
  open: boolean
  onClose: () => void
  trailer?: JikanTrailer | null
}) {
  const { t } = useI18n()
  const [loaded, setLoaded] = useState(false)
  const embedUrl = trailerEmbedUrl(trailer)

  // Reset the loaded flag each time the modal (re)opens.
  useEffect(() => {
    if (open) setLoaded(false)
  }, [open])

  if (!embedUrl) return null

  return (
    <Modal open={open} onClose={onClose} title={t('detail.trailerTitle')} size="xl">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        {/* Loading skeleton behind the iframe */}
        {!loaded && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-night-850">
            <Spinner className="h-8 w-8 text-slate-300" />
            <p className="text-xs text-slate-400">{t('detail.trailerLoading')}</p>
          </div>
        )}
        {open && (
          <iframe
            src={embedUrl}
            title={t('detail.trailerTitle')}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setLoaded(true)}
          />
        )}
      </div>
    </Modal>
  )
}
