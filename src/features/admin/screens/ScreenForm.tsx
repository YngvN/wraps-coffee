import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button, Checkbox, Input, SlideTransition } from '../../../components'
import { useBackLevel } from '../../../hooks/useBackLevel'
import { useDefaultPaneLanguage } from '../../../hooks/useDefaultPaneLanguage'
import { useScreens } from '../../../hooks/useScreens'
import { useScreensaverSchedule } from '../../../hooks/useScreensaverSchedule'
import { useLanguage, type LanguageCode } from '../../../i18n'
import {
  DEFAULT_SCREEN_BACKGROUND_COLOR,
  DEFAULT_TEXT_SIZES,
  type BackgroundImage,
  type DraftableScreenFields,
  type LayoutNode,
  type PaneGrowthFallback,
  type PaneId,
  type PreviewAspectRatio,
  type ScreenConfig,
  type ScreenSlot,
  type ScreenSlotContent,
  type ScreenTransitionStyle,
  type SplitDirection,
  type StageTimeline,
  type TextSizes,
} from '../../../types/screen'
import { findSiblingEventOrdinal } from '../../../utils/eventOrdinals'
import { generateId } from '../../../utils/id'
import { cloneSlot, createLeaf, deleteLeaf, emptySlot, listLeaves, splitLeaf } from '../../../utils/layoutTree'
import { hasOwnTextSizeFields, resolveContentBackgroundImage } from '../../../utils/screenSlots'
import {
  isResizeToFitConflict,
  resolveSlotBackgroundColor,
  resolveSlotBackgroundImage,
  resolveSlotContent,
  resolveSlotLanguage,
  resolveSlotLocked,
  resolveSlotOverflowMode,
  resolveSlotTextSizes,
  resolveStageValue,
  writeStageCheckpoint,
} from '../../../utils/screenStages'
import { resolveContentTextSizes } from '../../../utils/textSizeVars'
import { BackgroundColorPicker } from '../../screens/BackgroundColorPicker'
import { BackgroundEditor } from '../../screens/BackgroundEditor'
import { GlobalTextSizeScaler, type SizeSnapshot } from '../../screens/GlobalTextSizeScaler'
import { PaneEditor } from '../../screens/PaneEditor'
import { ScaledScreenPreview } from '../../screens/ScaledScreenPreview'
import { SplitLayout } from '../../screens/SplitLayout'
import { StageTabs } from '../../screens/StageTabs'
import './ScreenForm.scss'

/** Every named sub-view `editingTarget` can hold (`null` is the main view — which, since the live layout editor now lives inline there instead of its own sub-view, is also where "Layout" deep-links resolve) — exported so `ScreensView`'s own `?tab=` deep-link query param has something to validate against. */
export type ScreenFormTarget = 'global' | 'borders' | 'background' | 'stages' | 'transitions' | 'screensaver' | 'other'

interface ScreenFormProps {
  /** The screen being edited, or `null` when creating a new one. */
  screen: ScreenConfig | null
  onSave: (screen: ScreenConfig) => void
  onCancel: () => void
  /** Reports this form's own currently open sub-view by name (e.g. "Layout"), or `undefined` while showing its main tabbed content — lets the parent's `Modal` show it as a "Edit screen - Layout" breadcrumb next to its title. */
  onRouteChange?: (route: string | undefined) => void
  /** Opens straight to this sub-view instead of the main tabbed view — for deep-linking in from the sidebar's tier-3 flyout or a "recently opened" entry (see `ScreensView`'s `?tab=` query param). Only consumed once, on mount. */
  initialTarget?: ScreenFormTarget
}

/** The most common physical display shapes, offered as quick picks for the "Layout" tab's own live preview and persisted as the screen's own `previewAspectRatio` — also what its card in the admin Screens list is letterboxed to (see `ScreenCard`). Purely a preview aid either way; never affects the real kiosk display itself. */
const PREVIEW_ASPECT_RATIOS: { ratio: PreviewAspectRatio; label: string }[] = [
  { ratio: { width: 16, height: 9 }, label: '16:9' },
  { ratio: { width: 9, height: 16 }, label: '9:16' },
  { ratio: { width: 4, height: 3 }, label: '4:3' },
  { ratio: { width: 3, height: 4 }, label: '3:4' },
  { ratio: { width: 21, height: 9 }, label: '21:9' },
]

/** The next unused "<prefix> N" name (starting at 1), so a new screen never defaults to a name that collides with an existing one. */
function nextDefaultScreenName(screens: ScreenConfig[], prefix: string): string {
  const existingNames = new Set(screens.map((existing) => existing.name))
  let n = 1
  while (existingNames.has(`${prefix} ${n}`)) n++
  return `${prefix} ${n}`
}

/**
 * Create/edit form for a single screen: a "Global" tab with name, the
 * screen's own background color, an interactive "Layout" grid (drag any
 * divider to resize — the exact same live display shows), whether/what
 * color the borders between panes use, a "Steps" panel (whether/how many
 * shared stages every pane advances through together, the rotation timer,
 * and the transition animation), and — one tab per pane, so each gets its
 * own room — that pane's own content, background color/image, and
 * shared/fallback text size, plus simple "Split pane"/"Delete pane"
 * buttons for restructuring the arrangement itself. Once the screen has
 * shared stages on with more than one, a pane's own tab gains a stage-tab
 * bar above its fields — mirroring the outer tabs one level deeper — and
 * every field is resolved from (and edits write back into) that pane's own
 * independent timeline at whichever stage is selected (see
 * `src/utils/screenStages.ts`); with stages off (or only one), the tab bar
 * is hidden and every field is simply the pane's one static stage-1
 * checkpoint. Everything available from the display's own in-place editors
 * is available here too, so the whole screen can be configured externally
 * without ever opening the live display, including the same "Live editing"
 * checkbox `ScreenDisplay.tsx`'s own toolbar has (see the main tab's own
 * header row, `liveEditing`/`applyDraftableScreenPatch`/`handlePublish`) —
 * off stages every immediate/no-Save-needed edit into `screen.draft`
 * instead of the published screen, until an explicit "Publish".
 */
export function ScreenForm({ screen, onSave, onCancel, onRouteChange, initialTarget }: ScreenFormProps) {
  const { t } = useLanguage()
  const [screens, setScreens] = useScreens()
  const [screensaverSchedule] = useScreensaverSchedule()
  const [defaultPaneLanguage] = useDefaultPaneLanguage()
  /** This form's own "Live editing" checkbox (see the main tab's own header row) — on (the default, matching `ScreenDisplay.tsx`'s own toggle) writes every immediate/no-Save-needed edit (pane splits/resizes/clears/deletes, live text-size pushes, background/border/transition changes) straight to the persisted screen, exactly as this form always behaved before the toggle existed; off stages them into `screen.draft` instead, via `applyDraftableScreenPatch`, invisible to every other viewer until "Publish". Fields this form only ever writes via the explicit Save button (name, useStages/stageCount/slideDuration, showSlotBorders, hideScrollbar, useScreensaver, previewAspectRatio) are unaffected either way — they were never live-pushed to begin with. */
  const [liveEditing, setLiveEditing] = useState(true)
  /** Which sub-view (replacing the whole tabbed form until its own Back button is pressed) is open: the whole-screen percentage scaler, the interactive "Layout" grid, the pane-border color editor, the screen's own whole-screen "Background" color/image editor, the "Steps" (use-stages/count/duration/transition) editor, the "Screen saver" editor, the "Other settings" editor, or neither. A pane's own fields (content, background, text size) aren't one of these — they're owned by `PaneEditor` itself, which manages its own sub-view navigation internally (see the active-pane tab render below). Seeded from `initialTarget` via a lazy initializer (not an effect) when this form was opened via a deep link straight into a sub-view. */
  const [editingTarget, setEditingTarget] = useState<ScreenFormTarget | null>(() => initialTarget ?? null)
  /** `1` while opening a sub-view (slides in from the right, see `SlideTransition`), `-1` while going back (slides in from the left). Set right before whatever state change actually switches the view. */
  const [direction, setDirection] = useState<1 | -1>(1)
  /** Which physical display shape the "Layout" tab's own live preview is currently sized to — persisted as the screen's own `previewAspectRatio` (see `handleSubmit`). */
  const [previewAspectRatio, setPreviewAspectRatio] = useState<PreviewAspectRatio>(screen?.previewAspectRatio ?? PREVIEW_ASPECT_RATIOS[0].ratio)
  const [liveTextSizes, setLiveTextSizes] = useState<TextSizes>(screen?.textSizes ?? DEFAULT_TEXT_SIZES)
  /** Which stage a pane's own tab is currently showing fields for — shared across every pane tab (switching which pane you're viewing doesn't change it), since stages are a screen-wide sequence, not a per-pane one. */
  const [activeStage, setActiveStage] = useState(1)
  const [name, setName] = useState(() => screen?.name ?? nextDefaultScreenName(screens, t('admin.screens.defaultNamePrefix')))
  /** This screen's own arrangement + every pane's own content, kept as one local draft — a brand-new screen starts as a single pane showing a clock, a reasonable-looking default rather than a blank pane. Seeded from `screen.draft` (a pending, unpublished layout/paneSlots staged from an earlier "Live editing off" session) when one exists, falling back to the published fields otherwise — so opening this form fresh never silently starts from (and risks overwriting) an out-of-date baseline that ignores what's actually staged. */
  const [draft, setDraft] = useState<{ layout: StageTimeline<LayoutNode>; paneSlots: Record<PaneId, ScreenSlot> }>(() => {
    if (screen) return { layout: screen.draft?.layout ?? screen.layout, paneSlots: screen.draft?.paneSlots ?? screen.paneSlots }
    const { node, id } = createLeaf()
    return { layout: { 1: node }, paneSlots: { [id]: { ...emptySlot(), content: writeStageCheckpoint(undefined, 1, { kind: 'time' }) } } }
  })
  /** Which tab is showing: the screen-wide settings, or one specific pane's own. */
  const [activeTab, setActiveTab] = useState<'global' | PaneId>('global')
  /** Bumped on every tab switch (see `handleSelectTab`) purely to hand `editingFocus.pulse` a fresh, ever-increasing key — lets the live display's own flash element (see `SplitLayout`) restart from scratch on a repeat click of the tab that's already active, no matter how fast it's spam-clicked, rather than relying on `activeTab` itself (which wouldn't change at all in that case). */
  const pulseCounterRef = useRef(0)
  const [useStages, setUseStages] = useState(screen?.useStages ?? false)
  const [stageCount, setStageCount] = useState(screen?.stageCount ?? 1)
  const [slideDurationSeconds, setSlideDurationSeconds] = useState(screen?.slideDurationSeconds ?? 10)
  const [showSlotBorders, setShowSlotBorders] = useState(screen?.showSlotBorders ?? false)
  const [hideScrollbar, setHideScrollbar] = useState(screen?.hideScrollbar ?? false)
  const [useScreensaver, setUseScreensaver] = useState(screen?.useScreensaver ?? false)
  // Same "prefer a pending draft" seeding as `draft` above — both fields are live-pushed (see `handleTransitionStyleChange`/`handlePaneGrowthFallbackChange`), so a session that starts with Live editing off should continue from whatever was last staged, not the published value.
  const [transitionStyle, setTransitionStyle] = useState<ScreenTransitionStyle>(screen?.draft?.transitionStyle ?? screen?.transitionStyle ?? 'fade')
  const [paneGrowthFallback, setPaneGrowthFallback] = useState<PaneGrowthFallback>(screen?.draft?.paneGrowthFallback ?? screen?.paneGrowthFallback ?? 'screenEdge')

  const hasMultipleStages = useStages && stageCount > 1
  /** `activeStage` clamped to whatever's actually selectable right now — shrinking `stageCount` while a higher stage was selected shouldn't leave the tab bar (or any resolver below) pointing at a stage that's no longer offered; growing it back reveals the original selection again, since `activeStage` itself is never reset. */
  const clampedActiveStage = Math.min(activeStage, useStages ? Math.max(1, stageCount) : 1)

  const resolvedTree = resolveStageValue(draft.layout, clampedActiveStage) ?? Object.values(draft.layout)[0]
  const leaves = resolvedTree ? listLeaves(resolvedTree) : []
  const activeLeafId = activeTab !== 'global' ? activeTab : null
  const activeSlot = activeLeafId ? draft.paneSlots[activeLeafId] : undefined

  /**
   * The currently-selected pane's own Split/Delete buttons + `PaneEditor` —
   * clicking a pane in the live "Layout" preview selects it exactly like
   * clicking its own tab does, via the same `activeTab` state, so the two
   * never drift out of sync with each other.
   */
  const renderActivePaneEditor = () => {
    if (!activeSlot || !activeLeafId) return null
    const content = resolveSlotContent(activeSlot, clampedActiveStage)
    const backgroundImage = resolveContentBackgroundImage(content, resolveSlotBackgroundImage(activeSlot, clampedActiveStage))
    const paneIndex = leaves.findIndex((leaf) => leaf.id === activeLeafId)
    return (
      <>
        <div className="screen-form__pane-structure-actions">
          <Button type="button" variant="secondary" onClick={() => handleSplitPane(activeLeafId, 'row')}>
            {t('admin.screens.splitPaneHorizontallyButton')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => handleSplitPane(activeLeafId, 'column')}>
            {t('admin.screens.splitPaneVerticallyButton')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => handleClearPane(activeLeafId)}>
            {t('admin.screens.clearPaneButton')}
          </Button>
          {leaves.length > 1 && (
            <Button type="button" variant="secondary" onClick={() => handleDeletePane(activeLeafId)}>
              {t('admin.screens.deletePaneButton')}
            </Button>
          )}
        </div>
        <PaneEditor
          id={activeLeafId}
          content={content}
          onContentChange={handleContentChange}
          backgroundColor={resolveSlotBackgroundColor(activeSlot, clampedActiveStage)}
          onBackgroundColorChange={handleBackgroundColorChange}
          backgroundImage={backgroundImage}
          onBackgroundImageChange={handleBackgroundImageChange}
          textSizes={liveTextSizes}
          onTextSizesChange={handleLiveTextSizesChange}
          overflowMode={resolveSlotOverflowMode(activeSlot, clampedActiveStage)}
          onOverflowModeChange={handleOverflowModeChange}
          language={resolveSlotLanguage(activeSlot, clampedActiveStage)}
          onLanguageChange={handleLanguageChange}
          defaultLanguage={defaultPaneLanguage}
          useStages={useStages}
          stageCount={stageCount}
          activeStage={clampedActiveStage}
          onActiveStageChange={handleActiveStageChange}
          label={hasMultipleStages ? t('screenDisplay.textSizeEditor.stageTabLabel', { number: clampedActiveStage }) : t('admin.screens.paneLabel', { number: paneIndex + 1 })}
          resizeToFitBlocked={isResizeToFitConflict(
            leaves.map((leaf) => ({ id: leaf.id, slot: draft.paneSlots[leaf.id] })),
            activeLeafId,
            clampedActiveStage,
          )}
          suggestedEventOrdinal={
            findSiblingEventOrdinal(
              leaves.filter((leaf) => leaf.id !== activeLeafId).map((leaf) => draft.paneSlots[leaf.id]),
              clampedActiveStage,
            ) ?? 1
          }
        />
      </>
    )
  }

  /** The freshest persisted version of this screen — reflects any live writes already made this session (background color, text sizes) that this form's own local state doesn't separately track, so neither re-seeding a sub-panel nor the final Save can stomp them with stale data. */
  const latestScreen = screen ? (screens.find((candidate) => candidate.screenID === screen.screenID) ?? screen) : null

  /** `latestScreen` with any pending `.draft` fields merged on top — the freshest *complete* picture of this screen, read everywhere a current value is needed for display/continued-editing purposes (the "Layout" grid preview, the whole-screen percentage scaler, the background/border sub-views). Only differs from `latestScreen` while a draft is actually pending; otherwise identical. Unlike `ScreenDisplay.tsx`'s own `viewScreen`, this isn't gated on the "Live editing" checkbox — it's always draft-preferred, since this form's local state (`draft`, `transitionStyle`, `paneGrowthFallback`) is itself only *seeded once* on mount rather than recomputed every render, so a pending draft has to be the baseline from the very first render or it would otherwise be silently lost the moment this form makes its own first live-pushed edit. The checkbox instead only decides where a *new* edit goes (see `applyDraftableScreenPatch`). */
  const latestScreenWithDraft: ScreenConfig | null = latestScreen ? { ...latestScreen, ...(latestScreen.draft ?? {}) } : null

  /**
   * A screen-shaped object reflecting the freshest known state of every
   * live-pushed field — used to render the interactive "Layout" grid (the
   * exact same `SplitLayout` the live display uses) inline in this form.
   * Built from `latestScreenWithDraft` (not this form's own local draft/
   * component state) for every field that can be live-edited from
   * *anywhere* — `layout`, background, border color, transition style, etc.
   * — so an edit made directly on the kiosk display (or another open tab/
   * window of this same screen) shows up here too, not just edits made from
   * this form. `paneSlots` is the one deliberate exception: pane *content*
   * edits are draft-only until "Save" (unlike layout/background/etc., which
   * are live), so previewing this form's own in-progress unsaved content
   * edits takes priority there. A screen that hasn't been saved yet at all
   * (no `latestScreenWithDraft`) falls back to this form's own local field
   * state entirely, since there's nothing persisted anywhere to prefer
   * instead.
   */
  const previewScreen: ScreenConfig = latestScreenWithDraft
    ? { ...latestScreenWithDraft, paneSlots: draft.paneSlots }
    : {
        screenID: '',
        name,
        layout: draft.layout,
        paneSlots: draft.paneSlots,
        useStages,
        stageCount,
        slideDurationSeconds,
        transitionStyle,
        paneGrowthFallback,
        showSlotBorders,
        hideScrollbar,
        useScreensaver,
      }

  // Clears this screen's own live "which tab is the editor focused on" signal
  // (see `editingFocus`) the moment this form actually closes — otherwise
  // the live display would keep showing a stale highlight (or even replay
  // its flash on the next open) for a tab nobody's looking at anymore.
  // Mount/unmount-only ([screen] never actually changes mid-session): the
  // functional `setScreens` form reads fresh storage rather than this
  // component's own (separately-instanced, possibly momentarily stale)
  // `screens` state — this component and `ScreensView` each hold their own
  // `useScreens()` copy, only reconciled via the debounced sync round-trip,
  // so building this patch from `screens` in scope here risks clobbering a
  // Save this same close just made (that Save's write lands in storage
  // immediately; this component's own copy of it can lag behind).
  useEffect(() => {
    return () => {
      if (!screen) return
      setScreens((current) => current.map((existing) => (existing.screenID === screen.screenID ? { ...existing, editingFocus: undefined } : existing)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately mount/unmount-only, see comment above.
  }, [screen])

  /** Writes a partial change straight to the persisted screen, live, unconditionally — reserved for the two fields `DraftableScreenFields` excludes (`editingFocus`, `screensaverTestActive`), which stay live regardless of the "Live editing" checkbox since they're ephemeral live-signals, not real screen configuration (see that type's own doc comment). Every other live-pushed field goes through `applyDraftableScreenPatch` instead. Reads fresh from storage (the functional `setScreens` form) rather than this component's own `screens` state, which — being a separate `useScreens()` instance from `ScreensView`'s — can otherwise lag behind a write the other one just made. */
  const liveUpdateScreen = (patch: Partial<ScreenConfig>) => {
    if (!screen) return
    setScreens((current) => current.map((existing) => (existing.screenID === screen.screenID ? { ...existing, ...patch } : existing)))
  }

  /**
   * The single choke point every *draftable* field write in this form goes
   * through — routes straight to the published screen while "Live editing"
   * is on (identical to `liveUpdateScreen`), or merges into `screen.draft`
   * instead while it's off, invisible to every other viewer until
   * "Publish" (see `handlePublish`). Mirrors `ScreenDisplay.tsx`'s own
   * `applyScreenPatch`, minus its undo/redo bookkeeping (this form has none
   * of its own).
   */
  const applyDraftableScreenPatch = (patch: Partial<DraftableScreenFields>) => {
    if (!screen) return
    setScreens((current) =>
      current.map((existing) =>
        existing.screenID === screen.screenID ? (liveEditing ? { ...existing, ...patch } : { ...existing, draft: { ...existing.draft, ...patch } }) : existing,
      ),
    )
  }

  /** Merges the pending draft onto the published fields and clears it — everyone else's own view starts reflecting it immediately. Only ever called while `latestScreen.draft` is actually set (see the main tab's own "Publish" button). Mirrors `ScreenDisplay.tsx`'s own `handlePublish`. */
  const handlePublish = () => {
    if (!screen) return
    setScreens((current) => current.map((existing) => (existing.screenID === screen.screenID ? { ...existing, ...existing.draft, draft: undefined } : existing)))
  }

  /** Seeds the live text-size buffer for one pane at a given stage — that stage's resolved content's own value if it has one, else the pane's own shared/fallback value at that same stage. */
  const seedLiveTextSizes = (leafId: PaneId, stage: number) => {
    if (!screen || !latestScreenWithDraft) return
    const slot = latestScreenWithDraft.paneSlots[leafId]
    if (!slot) return
    const sharedTextSizes = resolveSlotTextSizes(slot, stage) ?? latestScreenWithDraft.textSizes ?? DEFAULT_TEXT_SIZES
    const content = resolveSlotContent(slot, stage)
    setLiveTextSizes(resolveContentTextSizes(content, sharedTextSizes))
  }

  /**
   * Switches the outer tab (the screen-wide "Global" settings, or one
   * specific pane), reseeding the live text-size buffer for whichever stage
   * is currently active, and persists `editingFocus` straight onto the
   * screen itself so every other open tab/window of it — including the
   * actual live display, possibly running on a kiosk with nobody at a
   * keyboard to click anything — can highlight and flash the matching pane,
   * helping show at a glance which physical position on the actual screen
   * is being edited right now.
   */
  const handleSelectTab = (tab: 'global' | PaneId) => {
    setActiveTab(tab)
    if (tab !== 'global') seedLiveTextSizes(tab, clampedActiveStage)
    pulseCounterRef.current += 1
    liveUpdateScreen({ editingFocus: { tab, pulse: pulseCounterRef.current } })
  }

  /** Opens the whole-screen percentage scaler. */
  const openGlobalTextSizeEditor = () => {
    if (!screen) return
    setDirection(1)
    setEditingTarget('global')
    onRouteChange?.(t('admin.screens.editTextSize'))
  }

  /** Opens the screen's own background color/image editor. */
  const openBackgroundEditor = () => {
    if (!screen) return
    setDirection(1)
    setEditingTarget('background')
    onRouteChange?.(t('admin.screens.backgroundLabel'))
  }

  /** Opens the pane-border color/visibility editor. */
  const openBordersEditor = () => {
    setDirection(1)
    setEditingTarget('borders')
    onRouteChange?.(t('admin.screens.bordersLabel'))
  }

  /** Opens the use-stages/count/duration editor. */
  const openStagesEditor = () => {
    setDirection(1)
    setEditingTarget('stages')
    onRouteChange?.(t('admin.screens.stagesLabel'))
  }

  /** Opens the content-transition-style / pane-growth-fallback editor. */
  const openTransitionsEditor = () => {
    setDirection(1)
    setEditingTarget('transitions')
    onRouteChange?.(t('admin.screens.transitionsLabel'))
  }

  /** Opens the "Use screensaver"/"Test screensaver" editor. */
  const openScreensaverEditor = () => {
    setDirection(1)
    setEditingTarget('screensaver')
    onRouteChange?.(t('admin.screens.screensaverLabel'))
  }

  /** Opens the catch-all "Other settings" editor. */
  const openOtherSettingsEditor = () => {
    setDirection(1)
    setEditingTarget('other')
    onRouteChange?.(t('admin.screens.otherSettingsLabel'))
  }

  /** Closes whichever sub-view is currently open, back to the main tabbed form. */
  const closeSubview = () => {
    setDirection(-1)
    setEditingTarget(null)
    onRouteChange?.(undefined)
  }

  /**
   * Reports the deep-linked-in sub-view's own breadcrumb label to the
   * parent, matching what each `openXEditor` function above does for a
   * normal click-driven open — `editingTarget` itself is already seeded
   * from `initialTarget` via the lazy `useState` initializer above (not
   * here), since directly calling one of those `openXEditor` functions
   * would call `setEditingTarget`/`setDirection` synchronously inside this
   * effect, which the "set-state-in-effect" lint rule flags (see
   * `useIdleTimer.ts` for the same rule hit elsewhere in this codebase).
   * `onRouteChange` is a plain prop callback, not a tracked `useState`
   * setter, so reporting it from here is fine.
   */
  useEffect(() => {
    if (!initialTarget) return
    const label = {
      global: t('admin.screens.editTextSize'),
      background: t('admin.screens.backgroundLabel'),
      borders: t('admin.screens.bordersLabel'),
      stages: t('admin.screens.stagesLabel'),
      transitions: t('admin.screens.transitionsLabel'),
      screensaver: t('admin.screens.screensaverLabel'),
      other: t('admin.screens.otherSettingsLabel'),
    }[initialTarget]
    onRouteChange?.(label)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only meant to run once, right on mount, reporting the breadcrumb for whatever sub-view `initialTarget` deep-linked straight into.
  }, [])

  /** Switches which stage the active pane's own tab bar has selected, reseeding the live text-size buffer to match. */
  const handleActiveStageChange = (stage: number) => {
    setActiveStage(stage)
    if (activeLeafId) seedLiveTextSizes(activeLeafId, stage)
  }

  /** Writes an updated version of the active pane's own slot into the local draft. */
  const updateActiveSlot = (updater: (slot: ScreenSlot) => ScreenSlot) => {
    if (!activeLeafId || !activeSlot) return
    setDraft((current) => ({ ...current, paneSlots: { ...current.paneSlots, [activeLeafId]: updater(current.paneSlots[activeLeafId]) } }))
  }

  /** Changes the active pane's own content at the currently active stage — writes a checkpoint there, leaving every other stage's own content untouched. */
  const handleContentChange = (content: ScreenSlotContent) => updateActiveSlot((slot) => ({ ...slot, content: writeStageCheckpoint(slot.content, clampedActiveStage, content) }))

  /** Changes the active pane's own background color at the currently active stage — same local-draft-only shape as `handleContentChange` (only actually persisted once "Save" is pressed), not the live-write pattern the text-size/layout handlers use. */
  const handleBackgroundColorChange = (color: string | undefined) => updateActiveSlot((slot) => ({ ...slot, backgroundColor: writeStageCheckpoint(slot.backgroundColor, clampedActiveStage, color) }))

  /** Changes the active pane's own single consolidated background image — to the active stage's own content checkpoint with more than one stage (so each stage's own pane can carry its own distinct image), else to the pane's own shared checkpoint, same split `handleLiveTextSizesChange` already resolves between. Same local-draft-only shape as `handleContentChange`. */
  const handleBackgroundImageChange = (image: BackgroundImage | undefined) => {
    if (!activeSlot) return
    if (hasMultipleStages) {
      handleContentChange({ ...resolveSlotContent(activeSlot, clampedActiveStage), backgroundImage: image })
      return
    }
    updateActiveSlot((slot) => ({ ...slot, backgroundImage: writeStageCheckpoint(slot.backgroundImage, clampedActiveStage, image) }))
  }

  /** Changes the active pane's own language override at the currently active stage — `undefined` resets it back to the cafe's own Standard pane language. Same local-draft-only shape as `handleContentChange`. */
  const handleLanguageChange = (language: LanguageCode | undefined) => updateActiveSlot((slot) => ({ ...slot, language: writeStageCheckpoint(slot.language, clampedActiveStage, language) }))

  /**
   * Writes the active tab's text-size change into this form's own local
   * draft (same as `handleContentChange`), plus — once the screen actually
   * has a `screenID` to write to — straight to the persisted screen too
   * (via `useScreens`, the same localStorage-backed store the display reads
   * from), so it shows up live on that screen's display immediately, in any
   * other tab/window of this browser already showing it. Still-being-
   * created screens (no `screenID` yet) only get the local write — there's
   * nothing to push live to yet — picked up like any other field once
   * "Save" is pressed. With more than one stage, goes to the currently
   * active stage's own content checkpoint, since editing one step's pane is
   * only ever meant to change how that step looks; with just one stage,
   * there's nothing else for a per-content value to differ from, so it goes
   * to the pane's own shared/fallback checkpoint instead.
   */
  const handleLiveTextSizesChange = (sizes: TextSizes) => {
    setLiveTextSizes(sizes)
    if (!activeLeafId || !activeSlot) return

    let updatedSlot: ScreenSlot
    if (!hasMultipleStages) {
      updatedSlot = { ...activeSlot, textSizes: writeStageCheckpoint(activeSlot.textSizes, clampedActiveStage, sizes) }
    } else {
      const content = resolveSlotContent(activeSlot, clampedActiveStage)
      if (!hasOwnTextSizeFields(content)) return
      updatedSlot = { ...activeSlot, content: writeStageCheckpoint(activeSlot.content, clampedActiveStage, { ...content, textSizes: sizes }) }
    }
    const nextPaneSlots = { ...draft.paneSlots, [activeLeafId]: updatedSlot }
    setDraft((current) => ({ ...current, paneSlots: nextPaneSlots }))
    if (screen) applyDraftableScreenPatch({ paneSlots: nextPaneSlots })
  }

  /** Writes the active tab's overflow-mode change at the currently active stage — same local-draft-plus-live-push posture as `handleLiveTextSizesChange`, so the shrink/scroll effect previews immediately, but always to the pane's own shared `overflowMode` timeline (unlike text sizes, it has no per-content-checkpoint variant to split between). */
  const handleOverflowModeChange = (mode: 'shrink' | 'scroll') => {
    if (!activeLeafId || !activeSlot) return
    const updatedSlot: ScreenSlot = { ...activeSlot, overflowMode: writeStageCheckpoint(activeSlot.overflowMode, clampedActiveStage, mode) }
    const nextPaneSlots = { ...draft.paneSlots, [activeLeafId]: updatedSlot }
    setDraft((current) => ({ ...current, paneSlots: nextPaneSlots }))
    if (screen) applyDraftableScreenPatch({ paneSlots: nextPaneSlots })
  }

  /** Writes a whole-screen percentage-scaled change (the default and every pane's own size, across every stage) straight to the persisted screen, live — same reasoning as `handleLiveTextSizesChange`. */
  const handleGlobalTextSizesChange = (next: SizeSnapshot) => {
    if (!screen) return
    setDraft((current) => ({ ...current, paneSlots: next.paneSlots }))
    applyDraftableScreenPatch({ textSizes: next.textSizes, paneSlots: next.paneSlots })
  }

  /** Writes the screen's own background color straight to the persisted screen, live. */
  const handleScreenBackgroundColorChange = (color: string) => applyDraftableScreenPatch({ backgroundColor: color })

  /** Writes the screen's own whole-screen background image straight to the persisted screen, live. */
  const handleScreenBackgroundImageChange = (backgroundImage: BackgroundImage | undefined) => applyDraftableScreenPatch({ backgroundImage })

  /** Writes the pane border color straight to the persisted screen, live. `undefined` goes back to the automatic contrast-based color. */
  const handleBorderColorChange = (color: string | undefined) => applyDraftableScreenPatch({ borderColor: color })

  /** Writes the chosen transition style (fade/slide) straight to the persisted screen, live. */
  const handleTransitionStyleChange = (style: ScreenTransitionStyle) => {
    setTransitionStyle(style)
    applyDraftableScreenPatch({ transitionStyle: style })
  }

  /** Writes the chosen pane-growth fallback (screen edge / fade — see `PaneGrowthFallback`) straight to the persisted screen, live. */
  const handlePaneGrowthFallbackChange = (fallback: PaneGrowthFallback) => {
    setPaneGrowthFallback(fallback)
    applyDraftableScreenPatch({ paneGrowthFallback: fallback })
  }

  /** Persists a divider drag (or, once the split/delete UI lands, a structural edit) from the inline "Layout" grid straight to the persisted screen, live — matching how the live display's own dragging already works. */
  const handleResizeDivider = (patch: Partial<ScreenConfig>) => {
    setDraft((current) => ({
      layout: patch.layout ?? current.layout,
      paneSlots: patch.paneSlots ? { ...current.paneSlots, ...patch.paneSlots } : current.paneSlots,
    }))
    if (screen) applyDraftableScreenPatch(patch)
  }

  /**
   * Splits `leafId` into two along `axis`, always an even 50/50 split, both
   * halves starting with its own duplicated content — switches to the new
   * pane's own tab afterward. `edge` defaults to placing the new pane on
   * the trailing side (matching the plain "Split pane horizontally/
   * vertically" buttons' own fixed behavior); the hover-thirds UI in the
   * "Layout" preview passes its own edge instead, matching whichever third
   * was clicked. Live-pushed immediately (no draft-only step), same
   * posture `handleResizeDivider` already has.
   */
  const handleSplitPane = (leafId: PaneId, axis: SplitDirection, edge: 'start' | 'end' = 'end') => {
    if (!resolvedTree) return
    const { tree, newPaneId } = splitLeaf(resolvedTree, leafId, axis, edge)
    const nextLayout = writeStageCheckpoint(draft.layout, clampedActiveStage, tree)
    const nextPaneSlots = { ...draft.paneSlots, [newPaneId]: cloneSlot(draft.paneSlots[leafId]) }
    setDraft({ layout: nextLayout, paneSlots: nextPaneSlots })
    setActiveTab(newPaneId)
    if (screen) applyDraftableScreenPatch({ layout: nextLayout, paneSlots: nextPaneSlots })
  }

  /** Splits `leafId` straight into a clean 2x2 of 4 equal panes in one step — see `ScreenDisplay.tsx`'s own `handleSplitPaneFour` for the identical tree-shape reasoning. Same live-pushed posture as `handleSplitPane`; doesn't switch tabs afterward (unlike a plain split's own single new pane, there's no one obviously "right" pane of the 3 new ones to land on). */
  const handleSplitPaneFour = (leafId: PaneId) => {
    if (!resolvedTree) return
    const { tree: afterRow, newPaneId: rightId } = splitLeaf(resolvedTree, leafId, 'row', 'end')
    const { tree: afterLeftColumn, newPaneId: bottomLeftId } = splitLeaf(afterRow, leafId, 'column', 'end')
    const { tree: afterRightColumn, newPaneId: bottomRightId } = splitLeaf(afterLeftColumn, rightId, 'column', 'end')
    const nextLayout = writeStageCheckpoint(draft.layout, clampedActiveStage, afterRightColumn)
    const originalSlot = draft.paneSlots[leafId]
    const nextPaneSlots = {
      ...draft.paneSlots,
      [rightId]: cloneSlot(originalSlot),
      [bottomLeftId]: cloneSlot(originalSlot),
      [bottomRightId]: cloneSlot(originalSlot),
    }
    setDraft({ layout: nextLayout, paneSlots: nextPaneSlots })
    if (screen) applyDraftableScreenPatch({ layout: nextLayout, paneSlots: nextPaneSlots })
  }

  /** Deletes `leafId` — its sibling takes over the freed space. No-op when it's the only pane left (the delete button isn't rendered at all in that case). Switches back to the "Global" tab if the deleted pane was the one currently open. */
  const handleDeletePane = (leafId: PaneId) => {
    if (!resolvedTree) return
    const nextTree = deleteLeaf(resolvedTree, leafId)
    if (!nextTree) return
    const nextLayout = writeStageCheckpoint(draft.layout, clampedActiveStage, nextTree)
    setDraft((current) => ({ ...current, layout: nextLayout }))
    if (activeLeafId === leafId) setActiveTab('global')
    if (screen) applyDraftableScreenPatch({ layout: nextLayout })
  }

  /** Resets `leafId`'s own content/background/text-size straight back to a fresh blank `ScreenSlot` — independent of `layout` entirely. Live-pushed immediately, same posture as split/delete. */
  const handleClearPane = (leafId: PaneId) => {
    const nextPaneSlots = { ...draft.paneSlots, [leafId]: emptySlot() }
    setDraft((current) => ({ ...current, paneSlots: nextPaneSlots }))
    if (screen) applyDraftableScreenPatch({ paneSlots: nextPaneSlots })
  }

  /** Toggles `leafId`'s own lock at the currently active stage — same posture as `handleClearPane`, and same accidental-edit-guard-only semantics as `ScreenDisplay.tsx`'s own `handleTogglePaneLock` (no PIN/confirmation, just this same button again). */
  const handleTogglePaneLock = (leafId: PaneId) => {
    const slot = draft.paneSlots[leafId] ?? emptySlot()
    const nextLocked = !resolveSlotLocked(slot, clampedActiveStage)
    const nextPaneSlots = { ...draft.paneSlots, [leafId]: { ...slot, locked: writeStageCheckpoint(slot.locked, clampedActiveStage, nextLocked) } }
    setDraft((current) => ({ ...current, paneSlots: nextPaneSlots }))
    if (screen) applyDraftableScreenPatch({ paneSlots: nextPaneSlots })
  }

  /** Toggles the live screensaver preview straight on the persisted screen — unlike `useScreensaver` itself (a plain field saved along with everything else on Submit), this needs to show up immediately on any open kiosk tab to actually be useful as a test. */
  const handleToggleTestScreensaver = () => {
    if (!latestScreen) return
    liveUpdateScreen({ screensaverTestActive: !latestScreen.screensaverTestActive })
  }

  /**
   * Returning from the whole-screen percentage scaler to the main form —
   * re-seeds the local pane draft from the freshest persisted data, since
   * the scaler writes straight into every pane's own content/color/text
   * sizes. Without this, the main form's own (now-stale) local pane state
   * would stomp those live writes the next time "Save" is clicked.
   */
  const closeGlobalTextSizeEditor = () => {
    setDirection(-1)
    const latest = screens.find((candidate) => candidate.screenID === screen?.screenID)
    if (latest) setDraft({ layout: latest.layout, paneSlots: latest.paneSlots })
    setEditingTarget(null)
    onRouteChange?.(undefined)
  }

  /** Registers "a sub-view is open" as its own level of the shared browser-back stack (see `useBackLevel`) — closes via whichever function actually returns to the main tabbed form for the currently open one, since the "global" scaler's own close also re-seeds this form's local pane state (see `closeGlobalTextSizeEditor`) and every other sub-view's doesn't need that. The single Back button lives one level up, in `ScreensView`'s own header — not here. */
  const closeCurrentSubview = () => {
    if (editingTarget === 'global') {
      closeGlobalTextSizeEditor()
      return
    }
    closeSubview()
  }
  useBackLevel(editingTarget !== null, closeCurrentSubview)

  let viewKey: string
  let formContent: ReactNode

  if (editingTarget === 'global' && screen) {
    viewKey = 'global'
    formContent = (
      <div className="screen-form__subview">
        <GlobalTextSizeScaler screen={latestScreenWithDraft ?? previewScreen} onChange={handleGlobalTextSizesChange} onDone={closeGlobalTextSizeEditor} />
      </div>
    )
  } else if (editingTarget === 'background' && latestScreen) {
    viewKey = 'background'
    formContent = (
      <div className="screen-form__subview">
        <BackgroundEditor
          backgroundColor={latestScreenWithDraft?.backgroundColor ?? DEFAULT_SCREEN_BACKGROUND_COLOR}
          onBackgroundColorChange={handleScreenBackgroundColorChange}
          backgroundImage={latestScreenWithDraft?.backgroundImage}
          onBackgroundImageChange={handleScreenBackgroundImageChange}
        />
      </div>
    )
  } else if (editingTarget === 'stages' && screen) {
    viewKey = 'stages'
    formContent = (
      <div className="screen-form__subview">
        <Checkbox id="screen-use-stages" label={t('admin.screens.useStagesLabel')} checked={useStages} onChange={(event) => setUseStages(event.target.checked)} />
        {useStages && (
          <Input
            id="screen-stage-count"
            label={t('admin.screens.stageCountLabel')}
            type="number"
            min={1}
            value={stageCount}
            onChange={(event) => setStageCount(Number(event.target.value))}
          />
        )}
        <Input
          id="screen-slide-duration"
          label={t('admin.screens.slideDurationLabel')}
          type="number"
          min={1}
          value={slideDurationSeconds}
          onChange={(event) => setSlideDurationSeconds(Number(event.target.value))}
        />
      </div>
    )
  } else if (editingTarget === 'transitions' && screen) {
    viewKey = 'transitions'
    formContent = (
      <div className="screen-form__subview">
        <div className="screen-form__field">
          <span>{t('admin.screens.transitionStyleLabel')}</span>
          <div className="screen-form__layout-picker">
            <button
              type="button"
              className={`screen-form__layout-option${transitionStyle === 'fade' ? ' screen-form__layout-option--active' : ''}`}
              onClick={() => handleTransitionStyleChange('fade')}
            >
              {t('admin.screens.transitionFadeLabel')}
            </button>
            <button
              type="button"
              className={`screen-form__layout-option${transitionStyle === 'slide' ? ' screen-form__layout-option--active' : ''}`}
              onClick={() => handleTransitionStyleChange('slide')}
            >
              {t('admin.screens.transitionSlideLabel')}
            </button>
          </div>
        </div>
        <div className="screen-form__field">
          <span>{t('admin.screens.paneGrowthFallbackLabel')}</span>
          <div className="screen-form__layout-picker">
            <button
              type="button"
              className={`screen-form__layout-option${paneGrowthFallback === 'screenEdge' ? ' screen-form__layout-option--active' : ''}`}
              onClick={() => handlePaneGrowthFallbackChange('screenEdge')}
            >
              {t('admin.screens.paneGrowthScreenEdgeLabel')}
            </button>
            <button
              type="button"
              className={`screen-form__layout-option${paneGrowthFallback === 'fade' ? ' screen-form__layout-option--active' : ''}`}
              onClick={() => handlePaneGrowthFallbackChange('fade')}
            >
              {t('admin.screens.paneGrowthFadeLabel')}
            </button>
          </div>
        </div>
      </div>
    )
  } else if (editingTarget === 'other') {
    viewKey = 'other'
    formContent = (
      <div className="screen-form__subview">
        <Checkbox
          id="screen-hide-scrollbar"
          label={t('admin.screens.hideScrollbarLabel')}
          checked={hideScrollbar}
          onChange={(event) => setHideScrollbar(event.target.checked)}
        />
      </div>
    )
  } else if (editingTarget === 'screensaver' && screen) {
    viewKey = 'screensaver'
    formContent = (
      <div className="screen-form__subview">
        <Checkbox
          id="screen-use-screensaver"
          label={t('admin.screens.useScreensaverLabel')}
          checked={useScreensaver}
          onChange={(event) => setUseScreensaver(event.target.checked)}
        />
        {latestScreen && (
          <Button type="button" variant="secondary" onClick={handleToggleTestScreensaver}>
            {latestScreen.screensaverTestActive ? t('admin.screens.stopTestScreensaverButton') : t('admin.screens.testScreensaverButton')}
          </Button>
        )}
      </div>
    )
  } else if (editingTarget === 'borders' && latestScreen) {
    viewKey = 'borders'
    formContent = (
      <div className="screen-form__subview">
        <Checkbox
          id="screen-show-slot-borders"
          label={t('admin.screens.showSlotBordersLabel')}
          checked={showSlotBorders}
          onChange={(event) => setShowSlotBorders(event.target.checked)}
        />
        {showSlotBorders && (
          <BackgroundColorPicker
            backgroundColor={latestScreenWithDraft?.borderColor}
            onChange={handleBorderColorChange}
            allowTransparent
            label={t('admin.screens.borderColorLabel')}
            transparentLabel={t('admin.screens.autoBorderColorLabel')}
          />
        )}
      </div>
    )
  } else {
    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      onSave({
        // Carries forward fields this form has no controls of its own for
        // (right now, none — kept as a safety net for any screen-level field
        // this form doesn't explicitly track) from the freshest persisted
        // data, so a Save right after a live sub-panel edit can't revert it.
        ...(latestScreen ?? screen),
        screenID: screen?.screenID ?? `screen-${generateId()}`,
        name,
        layout: draft.layout,
        paneSlots: draft.paneSlots,
        useStages,
        stageCount,
        slideDurationSeconds,
        transitionStyle,
        paneGrowthFallback,
        showSlotBorders,
        hideScrollbar,
        useScreensaver,
        previewAspectRatio,
      })
    }

    viewKey = 'main'
    formContent = (
      <form className="screen-form" onSubmit={handleSubmit}>
        <div className="screen-form__tab-panel">
          <Input id="screen-name" label={t('admin.screens.nameLabel')} value={name} onChange={(event) => setName(event.target.value)} required />

          {screen && (
            <div className="screen-form__live-editing-row">
              <Checkbox
                id="screen-form-live-editing"
                label={t('screenDisplay.liveEditing')}
                checked={liveEditing}
                onChange={(event) => setLiveEditing(event.target.checked)}
              />
              {latestScreen?.draft && (
                <Button type="button" variant="secondary" onClick={handlePublish}>
                  {t('screenDisplay.publish')}
                </Button>
              )}
            </div>
          )}

          {/* The live layout editor itself — a pane's own fields (below) are just one click away on whichever pane is clicked here, so the separate per-pane tab-button row (and the "Layout" sub-view that used to hold this) isn't needed anymore. */}
          <div className="screen-form__layout-picker" role="group" aria-label={t('admin.screens.previewRatioLabel')}>
            {PREVIEW_ASPECT_RATIOS.map(({ ratio, label }) => (
              <button
                key={label}
                type="button"
                className={`screen-form__layout-option${previewAspectRatio.width === ratio.width && previewAspectRatio.height === ratio.height ? ' screen-form__layout-option--active' : ''}`}
                onClick={() => setPreviewAspectRatio(ratio)}
              >
                {label}
              </button>
            ))}
          </div>
          {hasMultipleStages && <StageTabs stageCount={stageCount} activeStage={clampedActiveStage} onActiveStageChange={handleActiveStageChange} />}
          <div className="screen-form__preview">
            <ScaledScreenPreview aspectRatio={previewAspectRatio} fit="contain">
              <SplitLayout
                screen={previewScreen}
                resolveTextSizes={(leafId, stage, content) => {
                  const slot = draft.paneSlots[leafId]
                  const shared = (slot && resolveSlotTextSizes(slot, stage)) ?? latestScreen?.textSizes ?? DEFAULT_TEXT_SIZES
                  return resolveContentTextSizes(content, shared)
                }}
                stage={clampedActiveStage}
                onResizeDivider={handleResizeDivider}
                onEditSlide={handleSelectTab}
                onSplitPane={handleSplitPane}
                onSplitFour={handleSplitPaneFour}
                disableSplitOnTouch
                onClearPane={handleClearPane}
                onDeletePane={handleDeletePane}
                onTogglePaneLock={handleTogglePaneLock}
                selectedLeafId={activeLeafId ?? undefined}
                defaultPaneLanguage={defaultPaneLanguage}
              />
            </ScaledScreenPreview>
          </div>
          {activeLeafId && renderActivePaneEditor()}

          {screen && (
            <motion.div layout>
              <Button type="button" variant="secondary" className="screen-form__menu-button" onClick={openGlobalTextSizeEditor}>
                {t('admin.screens.editTextSize')}
                <span aria-hidden="true">→</span>
              </Button>
            </motion.div>
          )}

          {screen && (
            <motion.div layout>
              <Button type="button" variant="secondary" className="screen-form__menu-button" onClick={openBackgroundEditor}>
                {t('admin.screens.backgroundLabel')}
                <span aria-hidden="true">→</span>
              </Button>
            </motion.div>
          )}

          {/* Fades and slides in/out as the pane count crosses 1 (`initial={false}` skips this on first mount, since it's not really "appearing"). Animating its own `height` (0 to/from its natural size, `layout` enables interpolating that "auto" value) — rather than just `opacity`/`y` — is what actually makes every field below it glide smoothly into its new position instead of snapping the instant this one's removed from the document flow; those fields only need `layout` themselves to pick up that progressive reflow. `overflow: hidden` keeps the button from spilling out while its own height is still animating. */}
          <AnimatePresence initial={false}>
            {leaves.length > 1 && latestScreen && (
              <motion.div
                key="borders"
                layout
                initial={{ opacity: 0, y: -12, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -12, height: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                style={{ overflow: 'hidden' }}
              >
                <Button type="button" variant="secondary" className="screen-form__menu-button" onClick={openBordersEditor}>
                  {t('admin.screens.bordersLabel')}
                  <span aria-hidden="true">→</span>
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div layout>
            <Button type="button" variant="secondary" className="screen-form__menu-button" onClick={openStagesEditor}>
              {t('admin.screens.stagesLabel')}
              <span aria-hidden="true">→</span>
            </Button>
          </motion.div>

          <motion.div layout>
            <Button type="button" variant="secondary" className="screen-form__menu-button" onClick={openTransitionsEditor}>
              {t('admin.screens.transitionsLabel')}
              <span aria-hidden="true">→</span>
            </Button>
          </motion.div>

          {screensaverSchedule && (
            <motion.div layout>
              <Button type="button" variant="secondary" className="screen-form__menu-button" onClick={openScreensaverEditor}>
                {t('admin.screens.screensaverLabel')}
                <span aria-hidden="true">→</span>
              </Button>
            </motion.div>
          )}

          <motion.div layout>
            <Button type="button" variant="secondary" className="screen-form__menu-button" onClick={openOtherSettingsEditor}>
              {t('admin.screens.otherSettingsLabel')}
              <span aria-hidden="true">→</span>
            </Button>
          </motion.div>
        </div>

        <div className="screen-form__actions">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('admin.common.cancel')}
          </Button>
          <Button type="submit">{t('admin.common.save')}</Button>
        </div>
      </form>
    )
  }

  return (
    <SlideTransition viewKey={viewKey} direction={direction}>
      {formContent}
    </SlideTransition>
  )
}
