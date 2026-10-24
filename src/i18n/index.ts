/**
 * i18n/index.ts — translation helper + dictionaries registry.
 */

import type { Dict, Lang } from './translations'
import { ar, en } from './translations'

export type { Dict, Lang }
export { ar, en }

export const dictionaries: Record<Lang, Dict> = { ar, en }

export const LANGUAGES: { code: Lang; label: string; dir: 'rtl' | 'ltr' }[] = [
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'en', label: 'English', dir: 'ltr' },
]

/** Look up a key and interpolate {token} placeholders. */
export function translate(
  dict: Dict,
  key: string,
  vars?: Record<string, string | number>,
): string {
  let value = dict[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return value
}

/**
 * Arabic translations for the canonical AniList genre/theme names.
 *
 * Genre and theme labels come back from the AniList API in English (e.g.
 * "Action", "Slice of Life", "Isekai"). This map lets us surface them in
 * Arabic without touching the API layer. Unknown names simply fall back to the
 * original English value (see translateGenre), so new genres never render blank.
 */
const GENRE_AR: Record<string, string> = {
  // Genres
  Action: 'أكشن',
  Adventure: 'مغامرات',
  Comedy: 'كوميديا',
  Drama: 'دراما',
  Ecchi: 'إكيتشي',
  Fantasy: 'فانتازيا',
  Hentai: 'هنتاي',
  Horror: 'رعب',
  'Mahou Shoujo': 'بطلات سحرية',
  Mecha: 'ميكانيكا',
  Music: 'موسيقى',
  Mystery: 'غموض',
  Psychological: 'نفسي',
  Romance: 'رومانسية',
  'Sci-Fi': 'خيال علمي',
  'Slice of Life': 'شريحة من الحياة',
  Sports: 'رياضة',
  Supernatural: 'خوارق للطبيعة',
  Thriller: 'إثارة',
  // Common themes / demographics
  Isekai: 'عالم آخر',
  'Time Travel': 'سفر عبر الزمن',
  Reincarnation: 'إعادة تجسد',
  'Super Power': 'قوة خارقة',
  'Time Loop': 'حلقة زمنية',
  'Martial Arts': 'فنون قتالية',
  Shounen: 'شونين',
  Seinen: 'سينين',
  Shoujo: 'شوجو',
  Josei: 'جوزيه',
  'High School': 'ثانوية',
  'Middle School': 'مدرسة متوسطة',
  'Villainess': 'شريرة',
  'Lolicon': 'لوليكون',
  'Post-apocalyptic': 'ما بعد الطوفان',
  'Iyashikei': 'استرخاء',
  Game: 'لعبة',
  Dungeon: 'مرصد',
  Space: 'فضاء',
  Culinary: 'مطبخ',
  'Dating Sim': 'محاكاة المواعدة',
  Otaku: 'أوتاكو',
}

/**
 * Localize a genre / theme name for a language. Returns the Arabic label when
 * available and the language is Arabic; otherwise returns the original name
 * unchanged (so the English UI is untouched and unknown genres never go blank).
 */
export function translateGenre(name: string, lang: Lang): string {
  if (lang === 'ar') return GENRE_AR[name] ?? name
  return name
}
