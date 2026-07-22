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

export function ImagesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <polyline points="5,18 10,13 14,17 17,14 19,16" />
    </Icon>
  )
}

/** Upload-in-progress arrow, for `UploadsIndicator` (the top navbar's own "N uploads in progress" dropdown). */
export function UploadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 16V4" />
      <polyline points="7,9 12,4 17,9" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </Icon>
  )
}

export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 4.5c1.7.4 3 2 3 3.9 0 1.9-1.3 3.5-3 3.9" />
      <path d="M15 14c2.8.5 5 2.9 5 6" />
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

/** A bell — the admin top navbar's own notifications shortcut (new orders + out-of-stock tracked products), matching this file's shared `currentColor`-stroked conventions. */
export function BellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 8a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5Z" />
      <path d="M9.5 17.5a2.5 2.5 0 0 0 5 0" />
    </Icon>
  )
}

/** A magnifying glass — the admin top navbar's own global search shortcut. Same path `IntegrationSearchBar` already uses for its own at-rest icon, reused here for visual consistency between the two search entry points. */
export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" strokeWidth="1.5" />
    </Icon>
  )
}

/** A hex nut (hexagonal outline with a round hole through its center) — the rail/navbar's own settings shortcut. */
export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 2 L20 6.75 L20 16.25 L12 21 L4 16.25 L4 6.75 Z" />
      <circle cx="12" cy="11.5" r="3.2" />
    </Icon>
  )
}

/** A chevron pointing right, next to a plain vertical line — `AdminSidebarNav`'s own pin-toggle button, above the footer. Rotates 180° via its own `--active` modifier class when pinned open, becoming a chevron-left-next-to-a-line, so the same one glyph reads as both "pin open" and "un-pin" depending on state, rather than needing two separate icons. */
export function PinSidebarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 6l6 6-6 6" />
      <line x1="18" y1="4" x2="18" y2="20" />
    </Icon>
  )
}
