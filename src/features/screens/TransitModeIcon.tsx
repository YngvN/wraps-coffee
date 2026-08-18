import type { ReactNode } from 'react'
import { type TransitIconPack, DEFAULT_TRANSIT_ICON_PACK } from '../../types/screen'

interface TransitModeIconProps {
  /** Entur's `TransportMode` value (e.g. `"bus"`, `"rail"`, `"tram"`) — see `DepartureInfo.mode`. Anything unrecognized falls back to a generic question-mark/dot glyph rather than rendering nothing. */
  mode: string
  /** Which icon set to draw the glyph from — see `TransitIconPack`. Falls back to `DEFAULT_TRANSIT_ICON_PACK`. */
  pack?: TransitIconPack
  className?: string
}

/**
 * Shared icon-svg defaults — sizes/aligns every glyph in every pack the same
 * way (`1em`, inherits color from the surrounding text) regardless of its
 * own native coordinate space or rendering style. Two independent knobs:
 * - `viewBox` (default `"0 0 24 24"`, matching every glyph except the
 *   `'standard'` pack's `air` icon, drawn at its own source 128x128) — no
 *   glyph needs its coordinates converted to fit a shared space, since
 *   `width`/`height: 1em` scale the whole viewBox uniformly regardless of
 *   its own size.
 * - `filled` — `false` (default) renders `AdminNavIcons`' own outline style
 *   (`fill: none`, a `currentColor` stroke), used by every `'simple'`-pack
 *   glyph and the `'standard'` pack's remaining Lucide-adapted ones
 *   (`cableway`/`funicular`/`lift`/unknown). `true` renders a solid
 *   `currentColor` silhouette with no stroke, used by the `'standard'`
 *   pack's own original filled glyphs (`bus`/`tram`/`metro`/`water`/`rail`)
 *   plus its adapted `air` glyph — letting one pack mix both rendering
 *   styles glyph-by-glyph instead of forcing a single style pack-wide.
 */
function Wrapper({ children, className, viewBox = '0 0 24 24', filled = false }: { children: ReactNode; className?: string; viewBox?: string; filled?: boolean }) {
  return (
    <svg
      viewBox={viewBox}
      width="1em"
      height="1em"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={filled ? undefined : 1.75}
      strokeLinecap={filled ? undefined : 'round'}
      strokeLinejoin={filled ? undefined : 'round'}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  )
}

/** What `simpleIconFor`/`standardIconFor` return — the glyph itself, plus the two `Wrapper` knobs it needs (a glyph not drawn at the shared 24x24/outline default overrides whichever of these it needs). */
interface IconSpec {
  content: ReactNode
  viewBox?: string
  filled?: boolean
}

// ---------------------------------------------------------------------------
// "simple" pack — this app's own original hand-drawn outline glyphs.
// ---------------------------------------------------------------------------

function SimpleBusIcon() {
  return (
    <>
      <rect x="3" y="5" width="18" height="11" rx="2" />
      <line x1="3" y1="11" x2="21" y2="11" />
      <circle cx="7.5" cy="18.5" r="1.5" />
      <circle cx="16.5" cy="18.5" r="1.5" />
    </>
  )
}

function SimpleTramIcon() {
  return (
    <>
      <rect x="4" y="6" width="16" height="10" rx="1.5" />
      <line x1="4" y1="11" x2="20" y2="11" />
      <line x1="12" y1="6" x2="12" y2="2" />
      <circle cx="8" cy="18.5" r="1.5" />
      <circle cx="16" cy="18.5" r="1.5" />
    </>
  )
}

function SimpleRailIcon() {
  return (
    <>
      <rect x="5" y="3" width="14" height="13" rx="4" />
      <rect x="8" y="7" width="3" height="3" />
      <rect x="13" y="7" width="3" height="3" />
      <circle cx="8.5" cy="19" r="1.5" />
      <circle cx="15.5" cy="19" r="1.5" />
    </>
  )
}

function SimpleMetroIcon() {
  return (
    <>
      <rect x="4" y="4" width="16" height="12" rx="2" />
      <circle cx="12" cy="10" r="3" />
      <circle cx="8" cy="19" r="1.5" />
      <circle cx="16" cy="19" r="1.5" />
    </>
  )
}

function SimpleWaterIcon() {
  return (
    <>
      <polygon points="3,14 21,14 18,20 6,20" />
      <line x1="12" y1="14" x2="12" y2="4" />
      <line x1="12" y1="6" x2="17" y2="8" />
    </>
  )
}

function SimpleAirIcon() {
  return <polygon points="12,2 20,20 12,16 4,20" />
}

function SimpleCableCarIcon() {
  return (
    <>
      <line x1="2" y1="6" x2="22" y2="6" />
      <line x1="12" y1="6" x2="12" y2="10" />
      <rect x="7" y="10" width="10" height="8" rx="2" />
    </>
  )
}

function SimpleUnknownModeIcon() {
  return (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="1.5" />
    </>
  )
}

/** Entur's `TransportMode` enum, mapped to a representative `'simple'`-pack icon — `coach` (intercity bus) reuses the bus glyph, and `cableway`/`funicular`/`lift` (all rare, all "hanging from/riding a cable" concepts) share one gondola glyph. */
function simpleIconFor(mode: string): IconSpec {
  switch (mode) {
    case 'bus':
    case 'coach':
      return { content: <SimpleBusIcon /> }
    case 'tram':
      return { content: <SimpleTramIcon /> }
    case 'rail':
      return { content: <SimpleRailIcon /> }
    case 'metro':
      return { content: <SimpleMetroIcon /> }
    case 'water':
      return { content: <SimpleWaterIcon /> }
    case 'air':
      return { content: <SimpleAirIcon /> }
    case 'cableway':
    case 'funicular':
    case 'lift':
      return { content: <SimpleCableCarIcon /> }
    default:
      return { content: <SimpleUnknownModeIcon /> }
  }
}

// ---------------------------------------------------------------------------
// "standard" pack — `bus`/`tram`/`metro`/`water`/`rail` are this app's own
// original solid-filled glyphs (`fill="currentColor"`, no stroke) — drawn to
// read at a glance the way a real transit operator's own departure-board
// icon set does (chunky silhouette + a mode-specific distinguishing detail:
// tram's overhead pole, metro's tunnel-arch nose, rail's roof vents/3
// wheels, water's hull+mast), but freely designed for this app rather than
// copied from any existing icon set or product. `air` is adapted from an
// SVG Repo icon (https://www.svgrepo.com/svg/308387/). `cableway`/
// `funicular`/`lift` and the unknown-mode fallback keep the original
// Lucide-adapted (https://lucide.dev, ISC licensed) outline glyphs below —
// no filled replacement exists for these (rare) modes yet, so `standardIconFor`
// renders them with `filled: false` instead, same as the `'simple'` pack.
// ---------------------------------------------------------------------------

function StandardBusIcon() {
  return (
    <>
      <rect x="3" y="6" width="18" height="10" rx="3" />
      <circle cx="7.5" cy="17" r="2" />
      <circle cx="16.5" cy="17" r="2" />
    </>
  )
}

function StandardTramIcon() {
  return (
    <>
      <rect x="11" y="2" width="2" height="5" />
      <rect x="4" y="7" width="16" height="9" rx="2.5" />
      <circle cx="8" cy="17.5" r="1.8" />
      <circle cx="16" cy="17.5" r="1.8" />
    </>
  )
}

function StandardRailIcon() {
  return (
    <>
      <rect x="7" y="4" width="2.5" height="3" rx="1" />
      <rect x="14.5" y="4" width="2.5" height="3" rx="1" />
      <rect x="3" y="7" width="18" height="9" rx="3" />
      <circle cx="7" cy="17.5" r="1.5" />
      <circle cx="12" cy="17.5" r="1.5" />
      <circle cx="17" cy="17.5" r="1.5" />
    </>
  )
}

function StandardMetroIcon() {
  return (
    <>
      <path d="M4 17v-5a8 8 0 0 1 16 0v5Z" />
      <rect x="4" y="16" width="16" height="1.5" />
      <circle cx="8" cy="18.2" r="1.6" />
      <circle cx="16" cy="18.2" r="1.6" />
    </>
  )
}

function StandardWaterIcon() {
  return (
    <>
      <rect x="11.25" y="4" width="1.5" height="10" />
      <path d="M12.75 4 18 6.5 12.75 9Z" />
      <path d="M3 15h18l-3 5H6Z" />
    </>
  )
}

function StandardAirIcon() {
  return <path d="M119.7 18.2c7.8-7.8-3-17.9-10.7-10.3L80.7 36.3 15.8 19.2 5 30l53.5 28.2L36.8 79.8 20 77.7l-8.6 8.6 19.1 10 10 19.1 8.6-8.6-2-16.7 21.6-21.6 27.6 53.2 10.8-10.8L90.8 47.2 119.7 18.2Z" />
}

function StandardCableCarIcon() {
  return (
    <>
      <path d="M10 3h.01" />
      <path d="M14 2h.01" />
      <path d="m2 9 20-5" />
      <path d="M12 12V6.5" />
      <rect width="16" height="10" x="4" y="12" rx="3" />
      <path d="M9 12v5" />
      <path d="M15 12v5" />
      <path d="M4 17h16" />
    </>
  )
}

function StandardUnknownModeIcon() {
  return (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </>
  )
}

/** Entur's `TransportMode` enum, mapped to a representative `'standard'`-pack icon — `coach` (intercity bus) reuses the bus glyph, and `cableway`/`funicular`/`lift` (all rare, all "hanging from/riding a cable" concepts) share one gondola glyph. */
function standardIconFor(mode: string): IconSpec {
  switch (mode) {
    case 'bus':
    case 'coach':
      return { content: <StandardBusIcon />, filled: true }
    case 'tram':
      return { content: <StandardTramIcon />, filled: true }
    case 'rail':
      return { content: <StandardRailIcon />, filled: true }
    case 'metro':
      return { content: <StandardMetroIcon />, filled: true }
    case 'water':
      return { content: <StandardWaterIcon />, filled: true }
    case 'air':
      return { content: <StandardAirIcon />, filled: true, viewBox: '0 0 128 128' }
    case 'cableway':
    case 'funicular':
    case 'lift':
      return { content: <StandardCableCarIcon /> }
    default:
      return { content: <StandardUnknownModeIcon /> }
  }
}

/** One icon per Entur transport mode, shown inside a departure's line badge in `TransitSlide` (and in the admin's own "View transit icons" legend). See `TransitIconPack` for the available icon sets. */
export function TransitModeIcon({ mode, pack = DEFAULT_TRANSIT_ICON_PACK, className }: TransitModeIconProps) {
  const { content, viewBox, filled } = pack === 'simple' ? simpleIconFor(mode) : standardIconFor(mode)
  return (
    <Wrapper className={className} viewBox={viewBox} filled={filled}>
      {content}
    </Wrapper>
  )
}
