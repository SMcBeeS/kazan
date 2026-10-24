/**
 * icons.tsx — lightweight inline SVG icons (no icon dependency).
 * All inherit `currentColor` and accept a className.
 */

import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function base(props: IconProps) {
  return {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  }
}

export const HomeIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 9.5 12 3l9 6.5" />
    <path d="M5 10v10h14V10" />
    <path d="M9 20v-6h6v6" />
  </svg>
)

/** Person / profile glyph (used for the profile nav item + profile header). */
export const ProfileIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20a8 8 0 0 1 16 0" />
  </svg>
)

export const GridIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
)

export const HeartIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <svg {...base(p)} fill={filled ? 'currentColor' : 'none'}>
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8z" />
  </svg>
)

export const HistoryIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l3 2" />
  </svg>
)

export const SearchIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
)

export const PlayIcon = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M7 4.5v15l13-7.5z" />
  </svg>
)

export const PauseIcon = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <rect x="6" y="4.5" width="4" height="15" rx="1" />
    <rect x="14" y="4.5" width="4" height="15" rx="1" />
  </svg>
)

export const StarIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <svg {...base(p)} fill={filled ? 'currentColor' : 'none'}>
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
  </svg>
)

export const ChevronLeft = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m15 18-6-6 6-6" />
  </svg>
)

export const ChevronRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m9 18 6-6-6-6" />
  </svg>
)

export const ChevronDown = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)

export const ArrowLeft = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </svg>
)

export const ArrowRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
)

export const CloseIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
)

export const MenuIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 6h16" />
    <path d="M4 12h16" />
    <path d="M4 18h16" />
  </svg>
)

export const FullscreenIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    <path d="M16 3h3a2 2 0 0 1 2 2v3" />
    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
  </svg>
)

export const ExitFullscreenIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 3v3a2 2 0 0 1-2 2H3" />
    <path d="M16 3v3a2 2 0 0 0 2 2h3" />
    <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    <path d="M8 21v-3a2 2 0 0 0-2-2H3" />
  </svg>
)

export const VolumeIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" />
    <path d="M16 9a4 4 0 0 1 0 6" />
    <path d="M19 6a8 8 0 0 1 0 12" />
  </svg>
)

export const MuteIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" />
    <path d="m17 9 4 6" />
    <path d="m21 9-4 6" />
  </svg>
)

export const SettingsIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11.5 4a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 19.4 11a2 2 0 1 1 0 4z" />
  </svg>
)

export const SubtitlesIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 15h4" />
    <path d="M14 15h3" />
    <path d="M7 11h2" />
    <path d="M13 11h4" />
  </svg>
)

export const AlertIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4" />
    <path d="M12 16h.01" />
  </svg>
)

export const CheckIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m20 6-11 11-5-5" />
  </svg>
)

export const LanguageIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z" />
  </svg>
)

export const SkipNextIcon = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M6 5l9 7-9 7z" />
    <rect x="16" y="5" width="2.5" height="14" rx="1" />
  </svg>
)

export const SkipPrevIcon = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M18 5l-9 7 9 7z" />
    <rect x="5.5" y="5" width="2.5" height="14" rx="1" />
  </svg>
)

export const FilterIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 5h18" />
    <path d="M7 12h10" />
    <path d="M11 19h2" />
  </svg>
)

export const TrashIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </svg>
)

export const SparkleIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
    <path d="M18.5 15.5l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" />
    <path d="M5.5 14.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6L3.3 17l1.6-.6z" />
  </svg>
)

export const BellIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9" />
    <path d="M10 20a2.2 2.2 0 0 0 4 0" />
  </svg>
)

export const AvatarIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
  </svg>
)

export const SwordIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 20l2.5-2.5" />
    <path d="M6.5 15.5 15 7l2 2-8.5 8.5" />
    <path d="M14 4l6 6" />
    <path d="M16.5 3.5l4 4" />
    <path d="M13 5l6 6" />
  </svg>
)

export const CompassIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2 5-5 2 2-5z" />
  </svg>
)

export const LaughIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 14s1.5 2.5 4 2.5 4-2.5 4-2.5" />
    <path d="M9 9.5h.01" />
    <path d="M15 9.5h.01" />
  </svg>
)

export const DramaIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 4h16v12H4z" />
    <path d="M4 16c1.5 2 4 3 8 3s6.5-1 8-3" />
    <path d="M10 8.5h4" />
    <path d="M10 11.5h4" />
  </svg>
)

export const WandIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m5 19 9.5-9.5" />
    <path d="M15 4l.9 2.1L18 7l-2.1.9L15 10l-.9-2.1L12 7l2.1-.9z" />
    <path d="M19 11l.6 1.4L21 13l-1.4.6L19 15l-.6-1.4L17 13l1.4-.6z" />
  </svg>
)

export const MysteryIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
    <path d="M9.5 9.5a1.6 1.6 0 1 1 2.3 1.4c-.6.3-.8.7-.8 1.3" />
    <path d="M11 14.5h.01" />
  </svg>
)

export const RomanceIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 20s-7-4.3-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.7-9 9-9 9z" />
  </svg>
)

export const RocketIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 15c5-4 7-9 7-12-3 0-8 2-12 7l5 5z" />
    <path d="M9 12 4 10l2 5 3-3z" />
    <path d="M12 15l-3 3 2 2 3-3z" />
    <circle cx="15" cy="9" r="1.4" />
  </svg>
)

export const MapIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
    <path d="M9 4v14" />
    <path d="M15 6v14" />
  </svg>
)

export const MaskIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 5h16v5a8 8 0 0 1-8 8 8 8 0 0 1-8-8V5z" />
    <circle cx="9" cy="10" r="0.5" />
    <circle cx="15" cy="10" r="0.5" />
    <path d="M8.5 14.5c1 1 5 1 6.5-0.5" />
  </svg>
)

export const FlameIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 22c4.4 0 7.5-3 7.5-7.2 0-3-1.8-5.3-3.4-7C14.6 6.2 13 4.5 13 2c-3 2-4.5 4.2-5.3 6.3C6.4 9.6 4.5 11.8 4.5 14.8 4.5 19 7.6 22 12 22z" />
    <path d="M12 22c-2 0-3.5-1.4-3.5-3.3 0-1.4.9-2.4 1.7-3.4.7-.9 1.6-2 1.8-3.3 1.6 1 3.5 2.9 3.5 5.2 0 2.7-1.4 4.8-3.5 4.8z" />
  </svg>
)

export const GhostIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 21v-8a7 7 0 0 1 14 0v8l-2.7-1.8L13.5 20l-2.7-1.8L8 20 5.5 18.6z" />
    <circle cx="9.5" cy="10.5" r="0.5" />
    <circle cx="14.5" cy="10.5" r="0.5" />
  </svg>
)

export const BotIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4" y="8" width="16" height="11" rx="2.5" />
    <path d="M12 8V4" />
    <circle cx="12" cy="3" r="1" />
    <circle cx="9" cy="13" r="0.5" />
    <circle cx="15" cy="13" r="0.5" />
    <path d="M9.5 16.5h5" />
    <path d="M1.5 12v3" />
    <path d="M22.5 12v3" />
  </svg>
)

export const GearIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1z" />
  </svg>
)

export const MusicIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
)

export const BrainIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9.5 2a2.8 2.8 0 0 0-2.7 2.1A2.8 2.8 0 0 0 4 6.7 2.9 2.9 0 0 0 4.7 11 2.9 2.9 0 0 0 6 15.5 3 3 0 0 0 8 20c.4 1 1.4 2 2.9 2 .3 0 .6 0 .9-.1V3.6A2.6 2.6 0 0 0 9.5 2z" />
    <path d="M14.5 2a2.8 2.8 0 0 1 2.7 2.1A2.8 2.8 0 0 1 20 6.7a2.9 2.9 0 0 1-.7 4.3 2.9 2.9 0 0 1-1.3 4.5 3 3 0 0 1-2 4.5c-.4 1-1.4 2-2.9 2-.3 0-.6 0-.9-.1" />
    <path d="M12 3.5V21" />
  </svg>
)

export const CoffeeIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
    <path d="M3 8h14v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z" />
    <path d="M7 2v2" />
    <path d="M11 2v2" />
    <path d="M15 2v2" />
  </svg>
)

export const SunIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.9 4.9 1.4 1.4" />
    <path d="m17.7 17.7 1.4 1.4" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.3 17.7-1.4 1.4" />
    <path d="m19.1 4.9-1.4 1.4" />
  </svg>
)

export const TrophyIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 21h8" />
    <path d="M12 17v4" />
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
    <path d="M7 6H4a1 1 0 0 0-1 1c0 2.5 2 4 4 4" />
    <path d="M17 6h3a1 1 0 0 1 1 1c0 2.5-2 4-4 4" />
  </svg>
)

/** Laurel wreath (award laurels, e.g. Crunchyroll Anime Awards). */
export const LaurelIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 4.5v15" />
    <path d="M8.5 7c2 .8 3.1 2.7 3.5 5.5.4 2.8-.5 5.6-2.5 7.5-2-1.9-2.9-4.7-2.5-7.5.4-2.8 1.5-4.7 1.5-5.5z" />
    <path d="M15.5 7c-2 .8-3.1 2.7-3.5 5.5-.4 2.8.5 5.6 2.5 7.5 2-1.9 2.9-4.7 2.5-7.5-.4-2.8-1.5-4.7-1.5-5.5z" />
    <path d="M8.5 7c-1.7.3-3.1 1.3-4 2.7" />
    <path d="M15.5 7c1.7.3 3.1 1.3 4 2.7" />
    <path d="M5.4 12.2c-.9.5-1.7 1.2-2.1 2.1" />
    <path d="M18.6 12.2c.9.5 1.7 1.2 2.1 2.1" />
    <path d="M6 17.6c-.4.6-.6 1.2-.6 2" />
    <path d="M18 17.6c.4.6.6 1.2.6 2" />
  </svg>
)

/**
 * Filled, pointed-leaf path (laurel leaf) from `base` to `tip`.
 * Two quadratic curves bulge ±`w` off the midline, giving a pointed
 * ellipse — the classic lanceolate laurel-leaf silhouette.
 */
const laurelLeaf = (bx: number, by: number, tx: number, ty: number, w: number): string => {
  const mx = (bx + tx) / 2
  const my = (by + ty) / 2
  const dx = tx - bx
  const dy = ty - by
  const len = Math.hypot(dx, dy) || 1
  const px = -dy / len
  const py = dx / len
  return `M${bx} ${by} Q${(mx + px * w).toFixed(1)} ${(my + py * w).toFixed(1)} ${tx} ${ty} Q${(mx - px * w).toFixed(1)} ${(my - py * w).toFixed(1)} ${bx} ${by} Z`
}

/**
 * Classic laurel-branch data in a 32×44 box, drawn as the LEFT flanker:
 * a curved vine sweeping from bottom (19,43) left and up to a tip at (17,3),
 * with leaves alternating on the outer and inner edges, all pointing upward.
 * Each entry: [baseX, baseY, tipX, tipY, half-thickness].
 */
const LAUREL_STEM = 'M19 43 C11 40 6.5 33 7 24 C7.5 14.5 10.5 7 17 3'
const LAUREL_LEAVES: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [15.5, 41.5, 9.5, 33, 3.8], // outer, lower
  [12.8, 39.2, 16.8, 31, 3.8], // inner, lower
  [10.2, 36, 4.5, 28.5, 3.8], // outer
  [9.4, 32.5, 14.2, 25.5, 3.8], // inner
  [7.7, 27.5, 3.6, 20.5, 3.8], // outer
  [8.6, 23.5, 13.5, 17, 3.8], // inner
  [9.2, 18, 6.2, 11, 3.6], // outer
  [11.3, 13.5, 16.5, 7.5, 3.6], // inner
  [13.3, 8, 11.8, 2, 3.2], // outer, near tip
  [16.6, 4.6, 20.5, 0.5, 3.2], // tip leaf, along the vine's end tangent
]

/** The branch itself; `flipped` mirrors it horizontally via scale(-1, 1). */
const LaurelBranch = ({ flipped }: { flipped?: boolean }) => (
  <g transform={flipped ? 'translate(32 0) scale(-1 1)' : undefined}>
    <path d={LAUREL_STEM} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    {LAUREL_LEAVES.map(([bx, by, tx, ty, w]) => (
      <path key={`${bx}-${tx}`} d={laurelLeaf(bx, by, tx, ty, w)} />
    ))}
  </g>
)

/** Left laurel branch (award-logo flanker): vine faces right, opening toward the wordmark. */
export const LaurelLeftIcon = (p: IconProps) => (
  <svg viewBox="0 0 32 44" width="1em" height="1em" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...p}>
    <LaurelBranch />
  </svg>
)

/** Right laurel branch: identical branch mirrored with transform="scale(-1, 1)" so it faces left. */
export const LaurelRightIcon = (p: IconProps) => (
  <svg viewBox="0 0 32 44" width="1em" height="1em" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...p}>
    <LaurelBranch flipped />
  </svg>
)

export const EyeIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

export const LockIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
)

export const ShieldAlertIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 22s8-3.6 8-10V5l-8-3-8 3v7c0 6.4 8 10 8 10z" />
    <path d="M12 8v4" />
    <path d="M12 15h.01" />
  </svg>
)

export const MoonIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3c2.49 0 4.88.65 6.93 1.83a8.993 8.993 0 0 1-5.38 12.53A9 9 0 0 1 3 12c0-4.97 4.03-9 9-9z" />
  </svg>
)

export const CalendarIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4" />
    <path d="M8 2v4" />
    <path d="M3 10h18" />
  </svg>
)

export const ClockIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)

export const SkullIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 4.5c-2.4 0-4.4 1.6-4.7 3.8h-.1C7.2 9.1 5 12.5 5 16.5 5 19.4 7.6 22 11.2 22c1.6 0 3-.5 4.2-1.3.2-.1.3-.2.3-.4 0-.2.1-.5.3-.4.8-.4 1.3-1.2 1.3-2.1 0-1.2-1.1-2.1-2-2.1-.4 0-.8-.1-1.2-.2-2-.6-3.3-2.5-3.3-4.8 0-1.4.6-2.7 1.6-3.6.2-.2.5-.3.8-.3s.6.1.8.3c1 .9 2.2 1.4 3.5 1.4 1.3 0 2.5-.5 3.5-1.4 .2-.2.5-.3.8-.3s.6.1.8.3c1 .9 2.2 1.4 3.5 1.4 1.3 0 2.5-.5 3.5-1.4 1 1 1.6 2.2 1.6 3.6 0 2.3-1.3 4.2-3.3 4.8-.4.1-.8.2-1.2.2-.9 0-1.8-.9-2-2.1 0 .9.5 1.7 1.3 2.1.2.2.3.2.3.4 0 .2.1.3.3.4 1.2.8 2.6 1.3 4.2 1.3 3.6 0 6.2-2.6 6.2-5.5 0-4-2.2-7.4-5.3-9.2-.3-2.2-2.3-3.8-4.7-3.8z" />
    <circle cx="9.5" cy="8.5" r="0.6" />
    <circle cx="14.5" cy="8.5" r="0.6" />
  </svg>
)

/** Paper-plane / send (used by the episode comments "Post" button). */
export const SendIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M21.5 2.5 10.8 13.2" />
    <path d="M21.5 2.5 14.7 21.5l-3.9-8.3-8.3-3.9z" />
  </svg>
)

/* ---- Watchlist status outline icons (Watching / Plan to Watch / ...) ---- */

export const ListIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 6h11" />
    <path d="M9 12h11" />
    <path d="M9 18h11" />
    <path d="m4 5.5 1 1 2-2" />
    <path d="m4 11.5 1 1 2-2" />
    <path d="m4 17.5 1 1 2-2" />
  </svg>
)

export const CalendarPlusIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="4.5" width="18" height="17" rx="2.5" />
    <path d="M3 9.5h18" />
    <path d="M8 2.5v4" />
    <path d="M16 2.5v4" />
    <path d="M12 12.5v5" />
    <path d="M9.5 15h5" />
  </svg>
)

export const ClipboardCheckIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="5" y="4" width="14" height="18" rx="2.5" />
    <path d="M9 4.2c0-1 .8-1.7 1.7-1.7h2.6c1 0 1.7.8 1.7 1.7v1H9v-1z" />
    <path d="m8.8 13.3 2.2 2.2 4.2-4.3" />
  </svg>
)

export const PauseCircleIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M10 8.5v7" />
    <path d="M14 8.5v7" />
  </svg>
)

export const LogOutIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h3" />
    <path d="m15.5 8 4 4-4 4" />
    <path d="M19.5 12H9.5" />
  </svg>
)

/** Red "X in a circle" (Dropped status in the watchlist dropdown). */
export const XCircleIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="m9 9 6 6" />
    <path d="m15 9-6 6" />
  </svg>
)
