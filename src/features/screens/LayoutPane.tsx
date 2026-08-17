import { motion } from 'framer-motion'
import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type RefObject } from 'react'
import { useCrossfadeSlot } from '../../hooks/useCrossfadeSlot'
import type { NewsSlotSettings } from '../../hooks/useCurrentNewsHeadline'
import { usePaneCustomContent } from '../../hooks/usePaneCustomContent'
import { useShrinkToFitFontScale } from '../../hooks/useShrinkToFitFontScale'
import { useShrinkToFitScale } from '../../hooks/useShrinkToFitScale'
import { useLanguage, type LanguageCode } from '../../i18n'
import type { BackgroundImage, BackgroundImageOverlay, PaneId, ScreenConfig, ScreenSlot, ScreenSlotContent, SlideTransitionDirection, SplitDirection, TextSizes } from '../../types/screen'
import { backgroundImageTextStyle, getScreenColorVars, slotBackgroundColorStyle, slotTextColorStyle } from '../../utils/screenColors'
import type { Rect } from '../../utils/layoutGeometry'
import type { PaneGrowthOrigin } from '../../utils/paneGrowth'
import { resolveContentBackgroundImage } from '../../utils/screenSlots'
import {
  resolvePaneIdentitySignature,
  resolveSlotBackgroundColor,
  resolveSlotBackgroundImage,
  resolveSlotContent,
  resolveSlotLanguage,
  resolveSlotOverflowMode,
  resolveSlotTextColor,
} from '../../utils/screenStages'
import { textSizesToCssVars } from '../../utils/textSizeVars'
import { BORDER_TRANSITION_DURATION_SECONDS, collapsedClipPath, FULL_REVEAL_CLIP_PATH, PANE_GROWTH_DURATION_SECONDS, paneTransitionDelaySeconds } from './paneGrowthMotion'
import { PaneClearButton } from './PaneClearButton'
import { PaneDeleteButton } from './PaneDeleteButton'
import { PaneEditButton } from './PaneEditButton'
import { PaneLockButton } from './PaneLockButton'
import { PaneSelectCheckbox } from './PaneSelectCheckbox'
import { PaneSplitZones } from './PaneSplitZones'
import { PaneVisual } from './PaneVisual'
import { SlideBitmapLayer } from './SlideBitmapLayer'
import { readSlideBitmap, SLIDE_BITMAP_ENABLED, SLIDE_IDENTITY_ATTRIBUTE, SLIDE_REFLOW_ATTRIBUTE, slideBitmapKey, slideContentFingerprint } from './slideBitmapStore'
import { resolveTransitionVariants } from './transitions'

/**
 * **Experiment (2026-08-17)** — while a pane's content is fully hidden *and* its box is still gliding,
 * take that content out of layout entirely (`content-visibility: hidden`) instead of merely making it
 * invisible.
 *
 * See `skipsLayout` below for the window this covers and the mechanism it targets (consolidated report
 * fact 19). Flip to `Boolean(0)` to measure the pane against the current shipping behaviour, where the
 * subtree stays laid out — and therefore re-resolves every `cqmin` font size on every frame of the
 * geometry animation — behind an opacity of 0.
 *
 * Never write this as a literal `true`: that makes the other branch unreachable, TypeScript stops
 * narrowing in unreachable code, the build fails, and `dist/` silently keeps the *previous* build (see
 * the report's §10).
 */
const SUPPRESSED_SKIPS_LAYOUT = Boolean(1)

/**
 * **Chrome persists through a resize (2026-08-17).** When a pane keeps the *same* content but changes
 * shape, hide only the slide's **body** — the part that genuinely has to re-flow — and leave its
 * chrome painted throughout.
 *
 * A slide declares its own body with `data-slide-body` (see `TransitSlide`'s departures list and
 * `WeatherSlide`'s hourly list); everything outside that is chrome. On those two slides the split
 * already existed in the DOM — the brand logo and the stop-name/summary are siblings *outside* the
 * list — so this only had to be named, not built.
 *
 * Why it is worth doing: `reflowHide` currently blanks the entire pane for the ~0.8s an
 * `exiting → holding → idle` cycle takes, so a transit board's own identity (which stop this is)
 * disappears along with the departures that actually needed re-flowing. Keeping the chrome up means a
 * resize reads as the pane changing shape rather than as its content vanishing and coming back.
 *
 * Only ever applies to a `reflowHide`-eligible pane — one whose content is *unchanged* across the
 * transition. When the content itself differs, the chrome belongs to the outgoing content just as much
 * as the body does, so the whole slot crossfades exactly as before.
 *
 * Never write this as a literal `true` — see `SUPPRESSED_SKIPS_LAYOUT` above.
 */
const BODY_ONLY_REFLOW = Boolean(1)

/**
 * Whether this slide kind renders a `[data-slide-body]` element for `BODY_ONLY_REFLOW` to hide.
 *
 * **Load-bearing, not a convenience.** The body-only path deliberately leaves the *slot* visible so
 * the chrome keeps painting — which means that for a slide with no body to hide, it would hide
 * nothing at all and let the content re-flow on screen through the whole glide. That is strictly worse
 * than the ordinary whole-slot fade, so a kind that has not opted in must keep taking the old path.
 *
 * Kept as an explicit list rather than a DOM probe: the decision is needed during render, before the
 * subtree this would query even exists, and the set of slides that split themselves this way is a
 * deliberate design choice per kind rather than something to discover. Add a kind here in the same
 * change that adds `data-slide-body` to its markup.
 */
function declaresSlideBody(content: ScreenSlotContent | undefined): boolean {
  return content?.kind === 'transit' || content?.kind === 'weather'
}

interface LayoutPaneProps {
  leafId: PaneId
  /** This screen's own id — see `LayoutTree.tsx`'s own prop of the same name for why this is threaded all the way down here. */
  screenID: string
  slot: ScreenSlot
  stage: number
  transitionStyle: ScreenConfig['transitionStyle']
  slideDirection: SlideTransitionDirection
  resolveTextSizes: (leafId: PaneId, stage: number, content: ScreenSlotContent) => TextSizes
  onEditSlide?: (leafId: PaneId) => void
  onDropImage?: (leafId: PaneId, file: File) => void
  defaultPaneLanguage: LanguageCode
  editingFocus: ScreenConfig['editingFocus']
  transitionDuration: number
  /** Which phase of the stage-transition sequence is currently playing (see `SplitLayout`'s own `contentPhase` state) — `'idle'` (the default, when omitted, e.g. `ExitingPaneGhost`'s own wrapped instance) renders content normally; `'exiting'`/`'holding'` both force this pane's content (and background) into their own hidden/exit state via `suppressEnter` below, regardless of whether `activeContentSlot` would otherwise say a slot should be entering — unless `stageStatic` is also true, see that prop's own doc comment. */
  contentPhase?: 'idle' | 'exiting' | 'holding'
  /** True while this pane's own resolved identity (see `resolvePaneIdentitySignature`) is unchanged between the stage transition's old and new stage, or — for a pane that's structurally new this transition — its `splitFromPaneId` lineage matches a pane that already showed this same content (see `SplitLayout.tsx`'s own `stageStaticLeafIds`). Such a pane sits out the transition entirely: its content never gets forced into `suppressEnter`'s hidden/exit pose, so it stays fully visible with no fade/slide, regardless of what the rest of the screen is doing. Also skips the mount-time entrance pose entirely (see this file's own `initial` below) — necessary for the split-lineage case, since that pane is a genuinely fresh component mount. Omit (or `false`, the default) for the normal behavior. */
  stageStatic?: boolean
  /**
   * **Experiment (2026-08-17).** True when this pane's own content identity is unchanged (same as
   * `stageStatic`'s own test) but its box changed shape enough between the two stages that
   * `SplitLayout.tsx`'s `computeStageStaticSets` moved it into `reflowHideLeafIds` instead of
   * `staticLeafIds` — see that set's own doc comment for the full reasoning and the concrete case
   * (`Empty test`'s catalogue pane) that motivated it. Mutually exclusive with `stageStatic`: a leaf
   * is in exactly one of the two sets, never both.
   *
   * Unlike `stageStatic`, this does **not** by itself change how `suppressEnter` behaves — a pane
   * with this prop true is simply *not* `stageStatic`, so it already goes through the ordinary
   * fade-through-`exiting`/`holding` path every changing-content pane uses (correct as-is: that path
   * already finishes well before the geometry glide even starts, see `useReflowRevealHold`'s own doc
   * comment). What this prop actually adds is on the *reveal* side: whether the ordinary path's
   * `contentPhase === 'idle'` is early enough to safely reveal, given this pane's box may still be
   * gliding at that exact moment (see `useReflowRevealHold`), and whether the ordinary path should
   * apply at all — a QR/image pane whose appearance doesn't depend on box shape has no reason to fade
   * through a resize just because it happens to be large, so `usesFontScale0`/`usesFontScale1` below
   * gate this to the slide kinds that actually reflow.
   */
  reflowHide?: boolean
  reducedMotion: boolean | null
  /** Hovering close to the pane's own middle (either axis) reveals a "Split" line/label there; clicking splits it 50/50 along that axis — see `PaneSplitZones`. Omit (like `onEditSlide`) to disable, e.g. while the screen is locked. Only ever actually rendered while `selected` is also true (see the render below) — an unselected pane offers no split zones at all, regardless of this prop. */
  onSplitPane?: (leafId: PaneId, axis: SplitDirection, edge: 'start' | 'end') => void
  /** Hovering dead center instead splits this pane straight into a clean 2x2 of 4 — see `PaneSplitZones`' own doc comment. Omit (like `onSplitPane`) to disable. */
  onSplitFour?: (leafId: PaneId) => void
  /** Threaded straight through to `PaneSplitZones` — see its own prop of the same name. */
  disableSplitOnTouch?: boolean
  /** Hovering the pane reveals a top-left "Clear" button resetting its content back to blank. */
  onClearPane?: (leafId: PaneId) => void
  /** Hovering the pane reveals a top-right delete button — never rendered when `canDelete` is false (this is the tree's only pane). */
  onDeletePane?: (leafId: PaneId) => void
  /** Whether this pane can be deleted at all — false when it's the tree's only leaf, since deleting the last pane would leave nothing. */
  canDelete: boolean
  /** Whether this pane is locked at the current stage (see `resolveSlotLocked`) — purely for `PaneLockButton`'s own icon/positioning, since every *other* prop here is already omitted by the caller (`LayoutTree.tsx`) whenever this is true, rather than this component re-checking it itself. */
  locked: boolean
  /** Toggles this pane's own lock — unlike every other callback here, always present (when editing at all) regardless of `locked`, since it's the one thing that must stay reachable on a locked pane to ever unlock it again. */
  onToggleLock?: () => void
  /** Draws a persistent highlight ring around this pane — see `SplitLayout`'s own doc comment. */
  selected?: boolean
  /** Dims this pane behind a translucent overlay — see `SplitLayout`'s own `dimUnselectedPanes` doc comment. The overlay is `pointer-events: none`, so a click still reaches `PaneEditButton` underneath — e.g. clicking a different, dimmed pane switches the live display's own floating panel to editing that one instead. */
  dimmed?: boolean
  /** Whether this pane is currently checked for the toolbar's own multi-pane actions ("Delete selected"/"Group") — distinct from `selected`'s own single highlight-ring concept. Omit (along with `onToggleChecked`) to hide the checkbox entirely, e.g. while the screen is locked. */
  checked?: boolean
  /** Toggles this pane's own `checked` state. Omit (like `onEditSlide`) to disable selection entirely. */
  onToggleChecked?: () => void
  /** Which of this pane's own edges it should visually grow in from on mount (a real divider, the screen's own edge, or a plain fade — see `resolvePaneGrowthOrigin` in `src/utils/paneGrowth.ts`) — `undefined` renders at full size immediately, which is also always the effective behavior once `reducedMotion` is on (only consulted at React's own true first mount, per `SplitLayout.tsx`'s own doc comment on why this can't be computed in an effect). */
  growEntranceFrom?: PaneGrowthOrigin
  /** Every currently-resolved `'news'`-kind pane on this screen — threaded straight through to `SlotContent`/`QrCodeSlide`. See `LayoutTree`'s own prop of the same name. */
  newsSlots: NewsSlotSettings[]
  /** Threaded straight through to `SlotContent`/`NewsSlide`/`QrCodeSlide`. See `LayoutTree`'s own prop of the same name. */
  stageTick: number | undefined
  /** Threaded straight through to `SlotContent`/`VideoSlide`. See `SplitLayout`'s own prop of the same name. */
  onRequestStageAdvance?: () => void
  /** Threaded straight through to `SlotContent`. See `SplitLayout`'s own prop of the same name. */
  captureMode?: boolean
  /**
   * Where to place this pane, in the 0-100 percentage space `computeLayoutGeometry` uses — set only
   * by `FlatPaneLayer` (see `ENABLE_FLAT_PANE_LAYOUT`), which positions every pane absolutely against
   * the whole arrangement instead of letting a nested grid stretch it into a cell. Omit (the default,
   * and what `LayoutTree` does) to keep the grid-item behavior.
   *
   * Note `.split-layout__pane` sets `height: 100%` and *no* width, relying on being a stretched grid
   * item — so this can't be a class, it has to be inline, which also wins over the class's own height.
   * The explicit background is needed for the same reason `ExitingPaneGhost` sets one: panes paint no
   * backdrop of their own, and absolutely-positioned boxes can overlap mid-interpolation in a way grid
   * items never can.
   */
  rect?: Rect
  /**
   * A one-frame "start pose" for this pane's own rect transition — a `transform`/`clip-path` pair
   * placing it visually where it *was*, while its layout box is already at its destination (see
   * `FlatPaneLayer`'s own `paneRectMotion`). Applied with no transition on the frame it arrives, then
   * dropped on the next, which is what the browser animates away from. `undefined` means "at rest".
   */
  rectMotion?: CSSProperties
  /** The CSS `transition` to carry `rectMotion` back to rest with — `undefined` while the start pose is being painted (there must be no transition on that frame) or when nothing is animating. */
  rectTransition?: string
}

/**
 * One checkpoint's own frozen render input — snapshotted the moment it
 * becomes current (see `useCrossfadeSlot`), so a still-exiting checkpoint's
 * content never has its own text size/language swapped out from under it by
 * a *later* checkpoint's values before its own exit animation finishes.
 *
 * This is where a checkpoint's whole *backdrop* lives, not just its content:
 * `backgroundColor`/`backgroundImage`/`overlay` are all painted by the slot
 * holding this snapshot (see the render below), so they travel with the
 * content they belong to — a sliding checkpoint's background slides out with
 * it. The pane underneath deliberately paints nothing at all (see
 * `paneStyle`), which is what makes that movement visible rather than
 * masking it behind an identical color.
 */
interface PaneContentSnapshot {
  content: ScreenSlotContent
  textSizeVars: CSSProperties
  language: LanguageCode
  backgroundColor: string | undefined
  backgroundImage: BackgroundImage | undefined
  overlay: BackgroundImageOverlay | undefined
  textColor: string | undefined
}

/**
 * **Experiment (2026-08-17).** Extra hold, past the ordinary return-to-`'idle'`, for a `reflowHide`
 * pane specifically — see that prop's own doc comment for the full case. `stageStatic`/`reflowHide`
 * are mutually exclusive, so a `reflowHide` pane is *not* `stageStatic`, meaning `suppressEnter`
 * already engages the instant `contentPhase` leaves `'idle'` and its content fade-out already runs on
 * the same, already-tuned `CONTENT_TRANSITION_DURATION_SECONDS`/stagger every changing-content pane
 * uses — comfortably finished before `'holding'` (and the geometry glide, which starts exactly when
 * `'holding'` does) even begins. **Fade-out timing needs nothing new.**
 *
 * Fade-*in* is the half that does: `contentPhase` returns to `'idle'` after
 * `BORDER_TRANSITION_DURATION_SECONDS` (0.2s) of `'holding'`, but a `stableResizeGridTransition` grid
 * glide runs for `PANE_GROWTH_DURATION_SECONDS` (0.3s) — starting at the exact same `'holding'`-entry
 * commit. So `'idle'` arrives ~100ms before the glide is actually done, and revealing right then would
 * show this pane's content fading in over a box that is still visibly moving — measured directly on
 * `Empty test`: `contentPhase` returned to `'idle'` at a box height of 601px, 61px short of its final
 * 540px. This hook holds `suppressEnter` on past that point until `PANE_GROWTH_DURATION_SECONDS` has
 * elapsed **from `'holding'`'s own entry**, which is provably enough regardless of how many nested
 * `stableResizeGridTransition` splits sit above this leaf: every one of them starts on that same
 * commit and runs that same shared duration *in parallel*, not in sequence, so this leaf's own box is
 * done moving by then no matter how deep its ancestor chain is.
 *
 * A fixed timer rather than a `ResizeObserver`-based settle-debounce (the pattern
 * `useShrinkToFitFontScale`'s own resize handling uses elsewhere) because the duration here is a
 * known, shared, uniform constant — not content-dependent — so there is nothing a debounce would
 * discover that the constant doesn't already guarantee, and a timer adds no settle-window latency on
 * top of it.
 */
const REFLOW_REVEAL_HOLD_SECONDS = Math.max(0, PANE_GROWTH_DURATION_SECONDS - BORDER_TRANSITION_DURATION_SECONDS)

/**
 * **Experiment (2026-08-17) — release the body only once this pane's own box has actually stopped
 * moving, instead of after a fixed duration.**
 *
 * `REFLOW_REVEAL_HOLD_SECONDS` is derived from the shared animation constants, and the reasoning behind
 * it (every `stableResizeGridTransition` above this leaf starts on the same commit and runs the same
 * duration in parallel) is sound for the *grid* glide. It is not a guarantee about the pane element,
 * which is what actually has to be still before a re-flowing list can be shown: a pane's box also moves
 * for reasons the constant does not model — a `PANE_GROWTH_DURATION_SECONDS` clip-path/grow entrance on
 * a freshly-split leaf, an editor divider drag, a `ResizeObserver`-driven relayout arriving a frame
 * late, or simply the browser finishing the transition slightly after the timer says it should have.
 * Whenever that happens the departures come back while the box is still visibly moving, which is
 * exactly the artefact `reflowHide` exists to prevent.
 *
 * So the release becomes observational rather than predictive: watch the pane's own box and reveal only
 * after it has reported no change for `PANE_STILL_SETTLE_MS`. The trigger is unchanged (the hold is
 * still only ever armed by `contentPhase` reaching `'idle'` while `reflowHide` is true), so this only
 * moves *when* the hold ends, never whether it engages.
 *
 * `ResizeObserver` rather than a longer fixed timer because a longer timer is a guess in the other
 * direction — it keeps the list hidden past the point it could safely have been shown, on every
 * transition, for the sake of the rare late one. The observers themselves were measured close to free
 * (report fact 8's V1a removed all three and recovered 0% of worst frame), and this one delivers only
 * while a box is genuinely changing.
 *
 * **MEASURED A NO-OP, 2026-08-17 — shipped off.** A/B'd on `Ny test` with `body-still-check.mts`, which
 * samples every pane's box and its body's *effective* visibility once per animation frame: on and off
 * are indistinguishable — 1049 vs 1050 violating frames, identical movement episodes, and a release lag
 * of 78-98ms either way. That equality is not a coincidence: `REFLOW_REVEAL_HOLD_SECONDS` is 100ms and
 * `PANE_STILL_SETTLE_MS` is 80ms, so on a transition that finishes on schedule the two release within
 * one frame of each other. The measurement also showed the fixed timer is *already* enough for every
 * steady-state transition — every `'holding'`-started movement episode had **zero** frames with a
 * visible body, on all three bodies, across six rotations.
 *
 * Kept, off, for the case it was written for and the measurement could not produce: a transition that
 * finishes *late*. Turning it on is safe and costs one `ResizeObserver` per hiding pane; there is simply
 * no evidence it buys anything, and the fixed timer is less machinery.
 *
 * What the same measurement *did* find is a genuine artefact this does not fix — the body is visible over
 * a moving box for the first ~5.6s after a page load, in `'idle'`, in episodes of 1.1s, 1.3s and 2.7s.
 * That is not the stage glide (which is 300ms) and its cause is not yet identified; it is not the shrink
 * search, which was ablated as a control and changed nothing.
 *
 * Flip to `Boolean(1)` to restore the observer-driven release. Never a literal `true` — see
 * `SUPPRESSED_SKIPS_LAYOUT`.
 */
const BODY_REVEAL_ON_PANE_STILL = Boolean(0)

/**
 * How long the pane's box must report **no change at all** before its body is allowed back.
 *
 * Two 50Hz frames plus margin (the TV's panel is 50Hz, i.e. a 20ms frame — report §1). Long enough
 * that a transition finishing one frame late still counts as "still moving", short enough that it is
 * not itself a perceptible delay on top of the glide.
 */
const PANE_STILL_SETTLE_MS = 80

/**
 * Hard ceiling on the observer-driven hold.
 *
 * A pane whose box never settles — a divider being dragged, a container animating on some path nothing
 * here models — must not hide its body indefinitely. Reaching this cap means the list comes back over a
 * still-moving box, i.e. the old behaviour, which is the correct thing to degrade to: a re-flowing list
 * is a cosmetic problem, a permanently blank one is a broken screen.
 */
const PANE_STILL_MAX_HOLD_MS = 2000

/**
 * **Troubleshooting configuration (2026-08-17, at the user's request) — the bitmap is the pane's
 * *resting* representation, not just a cover for the moving frames.**
 *
 * With this on, a pane whose capture exists renders that capture **all the time**, the live subtree
 * underneath is hidden (`--bitmap-backed`), and its shrink-to-fit hooks are switched off — so the pane
 * stops re-deriving a font scale forever, which is the ~600ms of `idle` debt every other approach in the
 * consolidated report has failed to remove (facts 23, 27, 28). The moving-frames-only design could not
 * touch that **by construction**, because it deliberately returned to live DOM at rest and live DOM is
 * what runs the search (fact 26).
 *
 * This is deliberately the arm the report argues against on *cost* grounds, kept switchable because the
 * costs are real and measured: glyphs are frozen until the next capture (fine for a catalogue, wrong for
 * a transit board, whose departures change every 15s under an unchanged content fingerprint), the store
 * holds decoded full-resolution images (~4MB per half-screen pane at `devicePixelRatio` 2), and a capture
 * costs 4.6-9.5s on this device because it serialises the DOM rather than photographing it (fact 29).
 *
 * **A miss falls back to the live pane, always.** The lookup happens here rather than inside
 * `SlideBitmapLayer` precisely so the live subtree is only ever hidden when there is something to hide it
 * behind — hiding it on a miss would blank the pane. Note the store fills asynchronously during the warm
 * pass and a plain store read does not subscribe to that, so a pane that misses stays live until its next
 * render (in practice its next stage change), which is exactly the pre-existing behaviour.
 *
 * Flip to `Boolean(0)` for the moving-frames-only behaviour fact 26 measured. Never a literal `true` —
 * see `SUPPRESSED_SKIPS_LAYOUT`.
 */
const SLIDE_BITMAP_AT_REST = Boolean(1)

/**
 * **Experiment (2026-08-17) — the chrome stops re-laying-out while the pane's box glides.**
 *
 * `BODY_ONLY_REFLOW` hides a slide's re-flowing body through a resize and deliberately keeps its
 * **chrome** painted, so a transit board's identity (which stop this is) does not vanish and come back.
 * That leaves the chrome as the one thing in the pane still doing layout while the box animates — and it
 * sits inside a `container-type: size` pane, so its `cqmin` type re-resolves and re-lays-out on every
 * frame of the glide. Consolidated report fact 19's mechanism, hitting exactly the part fact 24 chose to
 * keep visible. Observed directly on the TV as the stop name stuttering through a resize while the
 * departures under it faded out cleanly.
 *
 * The fix is fact 17's, not a bitmap: **lay the chrome out once and fit it with a transform.** For the
 * window the body is hidden, the slot is pinned to the box it had when the glide started and given its
 * own `container-type: size`, so every `cqmin` inside resolves against a constant; a single
 * `transform: scale()` then tracks the pane. A transform is a compositor property, so the whole glide
 * costs no layout at all, and the pin is released the moment the pane settles — at which point the real
 * layout runs once, at the real size.
 *
 * **Uniform scale, never per-axis.** The factor is `min(width / frozenWidth, height / frozenHeight)`,
 * which is not an arbitrary choice: `cqmin` *is* a percentage of the box's smaller dimension, so scaling
 * by the min-dimension ratio reproduces exactly what re-resolving would have produced — while a per-axis
 * scale would distort the glyphs, which is precisely the artefact the earlier bitmap layer was corrected
 * for.
 *
 * What it gives up: the chrome's line wrapping is frozen for the ~0.3s of the glide, so a stop name that
 * would wrap differently at the new width re-wraps on release rather than during. That is the same trade
 * a bitmap would make, without a bitmap's capture cost (4.6-9.5s per pane on this device, fact 29),
 * memory, or staleness.
 *
 * **REFUTED AND SHIPPED OFF, 2026-08-17 — the idea cannot work as specified.** Observed on `Ny test`'s
 * 1→2 with `pane-backdrop-check.mts`, sampling the pane per animation frame: the pane grows
 * **478 → 618px wide at a constant 268px height**, and the pinned content stays at 478 for the whole
 * glide, because the uniform factor is `min(618/478, 268/268)` = **1.0**. Only one axis changed, so a
 * uniform scale is a no-op, and the chrome simply sits at its old size inside a bigger box until the
 * freeze releases and everything snaps into place — reported from the TV as the border animating
 * correctly while the pane's contents jumped at the end.
 *
 * The failure generalises past this one transition: **a frozen box cannot fill a box whose aspect is
 * changing.** A uniform scale only tracks proportional change, and a per-axis scale distorts glyphs
 * (fact 31). So the two goals are irreconcilable — anything that stops laying out per frame stops
 * filling the pane, and anything that fills the pane lays out per frame. The only mechanisms that avoid
 * per-frame layout entirely are the ones that stop *showing* the content (`SUPPRESSED_SKIPS_LAYOUT`'s
 * `content-visibility: hidden`) or replace it with a picture (a bitmap, fact 29's capture cost).
 *
 * Kept, off, because the measurement and the reasoning are worth more than the code: the chrome really
 * is the last thing still laying out under `BODY_ONLY_REFLOW`, and that cost is real. Closing it means
 * either hiding the chrome too — which is what `BODY_ONLY_REFLOW` exists to avoid — or accepting it.
 *
 * Never write this as a literal `true` — see `SUPPRESSED_SKIPS_LAYOUT`.
 */
const CHROME_FIXED_LAYOUT = Boolean(0)

/**
 * Pins the pane's content box while `frozen`, and keeps a uniform scale pointed at the live box — see
 * `CHROME_FIXED_LAYOUT`.
 *
 * Written imperatively, as custom properties on the pane element, rather than as React state: the scale
 * changes on every frame of the glide, and re-rendering this component per frame would reintroduce the
 * per-frame work the freeze exists to remove. The pane element is the right host because both crossfade
 * slots inherit from it.
 *
 * The frozen box comes from the `ResizeObserver`'s own `contentRect` — the last size it reported before
 * the freeze — never from `getBoundingClientRect`. Reading the box at freeze time would be a forced
 * synchronous layout landing in the `'holding'` commit, which is the single busiest commit in the whole
 * transition (fact 16).
 */
function useFrozenChromeScale(paneRef: RefObject<HTMLElement | null>, frozen: boolean): void {
  const lastBoxRef = useRef<{ width: number; height: number } | null>(null)
  const frozenBoxRef = useRef<{ width: number; height: number } | null>(null)

  useEffect(() => {
    const pane = paneRef.current
    if (!pane) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      lastBoxRef.current = { width, height }
      const base = frozenBoxRef.current
      if (!base || base.width <= 0 || base.height <= 0) return
      // `cqmin` is a percentage of the box's *smaller* dimension, so the min ratio is what re-resolving
      // would itself have produced — see `CHROME_FIXED_LAYOUT`.
      pane.style.setProperty('--chrome-scale', String(Math.min(width / base.width, height / base.height)))
    })
    observer.observe(pane)
    return () => observer.disconnect()
  }, [paneRef])

  useEffect(() => {
    const pane = paneRef.current
    if (!pane) return
    if (!frozen) {
      frozenBoxRef.current = null
      pane.style.removeProperty('--chrome-frozen-width')
      pane.style.removeProperty('--chrome-frozen-height')
      pane.style.removeProperty('--chrome-scale')
      return
    }
    const box = lastBoxRef.current
    // No observed box yet (the freeze arrived before the observer's first delivery) — leave the chrome
    // laid out normally rather than pinning it to a size nothing measured.
    if (!box || box.width <= 0 || box.height <= 0) return
    frozenBoxRef.current = box
    pane.style.setProperty('--chrome-frozen-width', `${box.width}px`)
    pane.style.setProperty('--chrome-frozen-height', `${box.height}px`)
    pane.style.setProperty('--chrome-scale', '1')
  }, [frozen, paneRef])
}

interface ReflowRevealHoldState {
  holding: boolean
  lastReflowHide: boolean | undefined
  lastContentPhase: 'idle' | 'exiting' | 'holding' | undefined
}

function useReflowRevealHold(
  paneRef: RefObject<HTMLElement | null>,
  contentPhase: 'idle' | 'exiting' | 'holding' | undefined,
  reflowHide: boolean | undefined,
): boolean {
  /**
   * Applies the two *synchronous* transitions (turning the hold on/off the same render its own
   * inputs change, not one commit later) directly in the render body — React's own documented
   * "adjusting state when a prop changes" pattern, same idiom `useCrossfadeSlot.ts`'s own slot-flip
   * and `SplitLayout.tsx`'s own `prevEffectiveStage` block already use, and for the same reason: this
   * codebase's lint config flags both a synchronous `setState` sitting directly in a `useEffect` body
   * (`react-hooks/set-state-in-effect`) and reading/writing a ref during render
   * (`react-hooks/refs`) — `useCrossfadeSlot.ts` sidesteps both by keeping "what was last seen"
   * inside the same state object as the derived value, compared against `state.lastKey`, which is
   * ordinary committed state and therefore safe to read during render. Only the genuinely async
   * case — waiting out the glide's own remaining time once `'idle'` arrives — needs a real effect,
   * below.
   */
  const [state, setState] = useState<ReflowRevealHoldState>({ holding: false, lastReflowHide: undefined, lastContentPhase: undefined })
  if (state.lastReflowHide !== reflowHide || state.lastContentPhase !== contentPhase) {
    const holding = !reflowHide
      ? false
      : contentPhase !== 'idle'
        ? true
        : // `contentPhase` just reached `'idle'` while `reflowHide` is true — carry the prior value
          // forward; the effect below is what actually schedules its release, since that genuinely
          // needs a timer rather than a same-render decision.
          state.holding
    setState({ holding, lastReflowHide: reflowHide, lastContentPhase: contentPhase })
  }

  useEffect(() => {
    if (!reflowHide || contentPhase !== 'idle') return
    const release = () => setState((prev) => (prev.holding ? { ...prev, holding: false } : prev))
    const pane = paneRef.current

    // See `BODY_REVEAL_ON_PANE_STILL`. Falls back to the fixed timer when the flag is off, and also
    // when there is no element to observe (an `ExitingPaneGhost`'s own wrapped instance renders with
    // `contentPhase` omitted, so it never arms this at all, but a missing ref must still release).
    if (!BODY_REVEAL_ON_PANE_STILL || !pane) {
      // `contentPhase` just reached `'idle'`, which itself arrived `BORDER_TRANSITION_DURATION_SECONDS`
      // after `'holding'` (and the grid glide) started — so only the *remainder* of
      // `PANE_GROWTH_DURATION_SECONDS` is still outstanding from here, not the full duration again.
      const timer = setTimeout(release, REFLOW_REVEAL_HOLD_SECONDS * 1000)
      return () => clearTimeout(timer)
    }

    let settle: ReturnType<typeof setTimeout> | undefined
    /** Restarts the quiet window. Every box change pushes the release further out; the last one wins. */
    const armSettle = () => {
      if (settle !== undefined) clearTimeout(settle)
      settle = setTimeout(release, PANE_STILL_SETTLE_MS)
    }
    // Armed up front, not only from the observer: the box may already have finished moving by the time
    // this effect runs, in which case the observer's own initial delivery is the only callback that will
    // ever arrive and nothing would schedule a release without this.
    armSettle()
    const observer = new ResizeObserver(armSettle)
    observer.observe(pane)
    const cap = setTimeout(release, PANE_STILL_MAX_HOLD_MS)

    return () => {
      observer.disconnect()
      if (settle !== undefined) clearTimeout(settle)
      clearTimeout(cap)
    }
  }, [contentPhase, reflowHide, paneRef])

  return state.holding
}

/**
 * Renders one pane's currently-showing content (animated whenever its own
 * resolved content actually changes value — not merely whenever the stage
 * crosses into a new checkpoint, see the crossfade key below), background,
 * hover-revealed edit button, and `editingFocus` pulse-flash — extracted
 * from the arrangement's own shape entirely, so it's identical regardless
 * of where in the tree this leaf sits. Each instance owns its own
 * drag-over/content-checkpoint tracking as local state (rather than the
 * whole tree bookkeeping it by index), since React already remounts/keeps
 * this component per leaf id.
 */
export function LayoutPane({
  leafId,
  screenID,
  slot,
  stage,
  transitionStyle,
  slideDirection,
  resolveTextSizes,
  onEditSlide,
  onDropImage,
  defaultPaneLanguage,
  editingFocus,
  transitionDuration,
  contentPhase = 'idle',
  stageStatic,
  reflowHide,
  reducedMotion,
  onSplitPane,
  onSplitFour,
  disableSplitOnTouch,
  onClearPane,
  onDeletePane,
  canDelete,
  locked,
  onToggleLock,
  selected,
  dimmed,
  checked,
  onToggleChecked,
  growEntranceFrom,
  newsSlots,
  stageTick,
  onRequestStageAdvance,
  captureMode,
  rect,
  rectMotion,
  rectTransition,
}: LayoutPaneProps) {
  const { t } = useLanguage()
  const [dragDepth, setDragDepth] = useState(0)
  /**
   * Screen-qualified by default (not the bare `leafId`) — confirmed a `PaneId` is not actually
   * globally unique in this app: "Duplicate screen" deep-clones a whole screen's `layout`/`paneSlots`,
   * deliberately preserving the exact same `PaneId`s across the original and the copy, and
   * `ScreenCard.tsx`'s own grid can live-render more than one screen's panes at once (any screen
   * without a captured preview yet) — a bare `paneId` scope would leak `customCss` across two
   * duplicated screens' identically-numbered panes shown together. This is LayoutPane's own single
   * real-pane render, so it always uses this default; only a caller mounting more than one instance of
   * the *same* real pane at once (the assistant's own before/after preview, a multi-stage candidate
   * list) ever needs to pass something else into `PaneVisual` directly.
   */
  const scopeId = `${screenID}:${leafId}`
  const scopedCss = usePaneCustomContent(scopeId, slot.customCss)

  /** This pane's own content/background leaving vs. arriving — each gets its own small deterministic-per-pane extra delay (see `paneTransitionDelaySeconds`) so a multi-pane stage advance doesn't have every pane leave/arrive in exact lockstep, rather than sharing one `transition` object like before. */
  const exitTransition = reducedMotion ? { duration: 0 } : { duration: transitionDuration, delay: paneTransitionDelaySeconds(leafId, 'exit'), ease: 'easeInOut' as const }
  const enterTransition = reducedMotion ? { duration: 0 } : { duration: transitionDuration, delay: paneTransitionDelaySeconds(leafId, 'enter'), ease: 'easeInOut' as const }

  // One outer/inner ref pair per crossfade slot (always exactly 2, see
  // `useCrossfadeSlot`) — `useShrinkToFitScale` is called unconditionally
  // for both, same "fixed number of hook calls" posture every other hook in
  // this component already has. Named individually (not an array) since the
  // `react-hooks/refs` lint rule flags indexing into a ref-holding array
  // during render, even when nothing actually reads `.current` there.
  /** This pane's own outer element — observed by `useReflowRevealHold` to tell whether the box is still actually moving (see `BODY_REVEAL_ON_PANE_STILL`). */
  const paneRef = useRef<HTMLDivElement>(null)
  const contentOuterRef0 = useRef<HTMLDivElement>(null)
  const contentInnerRef0 = useRef<HTMLDivElement>(null)
  const contentOuterRef1 = useRef<HTMLDivElement>(null)
  const contentInnerRef1 = useRef<HTMLDivElement>(null)
  const overflowMode = resolveSlotOverflowMode(slot, stage)

  /**
   * The `editingFocus.pulse` value already in effect the *first* time this
   * particular pane instance rendered — captured once (a plain `useState`
   * initial value, never updated afterward) so a pane that mounts fresh
   * while already matching the ambient focus (`'global'`, or a
   * newly-split/appeared pane that happens to inherit it) doesn't mistake
   * "I just mounted" for "I was just clicked." Without this, `initial`
   * always applies at a component's true first mount regardless of *why*
   * it mounted, so every newly-appeared pane matching `'global'` would
   * flash white the instant it grows in — very visible now that panes
   * animate in smoothly instead of popping in. Only a pulse value that's
   * genuinely *different* from this one — a real subsequent focus change —
   * plays the flash.
   */
  const [pulseAtMount] = useState(editingFocus?.pulse)

  const growthClipPath = growEntranceFrom && growEntranceFrom.kind !== 'fade' ? collapsedClipPath(growEntranceFrom.edge) : FULL_REVEAL_CLIP_PATH
  const growthInitial = growEntranceFrom && !reducedMotion ? { clipPath: growthClipPath, opacity: growEntranceFrom.kind === 'fade' ? 0 : 1 } : { clipPath: FULL_REVEAL_CLIP_PATH, opacity: 1 }
  const growthTransition = { duration: growEntranceFrom && !reducedMotion ? PANE_GROWTH_DURATION_SECONDS : 0, ease: 'easeInOut' as const }

  const content = resolveSlotContent(slot, stage)
  const backgroundColor = resolveSlotBackgroundColor(slot, stage)
  const textColor = resolveSlotTextColor(slot, stage)
  const slotBackgroundImage = resolveSlotBackgroundImage(slot, stage)
  /** This pane's own background image at this stage, if any. A pane with none simply paints no backdrop of its own and lets the screen's own background (color or image, painted once behind the whole tree — see `SplitLayout`'s own `.split-layout__bg`) show through it. */
  const backgroundImage = resolveContentBackgroundImage(content, slotBackgroundImage)
  const language = resolveSlotLanguage(slot, stage) ?? defaultPaneLanguage
  // The pane itself paints *nothing* — it only publishes this checkpoint's
  // own `--screen-*` custom properties, and stays transparent so whatever is
  // behind it (the screen's own background color or image) shows through.
  //
  // The actual backdrop — background color *and* image alike — is painted by
  // each crossfade slot instead (see the render below), so it travels with
  // the content it belongs to: a sliding checkpoint's whole backdrop slides
  // out with it rather than sitting still on the pane underneath while only
  // the content moves. Painting it here as well would defeat that entirely,
  // since an identical color behind the sliding one makes the movement
  // invisible.
  //
  // The vars still have to live here, not only on the slots: several
  // consumers are *siblings* of the slots rather than descendants — the
  // selection ring's own `--screen-accent`, and `PaneSplitZones`/
  // `PaneCornerHandle`, which deliberately want this pane's own
  // contrast-matched `--screen-bg`/`--screen-text` (see `PaneSplitZones.scss`'s
  // own doc comment).
  const paneStyle: CSSProperties = {
    ...(backgroundColor ? getScreenColorVars(backgroundColor) : {}),
    ...backgroundImageTextStyle(backgroundImage?.overlay),
    ...(!reducedMotion ? { transition: 'background-color 0.4s ease, color 0.4s ease' } : {}),
    // The flat layer's own positioning (see the `rect` prop) — inline rather than a class, both
    // because the values are per-pane and because `.split-layout__pane`'s own `height: 100%` would
    // otherwise win. Appended last so its own `transition` (which has to also carry the rect motion)
    // replaces the background/color one above rather than being dropped by it.
    ...(rect
      ? {
          position: 'absolute' as const,
          left: `${rect.x}%`,
          top: `${rect.y}%`,
          width: `${rect.width}%`,
          height: `${rect.height}%`,
          background: 'var(--screen-bg)',
          ...rectMotion,
          ...(reducedMotion
            ? {}
            : { transition: [rectTransition, 'background-color 0.4s ease, color 0.4s ease'].filter(Boolean).join(', ') }),
        }
      : {}),
  }
  const variants = resolveTransitionVariants(transitionStyle, slideDirection)

  const contentSnapshot: PaneContentSnapshot = {
    content,
    textSizeVars: textSizesToCssVars(resolveTextSizes(leafId, stage, content)),
    language,
    backgroundColor,
    backgroundImage,
    overlay: backgroundImage?.overlay,
    textColor,
  }
  // Keyed on the *resolved content itself* (a stable JSON signature), not
  // which checkpoint number it happened to resolve from — a stage advance
  // can very well cross into a checkpoint boundary (a new checkpoint stage)
  // whose value is nonetheless identical to the last one, e.g. a pane
  // resize propagated forward across future stages ("keep for next steps
  // too") writes real checkpoints at each of them, but with the exact same
  // content/background/language the pane already had — that's a pure size
  // change, not a content change, and should resize in place with no
  // fade/slide transition (and, for `'fade'`, no background flash from a
  // needless crossfade) rather than replaying one for every pane whose only
  // difference between these two stages is its own on-screen size. Content
  // that's genuinely different still transitions correctly, since the
  // signature simply reflects whatever the resolved values actually are.
  const { slots: contentSlots, activeSlot: activeContentSlot } = useCrossfadeSlot<PaneContentSnapshot>(contentSnapshot, () =>
    resolvePaneIdentitySignature(slot, stage, defaultPaneLanguage),
  )

  // Re-measures whenever this exact slot's own resolved content or text
  // size changes — not just on a pane resize (the hook's own
  // `ResizeObserver` already covers that) — e.g. an admin dragging a text-
  // size slider live needs a fresh measurement even though the pane itself
  // never changed size.
  const shrinkDep0 = contentSlots[0] ? JSON.stringify({ content: contentSlots[0].content, textSizeVars: contentSlots[0].textSizeVars }) : undefined
  const shrinkDep1 = contentSlots[1] ? JSON.stringify({ content: contentSlots[1].content, textSizeVars: contentSlots[1].textSizeVars }) : undefined
  // `'transit'`/`'weather'`/`'catalogue'`/the `'event'` kind's own `'month'`
  // display mode are width-filling grid/flex/multi-column layouts that need
  // an actual font-size reduction (so they can re-flow and re-fill the
  // available width), not a uniform paint transform — see
  // `useShrinkToFitFontScale`'s own doc comment. Every other kind keeps the
  // transform-based hook. Both hooks are always called (rules of hooks);
  // only one is ever actually `enabled` per slot.
  const isEventMonth = (content: ScreenSlotContent | undefined) => content?.kind === 'event' && content.displayMode === 'month'
  const usesFontScale = (content: ScreenSlotContent | undefined) =>
    content?.kind === 'transit' || content?.kind === 'weather' || content?.kind === 'catalogue' || isEventMonth(content)
  const usesFontScale0 = usesFontScale(contentSlots[0]?.content)
  const usesFontScale1 = usesFontScale(contentSlots[1]?.content)
  // Which of `usesFontScale0`/`usesFontScale1` actually applies right now: for a `reflowHide` leaf —
  // content identity unchanged across this transition, per `reflowHide`'s own doc comment — the two
  // crossfade slots hold the same content, so `activeContentSlot` alone picks the one that matters.
  const reflowHideEligible = Boolean(reflowHide) && (activeContentSlot === 0 ? usesFontScale0 : usesFontScale1)
  const reflowRevealHold = useReflowRevealHold(paneRef, contentPhase, reflowHideEligible)
  /** True for both of `contentPhase`'s non-idle values — this pane's own content/background stays forced into its hidden/exit state for the whole "old content exiting, then borders moving" stretch of the stage-transition sequence, only actually revealing once the caller settles back to `'idle'`. Never true for a `stageStatic` pane, which sits out the whole sequence instead of playing it pointlessly on content that never actually changed. A `reflowHide` pane (content unchanged too, but its own box changed shape enough to be worth hiding through — see that prop's own doc comment) is not `stageStatic`, so the first half of this already engages the ordinary way; `reflowRevealHold` is what keeps it hidden a little past the ordinary `'idle'` return, until this pane's own geometry glide has actually finished (see `useReflowRevealHold`). */
  const suppressEnter = (contentPhase !== 'idle' && !stageStatic) || reflowRevealHold
  /**
   * True exactly while this pane's content is **fully hidden and its box may still be moving** — the
   * window in which laying that content out is pure waste.
   *
   * `suppressEnter` alone is not that window. It also covers `'exiting'`, where the content is still
   * *visibly* playing its fade/slide out and therefore genuinely has to be laid out and painted.
   * `EXIT_PHASE_DURATION_SECONDS` (`CONTENT_TRANSITION_DURATION_SECONDS + PANE_TRANSITION_STAGGER_SECONDS`)
   * exists precisely so every pane's own exit animation has finished before the grid snaps, so by the
   * time `'holding'` begins nothing is visible any more — and `'holding'` is exactly when the geometry
   * glides. `reflowRevealHold` extends the same fully-hidden state past the return to `'idle'` for a
   * pane whose own box is still gliding (see `useReflowRevealHold`), so it belongs here too.
   *
   * **Why this matters (consolidated report fact 19).** `.split-layout__pane` declares
   * `container-type: size`, so every `--slide-*-size` (`cqmin`, from `textSizesToCssVars`) resolves
   * against the pane's own box. While that box animates, every font size in the pane changes on every
   * frame and re-lays-out the whole subtree. `REFLOW_HIDE_ENABLED` already made this content
   * *invisible* through the glide, but invisible is not the same as out of layout: opacity 0 and a
   * translate both leave the subtree fully laid out, so the cost was still being paid on content
   * nobody could see. That is measured as ~400ms of `'holding'` debt on a single catalogue pane.
   */
  /**
   * True while this pane should hide only its `[data-slide-body]` and keep its chrome painted — see
   * `BODY_ONLY_REFLOW`. Gated on `reflowHideEligible`, i.e. content unchanged across this transition;
   * a genuine content change has to take the chrome with it.
   */
  const bodyHidden = BODY_ONLY_REFLOW && reflowHideEligible && suppressEnter && declaresSlideBody(contentSlots[activeContentSlot]?.content)
  /**
   * What the *slot* itself does. Identical to `suppressEnter` except while `bodyHidden`, where the slot
   * stays in its visible pose (so the chrome keeps painting) and the body's own fade is driven by CSS
   * instead — see `.split-layout__pane-content--body-hidden` in `SplitLayout.scss`.
   */
  const suppressSlot = suppressEnter && !bodyHidden
  /** Body-only equivalent of `skipsLayout` below, over the same window: once the body has finished fading it stops being laid out too, which is where the actual cost is (fact 19). */
  const skipsBodyLayout = SUPPRESSED_SKIPS_LAYOUT && bodyHidden && contentPhase !== 'exiting'
  const skipsLayout = SUPPRESSED_SKIPS_LAYOUT && suppressSlot && contentPhase !== 'exiting'
  /** The window the chrome is pinned and transform-scaled for — see `CHROME_FIXED_LAYOUT`. Identical to `skipsBodyLayout`'s, since that is exactly when the body is gone and only the chrome is still laying out. */
  const chromeFrozen = CHROME_FIXED_LAYOUT && skipsBodyLayout
  useFrozenChromeScale(paneRef, chromeFrozen)
  /**
   * True for exactly the frames where this pane's box is moving and its live content is therefore
   * neither painted nor laid out — the window a captured bitmap exists to cover.
   *
   * Deliberately the *same* window as `skipsLayout`/`skipsBodyLayout` rather than a wider one: outside
   * it the live DOM is on screen, and showing a picture over the top would be visible as a swap. It
   * covers both paths, since a whole-slot hide and a body-only hide both leave something the bitmap
   * can stand in for — the whole pane in the first case, the chrome in the second (the capture itself
   * omits bodies, see `warmSlideBitmaps`'s own `capturePane`).
   */
  /**
   * This pane's own content fingerprint, computed from the same identity string the shrink hooks get
   * (`shrinkDep0`/`shrinkDep1`) and **published on the pane element** so `warmSlideBitmaps` addresses
   * its captures with this exact value rather than re-deriving one that might not match. See
   * `SLIDE_IDENTITY_ATTRIBUTE`.
   */
  const contentFingerprint = slideContentFingerprint([activeContentSlot === 0 ? shrinkDep0 : shrinkDep1])
  /**
   * True when this pane has a capture for exactly what it is currently showing, and the resting-bitmap
   * arm is on — i.e. when the picture can stand in for the live subtree permanently rather than only
   * through the moving frames. See `SLIDE_BITMAP_AT_REST`.
   */
  const restingBitmap = SLIDE_BITMAP_ENABLED && SLIDE_BITMAP_AT_REST && Boolean(readSlideBitmap(slideBitmapKey(screenID, leafId, stage, contentFingerprint)))
  const showsBitmap = restingBitmap || (SLIDE_BITMAP_ENABLED && (skipsLayout || skipsBodyLayout))
  /**
   * Published only when this pane's currently-showing content re-flows at a new box size — the set the
   * bitmap warm pass captures, and the same test `reflowHideEligible` above already applies. See
   * `SLIDE_REFLOW_ATTRIBUTE` for why the warm pass reads this rather than re-deriving it.
   */
  const reflowAttribute = (activeContentSlot === 0 ? usesFontScale0 : usesFontScale1) ? { [SLIDE_REFLOW_ATTRIBUTE]: '1' } : {}
  // `EventMonthSlide`'s own CSS multi-column list has no graceful width
  // fallback of its own (unlike `TransitSlide`'s ellipsis-truncating
  // destination column) — see `useShrinkToFitFontScale`'s own doc comment
  // for why it alone opts into that hook's width check too. `'weather'`
  // joins it for the same reason, but only in its own vertical-rectangle
  // layout (`WeatherSlide`'s `useIsVerticalPane`) — its default horizontal
  // layout already has that same `1fr`-track fallback (an hour column
  // shrinks before ever truly overflowing), but the vertical layout's own
  // fixed-width detail columns (Wind/Humidity/Rain/UV/Pressure headers) have
  // no such fallback, so a narrow enough pane with enough details toggled on
  // can genuinely run out of width with nothing else left to give.
  // Harmless to check width unconditionally for every weather pane either
  // way (the width check runs *in addition to* the height one this hook
  // already does, at the same real layout-measurement cost) — it just never
  // has anything to actually correct for while the horizontal layout's own
  // fallback is still absorbing the overflow itself.
  const checkWidth0 = isEventMonth(contentSlots[0]?.content) || contentSlots[0]?.content?.kind === 'weather'
  const checkWidth1 = isEventMonth(contentSlots[1]?.content) || contentSlots[1]?.content?.kind === 'weather'
  // The inactive (exiting) crossfade slot is fading to opacity 0 — no point
  // spending forced-layout remeasures keeping its scale live, so `false`
  // here drops its resize observer, mutation observer and poll alike. Gates
  // only those triggers, not `enabled` itself, so its last-good scale stays
  // applied rather than being stripped back to full size (see `trackResize`'s
  // own doc comment on `useShrinkToFitScale`). A slot becoming active again
  // re-runs the hook and measures fresh before painting, so nothing is
  // stale — which matters because an inactive slot's *rendered* content
  // isn't actually frozen the way its `content` prop is: the slide component
  // stays mounted and keeps polling its own live data (a `WeatherSlide`'s
  // forecast, a `TransitSlide`'s departures) regardless of activeness.
  //
  // `contentPhase === 'idle'` gates all four for the same reason `activeContentSlot` does, just for a
  // different window: a stage transition resizes every pane whose geometry changes, and each of those
  // resizes fires this pane's own `ResizeObserver`, whose callback is a *forced synchronous layout*
  // (it writes `transform: none`, reads `scrollHeight`/`scrollWidth`, then writes a scale). Doing that
  // per pane while the geometry is still moving measures a size that is already stale by the time it
  // is applied, and pays for the privilege in the single most contended window there is. Flipping
  // this back to `true` on the return to `'idle'` lets the measurement run against the settled
  // geometry — which is exactly the one measurement that was ever worth taking. See `trackResize`'s
  // own doc comment for why this freezes the last-good scale rather than stripping it
  // (`enabled: false`), i.e. why nothing visibly pops mid-transition.
  //
  // The two hooks consume this argument differently, and deliberately so. `useShrinkToFitScale` takes
  // it as `trackResize`, a dependency of its own effect — so a flip tears its observers down and
  // rebuilds them, remeasuring once on the way. `useShrinkToFitFontScale` takes it as `idle`, which
  // is explicitly *not* one of its dependencies: measurement on that hook is far more expensive (a
  // whole search of forced synchronous layouts rather than one), and making the phase a dependency is
  // exactly what made every flip re-run a full search on every pane — 85–89% of a real screen's
  // stage-transition stall (see the consolidated kiosk-performance report, fact 8). There it only
  // suspends probing, and the search resumes across frames once the pane settles.
  const trackShrink = contentPhase === 'idle'
  // A bitmap-backed pane has nothing to measure: the live subtree is hidden behind the picture, so
  // re-deriving its font scale would be a forced synchronous layout per probe, forever, for content
  // nobody can see. Switching the hooks off is therefore the *point* of the resting-bitmap arm, not a
  // side effect — see `SLIDE_BITMAP_AT_REST`. The capture itself was taken off-screen at boot with these
  // same hooks running normally, so what the picture shows is a properly-shrunk pane.
  const measuresShrink = !restingBitmap
  useShrinkToFitScale(contentOuterRef0, contentInnerRef0, measuresShrink && overflowMode === 'shrink' && !usesFontScale0, [shrinkDep0], activeContentSlot === 0 && trackShrink)
  useShrinkToFitScale(contentOuterRef1, contentInnerRef1, measuresShrink && overflowMode === 'shrink' && !usesFontScale1, [shrinkDep1], activeContentSlot === 1 && trackShrink)
  useShrinkToFitFontScale(contentOuterRef0, contentInnerRef0, measuresShrink && overflowMode === 'shrink' && usesFontScale0, [shrinkDep0], checkWidth0, activeContentSlot === 0 && trackShrink)
  useShrinkToFitFontScale(contentOuterRef1, contentInnerRef1, measuresShrink && overflowMode === 'shrink' && usesFontScale1, [shrinkDep1], checkWidth1, activeContentSlot === 1 && trackShrink)

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!onDropImage) return
    event.preventDefault()
    setDragDepth((depth) => depth + 1)
  }
  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!onDropImage) return
    event.preventDefault()
  }
  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!onDropImage) return
    event.preventDefault()
    setDragDepth((depth) => Math.max(0, depth - 1))
  }
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!onDropImage) return
    event.preventDefault()
    setDragDepth(0)
    const file = event.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) onDropImage(leafId, file)
  }

  return (
    <motion.div
      ref={paneRef}
      className={`split-layout__pane${selected ? ' split-layout__pane--selected' : ''}`}
      style={paneStyle}
      // The flat layer owns this pane's whole entrance/movement itself, as a plain CSS transition on
      // `rectMotion` — so Framer Motion is given nothing at all to animate there rather than left to
      // fight it over the same `clip-path`/`opacity` properties. An `animate` value always wins over
      // `style`, so even a constant one (`{ opacity: 1 }`) would silently erase a start pose that
      // needed to begin at `opacity: 0`.
      {...(rect
        ? { initial: false as const, animate: {}, transition: { duration: 0 } }
        : { initial: growthInitial, animate: { clipPath: FULL_REVEAL_CLIP_PATH, opacity: 1 }, transition: growthTransition })}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-pane-id={leafId}
      {...{ [SLIDE_IDENTITY_ATTRIBUTE]: contentFingerprint }}
      {...reflowAttribute}
    >
      {/*
        Exactly one `<style>` for this pane's own `customCss`, here at the outer level — not one per
        crossfade slot below, since both slots (when two are simultaneously mounted mid-transition)
        always share the same `scopeId` and the same `customCss` (a single value across every stage,
        see `ScreenSlot.customCss`'s own doc comment) — a second identical `<style>` tag would be pure
        waste. See `PaneVisual.tsx`'s own doc comment for the fuller reasoning.
      */}
      {scopedCss && <style>{scopedCss}</style>}
      {/*
        A pre-rendered picture of this pane, shown only while its box is actually moving and only when
        one was captured for exactly this (screen, pane, stage, content) — see `SlideBitmapLayer` and
        `warmSlideBitmaps`. Rendered as a sibling above the live content (which is hidden and out of
        layout for the same window) rather than replacing it, so a cache miss degrades to the ordinary
        live render with no branch of its own.
      */}
      {showsBitmap && (
        <SlideBitmapLayer
          screenID={screenID}
          paneId={leafId}
          stage={stage}
          contentFingerprint={contentFingerprint}
          // The screen's own poses, so a bitmap-backed pane leaves and arrives exactly like a live one
          // instead of being stretched to track the box (see `SlideBitmapLayer`'s own doc comment).
          variants={variants}
          // Driven by `suppressEnter`, **not** by `contentPhase` alone — exactly what the live slot below
          // uses. A `stageStatic` pane (content identity unchanged between the two stages) is meant to sit
          // the transition out entirely, and `suppressEnter` is already false for it throughout; keying
          // off the phase instead made such a pane slide out and back in on every stage advance even
          // though nothing about it changed, which is precisely the pointless motion `stageStatic` exists
          // to prevent.
          pose={suppressEnter ? 'exit' : 'animate'}
          transition={suppressEnter ? exitTransition : enterTransition}
          // A structurally-new pane is already playing its own grow-in; the picture must not slide in on
          // top of it. See `suppressEntrance`.
          suppressEntrance={Boolean(growEntranceFrom)}
        />
      )}
      {dragDepth > 0 && (
        <div className="split-layout__pane-drop-overlay">
          <p>{t('screenDisplay.dropImageHint')}</p>
        </div>
      )}
      {contentSlots.map((snapshot, slotIndex) => {
        if (!snapshot) return null
        return (
          <PaneVisual
            key={slotIndex}
            scopeId={scopeId}
            outerRef={slotIndex === 0 ? contentOuterRef0 : contentOuterRef1}
            contentInnerRef={slotIndex === 0 ? contentInnerRef0 : contentInnerRef1}
            className={`split-layout__pane-content${overflowMode === 'scroll' ? ' split-layout__pane-content--scroll' : ''}${
              skipsLayout ? ' split-layout__pane-content--layout-skipped' : ''
            }${bodyHidden ? ' split-layout__pane-content--body-hidden' : ''}${skipsBodyLayout ? ' split-layout__pane-content--body-skipped' : ''}${
              chromeFrozen ? ' split-layout__pane-content--chrome-frozen' : ''
            }${
              restingBitmap ? ' split-layout__pane-content--bitmap-backed' : ''
            }`}
            // This slot's own frozen backdrop, painted here rather than on the
            // pane so it travels with the content it belongs to. `color` has to
            // be re-declared alongside the vars, not just inherited: the pane
            // above already resolved its own `color: var(--screen-text)`, and
            // redefining that custom property down here doesn't retroactively
            // change a value resolved higher up (same reasoning as
            // `.split-layout__pane`'s own re-declaration — see its doc comment
            // in `SplitLayout.scss`). Without it a checkpoint's text would keep
            // the *pane's* color while its background slid away underneath.
            style={{
              ...snapshot.textSizeVars,
              ...slotBackgroundColorStyle(snapshot.backgroundColor),
              ...backgroundImageTextStyle(snapshot.overlay),
              ...(snapshot.backgroundColor ? { color: 'var(--screen-text)' } : {}),
              ...slotTextColorStyle(snapshot.textColor),
            }}
            motionProps={{
              variants,
              // `false` skips Framer Motion's mount-time entrance pose entirely, rendering straight at
              // the `animate` pose instead — needed for a `stageStatic` pane that's nonetheless a
              // genuinely fresh component mount (the split-lineage case, see this component's own
              // `stageStatic` prop doc comment): `initial` is honored unconditionally on true first
              // mount regardless of what `animate` resolves to, so merely keeping `suppressEnter` false
              // isn't enough on its own to stop that one entrance slide from playing. Harmless for an
              // already-mounted `stageStatic` pane (the ordinary persisting-content case) — `initial` is
              // only ever read at mount, so changing it on a pane that isn't remounting has no effect.
              initial: stageStatic ? false : 'initial',
              animate: !suppressSlot && activeContentSlot === slotIndex ? 'animate' : 'exit',
              transition: !suppressSlot && activeContentSlot === slotIndex ? enterTransition : exitTransition,
            }}
            content={snapshot.content}
            backgroundImage={snapshot.backgroundImage}
            overlay={snapshot.overlay}
            language={snapshot.language}
            paddingCqmin={snapshot.content.padding}
            customHtml={slot.customHtml}
            customHtmlPlacement={slot.customHtmlPlacement}
            newsSlots={newsSlots}
            stageTick={stageTick}
            stage={stage}
            onRequestStageAdvance={onRequestStageAdvance}
            captureMode={captureMode}
          />
        )
      })}
      {/*
        Layering (low to high, see each component's own z-index): pane
        content < `PaneEditButton` (z-index 5, full-pane click target) <
        `PaneSplitZones` (z-index 6, only its own narrow middle-line-hugging
        strips are real click targets — dead center stays click-through to
        the edit button beneath) < the corner `PaneClearButton`/`PaneDeleteButton`/
        `PaneLockButton` (z-index 7, win over both the edit button and the
        split zones in their own corners — `PaneLockButton` renders centered
        instead, at the same z-index, once the pane is actually locked, since
        every other button here is omitted by the caller at that point
        anyway) < `SplitLayoutDivider` (z-index 8, always grabbable) < the
        `editingFocus` pulse-flash (z-index 9, `pointer-events: none`, so it
        never blocks any of the above) < the `dimmed` overlay (z-index 10,
        also `pointer-events: none` — see its own prop doc comment).
      */}
      {onEditSlide && <PaneEditButton onClick={() => onEditSlide(leafId)} />}
      {/* A video fills its own pane edge-to-edge with no natural split point, so splitting it isn't offered at all — not even the hover highlight. Splitting an unselected pane isn't offered either: select it first (via `PaneEditButton` above), same as every other per-pane action here. */}
      {onSplitPane && selected && content.kind !== 'video' && (
        <PaneSplitZones
          onSplit={(axis, edge) => onSplitPane(leafId, axis, edge)}
          onSplitFour={onSplitFour ? () => onSplitFour(leafId) : undefined}
          disableOnTouch={disableSplitOnTouch}
        />
      )}
      {onToggleChecked && <PaneSelectCheckbox selected={Boolean(checked)} onToggle={onToggleChecked} />}
      {(onClearPane || (onDeletePane && canDelete)) && (
        <div className="pane-corner-button-group">
          {onClearPane && <PaneClearButton onClick={() => onClearPane(leafId)} />}
          {onDeletePane && canDelete && <PaneDeleteButton onClick={() => onDeletePane(leafId)} />}
        </div>
      )}
      {onToggleLock && <PaneLockButton locked={locked} onClick={onToggleLock} />}
      {editingFocus && (editingFocus.tab === 'global' || editingFocus.tab === leafId) && editingFocus.pulse !== pulseAtMount && (
        <motion.div key={editingFocus.pulse} className="split-layout__pane-pulse" initial={{ opacity: 0.55 }} animate={{ opacity: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }} />
      )}
      {dimmed && <div className="split-layout__pane-dim" />}
    </motion.div>
  )
}
