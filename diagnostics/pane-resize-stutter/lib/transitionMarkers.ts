/**
 * Injected into the page (via `page.evaluate`) to mark exact stage-transition boundaries with
 * `console.timeStamp('transition-start'|'transition-end')` — these land as timeline markers directly
 * in a captured Chrome trace, giving `lib/traceParse.ts` exact window boundaries with nothing to
 * eyeball-validate. See the plan's "Transition-window boundaries: explicit injected markers, not
 * post-hoc clustering" design decision, which replaced an earlier, riskier Layout-event-clustering
 * heuristic.
 *
 * Watches every `.layout-tree__split` element (`LayoutTree.tsx`'s own grid container class — each
 * `split` node in a screen's pane tree renders one) for `style` attribute mutations (the CSS
 * `grid-template-columns`/`rows` transition, `SplitLayout.tsx:490`, is what actually writes that
 * attribute frame-by-frame). A transition is "in flight" from the first mutation seen while idle until
 * every currently-tracked element's computed `gridTemplateColumns`/`gridTemplateRows` stops changing
 * for `SETTLE_FRAMES` consecutive animation frames — an empirical settle detector, not a hardcoded
 * duration, so it stays correct even if the app's own transition timing constants change.
 *
 * MUST be a fully self-contained function (no closures over anything outside itself) — Playwright's
 * `page.evaluate` serializes it by source and re-parses it inside the page, so anything from this
 * module's outer scope would be `undefined` there.
 *
 * The very first statement polyfills esbuild's `__name` helper — see `rafDeltaCapture.ts`'s own doc
 * comment on `installRafDeltaCollector` for why this is needed for any function with inner named
 * function/arrow bindings that gets passed straight into `page.evaluate`.
 */
export function installTransitionMarkers(): void {
  ;(globalThis as { __name?: (fn: unknown, name?: string) => unknown }).__name ??= (fn: unknown) => fn
  const SETTLE_FRAMES = 3
  const GRID_SPLIT_SELECTOR = '.layout-tree__split'

  let inFlight = false
  let unchangedFrameCount = 0
  let lastSnapshots = new Map<Element, string>()
  let rafHandle: number | undefined

  const snapshot = (element: Element) => {
    const style = getComputedStyle(element)
    return `${style.gridTemplateColumns}|${style.gridTemplateRows}`
  }

  const trackedElements = () => Array.from(document.querySelectorAll(GRID_SPLIT_SELECTOR))

  const pollFrame = () => {
    const elements = trackedElements()
    let anyChanged = false
    for (const element of elements) {
      const current = snapshot(element)
      if (lastSnapshots.get(element) !== current) anyChanged = true
      lastSnapshots.set(element, current)
    }
    if (anyChanged) unchangedFrameCount = 0
    else unchangedFrameCount++

    if (unchangedFrameCount >= SETTLE_FRAMES) {
      console.timeStamp('transition-end')
      inFlight = false
      unchangedFrameCount = 0
      rafHandle = undefined
      return
    }
    rafHandle = requestAnimationFrame(pollFrame)
  }

  const onMutation = () => {
    if (inFlight) return
    inFlight = true
    unchangedFrameCount = 0
    lastSnapshots = new Map(trackedElements().map((element) => [element, snapshot(element)]))
    console.timeStamp('transition-start')
    if (rafHandle === undefined) rafHandle = requestAnimationFrame(pollFrame)
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'style' && (mutation.target as Element).matches?.(GRID_SPLIT_SELECTOR)) {
        onMutation()
        return
      }
    }
  })
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['style'] })
  ;(window as unknown as { __paneResizeMarkersInstalled?: boolean }).__paneResizeMarkersInstalled = true
}
