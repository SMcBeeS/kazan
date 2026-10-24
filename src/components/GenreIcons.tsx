import {
  MapIcon,
  SwordIcon,
  SkullIcon,
  RocketIcon,
  HeartIcon,
  StarIcon,
  WandIcon,
  DramaIcon,
  BrainIcon,
  FlameIcon,
  MysteryIcon,
  ShieldAlertIcon,
  BotIcon,
  MusicIcon,
  CoffeeIcon,
  LaughIcon,
  TrophyIcon,
  SparkleIcon,
} from './icons'

/**
 * Distinct per-genre icon map for GenreGrid / GenreChips.
 *
 * Every supported genre maps to a unique line-icon so no two genres
 * ever fall back to a repetitive CompassIcon:
 *
 *   Action      → SwordIcon
 *   Adventure   → MapIcon
 *   Comedy      → LaughIcon
 *   Drama       → DramaIcon
 *   Ecchi       → FlameIcon
 *   Fantasy     → WandIcon
 *   Hentai      → ShieldAlertIcon
 *   Horror      → SkullIcon
 *   Mahou Shoujo → StarIcon
 *   Mecha       → BotIcon
 *   Music       → MusicIcon
 *   Mystery     → MysteryIcon
 *   Psychological → BrainIcon
 *   Romance     → HeartIcon
 *   Sci-Fi      → RocketIcon
 *   Slice of Life → CoffeeIcon
 *   Sports      → TrophyIcon
 *   Supernatural → SparkleIcon
 */
export const GENRE_ICONS: Record<string, typeof SwordIcon> = {
  Action: SwordIcon,
  Adventure: MapIcon,
  Comedy: LaughIcon,
  Drama: DramaIcon,
  Ecchi: FlameIcon,
  Fantasy: WandIcon,
  Hentai: ShieldAlertIcon,
  Horror: SkullIcon,
  'Mahou Shoujo': StarIcon,
  Mecha: BotIcon,
  Music: MusicIcon,
  Mystery: MysteryIcon,
  Psychological: BrainIcon,
  Romance: HeartIcon,
  'Sci-Fi': RocketIcon,
  'Slice of Life': CoffeeIcon,
  Sports: TrophyIcon,
  Supernatural: SparkleIcon,
}
