import type { CSSProperties } from 'react'
import type { TextSizes } from '../types/screen'

/** Maps a `TextSizes` object to the CSS custom properties the slide components read their font sizes from. */
export function textSizesToCssVars(textSizes: TextSizes): CSSProperties {
  return {
    '--slide-heading-size': `${textSizes.heading}rem`,
    '--slide-item-title-size': `${textSizes.itemTitle}rem`,
    '--slide-description-size': `${textSizes.description}rem`,
    '--slide-price-size': `${textSizes.price}rem`,
  } as CSSProperties
}
