import type { CSSProperties } from 'react'
import type { ScreenSlotContent, TextSizes } from '../types/screen'
import { hasOwnTextSizeFields } from './screenSlots'

/** Every `--slide-*-size` custom property name `textSizesToCssVars` emits — shared with `useShrinkToFitFontScale`, which reads these same names back off the pane's own base declaration to compute its own scaled overrides. */
export const SLIDE_SIZE_VAR_NAMES = ['--slide-heading-size', '--slide-item-title-size', '--slide-description-size', '--slide-price-size', '--slide-item-price-size'] as const

/**
 * Maps a `TextSizes` object to the CSS custom properties the slide
 * components read their font sizes from — each a `cqmin` container-query
 * length (1cqmin = 1% of the pane's own smaller dimension, see `TextSizes`'
 * own doc comment), not a fixed `rem`, so the same value scales with
 * whichever pane it's actually rendered in. Requires a `container-type:
 * size` ancestor to resolve against (see `.split-layout__pane` in
 * `SplitLayout.scss`) — every pane already has one.
 *
 * Plain, single values — not wrapped in a `--fit-scale` multiplier. An
 * earlier version of this rework tried exactly that (`calc(Xcqmin *
 * var(--fit-scale, 1))`, letting `useShrinkToFitFontScale` shrink content by
 * setting `--fit-scale` on a descendant), but that two-custom-property
 * indirection proved unreliable in practice (confirmed via DevTools: the
 * descendant's own computed font-size kept resolving to the *fallback* in
 * `var(--slide-*-size, Xcqmin)`, as if `--slide-*-size` itself were unset,
 * even with `--fit-scale` correctly showing as set one level up). Simpler
 * and more robust: `useShrinkToFitFontScale` now reads the plain values
 * these vars are set to and writes already-multiplied replacement values
 * straight onto its own pane-content wrapper — a single, direct override,
 * no nested `var()`-referencing-`var()` chain to go wrong.
 */
export function textSizesToCssVars(textSizes: TextSizes): CSSProperties {
  return {
    '--slide-heading-size': `${textSizes.heading}cqmin`,
    '--slide-item-title-size': `${textSizes.itemTitle}cqmin`,
    '--slide-description-size': `${textSizes.description}cqmin`,
    '--slide-price-size': `${textSizes.price}cqmin`,
    '--slide-item-price-size': `${textSizes.itemPrice}cqmin`,
  } as CSSProperties
}

/**
 * 1rem (16px) ÷ 5px — the px-per-`cqmin`-percentage-point this rework's
 * default/preset values were calibrated against (a reference pane whose own
 * smaller dimension is ~500px, where 1cqmin ≈ 5px) — see `TextSizes`' own
 * doc comment. Used only to convert pre-existing `rem`-based data to the
 * current percentage unit; never used for anything actually rendered.
 */
const REM_TO_PERCENT_FACTOR = 3.2

/** Converts one old fixed-`rem` size value to its equivalent `cqmin` percentage — see `REM_TO_PERCENT_FACTOR`. */
export function remToPercent(rem: number): number {
  return rem * REM_TO_PERCENT_FACTOR
}

/** Converts a whole pre-existing `rem`-based `TextSizes` value to the current percentage unit — see `remToPercent`. */
export function textSizesRemToPercent(textSizes: TextSizes): TextSizes {
  return {
    heading: remToPercent(textSizes.heading),
    itemTitle: remToPercent(textSizes.itemTitle),
    description: remToPercent(textSizes.description),
    price: remToPercent(textSizes.price),
    itemPrice: remToPercent(textSizes.itemPrice),
  }
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
 * Effective text sizes for a specific slide: its own value once it has one,
 * else `fallback` — typically the slide's slot's own size, or (absent that)
 * the screen's default.
 */
export function resolveContentTextSizes(content: ScreenSlotContent, fallback: TextSizes): TextSizes {
  if (hasOwnTextSizeFields(content) && content.textSizes) return normalizeTextSizes(content.textSizes)
  return fallback
}
