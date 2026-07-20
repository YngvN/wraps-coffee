import type { CSSProperties } from 'react'
import { getLogoSrc } from '../utils/logoAssets'
import './FetchedLogo.scss'

/** Deterministic, evenly-spread hue from a brand name, so fallback monogram badges get a stable but varied color without needing a hand-picked brand color per entry. */
function hueFromLabel(label: string): number {
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  return hash % 360
}

/**
 * One integration's brand mark — used both by the admin's "Coming soon"
 * extensions directory and by a live kiosk slide's own branded-theme logo
 * (see `TransitSlide`/`WeatherSlide`). Renders the real logo saved under
 * `extension-logos/<slug>.(svg|png)` when one was found (see `getLogoSrc`);
 * otherwise falls back to a colored monogram badge (the brand's first
 * letter) rather than silently rendering nothing or a misleading
 * placeholder image. Pass `onDark` for the few saved logos that are
 * light-colored wordmarks meant for a dark background (e.g. Open Exchange
 * Rates'), which adds a dark chip behind the image so the mark doesn't
 * disappear against a light background.
 */
export function FetchedLogo({ slug, label, className, onDark }: { slug: string; label: string; className?: string; onDark?: boolean }) {
  const src = getLogoSrc(slug)
  if (src) {
    const classes = ['fetched-logo', onDark && 'fetched-logo--on-dark', className].filter(Boolean).join(' ')
    return <img src={src} alt={label} className={classes} />
  }

  const hue = hueFromLabel(label)
  return (
    <span
      className={`fetched-logo fetched-logo--monogram${className ? ` ${className}` : ''}`}
      style={{ '--monogram-hue': hue } as CSSProperties}
      title={label}
      aria-hidden="true"
    >
      {label.charAt(0).toUpperCase()}
    </span>
  )
}
