import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { HeaderBar } from './HeaderBar'
import { Footer } from './Footer'
import { PageTransition } from './PageTransition'
import { useI18n } from '../../context/LanguageContext'

/**
 * App shell: persistent sidebar, header bar, animated main outlet, and footer.
 */
export function RootLayout() {
  const { t } = useI18n()

  return (
    <div className="flex min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-night-900"
      >
        {t('app.skipToContent')}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="container-page relative z-40 flex flex-wrap items-center gap-x-2 gap-y-2 pt-1.5 sm:pt-2">
          <HeaderBar />
        </div>
        <main id="main" className="flex-1 pb-24">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </main>
        <Footer />
      </div>
    </div>
  )
}