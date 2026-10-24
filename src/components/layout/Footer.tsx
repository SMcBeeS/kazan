import { useI18n } from '../../context/LanguageContext'
import { BrandMark } from './Sidebar'

/** Minimal centered site footer: branding, tagline, and copyright. */
export function Footer() {
  const { t } = useI18n()
  const year = new Date().getFullYear()

  return (
    <footer className="mt-10 border-t border-night-700/70 bg-night-900/60">
      <div className="container-page flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex items-center gap-2">
          <BrandMark size="sm" />
          <span className="text-base font-semibold tracking-wide text-white">{t('app.name')}</span>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-slate-400">
          {t('app.tagline')}. {t('footer.disclaimer')}
        </p>
        <p className="text-xs text-slate-500">{t('footer.rights', { year })}</p>
      </div>
    </footer>
  )
}
