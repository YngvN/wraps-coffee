import { useMemo } from 'react'
import { scopePaneCustomCss } from '../utils/paneCustomCss'

/**
 * Memoizes `scopePaneCustomCss` per `(scopeId, rawCss)` — `LayoutPane`/`PaneVisual` re-render often
 * (crossfade/animation state), and re-running a `stylis` compile+serialize pass on every one of those
 * would be wasted work whenever the underlying CSS text (and scope) hasn't actually changed. Returns
 * `''` for an unset/empty `rawCss` — the caller only needs to render a `<style>` tag at all when this
 * is non-empty.
 */
export function usePaneCustomContent(scopeId: string, rawCss: string | undefined): string {
  return useMemo(() => (rawCss ? scopePaneCustomCss(rawCss, scopeId) : ''), [scopeId, rawCss])
}
