import { Link } from 'react-router-dom'
import { useI18n } from '../context/LanguageContext'

/** NotFoundPage — friendly 404. */
export default function NotFoundPage() {
  const { t } = useI18n()
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-12 text-center">
      <span className="bg-white bg-clip-text text-7xl font-bold text-transparent sm:text-8xl" style={{ WebkitTextStroke: '1px rgba(255,255,255,0.4)', textShadow: '0 0 40px rgba(255,255,255,0.25)' }}>
        404
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-wide text-white">{t('common.notFound')}</h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        {t('app.tagline')}
      </p>
      <Link to="/" className="btn-primary mt-6 px-6 py-3">
        {t('common.backHome')}
      </Link>
    </div>
  )
}
