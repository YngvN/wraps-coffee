import type { SVGProps } from 'react'

export type IconProps = SVGProps<SVGSVGElement>

/** Shared stroke-icon defaults, matching `ThemeToggle`'s own sun/moon icons — a plain 24x24 outline glyph that inherits its color from the surrounding link text. */
function Icon({ children, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  )
}

export function OverviewIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </Icon>
  )
}

export function MessagesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <polyline points="3,7 12,13 21,7" />
    </Icon>
  )
}

export function ProductsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 11 L11 3 L21 3 L21 13 L13 21 Z" />
      <circle cx="16" cy="8" r="1.5" />
    </Icon>
  )
}

export function EventsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="9" x2="21" y2="9" />
    </Icon>
  )
}

export function InstagramIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <circle cx="12" cy="13" r="3.5" />
      <polyline points="8,7 10,4 14,4 16,7" />
    </Icon>
  )
}

export function ContactIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="9" r="5" />
      <polygon points="12,21 8,13 16,13" />
    </Icon>
  )
}

export function OrdersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 2 H18 V20 L15 18 L12 20 L9 18 L6 20 Z" />
      <line x1="9" y1="7" x2="15" y2="7" />
      <line x1="9" y1="11" x2="15" y2="11" />
    </Icon>
  )
}

export function ScreensIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </Icon>
  )
}

export function ExtensionsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="12" height="12" rx="2" />
      <rect x="9" y="9" width="12" height="12" rx="2" />
    </Icon>
  )
}

export function ImagesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <polyline points="5,18 10,13 14,17 17,14 19,16" />
    </Icon>
  )
}

export function MessageBoardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 4 H20 V16 H10 L5 20 V16 H4 Z" />
      <line x1="8" y1="9" x2="16" y2="9" />
      <line x1="8" y1="12.5" x2="14" y2="12.5" />
    </Icon>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="1" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="23" />
      <line x1="1" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="23" y2="12" />
      <line x1="4.5" y1="4.5" x2="6.5" y2="6.5" />
      <line x1="17.5" y1="17.5" x2="19.5" y2="19.5" />
      <line x1="4.5" y1="19.5" x2="6.5" y2="17.5" />
      <line x1="17.5" y1="6.5" x2="19.5" y2="4.5" />
    </Icon>
  )
}
