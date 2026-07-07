import type { CSSProperties } from 'react'
import type { ScreenSlotContent, TextSizes } from '../types/screen'
import { hasOwnTextSizeFields } from './screenSlots'

/** Maps a `TextSizes` object to the CSS custom properties the slide components read their font sizes from. */
export function textSizesToCssVars(textSizes: TextSizes): CSSProperties {
  return {
    '--slide-heading-size': `${textSizes.heading}rem`,
    '--slide-item-title-size': `${textSizes.itemTitle}rem`,
    '--slide-description-size': `${textSizes.description}rem`,
    '--slide-price-size': `${textSizes.price}rem`,
    '--slide-item-price-size': `${textSizes.itemPrice}rem`,
  } as CSSProperties
}

/**
 * Fills in a `TextSizes` value's `itemPrice` from its `price` if missing —
 * older persisted data (from before "price" and "price per item" were split
 * into their own sizes) doesn't have it, so this keeps that data from ever
 * producing an `undefined` size, while preserving whatever size per-item
 * prices already appeared at.
 */
export function normalizeTextSizes(textSizes: TextSizes): TextSizes {
  return { ...textSizes, itemPrice: textSizes.itemPrice ?? textSizes.price }
}

/**
 * Effective text sizes for a specific slide: its own override when it has
 * opted into one (`useOwnTextSizes`), else `fallback` — typically the
 * slide's slot's own size, or (absent that) the screen's default.
 */
export function resolveContentTextSizes(content: ScreenSlotContent, fallback: TextSizes): TextSizes {
  if (hasOwnTextSizeFields(content) && content.useOwnTextSizes && content.textSizes) return normalizeTextSizes(content.textSizes)
  return fallback
}
