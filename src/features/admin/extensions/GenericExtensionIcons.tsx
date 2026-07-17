import type { SVGProps } from 'react'

export type IconProps = SVGProps<SVGSVGElement>

/** Shared stroke-icon defaults for the "Coming soon" items that describe a generic capability rather than a specific branded product — matches `AdminNavIcons`' own outline style rather than a colored brand mark. */
function Icon({ children, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  )
}

/** Barcode scanning/generation (no single company owns this concept). */
export function BarcodeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5v14M8 5v14M11 5v14M15 5v14M17 5v14M20 5v14" />
    </Icon>
  )
}

/** QR code generation. */
export function QrCodeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20v.01" />
    </Icon>
  )
}

/** Table/seating layout planning. */
export function TablePlanIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8" />
    </Icon>
  )
}

/** Weighing/registering food waste. */
export function ScaleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v18M7 21h10" />
      <path d="M4 6h16" />
      <path d="M4 6l-2 5a3 3 0 0 0 6 0zM20 6l-2 5a3 3 0 0 0 6 0z" />
    </Icon>
  )
}

/** Automated price checking. */
export function PriceRadarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M10.5 6v4.5l3 2" />
      <path d="M21 21l-4.8-4.8" />
    </Icon>
  )
}

/** Weather-linked sales forecasting. */
export function ForecastTrendIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 16a3.5 3.5 0 0 1 .5-6.96 4.5 4.5 0 0 1 8.7-1.3A4 4 0 0 1 18 15.5" />
      <path d="M6 20l3.5-3.5L12 19l6-6" />
    </Icon>
  )
}

/** Birthday reward trigger. */
export function GiftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="9" width="18" height="12" rx="1.5" />
      <path d="M3 13h18M12 9v12" />
      <path d="M12 9C9 9 8 7.5 8 6a2 2 0 0 1 4 0 2 2 0 0 1 4 0c0 1.5-1 3-4 3z" />
    </Icon>
  )
}
