import { Link } from 'react-router-dom'
import { useI18n } from '../context/LanguageContext'
import { useLibrary } from '../context/LibraryContext'
import { EmptyState } from '../components/ui/States'
import { HeartIcon, TrashIcon } from '../components/icons'

/** FavoritesPage — grid of saved anime pulled from localStorage. */
export default function FavoritesPage() {
  const { t } = useI18n()
  const { favorites, removeFavorite } = useLibrary()

  if (favorites.length === 0) {
    return (
      <div className="container-page py-12">
        <EmptyState
          icon={<HeartIcon className="h-7 w-7" />}
          title={t('favorites.empty')}
          hint={t('favorites.emptyHint')}
          action={
            <Link to="/catalog" className="btn-primary">
              {t('favorites.browse')}
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="container-page py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-wide text-white sm:text-3xl">{t('favorites.title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('favorites.count', { n: favorites.length })}</p>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {favorites.map((f) => (
          <div key={f.mal_id} className="group relative">
            <Link to={`/anime/${f.mal_id}`} className="block">
              <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-night-700/70 bg-night-850 shadow-card transition group-hover:-translate-y-1 group-hover:border-slate-400/60 group-hover:shadow-glow-accent">
                {f.image ? (
                  <img src={f.image} alt={f.title} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-600">?</div>
                )}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-night-950/90 to-transparent" />
                <h3 className="absolute inset-x-0 bottom-0 line-clamp-2 p-2.5 text-sm font-bold text-white">
                  {f.title}
                </h3>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => removeFavorite(f.mal_id)}
              aria-label={t('favorites.remove')}
              className="absolute end-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-night-600/80 bg-night-900/80 text-red-400 backdrop-blur-sm transition hover:bg-red-500/20"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
