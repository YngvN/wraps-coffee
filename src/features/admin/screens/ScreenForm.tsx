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
  type ScreenConfig,
  type ScreenSlot,
  type ScreenSlotContent,
  type ScreenTransitionStyle,
  type SplitBigPosition,
  type SplitDirection,
  type TextSizes,
} from '../../../types/screen'
import { findSiblingEventOrdinal } from '../../../utils/eventOrdinals'
import { nudgeRatio, type ResizeDirection } from '../../../utils/screenLayout'
import { hasOwnTextSizeFields, resolveContentBackgroundImage } from '../../../utils/screenSlots'
import {
  isResizeToFitConflict,
  isSlotActive,
  resolveSlotBackgroundColor,
  resolveSlotBackgroundImage,
  resolveSlotContent,
  resolveSlotLanguage,
  resolveSlotTextSizes,
  writeStageCheckpoint,
} from '../../../utils/screenStages'
import { resolveContentTextSizes } from '../../../utils/textSizeVars'
import { BackgroundColorPicker } from '../../screens/BackgroundColorPicker'
import { BackgroundEditor } from '../../screens/BackgroundEditor'
import { GlobalTextSizeScaler, type SizeSnapshot } from '../../screens/GlobalTextSizeScaler'
import { PaneEditor } from '../../screens/PaneEditor'
import { StageTabs } from '../../screens/StageTabs'
import { LayoutIcon, type LayoutIconPattern } from './LayoutIcon'
import { getArrangementPattern } from './screenPreviewPattern'
import './ScreenForm.scss'

interface ScreenFormProps {
  /** The screen being edited, or `null` when creating a new one. */
  screen: ScreenConfig | null
  onSave: (screen: ScreenConfig) => void
  onCancel: () => void
  /** Reports this form's own currently open sub-view by name (e.g. "Resize slots"), or `undefined` while showing its main tabbed content — lets the parent's `Modal` show it as a "Edit screen - Resize slots" breadcrumb next to its title. */
  onRouteChange?: (route: string | undefined) => void
}

/** The 4 arrangements available when exactly 3 of a screen's slots are active. */
const TRIPLE_ARRANGEMENTS: { pattern: LayoutIconPattern; direction: SplitDirection; bigPosition: SplitBigPosition; labelKey: string }[] = [
  { pattern: 'triple-row-first', direction: 'row', bigPosition: 'first', labelKey: 'tripleRowFirstLabel' },
  { pattern: 'triple-row-second', direction: 'row', bigPosition: 'second', labelKey: 'tripleRowSecondLabel' },
  { pattern: 'triple-column-first', direction: 'column', bigPosition: 'first', labelKey: 'tripleColumnFirstLabel' },
  { pattern: 'triple-column-second', direction: 'column', bigPosition: 'second', labelKey: 'tripleColumnSecondLabel' },
]

/** A representative preview pattern for each selectable `slotCount`, shown on the "Layout" picker's own buttons — not necessarily this screen's actual current arrangement (that's the tab bar's own icons, just above), just a stand-in shape for "1 pane"/"2 panes"/etc. */
const SLOT_COUNT_PREVIEW_PATTERNS: Record<number, LayoutIconPattern> = {
  1: 'single',
  2: 'row',
  3: 'triple-row-first',
  4: 'quad',
}

/** A slot with no checkpoints yet. */
const EMPTY_SLOT: ScreenSlot = { content: {}, backgroundColor: {}, backgroundImage: {}, textSizes: {} }

/** The next unused "<prefix> N" name (starting at 1), so a new screen never defaults to a name that collides with an existing one. */
function nextDefaultScreenName(screens: ScreenConfig[], prefix: string): string {
  const existingNames = new Set(screens.map((existing) => existing.name))
  let n = 1
  while (existingNames.has(`${prefix} ${n}`)) n++
  return `${prefix} ${n}`
}

/**
 * Create/edit form for a single screen: a "Global" tab with name, the
 * screen's own background color, how many of its 4 slots are actually shown
 * (`slotCount`) plus their on-screen arrangement, a "Resize" panel of 4
 * arrows nudging whichever pane divider each one controls 1% at a time (the
 * exact same fields the live display's own draggable dividers adjust, so
 * either one stays in sync with the other), whether/what color the borders
 * between panes use, a "Steps" panel (whether/how many shared stages every
 * slot advances through together, the rotation timer, and the transition
 * animation), and — one tab per slot, so each gets its own room — that
 * slot's own content, background color/image, and shared/fallback text
 * size. Once the screen has shared stages on with more than one, a slot's
 * own tab gains a stage-tab bar above its fields — mirroring the outer
 * tabs one level deeper — and every field is resolved from (and edits
 * write back into) that slot's own independent timeline at whichever stage
 * is selected (see `src/utils/screenStages.ts`); with stages off (or only
 * one), the tab bar is hidden and every field is simply the slot's one
 * static stage-1 checkpoint. Everything available from the display's own
 * in-place editors is available here too, so the whole screen can be
 * configured externally without ever opening the live display. Reducing
 * `slotCount` never clears a hidden slot's own content/settings — its tab
 * stays fully editable, just visually marked as not currently shown — so
 * dialing it back up (or mis-saving with it lower than intended) can't
 * lose any data; only deleting the whole screen does.
 */
export function ScreenForm({ screen, onSave, onCancel, onRouteChange }: ScreenFormProps) {
  const { t } = useLanguage()
  const [screens, setScreens] = useScreens()
  const [screensaverSchedule] = useScreensaverSchedule()
  const [defaultPaneLanguage] = useDefaultPaneLanguage()
  /** Which sub-view (replacing the whole tabbed form until its own Back button is pressed) is open: the whole-screen percentage scaler, the "Layout" pane-count picker, the "Split direction" editor (arrangement picker plus its own resize D-pad, and its own nested "Borders" sub-menu — see `arrangementShowingBorders`), the screen's own whole-screen "Background" color/image editor, the "Steps" (use-stages/count/duration/transition) editor, the "Screen saver" editor, the "Other settings" editor, or neither. A slot's own fields (content, background, text size) aren't one of these — they're owned by `PaneEditor` itself, which manages its own sub-view navigation internally (see the active-slot tab render below). */
  const [editingTarget, setEditingTarget] = useState<'global' | 'layout' | 'arrangement' | 'background' | 'stages' | 'screensaver' | 'other' | null>(null)
  /** `1` while opening a sub-view (slides in from the right, see `SlideTransition`), `-1` while going back (slides in from the left) — including one level of nesting deeper/shallower within Arrangement's own "Borders" sub-menu. Set right before whatever state change actually switches the view. */
  const [direction, setDirection] = useState<1 | -1>(1)
  /** Whether the "Split direction" sub-view is itself showing its own nested "Borders" sub-menu rather than the layout picker/resize D-pad — reset whenever this sub-view (re)opens. */
  const [arrangementShowingBorders, setArrangementShowingBorders] = useState(false)
  const [liveTextSizes, setLiveTextSizes] = useState<TextSizes>(screen?.textSizes ?? DEFAULT_TEXT_SIZES)
  /** Which stage a slot's own tab is currently showing fields for — shared across every slot tab (switching which slot you're viewing doesn't change it), since stages are a screen-wide sequence, not a per-slot one. */
  const [activeStage, setActiveStage] = useState(1)
  const [name, setName] = useState(() => screen?.name ?? nextDefaultScreenName(screens, t('admin.screens.defaultNamePrefix')))
  const [slotCount, setSlotCount] = useState(screen?.slotCount ?? 4)
  const [slot1, setSlot1] = useState<ScreenSlot>(screen?.slots[0] ?? EMPTY_SLOT)
  const [slot2, setSlot2] = useState<ScreenSlot>(screen?.slots[1] ?? EMPTY_SLOT)
  const [slot3, setSlot3] = useState<ScreenSlot>(screen?.slots[2] ?? EMPTY_SLOT)
  const [slot4, setSlot4] = useState<ScreenSlot>(screen?.slots[3] ?? EMPTY_SLOT)
  /** Which tab is showing: the screen-wide settings, or one specific slot's own. */
  const [activeTab, setActiveTab] = useState<'global' | number>('global')
  /** Bumped on every tab switch (see `handleSelectTab`) purely to hand `editingFocus.pulse` a fresh, ever-increasing key — lets the live display's own flash element (see `SplitLayout`) restart from scratch on a repeat click of the tab that's already active, no matter how fast it's spam-clicked, rather than relying on `activeTab` itself (which wouldn't change at all in that case). */
  const pulseCounterRef = useRef(0)
  const [useStages, setUseStages] = useState(screen?.useStages ?? false)
  const [stageCount, setStageCount] = useState(screen?.stageCount ?? 1)
  const [slideDurationSeconds, setSlideDurationSeconds] = useState(screen?.slideDurationSeconds ?? 10)
  const [splitDirection, setSplitDirection] = useState<SplitDirection>(screen?.splitDirection ?? 'row')
  const [splitBigPosition, setSplitBigPosition] = useState<SplitBigPosition>(screen?.splitBigPosition ?? 'first')
  const [showSlotBorders, setShowSlotBorders] = useState(screen?.showSlotBorders ?? true)
  const [hideScrollbar, setHideScrollbar] = useState(screen?.hideScrollbar ?? false)
  const [useScreensaver, setUseScreensaver] = useState(screen?.useScreensaver ?? false)
  const [transitionStyle, setTransitionStyle] = useState<ScreenTransitionStyle>(screen?.transitionStyle ?? 'fade')

  const hasMultipleStages = useStages && stageCount > 1
  /** `activeStage` clamped to whatever's actually selectable right now — shrinking `stageCount` while a higher stage was selected shouldn't leave the tab bar (or any resolver below) pointing at a stage that's no longer offered; growing it back reveals the original selection again, since `activeStage` itself is never reset. */
  const clampedActiveStage = Math.min(activeStage, useStages ? Math.max(1, stageCount) : 1)

  const slotFields: { id: string; label: string; value: ScreenSlot; onChange: (slot: ScreenSlot) => void }[] = [
    { id: 'slot-1', label: t('admin.screens.slot1Label'), value: slot1, onChange: setSlot1 },
    { id: 'slot-2', label: t('admin.screens.slot2Label'), value: slot2, onChange: setSlot2 },
    { id: 'slot-3', label: t('admin.screens.slot3Label'), value: slot3, onChange: setSlot3 },
    { id: 'slot-4', label: t('admin.screens.slot4Label'), value: slot4, onChange: setSlot4 },
  ]
  const activeSlot = typeof activeTab === 'number' ? slotFields[activeTab] : null
  /** The arrangement shape every slot tab's own icon is drawn against, so each button's `highlightIndex` shows exactly which physical position on the screen it represents. */
  const arrangementPattern = getArrangementPattern({ slotCount, splitDirection, splitBigPosition })

  /** The freshest persisted version of this screen — reflects any live writes already made this session (background color, text sizes) that this form's own local state doesn't separately track, so neither re-seeding a sub-panel nor the final Save can stomp them with stale data. */
  const latestScreen = screen ? (screens.find((candidate) => candidate.screenID === screen.screenID) ?? screen) : null

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

  /**
   * Switches the outer tab (the screen-wide "Global" settings, or one
   * specific slot), reseeding the live text-size buffer for whichever stage
   * is currently active, and persists `editingFocus` straight onto the
   * screen itself so every other open tab/window of it — including the
   * actual live display, possibly running on a kiosk with nobody at a
   * keyboard to click anything — can highlight and flash the matching pane,
   * helping show at a glance which physical position on the actual screen
   * is being edited right now.
   */
  const handleSelectTab = (tab: 'global' | number) => {
    setActiveTab(tab)
    if (typeof tab === 'number') seedLiveTextSizes(tab, clampedActiveStage)
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

  /** Opens the "Layout" pane-count picker (1-4 panes). */
  const openLayoutEditor = () => {
    setDirection(1)
    setEditingTarget('layout')
    onRouteChange?.(t('admin.screens.slotCountLabel'))
  }

  /** Opens the arrangement picker/resize D-pad editor ("Split direction"). */
  const openArrangementEditor = () => {
    setDirection(1)
    setEditingTarget('arrangement')
    setArrangementShowingBorders(false)
    onRouteChange?.(t('admin.screens.splitDirectionLabel'))
  }

  /** Opens Arrangement's own nested "Borders" sub-menu. */
  const openBordersWithinArrangement = () => {
    setDirection(1)
    setArrangementShowingBorders(true)
    onRouteChange?.(`${t('admin.screens.splitDirectionLabel')} - ${t('admin.screens.bordersLabel')}`)
  }

  /** Returns from Arrangement's own nested "Borders" sub-menu back to the layout picker/resize D-pad — one level up, not all the way out to the main form. */
  const closeBordersWithinArrangement = () => {
    setDirection(-1)
    setArrangementShowingBorders(false)
    onRouteChange?.(t('admin.screens.splitDirectionLabel'))
  }

  /** Registers Arrangement's own nested "Borders" sub-menu as its own (third) level of the shared browser-back stack — nested inside the "a sub-view is open" level just below, so the browser's own back action closes Borders first, then the Arrangement sub-view itself, one at a time. */
  useBackLevel(editingTarget === 'arrangement' && arrangementShowingBorders, closeBordersWithinArrangement)

  /** Opens the use-stages/count/duration/transition editor. */
  const openStagesEditor = () => {
    setDirection(1)
    setEditingTarget('stages')
    onRouteChange?.(t('admin.screens.stagesLabel'))
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

  /** Seeds the live text-size buffer for one slot at a given stage — that stage's resolved content's own value if it has one, else the slot's own shared/fallback value at that same stage. */
  const seedLiveTextSizes = (slotIndex: number, stage: number) => {
    if (!screen || !latestScreen) return
    const slot = latestScreen.slots[slotIndex]
    const sharedTextSizes = resolveSlotTextSizes(slot, stage) ?? latestScreen.textSizes ?? DEFAULT_TEXT_SIZES
    const content = resolveSlotContent(slot, stage)
    setLiveTextSizes(resolveContentTextSizes(content, sharedTextSizes))
  }

  /** Switches which stage the active slot's own tab bar has selected, reseeding the live text-size buffer to match. */
  const handleActiveStageChange = (stage: number) => {
    setActiveStage(stage)
    if (typeof activeTab === 'number') seedLiveTextSizes(activeTab, stage)
  }

  /** Changes the active slot's own content at the currently active stage — writes a checkpoint there, leaving every other stage's own content untouched. */
  const handleContentChange = (content: ScreenSlotContent) => {
    if (!activeSlot) return
    activeSlot.onChange({ ...activeSlot.value, content: writeStageCheckpoint(activeSlot.value.content, clampedActiveStage, content) })
  }

  /** Changes the active slot's own background color at the currently active stage — same local-draft-only shape as `handleContentChange` (only actually persisted once "Save" is pressed), not the live-write pattern the text-size/arrangement handlers use. */
  const handleBackgroundColorChange = (color: string | undefined) => {
    if (!activeSlot) return
    activeSlot.onChange({ ...activeSlot.value, backgroundColor: writeStageCheckpoint(activeSlot.value.backgroundColor, clampedActiveStage, color) })
  }

  /** Changes the active slot's own single consolidated background image — to the active stage's own content checkpoint with more than one stage (so each stage's own pane can carry its own distinct image), else to the slot's own shared checkpoint, same split `handleLiveTextSizesChange` already resolves between. Same local-draft-only shape as `handleContentChange`. */
  const handleBackgroundImageChange = (image: BackgroundImage | undefined) => {
    if (!activeSlot) return
    if (hasMultipleStages) {
      handleContentChange({ ...resolveSlotContent(activeSlot.value, clampedActiveStage), backgroundImage: image })
      return
    }
    activeSlot.onChange({ ...activeSlot.value, backgroundImage: writeStageCheckpoint(activeSlot.value.backgroundImage, clampedActiveStage, image) })
  }

  /** Changes the active slot's own language override at the currently active stage — `undefined` resets it back to the cafe's own Standard pane language. Same local-draft-only shape as `handleContentChange`. */
  const handleLanguageChange = (language: LanguageCode | undefined) => {
    if (!activeSlot) return
    activeSlot.onChange({ ...activeSlot.value, language: writeStageCheckpoint(activeSlot.value.language, clampedActiveStage, language) })
  }

  /**
   * Writes the active tab's text-size change into this form's own local
   * slot state (same as `handleContentChange`), plus — once the screen
   * actually has a `screenID` to write to — straight to the persisted
   * screen too (via `useScreens`, the same localStorage-backed store the
   * display reads from), so it shows up live on that screen's display
   * immediately, in any other tab/window of this browser already showing
   * it. Still-being-created screens (no `screenID` yet) only get the local
   * write — there's nothing to push live to yet — picked up like any other
   * field once "Save" is pressed. This is plain browser storage, not a
   * network call, so the live push keeps working even if the internet
   * drops. With more than one stage, goes to the currently active stage's
   * own content checkpoint, since editing one step's pane is only ever
   * meant to change how that step looks; with just one stage, there's
   * nothing else for a per-content value to differ from, so it goes to the
   * slot's own shared/fallback checkpoint instead.
   */
  const handleLiveTextSizesChange = (sizes: TextSizes) => {
    setLiveTextSizes(sizes)
    if (typeof activeTab !== 'number') return
    const slotIndex = activeTab
    const slot = slotFields[slotIndex].value

    if (!hasMultipleStages) {
      const updatedSlot: ScreenSlot = { ...slot, textSizes: writeStageCheckpoint(slot.textSizes, clampedActiveStage, sizes) }
      slotFields[slotIndex].onChange(updatedSlot)
      if (screen) liveUpdateScreen({ slots: slotFields.map((field, i) => (i === slotIndex ? updatedSlot : field.value)) as ScreenConfig['slots'] })
      return
    }

    const content = resolveSlotContent(slot, clampedActiveStage)
    if (!hasOwnTextSizeFields(content)) return
    const updatedSlot: ScreenSlot = { ...slot, content: writeStageCheckpoint(slot.content, clampedActiveStage, { ...content, textSizes: sizes }) }
    slotFields[slotIndex].onChange(updatedSlot)
    if (screen) liveUpdateScreen({ slots: slotFields.map((field, i) => (i === slotIndex ? updatedSlot : field.value)) as ScreenConfig['slots'] })
  }

  /** Writes a whole-screen percentage-scaled change (the default and every slot's own size, across every stage) straight to the persisted screen, live — same reasoning as `handleLiveTextSizesChange`. */
  const handleGlobalTextSizesChange = (next: SizeSnapshot) => {
    if (!screen) return
    setScreens((current) => current.map((existing) => (existing.screenID === screen.screenID ? { ...existing, textSizes: next.textSizes, slots: next.slots } : existing)))
  }

  /** Writes a partial change straight to the persisted screen, live — same reasoning as the text-size handlers: so it shows up on the display immediately, in any other tab/window of this browser already showing it. Reads fresh from storage (the functional `setScreens` form) rather than this component's own `screens` state, which — being a separate `useScreens()` instance from `ScreensView`'s — can otherwise lag behind a write the other one just made. */
  const liveUpdateScreen = (patch: Partial<ScreenConfig>) => {
    if (!screen) return
    setScreens((current) => current.map((existing) => (existing.screenID === screen.screenID ? { ...existing, ...patch } : existing)))
  }

  /** Writes the screen's own background color straight to the persisted screen, live. */
  const handleScreenBackgroundColorChange = (color: string) => liveUpdateScreen({ backgroundColor: color })

  /** Writes the screen's own whole-screen background image straight to the persisted screen, live. */
  const handleScreenBackgroundImageChange = (backgroundImage: BackgroundImage | undefined) => liveUpdateScreen({ backgroundImage })

  /** Writes the pane border color straight to the persisted screen, live. `undefined` goes back to the automatic contrast-based color. */
  const handleBorderColorChange = (color: string | undefined) => liveUpdateScreen({ borderColor: color })

  /** Writes the chosen slot count straight to the persisted screen, live. */
  const handleSlotCountChange = (count: number) => {
    setSlotCount(count)
    liveUpdateScreen({ slotCount: count })
  }

  /** Writes the row/column split direction (2 slots) straight to the persisted screen, live. */
  const handleSplitDirectionChange = (direction: SplitDirection) => {
    setSplitDirection(direction)
    liveUpdateScreen({ splitDirection: direction })
  }

  /** Writes a triple arrangement (3 slots) straight to the persisted screen, live. */
  const handleTripleArrangementChange = (direction: SplitDirection, bigPosition: SplitBigPosition) => {
    setSplitDirection(direction)
    setSplitBigPosition(bigPosition)
    liveUpdateScreen({ splitDirection: direction, splitBigPosition: bigPosition })
  }

  /** Writes the chosen transition style (fade/slide) straight to the persisted screen, live. */
  const handleTransitionStyleChange = (style: ScreenTransitionStyle) => {
    setTransitionStyle(style)
    liveUpdateScreen({ transitionStyle: style })
  }

  /** Nudges the divider a "Resize" arrow direction controls (for the screen's current arrangement) by 1%, live, checkpointed at the currently active stage — the exact same fields the display's own draggable dividers adjust, so the two stay in sync no matter which is used to resize. No-ops (button disabled) for a direction with no divider on that axis. */
  const handleNudgeRatio = (direction: ResizeDirection) => {
    if (!latestScreen) return
    const patch = nudgeRatio(latestScreen, direction, clampedActiveStage)
    if (patch) liveUpdateScreen(patch)
  }

  /** Toggles the live screensaver preview straight on the persisted screen — unlike `useScreensaver` itself (a plain field saved along with everything else on Submit), this needs to show up immediately on any open kiosk tab to actually be useful as a test. */
  const handleToggleTestScreensaver = () => {
    if (!latestScreen) return
    liveUpdateScreen({ screensaverTestActive: !latestScreen.screensaverTestActive })
  }

  /**
   * Returning from the whole-screen percentage scaler to the main form —
   * re-seeds the 4 slot fields from the freshest persisted data, since the
   * scaler writes straight into every slot's own content/color/text
   * sizes. Without this, the main form's own (now-stale) local slot state
   * would stomp those live writes the next time "Save" is clicked.
   */
  const closeGlobalTextSizeEditor = () => {
    setDirection(-1)
    const latest = screens.find((candidate) => candidate.screenID === screen?.screenID)
    if (latest) {
      setSlot1(latest.slots[0])
      setSlot2(latest.slots[1])
      setSlot3(latest.slots[2])
      setSlot4(latest.slots[3])
    }
    setEditingTarget(null)
    onRouteChange?.(undefined)
  }

  /** Registers "a sub-view is open" as its own level of the shared browser-back stack (see `useBackLevel`) — closes via whichever function actually returns to the main tabbed form for the currently open one, since the "global" scaler's own close also re-seeds this form's local slot state (see `closeGlobalTextSizeEditor`) and every other sub-view's doesn't need that. The single Back button lives one level up, in `ScreensView`'s own header — not here. */
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
        <GlobalTextSizeScaler screen={latestScreen ?? screen} onChange={handleGlobalTextSizesChange} onDone={closeGlobalTextSizeEditor} />
      </div>
    )
  } else if (editingTarget === 'layout') {
    viewKey = 'layout'
    formContent = (
      <div className="screen-form__subview">
        <div className="screen-form__layout-picker">
          {[1, 2, 3, 4].map((count) => {
            const countLabel = count === 1 ? t('admin.screens.slotCountBadgeOne') : t('admin.screens.slotCountBadge', { count })
            return (
              <button
                key={count}
                type="button"
                aria-label={countLabel}
                title={countLabel}
                className={`screen-form__layout-option${slotCount === count ? ' screen-form__layout-option--active' : ''}`}
                onClick={() => handleSlotCountChange(count)}
              >
                <LayoutIcon pattern={SLOT_COUNT_PREVIEW_PATTERNS[count]} highlightIndex="all" />
              </button>
            )
          })}
        </div>
      </div>
    )
  } else if (editingTarget === 'background' && latestScreen) {
    viewKey = 'background'
    formContent = (
      <div className="screen-form__subview">
        <BackgroundEditor
          backgroundColor={latestScreen.backgroundColor ?? DEFAULT_SCREEN_BACKGROUND_COLOR}
          onBackgroundColorChange={handleScreenBackgroundColorChange}
          backgroundImage={latestScreen.backgroundImage}
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
  } else if (editingTarget === 'arrangement' && latestScreen && arrangementShowingBorders) {
    viewKey = 'arrangement-borders'
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
            backgroundColor={latestScreen?.borderColor}
            onChange={handleBorderColorChange}
            allowTransparent
            label={t('admin.screens.borderColorLabel')}
            transparentLabel={t('admin.screens.autoBorderColorLabel')}
          />
        )}
      </div>
    )
  } else if (editingTarget === 'arrangement' && latestScreen) {
    viewKey = 'arrangement'
    formContent = (
      <div className="screen-form__subview">
        {slotCount === 2 && (
          <div className="screen-form__field">
            <span>{t('admin.screens.splitDirectionLabel')}</span>
            <div className="screen-form__layout-picker">
              <button
                type="button"
                className={`screen-form__layout-option${splitDirection === 'row' ? ' screen-form__layout-option--active' : ''}`}
                onClick={() => handleSplitDirectionChange('row')}
                aria-label={t('admin.screens.splitDirectionRowLabel')}
                title={t('admin.screens.splitDirectionRowLabel')}
              >
                <LayoutIcon pattern="row" />
              </button>
              <button
                type="button"
                className={`screen-form__layout-option${splitDirection === 'column' ? ' screen-form__layout-option--active' : ''}`}
                onClick={() => handleSplitDirectionChange('column')}
                aria-label={t('admin.screens.splitDirectionColumnLabel')}
                title={t('admin.screens.splitDirectionColumnLabel')}
              >
                <LayoutIcon pattern="column" />
              </button>
            </div>
          </div>
        )}

        {slotCount === 3 && (
          <div className="screen-form__field">
            <span>{t('admin.screens.splitDirectionLabel')}</span>
            <div className="screen-form__layout-picker">
              {TRIPLE_ARRANGEMENTS.map(({ pattern, direction, bigPosition, labelKey }) => {
                const isActive = splitDirection === direction && splitBigPosition === bigPosition
                const label = t(`admin.screens.${labelKey}`)
                return (
                  <button
                    type="button"
                    key={pattern}
                    className={`screen-form__layout-option${isActive ? ' screen-form__layout-option--active' : ''}`}
                    onClick={() => handleTripleArrangementChange(direction, bigPosition)}
                    aria-label={label}
                    title={label}
                  >
                    <LayoutIcon pattern={pattern} />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="screen-form__field">
          <span>{t('admin.screens.resizeLabel')}</span>
        </div>
        {hasMultipleStages && <StageTabs stageCount={stageCount} activeStage={clampedActiveStage} onActiveStageChange={handleActiveStageChange} />}
        <div className="screen-form__resize-pad" role="group" aria-label={t('admin.screens.resizeLabel')}>
          <button
            type="button"
            className="screen-form__resize-arrow screen-form__resize-arrow--up"
            disabled={!nudgeRatio(latestScreen, 'up', clampedActiveStage)}
            onClick={() => handleNudgeRatio('up')}
            aria-label={t('admin.screens.resizeUpLabel')}
          >
            ▲
          </button>
          <button
            type="button"
            className="screen-form__resize-arrow screen-form__resize-arrow--left"
            disabled={!nudgeRatio(latestScreen, 'left', clampedActiveStage)}
            onClick={() => handleNudgeRatio('left')}
            aria-label={t('admin.screens.resizeLeftLabel')}
          >
            ◀
          </button>
          <button
            type="button"
            className="screen-form__resize-arrow screen-form__resize-arrow--right"
            disabled={!nudgeRatio(latestScreen, 'right', clampedActiveStage)}
            onClick={() => handleNudgeRatio('right')}
            aria-label={t('admin.screens.resizeRightLabel')}
          >
            ▶
          </button>
          <button
            type="button"
            className="screen-form__resize-arrow screen-form__resize-arrow--down"
            disabled={!nudgeRatio(latestScreen, 'down', clampedActiveStage)}
            onClick={() => handleNudgeRatio('down')}
            aria-label={t('admin.screens.resizeDownLabel')}
          >
            ▼
          </button>
        </div>

        <Button type="button" variant="secondary" onClick={openBordersWithinArrangement}>
          {t('admin.screens.bordersLabel')}
        </Button>
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
        screenID: screen?.screenID ?? `${Date.now()}`,
        name,
        slotCount,
        slots: [slot1, slot2, slot3, slot4],
        useStages,
        stageCount,
        slideDurationSeconds,
        transitionStyle,
        splitDirection,
        splitBigPosition,
        showSlotBorders,
        hideScrollbar,
        useScreensaver,
      })
    }

    viewKey = 'main'
    formContent = (
      <form className="screen-form" onSubmit={handleSubmit}>
        <div className="screen-form__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'global'}
            aria-label={t('admin.screens.globalTabLabel')}
            title={t('admin.screens.globalTabLabel')}
            className={`screen-form__tab screen-form__tab--icon${activeTab === 'global' ? ' screen-form__tab--active' : ''}`}
            onClick={() => handleSelectTab('global')}
          >
            <LayoutIcon pattern={arrangementPattern} highlightIndex="all" />
          </button>
          {slotFields.map(({ id, label, value }, index) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === index}
              aria-label={label}
              title={label}
              className={`screen-form__tab screen-form__tab--icon${activeTab === index ? ' screen-form__tab--active' : ''}${isSlotActive(value) ? ' screen-form__tab--filled' : ''}${index >= slotCount ? ' screen-form__tab--out-of-range' : ''}`}
              onClick={() => handleSelectTab(index)}
            >
              <LayoutIcon pattern={arrangementPattern} highlightIndex={index} />
            </button>
          ))}
        </div>

        <div className="screen-form__tab-panel">
          {activeTab === 'global' ? (
            <>
              <Input id="screen-name" label={t('admin.screens.nameLabel')} value={name} onChange={(event) => setName(event.target.value)} required />

              <motion.div layout>
                <Button type="button" variant="secondary" className="screen-form__menu-button" onClick={openLayoutEditor}>
                  {t('admin.screens.slotCountLabel')}
                  <span aria-hidden="true">→</span>
                </Button>
              </motion.div>

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

              {/* Fades and slides in/out as slotCount crosses 1 (`initial={false}` skips this on first mount, since it's not really "appearing"). Animating its own `height` (0 to/from its natural size, `layout` enables interpolating that "auto" value) — rather than just `opacity`/`y` — is what actually makes every field below it glide smoothly into its new position instead of snapping the instant this one's removed from the document flow; those fields only need `layout` themselves to pick up that progressive reflow. `overflow: hidden` keeps the button from spilling out while its own height is still animating. */}
              <AnimatePresence initial={false}>
                {slotCount > 1 && latestScreen && (
                  <motion.div
                    key="arrangement"
                    layout
                    initial={{ opacity: 0, y: -12, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -12, height: 0 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    style={{ overflow: 'hidden' }}
                  >
                    <Button type="button" variant="secondary" className="screen-form__menu-button" onClick={openArrangementEditor}>
                      {t('admin.screens.splitDirectionLabel')}
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
            </>
          ) : (
            activeSlot &&
            (() => {
              const content = resolveSlotContent(activeSlot.value, clampedActiveStage)
              const backgroundImage = resolveContentBackgroundImage(content, resolveSlotBackgroundImage(activeSlot.value, clampedActiveStage))
              const handlePaneRouteChange = (route: string | undefined) => {
                if (!route) {
                  onRouteChange?.(undefined)
                  return
                }
                const slotLabel = t('screenDisplay.textSizeEditor.slotLabel', { number: (activeTab as number) + 1 })
                const stagePart = hasMultipleStages ? ` - ${t('screenDisplay.textSizeEditor.stageTabLabel', { number: clampedActiveStage })}` : ''
                onRouteChange?.(`${slotLabel}${stagePart} - ${route}`)
              }
              return (
                <PaneEditor
                  id={activeSlot.id}
                  content={content}
                  onContentChange={handleContentChange}
                  backgroundColor={resolveSlotBackgroundColor(activeSlot.value, clampedActiveStage)}
                  onBackgroundColorChange={handleBackgroundColorChange}
                  backgroundImage={backgroundImage}
                  onBackgroundImageChange={handleBackgroundImageChange}
                  textSizes={liveTextSizes}
                  onTextSizesChange={handleLiveTextSizesChange}
                  language={resolveSlotLanguage(activeSlot.value, clampedActiveStage)}
                  onLanguageChange={handleLanguageChange}
                  defaultLanguage={defaultPaneLanguage}
                  useStages={useStages}
                  stageCount={stageCount}
                  activeStage={clampedActiveStage}
                  onActiveStageChange={handleActiveStageChange}
                  label={hasMultipleStages ? t('screenDisplay.textSizeEditor.stageTabLabel', { number: clampedActiveStage }) : activeSlot.label}
                  resizeToFitBlocked={isResizeToFitConflict(
                    slotFields.map((field) => field.value),
                    activeTab as number,
                    clampedActiveStage,
                  )}
                  suggestedEventOrdinal={
                    findSiblingEventOrdinal(
                      slotFields.filter((_, index) => index !== activeTab).map((field) => field.value),
                      clampedActiveStage,
                    ) ?? 1
                  }
                  onRouteChange={handlePaneRouteChange}
                  hideBackButton
                />
              )
            })()
          )}
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
