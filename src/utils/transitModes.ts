/** Every Entur `TransportMode` value `TransitModeIcon` recognizes, paired with its own i18n label — shared by the Integrations page's "View transit icons" legend and a `'transit'` slide's own mode-filter checkboxes (see `SlideFields.tsx`), so both list the exact same set. */
export const TRANSIT_MODES: { mode: string; labelKey: string }[] = [
  { mode: 'bus', labelKey: 'admin.integrations.transitModeBus' },
  { mode: 'coach', labelKey: 'admin.integrations.transitModeCoach' },
  { mode: 'tram', labelKey: 'admin.integrations.transitModeTram' },
  { mode: 'rail', labelKey: 'admin.integrations.transitModeRail' },
  { mode: 'metro', labelKey: 'admin.integrations.transitModeMetro' },
  { mode: 'water', labelKey: 'admin.integrations.transitModeWater' },
  { mode: 'air', labelKey: 'admin.integrations.transitModeAir' },
  { mode: 'cableway', labelKey: 'admin.integrations.transitModeCableway' },
  { mode: 'funicular', labelKey: 'admin.integrations.transitModeFunicular' },
  { mode: 'lift', labelKey: 'admin.integrations.transitModeLift' },
  { mode: 'unknown', labelKey: 'admin.integrations.transitModeUnknown' },
]
