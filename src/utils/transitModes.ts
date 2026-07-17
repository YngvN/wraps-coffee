/** Every Entur `TransportMode` value `TransitModeIcon` recognizes, paired with its own i18n label — shared by the Integrations page's "View transit icons" legend and a `'transit'` slide's own mode-filter checkboxes (see `SlideFields.tsx`), so both list the exact same set. */
export const TRANSIT_MODES: { mode: string; labelKey: string }[] = [
  { mode: 'bus', labelKey: 'admin.extensions.transitModeBus' },
  { mode: 'coach', labelKey: 'admin.extensions.transitModeCoach' },
  { mode: 'tram', labelKey: 'admin.extensions.transitModeTram' },
  { mode: 'rail', labelKey: 'admin.extensions.transitModeRail' },
  { mode: 'metro', labelKey: 'admin.extensions.transitModeMetro' },
  { mode: 'water', labelKey: 'admin.extensions.transitModeWater' },
  { mode: 'air', labelKey: 'admin.extensions.transitModeAir' },
  { mode: 'cableway', labelKey: 'admin.extensions.transitModeCableway' },
  { mode: 'funicular', labelKey: 'admin.extensions.transitModeFunicular' },
  { mode: 'lift', labelKey: 'admin.extensions.transitModeLift' },
  { mode: 'unknown', labelKey: 'admin.extensions.transitModeUnknown' },
]
