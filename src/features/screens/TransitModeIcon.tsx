import type { ReactNode } from 'react'

interface TransitModeIconProps {
  /** Entur's `TransportMode` value (e.g. `"bus"`, `"rail"`, `"tram"`) — see `DepartureInfo.mode`. Anything unrecognized falls back to a generic dot-in-circle glyph rather than rendering nothing. */
  mode: string
  className?: string
}

/** Shared stroke-icon defaults, matching `AdminNavIcons`' own outline style — a plain 24x24 glyph that inherits its color from the surrounding text. */
function Wrapper({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {children}
    </svg>
  )
}

function BusIcon() {
  return (
    <>
      <rect x="3" y="5" width="18" height="11" rx="2" />
      <line x1="3" y1="11" x2="21" y2="11" />
      <circle cx="7.5" cy="18.5" r="1.5" />
      <circle cx="16.5" cy="18.5" r="1.5" />
    </>
  )
}

function TramIcon() {
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

function RailIcon() {
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

function MetroIcon() {
  return (
    <>
      <rect x="4" y="4" width="16" height="12" rx="2" />
      <circle cx="12" cy="10" r="3" />
      <circle cx="8" cy="19" r="1.5" />
      <circle cx="16" cy="19" r="1.5" />
    </>
  )
}

function WaterIcon() {
  return (
    <>
      <polygon points="3,14 21,14 18,20 6,20" />
      <line x1="12" y1="14" x2="12" y2="4" />
      <line x1="12" y1="6" x2="17" y2="8" />
    </>
  )
}

function AirIcon() {
  return <polygon points="12,2 20,20 12,16 4,20" />
}

function CableCarIcon() {
  return (
    <>
      <line x1="2" y1="6" x2="22" y2="6" />
      <line x1="12" y1="6" x2="12" y2="10" />
      <rect x="7" y="10" width="10" height="8" rx="2" />
    </>
  )
}

function UnknownModeIcon() {
  return (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="1.5" />
    </>
  )
}

/** Entur's `TransportMode` enum, mapped to a representative icon — `coach` (intercity bus) reuses the bus glyph, and `cableway`/`funicular`/`lift` (all rare, all "hanging from/riding a cable" concepts) share one gondola glyph. */
function iconFor(mode: string) {
  switch (mode) {
    case 'bus':
    case 'coach':
      return <BusIcon />
    case 'tram':
      return <TramIcon />
    case 'rail':
      return <RailIcon />
    case 'metro':
      return <MetroIcon />
    case 'water':
      return <WaterIcon />
    case 'air':
      return <AirIcon />
    case 'cableway':
    case 'funicular':
    case 'lift':
      return <CableCarIcon />
    default:
      return <UnknownModeIcon />
  }
}

/** One outline icon per Entur transport mode, shown next to a departure's line number in `TransitSlide`. */
export function TransitModeIcon({ mode, className }: TransitModeIconProps) {
  return <Wrapper className={className}>{iconFor(mode)}</Wrapper>
}
