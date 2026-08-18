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
// "standard" pack — `bus`/`tram`/`metro`/`water` are adapted directly from
// Ruter's own live product ("RDS", Ruter's design system — captured straight
// off ruter.no's own markup), and `rail` the same way from Ruter's own
// timetable-search page. A deliberate call, not an oversight: this app
// already themes a Ruter-branded transit pane with Ruter's own real brand
// colors and logo (`useBrandTheme`/`FetchedLogo`), so reusing their own icon
// set for the exact same feature is consistent with how the rest of that
// theming already leans on Ruter's own identity rather than a generic
// look-alike. `air` is adapted from an SVG Repo icon
// (https://www.svgrepo.com/svg/308387/). `cableway`/`funicular`/`lift` and
// the unknown-mode fallback keep the original Lucide-adapted
// (https://lucide.dev, ISC licensed) outline glyphs below — no Ruter/filled
// equivalent has been sourced for these (rare) modes yet, so
// `standardIconFor` renders them with `filled: false` instead, same as the
// `'simple'` pack.
// ---------------------------------------------------------------------------

function StandardBusIcon() {
  return (
    <>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M23 8C23 7.44772 22.5523 7 22 7H2C1.44772 7 1 7.44772 1 8V16.5C1 16.7761 1.22386 17 1.5 17H2.5C2.77614 17 2.99563 16.7745 3.04113 16.5021C3.2783 15.0822 4.51277 14 6 14C7.48723 14 8.7217 15.0822 8.95887 16.5021C9.00437 16.7745 9.22386 17 9.5 17H14.5C14.7761 17 14.9956 16.7745 15.0411 16.5021C15.2783 15.0822 16.5128 14 18 14C19.4872 14 20.7217 15.0822 20.9589 16.5021C21.0044 16.7745 21.2239 17 21.5 17H22.5C22.7761 17 23 16.7761 23 16.5V8ZM9 9.5C9 9.22386 9.22386 9 9.5 9H14.5C14.7761 9 15 9.22386 15 9.5V11.5C15 11.7761 14.7761 12 14.5 12H9.5C9.22386 12 9 11.7761 9 11.5V9.5ZM8 9.5C8 9.22386 7.77614 9 7.5 9H3.5C3.22386 9 3 9.22386 3 9.5V11.5C3 11.7761 3.22386 12 3.5 12H7.5C7.77614 12 8 11.7761 8 11.5V9.5ZM16 9.5C16 9.22386 16.2239 9 16.5 9H20.5C20.7761 9 21 9.22386 21 9.5V11.5C21 11.7761 20.7761 12 20.5 12H16.5C16.2239 12 16 11.7761 16 11.5V9.5Z"
      />
      <path d="M18 19C19.1046 19 20 18.1046 20 17C20 15.8954 19.1046 15 18 15C16.8954 15 16 15.8954 16 17C16 18.1046 16.8954 19 18 19Z" />
      <path d="M8 17C8 18.1046 7.10457 19 6 19C4.89543 19 4 18.1046 4 17C4 15.8954 4.89543 15 6 15C7.10457 15 8 15.8954 8 17Z" />
    </>
  )
}

function StandardTramIcon() {
  return (
    <>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12.4113 5.41581L10.8273 6.99977H2.8673C2.36964 6.99977 1.94772 7.3657 1.87735 7.85835L1.07071 13.5048C1.0262 13.8164 1.13099 14.1308 1.35355 14.3533L2.70711 15.7069C2.89464 15.8944 3.149 15.9998 3.41421 15.9998H4.75C4.88807 15.9998 5 16.1117 5 16.2498V16.4998C5 16.7759 5.22386 16.9998 5.5 16.9998H9.5C9.77614 16.9998 10 16.7759 10 16.4998V16.2498C10 16.1117 10.1119 15.9998 10.25 15.9998H13.75C13.8881 15.9998 14 16.1117 14 16.2498V16.4998C14 16.7759 14.2239 16.9998 14.5 16.9998H18.5C18.7761 16.9998 19 16.7759 19 16.4998V16.2498C19 16.1117 19.1119 15.9998 19.25 15.9998H20.5858C20.851 15.9998 21.1054 15.8944 21.2929 15.7069L22.6464 14.3533C22.869 14.1308 22.9738 13.8164 22.9293 13.5048L22.1227 7.85835C22.0523 7.3657 21.6304 6.99977 21.1327 6.99977H12.2415L13.4725 5.76874C13.6678 5.57344 13.6678 5.25677 13.4724 5.06153L11.5816 3.1718C11.4839 3.07422 11.3257 3.07425 11.2281 3.17186L10.8745 3.52546C10.7768 3.62309 10.7768 3.78138 10.8745 3.87901L12.4113 5.41581ZM15 8.99977H9V11.9998H15V8.99977ZM16 8.99977H19.5C19.7761 8.99977 20 9.22363 20 9.49977V11.9998H16V8.99977ZM8 8.99977H4.5C4.22386 8.99977 4 9.22363 4 9.49977V11.9998H8V8.99977Z"
      />
      <path d="M1 17.25C1 17.1119 1.11193 17 1.25 17H22.75C22.8881 17 23 17.1119 23 17.25V17.75C23 17.8881 22.8881 18 22.75 18H1.25C1.11193 18 1 17.8881 1 17.75V17.25Z" />
    </>
  )
}

function StandardRailIcon() {
  return (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M4.146 1.646a.5.5 0 0 1 .708 0L7.207 4h3.861c.73 0 1.429.29 1.945.805l3.116 3.117A2.975 2.975 0 0 1 14.025 13H1.875A.875.875 0 0 1 1 12.125v-7.25C1 4.392 1.392 4 1.875 4h3.918L4.146 2.354a.5.5 0 0 1 0-.708M2 6.5v3h3v-3zm4 0v3h3v-3zm4.5 3h5.429a2 2 0 0 0-.507-.871L12.792 6H11a.5.5 0 0 0-.5.5zm-9 4.5a.5.5 0 0 0 0 1h13a.5.5 0 1 0 0-1z"
    />
  )
}

function StandardMetroIcon() {
  return (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM7.5 8C7.22386 8 7 8.22386 7 8.5V9.5C7 9.77614 7.22386 10 7.5 10H11V17.5C11 17.7761 11.2239 18 11.5 18H12.5C12.7761 18 13 17.7761 13 17.5V10H16.5C16.7761 10 17 9.77614 17 9.5V8.5C17 8.22386 16.7761 8 16.5 8H7.5Z"
    />
  )
}

function StandardWaterIcon() {
  return (
    <>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.99001 15.0017C7.04001 15.0017 6.01001 15.4417 5.10001 15.8317C4.52379 16.0809 4.00215 16.3058 3.22819 16.4215C2.88015 16.4735 2.62037 16.1314 2.73188 15.7976L3.8859 12.3433C3.95405 12.1392 4.14504 12.0017 4.36014 12.0017H5.63986C5.85496 12.0017 6.04596 11.8641 6.11411 11.6601L7.44182 7.68489C7.57811 7.27684 7.9601 7.00169 8.39031 7.00169H12V6.3107C12 6.12132 12.107 5.94819 12.2764 5.86349L15.2764 4.36349C15.6089 4.19726 16 4.43901 16 4.8107V6.00169H17.2793C17.7097 6.00169 18.0918 6.27712 18.2279 6.68546L19.7721 11.3179C19.9082 11.7263 20.2903 12.0017 20.7208 12.0017H22.3056C22.6471 12.0017 22.8881 12.3364 22.7798 12.6603L22.0836 14.7419C22.0207 14.9301 21.8519 15.062 21.655 15.0868C20.5216 15.2292 19.7773 15.5388 19.1 15.8317L19.0946 15.834C18.2569 16.193 17.5367 16.5017 15.99 16.5017C14.4433 16.5017 13.7231 16.193 12.8854 15.834L12.88 15.8317C11.98 15.4417 10.95 15.0017 8.99001 15.0017ZM17.3063 12.0017C17.6476 12.0017 17.8886 11.6673 17.7806 11.3436L17.114 9.34357C17.0459 9.1394 16.8548 9.00169 16.6396 9.00169H15V12.0017H17.3063ZM14 9.00169H9.36039C9.14517 9.00169 8.95411 9.1394 8.88605 9.34357L8.21938 11.3436C8.11146 11.6673 8.35245 12.0017 8.69372 12.0017H14V9.00169Z"
      />
      <path d="M19.0946 17.834L19.1 17.8317C19.5097 17.6542 19.9427 17.472 20.4754 17.3233C20.8393 17.2218 21.1449 17.5752 21.0249 17.9334L20.6051 19.1874C20.5576 19.3294 20.4487 19.4422 20.31 19.4986C20.2343 19.5293 20.1581 19.5609 20.0811 19.5928C20.0181 19.6189 19.9545 19.6453 19.89 19.6717C18.98 20.0617 17.95 20.5017 15.99 20.5017C14.04 20.5017 13.01 20.0617 12.1 19.6717C11.26 19.3117 10.53 19.0017 8.99 19.0017C7.45332 19.0017 6.73311 19.3104 5.89543 19.6694L5.89 19.6717C4.98 20.0617 3.95 20.5017 2 20.5017C1.93829 20.5017 1.87785 20.5013 1.8186 20.5004C1.49366 20.4958 1.27988 20.1736 1.38311 19.8654L1.7257 18.8429C1.79398 18.639 1.98502 18.5032 2.19979 18.4947C3.21976 18.4548 4.14341 18.2417 5.1 17.8317C6.01 17.4417 7.04 17.0017 8.99 17.0017C10.95 17.0017 11.98 17.4417 12.88 17.8317C13.72 18.1917 14.45 18.5017 15.99 18.5017C17.5367 18.5017 18.2569 18.193 19.0946 17.834Z" />
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
      return { content: <StandardRailIcon />, filled: true, viewBox: '0 0 18 18' }
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
