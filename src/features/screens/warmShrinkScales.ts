import { createElement } from 'react'
import type { LanguageCode } from '../../i18n'
import { shrinkScaleStoreSize } from '../../hooks/shrinkScaleStore'
import type { ScreenConfig } from '../../types/screen'
import { getPersistedSlotTextSizes } from '../../utils/screenStages'
import { resolveContentTextSizes } from '../../utils/textSizeVars'
import { withOffscreenStage } from './offscreenStageMount'
import { SplitLayout } from './SplitLayout'

/**
 * **Arm B (experiment, 2026-08-16)** — pre-resolves every stage's shrink-to-fit font scales once, at
 * kiosk startup, by rendering each stage off-screen and letting the real
 * `useShrinkToFitFontScale` instances populate `shrinkScaleStore` themselves. Nothing here reads or
 * writes a scale directly; the store is filled purely as a side effect of the ordinary hooks running
 * inside the off-screen tree.
 *
 * Why it exists: the search is cheapest when it starts from the right answer and merely re-confirms
 * it, but every cache is empty on the pass a viewer actually sees — a kiosk's very first rotation
 * after boot. Warming ahead of time moves that cost into startup, where nothing is on screen yet.
 *
 * **Rendered at the live viewport size, deliberately not at `referenceCanvasSize`'s fixed
 * 1920x1080.** Scales are keyed by aspect ratio and text is sized in `cqmin`, so they mostly do
 * transfer between sizes — but `CatalogueSlide`'s `minmax(max(160px, 14ch), 1fr)` and
 * `EventMonthSlide`'s `column-width: max(320px, 26ch)` are absolute px floors, so the number of
 * columns that fit genuinely differs between 1920 and the TV WebView's own 960 CSS px viewport.
 * Warming at the wrong size would seed those two slide kinds with a confidently wrong answer, which
 * is worse than not warming them at all.
 *
 * Stages are warmed **sequentially**, never concurrently — the same reason `captureScreenPreviews`
 * gives: mounting N live `SplitLayout` instances at once would put every one of their data
 * subscriptions and animations on the main thread simultaneously, on the exact device this whole
 * effort exists to keep responsive.
 *
 * Failure is always non-fatal. A stage that throws is skipped; the hooks then simply resolve that
 * pane's scale live the way they did before this existed.
 */
/**
 * **Off for troubleshooting (2026-08-17).** Whether to run this pass at all.
 *
 * It costs one full off-screen `SplitLayout` mount per stage — 11 of them on `Empty test`, each through
 * `withOffscreenStage`'s whole settle sequence — and the measurement says it buys nothing on the fixture
 * it was built for. Two independent reasons: re-running the pre-warm baseline on the current tree
 * (consolidated report fact 27) moved neither the median worst frame nor the debt, and the search never
 * probes its seed at all for below-floor content, because `'full'` routes to `'seed'` only when
 * `seed > MIN_LEGIBLE_SCALE` — which a 55-item catalogue never is. So the store it fills is, for a
 * catalogue, write-only.
 *
 * Flip back to `Boolean(1)` to restore it. Never a literal `true` — see `LayoutPane.tsx`'s
 * `SUPPRESSED_SKIPS_LAYOUT`.
 */
const WARM_SHRINK_SCALES_ENABLED = Boolean(0)

export async function warmShrinkScales(screen: ScreenConfig, defaultPaneLanguage: LanguageCode): Promise<number> {
  if (!WARM_SHRINK_SCALES_ENABLED) return 0
  const stageCount = screen.useStages ? Math.max(1, screen.stageCount ?? 1) : 1
  const size = { width: window.innerWidth, height: window.innerHeight }
  if (size.width <= 0 || size.height <= 0) return 0

  const before = shrinkScaleStoreSize()
  for (let stage = 1; stage <= stageCount; stage++) {
    await withOffscreenStage(
      createElement(SplitLayout, {
        screen,
        stage,
        defaultPaneLanguage,
        // Matches `ScreenPreviewCaptureCanvas`'s own resolution: the persisted per-slot sizes, not
        // whatever an open editor happens to be previewing.
        resolveTextSizes: (leafId, textSizeStage, content) => resolveContentTextSizes(content, getPersistedSlotTextSizes(screen, leafId, textSizeStage)),
        captureMode: true,
      }),
      size,
      () => undefined,
      (error) => console.warn(`[warmShrinkScales] stage ${stage} of screen "${screen.screenID}" failed to warm — its panes will resolve their scale live instead.`, error),
    )
  }
  return shrinkScaleStoreSize() - before
}
