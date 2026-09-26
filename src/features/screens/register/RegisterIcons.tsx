/**
 * The register's icons: `currentColor`-stroked line icons in the same style as the shared icons in
 * `src/components/`, so each follows its button's colour, plus the Vipps wordmark. Local to the register,
 * since nothing else uses them yet.
 */

import type { ReactNode } from 'react'

/** Shared props: every icon is decorative (its button carries the label) and sized by the caller's CSS. */
interface IconProps {
  className?: string
}

/** A 24×24 line icon frame. */
function Line({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** Magnifying glass — the product search. */
export function SearchIcon(props: IconProps) {
  return (
    <Line {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </Line>
  )
}

/** Up and down arrows — the product sort. */
export function SortIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />
    </Line>
  )
}

/** A payment card — paying by card. */
export function CardIcon(props: IconProps) {
  return (
    <Line {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20M6 15h4" />
    </Line>
  )
}

/** A banknote — paying in cash. */
export function CashIcon(props: IconProps) {
  return (
    <Line {...props}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </Line>
  )
}

/** An open cash drawer — "Open drawer". */
export function DrawerIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M3 9h18v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M5 9V5h14v4M9 14h6" />
    </Line>
  )
}

/** A clock with a turning-back arrow — order history. */
export function HistoryIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </Line>
  )
}

/** A QR code — pickup codes. */
export function QrIcon(props: IconProps) {
  return (
    <Line {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3M21 14v7h-4M14 18v3" />
    </Line>
  )
}

/** A report sheet with lines and a total bar — X/Z reports. */
export function ReportIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </Line>
  )
}

/** A barcode — the Scan button that turns camera scanning on and off. */
export function BarcodeIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 8v8M10 8v8M13 8v8M17 8v8" />
    </Line>
  )
}

/** A camera — camera scanning. */
export function CameraIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </Line>
  )
}

/** A tick in a circle — a sale that went through. */
export function DoneIcon(props: IconProps) {
  return (
    <Line {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M7 12.5l3.2 3.2L17 9" />
    </Line>
  )
}

/**
 * The Vipps wordmark, from the brand file already in the app
 * (`src/assets/images/integration-logos/vipps-mobilepay.svg`), cropped to the visible letters and filled
 * with `currentColor` — white on the orange Vipps button, orange on a light background.
 */
export function VippsLogo({ className }: IconProps) {
  return (
    <svg className={className} viewBox="20 18.5 124 38.5" fill="currentColor" role="img" aria-label="Vipps">
      <path d="M28,22l5.1,14.9l5-14.9H44l-8.8,22.1h-4.4L22,22H28z" />
      <path d="M57.3,40.6c3.7,0,5.8-1.8,7.8-4.4c1.1-1.4,2.5-1.7,3.5-0.9s1.1,2.3,0,3.7c-2.9,3.8-6.6,6.1-11.3,6.1 c-5.1,0-9.6-2.8-12.7-7.7c-0.9-1.3-0.7-2.7,0.3-3.4s2.5-0.4,3.4,1C50.5,38.3,53.5,40.6,57.3,40.6z M64.2,28.3c0,1.8-1.4,3-3,3 s-3-1.2-3-3s1.4-3,3-3C62.8,25.3,64.2,26.6,64.2,28.3z" />
      <path d="M78.3,22v3c1.5-2.1,3.8-3.6,7.2-3.6c4.3,0,9.3,3.6,9.3,11.3c0,8.1-4.8,12-9.8,12c-2.6,0-5-1-6.8-3.5v10.6h-5.4 V22H78.3z M78.3,33c0,4.5,2.6,6.9,5.5,6.9c2.8,0,5.6-2.2,5.6-6.9c0-4.6-2.8-6.8-5.6-6.8C81,26.2,78.3,28.3,78.3,33z" />
      <path d="M104.3,22v3c1.5-2.1,3.8-3.6,7.2-3.6c4.3,0,9.3,3.6,9.3,11.3c0,8.1-4.8,12-9.8,12c-2.6,0-5-1-6.8-3.5v10.6h-5.4 V22H104.3z M104.3,33c0,4.5,2.6,6.9,5.5,6.9c2.8,0,5.6-2.2,5.6-6.9c0-4.6-2.8-6.8-5.6-6.8C106.9,26.2,104.3,28.3,104.3,33z" />
      <path d="M132.3,21.4c4.5,0,7.7,2.1,9.1,7.3l-4.9,0.8c-0.1-2.6-1.7-3.5-4.1-3.5c-1.8,0-3.2,0.8-3.2,2.1 c0,1,0.7,2,2.8,2.4l3.7,0.7c3.6,0.7,5.6,3.1,5.6,6.3c0,4.8-4.3,7.2-8.4,7.2c-4.3,0-9.1-2.2-9.8-7.6l4.9-0.8c0.3,2.8,2,3.8,4.8,3.8 c2.1,0,3.5-0.8,3.5-2.1c0-1.2-0.7-2.1-3-2.5l-3.4-0.6c-3.6-0.7-5.8-3.2-5.8-6.4C124.2,23.5,128.7,21.4,132.3,21.4z" />
    </svg>
  )
}
