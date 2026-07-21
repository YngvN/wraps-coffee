import type { ReactNode } from 'react'
import { type TransitIconPack, DEFAULT_TRANSIT_ICON_PACK } from '../../types/screen'

interface TransitModeIconProps {
  /** Entur's `TransportMode` value (e.g. `"bus"`, `"rail"`, `"tram"`) — see `DepartureInfo.mode`. Anything unrecognized falls back to a generic question-mark/dot glyph rather than rendering nothing. */
  mode: string
  /** Which icon set to draw the glyph from — see `TransitIconPack`. Falls back to `DEFAULT_TRANSIT_ICON_PACK`. */
  pack?: TransitIconPack
  className?: string
}

/** Shared stroke-icon defaults, matching `AdminNavIcons`' own outline style — a plain 24x24 glyph that inherits its color from the surrounding text. Shared by every pack, so switching `pack` only ever changes the glyph shapes, never their sizing/alignment. */
function Wrapper({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {children}
    </svg>
  )
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
function simpleIconFor(mode: string): ReactNode {
  switch (mode) {
    case 'bus':
    case 'coach':
      return <SimpleBusIcon />
    case 'tram':
      return <SimpleTramIcon />
    case 'rail':
      return <SimpleRailIcon />
    case 'metro':
      return <SimpleMetroIcon />
    case 'water':
      return <SimpleWaterIcon />
    case 'air':
      return <SimpleAirIcon />
    case 'cableway':
    case 'funicular':
    case 'lift':
      return <SimpleCableCarIcon />
    default:
      return <SimpleUnknownModeIcon />
  }
}

// ---------------------------------------------------------------------------
// "standard" pack — familiar transit-map-style glyphs, adapted from the
// open-source Lucide icon set (https://lucide.dev, ISC licensed):
// `bus`, `tram-front`, `train-front`, `train-front-tunnel`, `ship`, `plane`,
// `cable-car`, and `circle-help`.
// ---------------------------------------------------------------------------

function StandardBusIcon() {
  return (
    <>
      <path d="M8 6v6" />
      <path d="M15 6v6" />
      <path d="M2 12h19.6" />
      <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3" />
      <circle cx="7" cy="18" r="2" />
      <path d="M9 18h5" />
      <circle cx="16" cy="18" r="2" />
    </>
  )
}

function StandardTramIcon() {
  return (
    <>
      <rect width="16" height="16" x="4" y="3" rx="2" />
      <path d="M4 11h16" />
      <path d="M12 3v8" />
      <path d="m8 19-2 3" />
      <path d="m18 22-2-3" />
      <path d="M8 15h.01" />
      <path d="M16 15h.01" />
    </>
  )
}

function StandardRailIcon() {
  return (
    <>
      <path d="M8 3.1V7a4 4 0 0 0 8 0V3.1" />
      <path d="m9 15-1-1" />
      <path d="m15 15 1-1" />
      <path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z" />
      <path d="m8 19-2 3" />
      <path d="m16 19 2 3" />
    </>
  )
}

function StandardMetroIcon() {
  return (
    <>
      <path d="M2 22V12a10 10 0 1 1 20 0v10" />
      <path d="M15 6.8v1.4a3 2.8 0 1 1-6 0V6.8" />
      <path d="M10 15h.01" />
      <path d="M14 15h.01" />
      <path d="M10 19a4 4 0 0 1-4-4v-3a6 6 0 1 1 12 0v3a4 4 0 0 1-4 4Z" />
      <path d="m9 19-2 3" />
      <path d="m15 19 2 3" />
    </>
  )
}

function StandardWaterIcon() {
  return (
    <>
      <path d="M12 10.189V14" />
      <path d="M12 2v3" />
      <path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6" />
      <path d="M19.38 20A11.6 11.6 0 0 0 21 14l-8.188-3.639a2 2 0 0 0-1.624 0L3 14a11.6 11.6 0 0 0 2.81 7.76" />
      <path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
    </>
  )
}

function StandardAirIcon() {
  return <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
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

/** Entur's `TransportMode` enum, mapped to a representative `'standard'`-pack icon — `coach` (intercity bus) reuses the bus glyph, `metro` gets the tunnel variant of the train glyph (`rail` gets the plain one), and `cableway`/`funicular`/`lift` (all rare, all "hanging from/riding a cable" concepts) share one gondola glyph. */
function standardIconFor(mode: string): ReactNode {
  switch (mode) {
    case 'bus':
    case 'coach':
      return <StandardBusIcon />
    case 'tram':
      return <StandardTramIcon />
    case 'rail':
      return <StandardRailIcon />
    case 'metro':
      return <StandardMetroIcon />
    case 'water':
      return <StandardWaterIcon />
    case 'air':
      return <StandardAirIcon />
    case 'cableway':
    case 'funicular':
    case 'lift':
      return <StandardCableCarIcon />
    default:
      return <StandardUnknownModeIcon />
  }
}

/** One outline icon per Entur transport mode, shown next to a departure's line number in `TransitSlide` (and in the admin's own "View transit icons" legend). See `TransitIconPack` for the available icon sets. */
export function TransitModeIcon({ mode, pack = DEFAULT_TRANSIT_ICON_PACK, className }: TransitModeIconProps) {
  return <Wrapper className={className}>{pack === 'simple' ? simpleIconFor(mode) : standardIconFor(mode)}</Wrapper>
}
