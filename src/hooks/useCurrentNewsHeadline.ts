import { useEffect, useState } from 'react'
import type { NewsHeadline, NewsSource } from '../types/news'
import { NEWS_SOURCES } from '../types/news'
import { DEFAULT_NEWS_HEADLINE_COUNT, DEFAULT_NEWS_ROTATE_SECONDS } from '../types/screen'
import { useNewsHeadlines } from './useNewsHeadlines'

/** Which sources a `'news'` pane (or a `'qrcode'` slide's own "automatic" mode) actually pulls from: its own `sourceIds` narrowed to ones still cafe-wide-enabled, or every enabled source if unset/empty/now-entirely-disabled — same "show something sensible rather than going blank" posture as `TransitSlide`'s own `effectiveStopId` resolution. */
export function resolveNewsSourceIds(configEnabledIds: string[], sourceIds: string[] | undefined): string[] {
  if (!sourceIds || sourceIds.length === 0) return configEnabledIds
  const filtered = sourceIds.filter((id) => configEnabledIds.includes(id))
  return filtered.length > 0 ? filtered : configEnabledIds
}

/**
 * Ticks a re-render every `intervalSeconds` (while there's more than one
 * item to rotate through) and returns a *deterministic*, wall-clock-derived
 * index into a `length`-item list — not locally-incrementing state that
 * starts fresh at 0 per mount. This is what lets a `'qrcode'` slide's own
 * "automatic" mode (see `useCurrentNewsHeadline` below) independently
 * compute the exact same "currently showing" item a sibling `'news'`
 * pane's own rotation is on, without either one needing to read the
 * other's live component state — as long as both are handed the same
 * `length`/`intervalSeconds`, they always agree, purely from the current
 * time. `Date.now()` can't be called directly during render (an impure
 * call) — same posture as `TransitSlide`'s own `now` state — so it's only
 * ever read inside `useState`'s lazy initializer or the interval callback.
 *
 * Only actually the rotation source for a screen with no stages of its own
 * (see `useCurrentNewsHeadline`'s own doc comment) — a screen *with*
 * stages doesn't need this wall-clock trick at all, since both `NewsSlide`
 * and a `'qrcode'` slide's own "automatic" mode already share the exact
 * same `stageTick` prop by then.
 */
export function useDeterministicRotationIndex(length: number, intervalSeconds: number): number {
  const clampedIntervalMs = Math.max(1, intervalSeconds) * 1000
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (length < 2) return
    const interval = setInterval(() => setNow(Date.now()), clampedIntervalMs)
    return () => clearInterval(interval)
  }, [length, clampedIntervalMs])
  if (length === 0) return 0
  return Math.floor(now / clampedIntervalMs) % length
}

/** The subset of a `'news'`-kind `ScreenSlotContent`'s own fields that determine which headline it's currently showing — what both `NewsSlide` and a `'qrcode'` slide's own "automatic" mode (`QrCodeSlide`) resolve against, so the two agree on the same answer given the same settings. */
export interface NewsSlotSettings {
  sourceIds?: string[]
  headlineCount?: number
  rotateSeconds?: number
}

/**
 * Resolves the exact headline (and its own source) a `'news'` pane
 * configured with `settings` is currently showing, right now — the shared
 * logic both `NewsSlide` (resolving its own settings) and `QrCodeSlide`'s
 * "automatic" mode (resolving a *sibling* News pane's own settings, read
 * off that pane's resolved `ScreenSlotContent` — see `SlotContent`'s own
 * `newsSlots` prop) call, so the two always agree without any direct
 * communication between the two live components. `settings` of `undefined`
 * (e.g. no matching News pane exists at all) resolves to no headline.
 *
 * `stageTick` (threaded down from `SplitLayout`, see its own doc comment)
 * picks the rotation source: `undefined` (the screen has no stages of its
 * own) falls back to the independent wall-clock timer
 * (`useDeterministicRotationIndex`, `settings.rotateSeconds`) exactly as
 * before; a real value instead advances the headline in lockstep with the
 * screen's own shared stage rotation, one new headline per stage advance.
 * Deliberately keyed off the *raw* tick rather than the wrapped 1..
 * `stageCount` stage number — the stage number alone would cap a rotating
 * pane at exactly `stageCount` distinct headlines forever, however many are
 * actually available, which isn't what a "which sources" picker with more
 * headlines than stages should do. `NewsSlide` and `QrCodeSlide`'s own
 * "automatic" mode agree here for the same reason they agree on
 * `useDeterministicRotationIndex`'s wall-clock case: both receive the exact
 * same `stageTick` value via props, not by independently reconstructing it.
 */
export function useCurrentNewsHeadline(
  settings: NewsSlotSettings | undefined,
  enabledSourceIds: string[],
  stageTick: number | undefined,
): { headline: NewsHeadline | undefined; source: NewsSource | undefined } {
  const effectiveSourceIds = settings ? resolveNewsSourceIds(enabledSourceIds, settings.sourceIds) : []
  const { headlines } = useNewsHeadlines(effectiveSourceIds, settings?.headlineCount ?? DEFAULT_NEWS_HEADLINE_COUNT)
  const rotateSeconds = settings?.rotateSeconds ?? DEFAULT_NEWS_ROTATE_SECONDS
  // Still called unconditionally every render (rules of hooks) even while
  // stage-driven — passed a `length` of 0 in that case so its own `length <
  // 2` guard skips subscribing a wasted interval for a value that won't be used.
  const wallClockIndex = useDeterministicRotationIndex(stageTick === undefined ? headlines.length : 0, rotateSeconds)
  const index = stageTick !== undefined && headlines.length > 0 ? stageTick % headlines.length : wallClockIndex
  const headline = headlines[index]
  const source = headline ? NEWS_SOURCES.find((candidate) => candidate.id === headline.sourceId) : undefined
  return { headline, source }
}
