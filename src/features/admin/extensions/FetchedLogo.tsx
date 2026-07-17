import type { CSSProperties } from 'react'
import './FetchedLogo.scss'

/**
 * Every logo image saved under `src/assets/images/extension-logos/`, eagerly
 * resolved to its final built asset URL at bundle time. Keyed by filename
 * (without extension) so `FetchedLogo` can look one up by brand slug without
 * needing to know ahead of time whether a given brand's fetch produced a
 * `.svg` or a `.png` — or whether it produced anything at all.
 */
const logoModules = import.meta.glob('../../../assets/images/extension-logos/*.{svg,png}', { eager: true, import: 'default' }) as Record<string, string>

const logosBySlug: Record<string, string> = {}
for (const [path, url] of Object.entries(logoModules)) {
  const slug = path.replace(/^.*\//, '').replace(/\.(svg|png)$/, '')
  logosBySlug[slug] = url
}

/** Deterministic, evenly-spread hue from a brand name, so fallback monogram badges get a stable but varied color without needing a hand-picked brand color per entry. */
function hueFromLabel(label: string): number {
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  return hash % 360
}

/**
 * One integration's brand mark for the "Coming soon" extensions directory.
 * Renders the real logo saved under `extension-logos/<slug>.(svg|png)` when
 * one was found; otherwise falls back to a colored monogram badge (the
 * brand's first letter) rather than silently rendering nothing or a
 * misleading placeholder image. Pass `onDark` for the few saved logos that
 * are light-colored wordmarks meant for a dark background (e.g. Open
 * Exchange Rates') — it adds a dark chip behind the image so the mark
 * doesn't disappear against this page's light card background.
 */
export function FetchedLogo({ slug, label, className, onDark }: { slug: string; label: string; className?: string; onDark?: boolean }) {
  const src = logosBySlug[slug]
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
