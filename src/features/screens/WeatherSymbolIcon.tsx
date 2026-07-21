import type { ReactNode } from 'react'
import { type WeatherIconPack, DEFAULT_WEATHER_ICON_PACK } from '../../types/screen'
import { weatherSymbolToEmoji } from '../../utils/weatherSymbols'

interface WeatherSymbolIconProps {
  /** MET Norway/Yr "symbol code" (e.g. `"partlycloudy_day"`) — see `weatherSymbolToEmoji`'s own doc comment for the `_day`/`_night`/`_polartwilight` suffix. */
  symbolCode: string
  /** Which icon set to draw the glyph from — see `WeatherIconPack`. Falls back to `DEFAULT_WEATHER_ICON_PACK`. */
  pack?: WeatherIconPack
  className?: string
}

/** Shared stroke-icon defaults, matching `TransitModeIcon`'s own `Wrapper` — a plain 24x24 glyph that inherits its color/size from the surrounding text (`width`/`height: 1em`), so it drops into `WeatherSlide`'s existing `.weather-slide__icon` font-size-driven sizing exactly like the `'system'` pack's plain emoji text does. */
function Wrapper({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {children}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// "outline" pack — dedicated outline glyphs, adapted from the open-source
// Lucide icon set (https://lucide.dev, ISC licensed): `sun`, `moon`,
// `cloud-sun`, `cloud-moon`, `cloud-sun-rain`, `cloud-moon-rain`, `cloud`,
// `cloud-fog`, `cloud-lightning`, `cloud-hail`, `cloud-snow`, `snowflake`,
// `cloud-rain`, `cloud-rain-wind`, `cloud-drizzle`.
// ---------------------------------------------------------------------------

function SunIcon() {
  return (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </>
  )
}

function MoonIcon() {
  return <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
}

function CloudSunIcon() {
  return (
    <>
      <path d="M12 2v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="M20 12h2" />
      <path d="m19.07 4.93-1.41 1.41" />
      <path d="M15.947 12.65a4 4 0 0 0-5.925-4.128" />
      <path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z" />
    </>
  )
}

function CloudMoonIcon() {
  return (
    <>
      <path d="M13 16a3 3 0 0 1 0 6H7a5 5 0 1 1 4.9-6z" />
      <path d="M18.376 14.512a6 6 0 0 0 3.461-4.127c.148-.625-.659-.97-1.248-.714a4 4 0 0 1-5.259-5.26c.255-.589-.09-1.395-.716-1.248a6 6 0 0 0-4.594 5.36" />
    </>
  )
}

function CloudSunRainIcon() {
  return (
    <>
      <path d="M12 2v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="M20 12h2" />
      <path d="m19.07 4.93-1.41 1.41" />
      <path d="M15.947 12.65a4 4 0 0 0-5.925-4.128" />
      <path d="M3 20a5 5 0 1 1 8.9-4H13a3 3 0 0 1 2 5.24" />
      <path d="M11 20v2" />
      <path d="M7 19v2" />
    </>
  )
}

function CloudMoonRainIcon() {
  return (
    <>
      <path d="M11 20v2" />
      <path d="M18.376 14.512a6 6 0 0 0 3.461-4.127c.148-.625-.659-.97-1.248-.714a4 4 0 0 1-5.259-5.26c.255-.589-.09-1.395-.716-1.248a6 6 0 0 0-4.594 5.36" />
      <path d="M3 20a5 5 0 1 1 8.9-4H13a3 3 0 0 1 2 5.24" />
      <path d="M7 19v2" />
    </>
  )
}

function CloudIcon() {
  return <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
}

function CloudFogIcon() {
  return (
    <>
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M16 17H7" />
      <path d="M17 21H9" />
    </>
  )
}

function CloudLightningIcon() {
  return (
    <>
      <path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973" />
      <path d="m13 12-3 5h4l-3 5" />
    </>
  )
}

function CloudHailIcon() {
  return (
    <>
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M16 14v2" />
      <path d="M8 14v2" />
      <path d="M16 20h.01" />
      <path d="M8 20h.01" />
      <path d="M12 16v2" />
      <path d="M12 22h.01" />
    </>
  )
}

function CloudSnowIcon() {
  return (
    <>
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M8 15h.01" />
      <path d="M8 19h.01" />
      <path d="M12 17h.01" />
      <path d="M12 21h.01" />
      <path d="M16 15h.01" />
      <path d="M16 19h.01" />
    </>
  )
}

function SnowflakeIcon() {
  return (
    <>
      <path d="m10 20-1.25-2.5L6 18" />
      <path d="M10 4 8.75 6.5 6 6" />
      <path d="m14 20 1.25-2.5L18 18" />
      <path d="m14 4 1.25 2.5L18 6" />
      <path d="m17 21-3-6h-4" />
      <path d="m17 3-3 6 1.5 3" />
      <path d="M2 12h6.5L10 9" />
      <path d="m20 10-1.5 2 1.5 2" />
      <path d="M22 12h-6.5L14 15" />
      <path d="m4 10 1.5 2L4 14" />
      <path d="m7 21 3-6-1.5-3" />
      <path d="m7 3 3 6h4" />
    </>
  )
}

function CloudRainIcon() {
  return (
    <>
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M16 14v6" />
      <path d="M8 14v6" />
      <path d="M12 16v6" />
    </>
  )
}

function CloudRainWindIcon() {
  return (
    <>
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="m9.2 22 3-7" />
      <path d="m9 13-3 7" />
      <path d="m17 13-3 7" />
    </>
  )
}

function CloudDrizzleIcon() {
  return (
    <>
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M8 19v1" />
      <path d="M8 14v1" />
      <path d="M16 19v1" />
      <path d="M16 14v1" />
      <path d="M12 21v1" />
      <path d="M12 16v1" />
    </>
  )
}

/**
 * MET's symbol codes mapped to a representative `'outline'`-pack icon, keyed
 * by the base code with the `_day`/`_night`/`_polartwilight` suffix stripped
 * (same split `weatherSymbolToEmoji` already does). Day/night only actually
 * changes the glyph for the four codes Lucide has a matching sun/moon pair
 * for (`clearsky`, `fair`/`partlycloudy` sharing one pair, `rainshowers`) —
 * `polartwilight` (dim daylight) counts as "day" here, same as every other
 * non-`night` suffix. Every other code (continuous precipitation, thunder,
 * fog) reads the same regardless of time of day, matching how Yr's own icon
 * set treats them.
 */
function outlineIconFor(symbolCode: string): ReactNode {
  const base = symbolCode.replace(/_(day|night|polartwilight)$/, '')
  const night = symbolCode.endsWith('_night')
  switch (base) {
    case 'clearsky':
      return night ? <MoonIcon /> : <SunIcon />
    case 'fair':
    case 'partlycloudy':
      return night ? <CloudMoonIcon /> : <CloudSunIcon />
    case 'rainshowers':
      return night ? <CloudMoonRainIcon /> : <CloudSunRainIcon />
    case 'fog':
      return <CloudFogIcon />
    case 'rainshowersandthunder':
    case 'rainandthunder':
    case 'snowandthunder':
    case 'sleetshowersandthunder':
    case 'snowshowersandthunder':
      return <CloudLightningIcon />
    case 'sleetshowers':
    case 'sleet':
      return <CloudHailIcon />
    case 'snowshowers':
    case 'snow':
    case 'heavysnow':
      return <CloudSnowIcon />
    case 'lightsnow':
      return <SnowflakeIcon />
    case 'rain':
      return <CloudRainIcon />
    case 'heavyrain':
      return <CloudRainWindIcon />
    case 'lightrain':
      return <CloudDrizzleIcon />
    case 'cloudy':
      return <CloudIcon />
    default:
      return <CloudIcon />
  }
}

/** One weather icon per MET symbol code, shown next to each hour's own temperature in `WeatherSlide` (and in the admin's own "View weather icons" legend). See `WeatherIconPack` for the available icon sets. */
export function WeatherSymbolIcon({ symbolCode, pack = DEFAULT_WEATHER_ICON_PACK, className }: WeatherSymbolIconProps) {
  if (pack === 'system') return <span className={className} aria-hidden="true">{weatherSymbolToEmoji(symbolCode)}</span>
  return <Wrapper className={className}>{outlineIconFor(symbolCode)}</Wrapper>
}
