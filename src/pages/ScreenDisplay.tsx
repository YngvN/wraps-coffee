import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BackButton, Modal } from '../components'
import { BackgroundEditor } from '../features/screens/BackgroundEditor'
import { FullscreenToggle } from '../features/screens/FullscreenToggle'
import { GlobalTextSizeScaler, type SizeSnapshot } from '../features/screens/GlobalTextSizeScaler'
import { KeepEditPrompt, type SlotEditChanges } from '../features/screens/KeepEditPrompt'
import { LockIcon } from '../features/screens/LockIcon'
import { ScreenToolbar } from '../features/screens/ScreenToolbar'
import { SlotEditor } from '../features/screens/SlotEditor'
import { SplitLayout } from '../features/screens/SplitLayout'
import { StagePlaybackControls } from '../features/screens/StagePlaybackControls'
import { UnlockScreenModal } from '../features/screens/UnlockScreenModal'
import { useAdminSession } from '../hooks/useAdminSession'
import { useDefaultPaneLanguage } from '../hooks/useDefaultPaneLanguage'
import { useScreenLockPin } from '../hooks/useScreenLockPin'
import { useScreens } from '../hooks/useScreens'
import { useScreensaverSchedule } from '../hooks/useScreensaverSchedule'
import { useLanguage } from '../i18n'
import { reportError } from '../lib/errorNotifications'
import { deleteUpload, isOwnUploadUrl, SessionExpiredError, uploadImage } from '../lib/localServer'
import { DEFAULT_SCREEN_BACKGROUND_COLOR, DEFAULT_TEXT_SIZES, type BackgroundImage, type RatioField, type ScreenConfig, type ScreenSlot, type ScreenSlotContent, type TextSizes } from '../types/screen'
import { findSiblingEventOrdinal } from '../utils/eventOrdinals'
import { backgroundImageTextStyle, borderColorStyle, getScreenColorVars } from '../utils/screenColors'
import { applyRatioOverrides } from '../utils/screenLayout'
import { isWithinScreensaverWindow } from '../utils/screensaver'
import { hasOwnTextSizeFields, resolveContentBackgroundImage } from '../utils/screenSlots'
import {
  currentStage,
  isResizeToFitConflict,
  resolveSlotBackgroundColor,
  resolveSlotBackgroundImage,
  resolveSlotContent,
  resolveSlotLanguage,
  resolveSlotTextSizes,
  resolveStageValue,
  writeStageCheckpoint,
} from '../utils/screenStages'
import { resolveContentTextSizes, textSizesToCssVars } from '../utils/textSizeVars'
import './ScreenDisplay.scss'

/** A slot with no checkpoints yet — the starting draft before a slot's own data has been seeded in. */
const EMPTY_SLOT: ScreenSlot = { content: {}, backgroundColor: {}, backgroundImage: {}, textSizes: {} }

/** The fixed `KeepEditPrompt` change-summary for the pane-resize fallback prompt below — a divider drag only ever touches the arrangement's own ratios, never a slot's content/text size/background. */
const RESIZE_CHANGES: SlotEditChanges = { content: false, textSizes: false, backgroundColor: false, backgroundImage: false, language: false, layout: true }

/** Folds a stage's own live text-size draft into `slot`'s content timeline, at `stage` — used both when switching away from that stage (so its edits aren't lost) and when the whole editor closes. Only meaningful with more than one stage — with just one, editing "this pane" and editing "the slot's own shared size" are the same action (see `SlotEditor`'s own single-stage fallback), so this is a no-op. */
function flushStageTextSizeIntoSlot(slot: ScreenSlot, stage: number, textSizes: TextSizes, hasMultipleStages: boolean): ScreenSlot {
  if (!hasMultipleStages) return slot
  const content = resolveSlotContent(slot, stage)
  if (!hasOwnTextSizeFields(content)) return slot
  return { ...slot, content: writeStageCheckpoint(slot.content, stage, { ...content, textSizes }) }
}

/** A content checkpoint's own signature for change-detection, deliberately excluding `textSizes` — that field is tracked (and diffed) separately via the live `draftTextSizes`/`originalTextSizes` state, since it isn't folded into the content object itself until the editor actually closes (see `flushStageTextSizeIntoSlot`). */
function contentSignature(content: ScreenSlotContent): string {
  const withoutTextSizes = { ...content } as Record<string, unknown>
  delete withoutTextSizes.textSizes
  return JSON.stringify(withoutTextSizes)
}

/** Maps a screen's text sizes, background color, (if set) its own fixed border color, and (if its own whole-screen background image has a light/dark overlay) the contrast-forced text color that overlay picks, to the CSS custom properties the whole display (and, by inheritance, any slot without its own override) reads from. */
function screenAppearanceToCssVars(textSizes: TextSizes, backgroundColor: string, borderColor: string | undefined, backgroundImage: BackgroundImage | undefined): CSSProperties {
  return {
    ...textSizesToCssVars(textSizes),
    ...getScreenColorVars(backgroundColor),
    ...borderColorStyle(borderColor),
    ...backgroundImageTextStyle(backgroundImage?.overlay),
  } as CSSProperties
}

/** The persisted (non-live-draft) effective text sizes for a slot at a given stage: its own resolved override, else the screen's own, else the global default. Used both as the shared fallback for that stage's content and as what editing "the slot" (rather than one specific stage) reads/writes. */
function getPersistedSlotTextSizes(screen: ScreenConfig, slotIndex: number, stage: number): TextSizes {
  return resolveSlotTextSizes(screen.slots[slotIndex], stage) ?? screen.textSizes ?? DEFAULT_TEXT_SIZES
}

/** Which appearance settings are currently open for editing: the whole screen's defaults (incl. background color), one specific slot (by index), or nothing. */
type EditingTarget = 'screen' | { slotIndex: number } | null

/** A random spot for the "Screen saver test" label to sit at, kept well clear of the edges. */
function randomScreensaverTestLabelPosition(): { top: number; left: number } {
  return { top: 10 + Math.random() * 80, left: 10 + Math.random() * 80 }
}

/**
 * Fullscreen kiosk display for a single configured screen, reached at
 * `/screens/:screenId`. No site chrome. Looks up the screen live via
 * `useScreens()`, so admin edits (or the screen being deleted) made in
 * another tab of the same browser are reflected here without a refresh.
 *
 * Includes two in-place editing entry points, both live-previewed as you
 * make a change: the toolbar's "Edit appearance" button opens a
 * percentage-based scaler (`GlobalTextSizeScaler`) that grows/shrinks the
 * screen's default and every slot's own size (across every stage they
 * have) all together, relative to whatever each currently is — plus its
 * own "Background" button, opening a sub-view (`BackgroundEditor`) for the
 * screen's own overall background color and an optional whole-screen
 * background image (blurred and scaled to cover, same technique as a
 * slot's own — see `.screen-display__bg`), shown through any pane that
 * doesn't have its own background color/image (a slot's own individual
 * background is only editable from that slot's own editor, not here).
 * Unlike the scaler's own fields, both are always live, with no
 * draft/"restore previous" step. Hovering any individual pane instead
 * reveals a small "Edit slot" button covering that whole slot: once
 * `screen.useStages` is on and there's more than one stage, a stage-tab bar
 * (mirroring the admin dashboard's own one level deeper) lets the owner
 * jump between stages, each showing that slot's own content, background
 * color/image, and shared/fallback text size exactly as resolved at that
 * stage — editing any of them always writes a checkpoint at the stage
 * currently selected, independent of every other field's own timeline (see
 * `src/utils/screenStages.ts`). With `useStages` off (or only one stage),
 * the tab bar is hidden and the slot's fields are simply its one static
 * stage-1 checkpoint. Neither editor has a "Save" step — the in-progress
 * draft is written to the persisted screen as soon as it closes (whether
 * via its own "Done" button, the modal's × / Escape, or clicking outside
 * it), and a "Restore previous" button resets the draft back to the values
 * it had when the editor was opened. On a slot with more than one stage,
 * closing it after a real change instead shows `KeepEditPrompt` first — a
 * summary of what was touched (content, text size, background color/image)
 * plus the choice to keep it just for the stage being edited, overwrite
 * every later stage's own checkpoint for that same slot with it too, or
 * discard the whole session's edits outright (see `requestCloseEditor`).
 * While a slot's editor is open, the
 * whole live display (every pane, not just the one being edited, since
 * every slot shares the same stage sequence) freezes on whichever stage its
 * tab bar currently has selected, instead of continuing its natural
 * rotation, so the preview always shows exactly the stage being edited.
 *
 * The toolbar's "Lock screen" button (shown only once a PIN's been set from
 * the admin dashboard) collapses the whole toolbar down to a single lock
 * icon button — hiding the screen name, the stage indicator, the playback
 * transport, the fullscreen toggle, the "Edit appearance" button, and (via
 * `SplitLayout`) every pane's own hover-revealed edit button, its draggable
 * resize dividers, and dropping an image file onto a pane. Tapping that icon
 * opens `UnlockScreenModal` to ask for that same PIN before restoring all of
 * it. While locked, text/image selection, dragging and the right-click menu
 * are also disabled (`.screen-display--locked`), leaving scrolling as the
 * only thing still possible — and a `fullscreenchange` listener makes a
 * best-effort attempt to hop straight back into fullscreen if it's exited,
 * though it can't actually stop Escape from exiting in the first place; no
 * website can override that.
 *
 * A screen with its own "Use screensaver" checkbox on (only offered once a
 * shared daily window's been set from the admin dashboard's "Screen saver"
 * button — see `useScreensaverSchedule`) shows a solid black overlay, above
 * the slots but below the toolbar, for as long as the current time falls
 * within that window, or immediately regardless of the time while its own
 * "Test screensaver" button is toggled on. Both the checkbox and the test
 * button are also reachable from the toolbar's own "Edit appearance" panel,
 * live either way.
 */
export function ScreenDisplay() {
  const { t } = useLanguage()
  const { screenId } = useParams<{ screenId: string }>()
  const { session, clearSession } = useAdminSession()
  const [screens, setScreens] = useScreens()
  const [screensaverSchedule] = useScreensaverSchedule()
  const [defaultPaneLanguage] = useDefaultPaneLanguage()
  const screen = screens.find((candidate) => candidate.screenID === screenId)
  const [now, setNow] = useState(() => new Date())
  const [editingTarget, setEditingTarget] = useState<EditingTarget>(null)
  const [screenDraftSnapshot, setScreenDraftSnapshot] = useState<SizeSnapshot | null>(null)
  /** Whether the whole-screen editor is showing its own "Background" sub-view instead of the main percentage scaler — reset whenever the editor (re)opens. Background color/image are always live (see `handleScreenBackgroundColorChange`/`handleScreenBackgroundImageChange`), so unlike the scaler's own fields this has no draft/restore state of its own. */
  const [screenSubview, setScreenSubview] = useState<'background' | null>(null)
  const [draftSlot, setDraftSlot] = useState<ScreenSlot>(EMPTY_SLOT)
  const [originalSlot, setOriginalSlot] = useState<ScreenSlot>(EMPTY_SLOT)
  const [draftTextSizes, setDraftTextSizes] = useState<TextSizes>(DEFAULT_TEXT_SIZES)
  const [originalTextSizes, setOriginalTextSizes] = useState<TextSizes>(DEFAULT_TEXT_SIZES)
  /** The slot's own shared/fallback text sizes at the currently active stage — shown once a screen has more than one stage (see `SlotEditor`). */
  const [draftSlotTextSizes, setDraftSlotTextSizes] = useState<TextSizes>(DEFAULT_TEXT_SIZES)
  const [originalSlotTextSizes, setOriginalSlotTextSizes] = useState<TextSizes>(DEFAULT_TEXT_SIZES)
  /** Whether `KeepEditPrompt` is currently showing in place of `SlotEditor` — see `requestCloseEditor`. Reset to `false` every time a slot editor (re)opens. */
  const [showKeepEditPrompt, setShowKeepEditPrompt] = useState(false)
  /** `SlotEditor`'s own currently open sub-view (e.g. "Background"), reported via its `onRouteChange` — shown as the modal's own breadcrumb next to its title. Reset whenever a slot editor (re)opens. */
  const [slotEditorRoute, setSlotEditorRoute] = useState<string | undefined>(undefined)
  /** Which stage the slot editor's own tab bar currently has selected. */
  const [activeStage, setActiveStage] = useState(1)
  /** The stage the slot editor was opened on — what "Restore previous" returns the tab bar to. */
  const [initialStage, setInitialStage] = useState(1)
  /**
   * The screen's own arrangement ratios as they were right before the
   * currently-unresolved pane-resize "session" began — `undefined` means
   * there's nothing pending to ask about. Captured once, on the rising edge
   * of a divider drag (see `handleDragStateChange`), and cleared again once
   * `requestPendingResizeAction` has asked about (or found nothing to ask
   * about in) whatever's changed since. A divider drag has no modal step of
   * its own to catch this in the way the slot editor's session does, so this
   * is the fallback: the next time the owner steps to another stage or locks
   * the screen, `KeepEditPrompt` (see `RESIZE_CHANGES`) offers the same
   * "keep here / keep for next steps too / remove edits" choice for whatever
   * pane sizes were just dragged.
   */
  const [resizeSessionOriginalRatios, setResizeSessionOriginalRatios] = useState<ScreenConfig['ratios'] | undefined>(undefined)
  /** The next/previous-stage step or lock action waiting on the resize fallback prompt's own resolution — see `requestPendingResizeAction`. */
  const [pendingResizeAction, setPendingResizeAction] = useState<(() => void) | null>(null)
  const [pin] = useScreenLockPin()
  const [unlockModalOpen, setUnlockModalOpen] = useState(false)
  const [screensaverTestLabelPosition, setScreensaverTestLabelPosition] = useState(randomScreensaverTestLabelPosition)
  const [tick, setTick] = useState(0)
  /**
   * The toolbar's own play/pause toggle — independent of (and on top of)
   * the editor/unlock-modal pausing below, so the owner can freeze playback
   * for a moment without opening anything. Also force-set to `true` the
   * moment any editing interaction starts (`openScreenEditor`,
   * `openSlotEditor`, `handleDragStateChange`'s rising edge) — unlike
   * `editingTarget`/a divider drag, which only pause rotation for as long
   * as they're actually in progress, editing should stay paused once it's
   * *done* too, until the owner explicitly presses Play again, so the
   * screen doesn't leap to a different stage the moment an edit/drag ends.
   * Starts `true` — a freshly opened display (e.g. a kiosk device just
   * booting up and loading this page) sits on its first stage until someone
   * explicitly presses Play, rather than immediately cycling through
   * content unattended.
   */
  const [manuallyPaused, setManuallyPaused] = useState(true)
  /** The toolbar's own fast-forward toggle — while on, stages advance every 2 seconds instead of the screen's own configured `slideDurationSeconds`. */
  const [fastForward, setFastForward] = useState(false)

  const paused = editingTarget !== null || unlockModalOpen || manuallyPaused

  /** Advances the shared stage sequence, paused while any editor (or a divider drag, or the unlock modal, or the toolbar's own play/pause toggle) is open/active so the preview isn't pulled out from under it — mirrors the same rotation timer `SplitLayout` used to own directly, lifted up here so `ScreenToolbar`'s stage indicator and playback controls can read/drive the same clock. */
  useEffect(() => {
    if (paused || !screen?.useStages || (screen?.stageCount ?? 1) <= 1) return
    const timer = setInterval(() => setTick((current) => current + 1), fastForward ? 2000 : screen.slideDurationSeconds * 1000)
    return () => clearInterval(timer)
  }, [paused, screen?.useStages, screen?.stageCount, screen?.slideDurationSeconds, fastForward])

  /**
   * Best-effort attempt to keep a locked screen in fullscreen — if it gets
   * exited (e.g. via Escape) while still locked, immediately re-requests
   * it. This can't actually stop Escape from exiting fullscreen in the
   * first place — no website can override that, by design, as a browser
   * safety net for the user — so this only re-enters a moment later, and
   * even that isn't guaranteed: browsers require a fresh user gesture for
   * `requestFullscreen()`, which this `fullscreenchange` handler doesn't
   * have, so some browsers may silently refuse it.
   */
  useEffect(() => {
    if (!screen?.locked) return
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {})
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [screen?.locked])

  /** Keeps `now` fresh enough for the screensaver's own scheduled window to actually kick in (and end) without needing a refresh, without re-rendering every second for a check that's only ever precise to the minute. */
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(interval)
  }, [])

  /** While the screensaver's own "Test screensaver" button is on, periodically moves its "Screen saver test" label to a new random spot — same reasoning a real screensaver moves its content around, so nothing sits burned into one spot on the (probably otherwise idle) display for the whole test. */
  useEffect(() => {
    if (!screen?.screensaverTestActive) return
    const interval = setInterval(() => setScreensaverTestLabelPosition(randomScreensaverTestLabelPosition()), 4000)
    return () => clearInterval(interval)
  }, [screen?.screensaverTestActive])

  if (!screen) {
    return (
      <div className="screen-display screen-display--not-found" style={getScreenColorVars(DEFAULT_SCREEN_BACKGROUND_COLOR) as CSSProperties}>
        <h1>{t('screenDisplay.notFound.title')}</h1>
        <p>{t('screenDisplay.notFound.message')}</p>
      </div>
    )
  }

  const stage = currentStage(tick, screen)

  const activeTextSizes = editingTarget === 'screen' && screenDraftSnapshot ? screenDraftSnapshot.textSizes : (screen.textSizes ?? DEFAULT_TEXT_SIZES)

  /** The screen as it should currently render: the slot being edited (if any) swapped for its live draft, so content/color changes preview immediately, same as text-size changes already do. */
  const effectiveScreen: ScreenConfig =
    typeof editingTarget === 'object' && editingTarget !== null
      ? { ...screen, slots: screen.slots.map((slot, index) => (index === editingTarget.slotIndex ? draftSlot : slot)) as ScreenConfig['slots'] }
      : screen

  /** While a slot's editor is open, forces the *whole* display (every pane, not just the one being edited — every slot shares the same stage sequence) to the stage its own tab bar currently has selected, instead of letting it keep naturally rotating. */
  const forcedStage = typeof editingTarget === 'object' && editingTarget !== null ? activeStage : undefined

  /** Whether the slot currently being edited has more than one stage — the deciding factor for whether a text-size edit goes to that stage's own content (`draftTextSizes`) or the slot's shared/fallback size (`draftSlotTextSizes`), both while editing (see `resolveTextSizes` below) and in `SlotEditor` itself. */
  const hasMultipleStages = typeof editingTarget === 'object' && editingTarget !== null && Boolean(screen.useStages) && (screen.stageCount ?? 1) > 1

  /**
   * Resolves the sizes a given slot should render with right now, at
   * `stage`. While editing this exact slot: the live draft —
   * `draftTextSizes` with more than one stage (matching exactly which one
   * `SlotEditor`'s slider is bound to), else `draftSlotTextSizes`. While the
   * whole screen is being edited: the percentage scaler's own resolved
   * value for this exact slot/stage. Otherwise: its own persisted value if
   * it has one at this stage, else the slot's persisted effective value.
   */
  const resolveTextSizes = (slotIndex: number, stage: number, content: ScreenSlotContent): TextSizes => {
    const isEditingThisSlot = typeof editingTarget === 'object' && editingTarget !== null && editingTarget.slotIndex === slotIndex
    if (isEditingThisSlot) return hasMultipleStages ? draftTextSizes : draftSlotTextSizes

    if (editingTarget === 'screen' && screenDraftSnapshot) {
      const draftSlotSnapshot = screenDraftSnapshot.slots[slotIndex]
      const draftContent = resolveSlotContent(draftSlotSnapshot, stage)
      return resolveContentTextSizes(draftContent, resolveSlotTextSizes(draftSlotSnapshot, stage) ?? screenDraftSnapshot.textSizes)
    }

    return resolveContentTextSizes(content, getPersistedSlotTextSizes(screen, slotIndex, stage))
  }

  const openScreenEditor = () => {
    setScreenDraftSnapshot(null)
    setScreenSubview(null)
    setEditingTarget('screen')
    setManuallyPaused(true)
  }

  const openSlotEditor = (slotIndex: number) => {
    const slot = screen.slots[slotIndex] ?? EMPTY_SLOT
    const openStage = stage
    const content = resolveSlotContent(slot, openStage)
    const sharedTextSizes = getPersistedSlotTextSizes(screen, slotIndex, openStage)
    const effective = resolveContentTextSizes(content, sharedTextSizes)
    setDraftSlot(slot)
    setOriginalSlot(slot)
    setDraftTextSizes(effective)
    setOriginalTextSizes(effective)
    setDraftSlotTextSizes(sharedTextSizes)
    setOriginalSlotTextSizes(sharedTextSizes)
    setActiveStage(openStage)
    setInitialStage(openStage)
    setShowKeepEditPrompt(false)
    setSlotEditorRoute(undefined)
    setEditingTarget({ slotIndex })
    setManuallyPaused(true)
  }

  /**
   * A divider drag starting also counts as "editing the screen" for pause
   * purposes (see `paused`) — only the rising edge forces a pause; the
   * falling edge (drag finished) deliberately leaves it paused, same as
   * closing an editor, until the toolbar's own Play is pressed. The rising
   * edge also seeds `resizeSessionOriginalRatios`, but only if nothing's
   * already pending — a second drag before the owner has navigated away (and
   * so been asked about the first one) extends the same session rather than
   * resetting its "before" snapshot.
   */
  const handleDragStateChange = (isDragging: boolean) => {
    if (!isDragging) return
    setManuallyPaused(true)
    setResizeSessionOriginalRatios((current) => current ?? screen.ratios)
  }

  /**
   * Switches which stage the slot editor's tab bar has selected. First
   * folds whatever the currently active stage's own draft text-size holds
   * into `draftSlot`'s content timeline, *and* the shared/fallback draft
   * into that same stage's own `textSizes` checkpoint — both independent
   * timelines, both need flushing, or whichever one wasn't currently bound
   * to the visible slider (see `SlotEditor`'s own single-vs-multi-stage
   * branch) would otherwise sit edited only in this component's local
   * state, never actually reaching `draftSlot`, and so get silently
   * dropped the next time the stage is switched again before the editor
   * closes. Only then reseeds the live draft for the stage being switched
   * to, against the slot's own (possibly just-flushed) values there.
   */
  const handleActiveStageChange = (nextStage: number) => {
    const flushedSlot = flushStageTextSizeIntoSlot(draftSlot, activeStage, draftTextSizes, hasMultipleStages)
    const flushedSlotWithSharedSize: ScreenSlot = { ...flushedSlot, textSizes: writeStageCheckpoint(flushedSlot.textSizes, activeStage, draftSlotTextSizes) }
    if (flushedSlotWithSharedSize !== draftSlot) setDraftSlot(flushedSlotWithSharedSize)

    const content = resolveSlotContent(flushedSlotWithSharedSize, nextStage)
    const sharedTextSizes = resolveSlotTextSizes(flushedSlotWithSharedSize, nextStage) ?? screen.textSizes ?? DEFAULT_TEXT_SIZES
    setDraftTextSizes(resolveContentTextSizes(content, sharedTextSizes))
    setDraftSlotTextSizes(sharedTextSizes)
    setActiveStage(nextStage)
  }

  /** Jumps the shared stage sequence straight to `targetStage`, dragged from the toolbar's own scrubber — sets `tick` to whichever value resolves to exactly that stage (see `currentStage`), so it snaps into position instantly regardless of where the natural rotation currently is. If playback is running, the timer just keeps advancing from here next; scrubbing doesn't itself start or stop it. Deliberately ungated by `requestPendingResizeAction` — a continuous scrubber drag firing that check on every step it passes through would interrupt the drag itself; the previous/next-stage buttons (`handleStepStage`) get the check instead, since those are the discrete "I'm done with this stage" gesture. */
  const handleScrubToStage = (targetStage: number) => setTick(targetStage - 1)

  /** The previous/next-stage button pair's own discrete jump — same destination as `handleScrubToStage`, but routed through `requestPendingResizeAction` first, since clicking away from a stage is exactly the moment an unresolved pane resize on it should be asked about. */
  const handleStepStage = (targetStage: number) => requestPendingResizeAction(() => setTick(targetStage - 1))

  /** A divider's new position, dragged right on this display — applies (and persists) immediately, mirroring the admin dashboard's own arrow-nudge "Resize" panel writing to the very same fields. The screen's shared rotation timer (seconds per step) is edited from that same admin dashboard's own "Steps" panel, not from this display. */
  const handleResizeDivider = (patch: Partial<ScreenConfig>) => {
    setScreens(screens.map((existing) => (existing.screenID === screen.screenID ? { ...existing, ...patch } : existing)))
  }

  /**
   * A file dropped directly onto a pane (see `SplitLayout`'s own
   * `onDropImage`) — uploads it and sets that slot's content straight to
   * the result at `fit: 'cover'` (a drag-and-drop is a "fill this pane"
   * gesture, unlike the slot editor's own image field, which defaults to
   * `'contain'`), applied and persisted immediately, same as
   * `handleResizeDivider`. Targets whichever stage is currently being
   * shown/edited (`forcedStage ?? stage`), same rule every other direct
   * pane edit already follows. Requires a logged-in admin session in this
   * same browser (uploads are authenticated — see `ImageUploadField`, which
   * this mirrors); reports a toast instead of silently doing nothing when
   * there isn't one, since a drop is a much more deliberate action than a
   * field simply being disabled.
   */
  const handleDropImage = async (slotIndex: number, file: File) => {
    if (!session) {
      reportError(t('imageUpload.noSession'))
      return
    }

    const targetStage = forcedStage ?? stage
    const slot = screen.slots[slotIndex] ?? EMPTY_SLOT
    const previousContent = resolveSlotContent(slot, targetStage)

    try {
      const imageUrl = await uploadImage(file, session.token)
      const nextContent: ScreenSlotContent = { kind: 'image', imageUrl, fit: 'cover' }
      const nextSlot: ScreenSlot = { ...slot, content: writeStageCheckpoint(slot.content, targetStage, nextContent) }
      setScreens(
        screens.map((existing) =>
          existing.screenID === screen.screenID
            ? { ...existing, slots: existing.slots.map((existingSlot, index) => (index === slotIndex ? nextSlot : existingSlot)) as ScreenConfig['slots'] }
            : existing,
        ),
      )
      if (previousContent.kind === 'image' && previousContent.imageUrl && isOwnUploadUrl(previousContent.imageUrl)) void deleteUpload(previousContent.imageUrl, session.token)
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        reportError(t('imageUpload.sessionExpired'))
        clearSession()
      } else {
        reportError(error instanceof Error ? error.message : t('imageUpload.error'))
      }
    }
  }

  /**
   * Runs `action` immediately if there's no unresolved pane-resize edit to
   * ask about (see `resizeSessionOriginalRatios`), else stashes it and shows
   * the resize fallback prompt first — the same "ask before leaving an edit
   * behind" safety net the slot editor's own session already has via
   * `requestCloseEditor`, but for a divider drag made directly on the live
   * view, which has no modal step of its own to normally catch it in. Used
   * by both `handleStepStage` and `handleLockScreen`. Only actually asks on
   * a screen with more than one stage — with just one, "keep for next
   * step(s) too" is meaningless (there's nothing to propagate to), and a
   * divider drag has already fully persisted the moment it was released
   * either way.
   */
  const requestPendingResizeAction = (action: () => void) => {
    const screenHasMultipleStages = Boolean(screen.useStages) && (screen.stageCount ?? 1) > 1
    if (screenHasMultipleStages && resizeSessionOriginalRatios !== undefined && JSON.stringify(resizeSessionOriginalRatios) !== JSON.stringify(screen.ratios)) {
      setPendingResizeAction(() => action)
      return
    }
    setResizeSessionOriginalRatios(undefined)
    action()
  }

  /** The resize fallback prompt's own "keep here only" — nothing further to persist, since a divider drag already writes straight to the active stage's own ratio checkpoint the moment it's released; just clears the pending session and runs whatever navigation/lock action was waiting on it. */
  const resolveResizeKeepHere = () => {
    setResizeSessionOriginalRatios(undefined)
    const proceed = pendingResizeAction
    setPendingResizeAction(null)
    proceed?.()
  }

  /** The resize fallback prompt's own "keep for next step(s) too" — propagates every ratio field whose value at the current stage differs from `resizeSessionOriginalRatios` forward onto every later stage's own checkpoint, same idea as `handleKeepForNextSteps`, but for the arrangement's dividers instead of one pane's own content/background/text size. */
  const resolveResizeKeepForNextSteps = () => {
    if (resizeSessionOriginalRatios === undefined) return
    const changedFields = (Object.keys(screen.ratios ?? {}) as RatioField[]).filter(
      (field) => resolveStageValue(screen.ratios?.[field], stage) !== resolveStageValue(resizeSessionOriginalRatios[field], stage),
    )
    let nextRatios = screen.ratios
    for (const field of changedFields) {
      const value = resolveStageValue(screen.ratios?.[field], stage)
      if (value === undefined) continue
      for (let futureStage = stage + 1; futureStage <= (screen.stageCount ?? 1); futureStage++) {
        nextRatios = applyRatioOverrides(nextRatios, futureStage, { [field]: value })
      }
    }
    setScreens(screens.map((existing) => (existing.screenID === screen.screenID ? { ...existing, ratios: nextRatios } : existing)))
    setResizeSessionOriginalRatios(undefined)
    const proceed = pendingResizeAction
    setPendingResizeAction(null)
    proceed?.()
  }

  /** The resize fallback prompt's own "remove edits" — reverts the screen's ratios back to `resizeSessionOriginalRatios`, undoing every divider drag made this session, then runs whatever navigation/lock action was waiting on it. */
  const resolveResizeRemoveEdits = () => {
    if (resizeSessionOriginalRatios !== undefined) {
      setScreens(screens.map((existing) => (existing.screenID === screen.screenID ? { ...existing, ratios: resizeSessionOriginalRatios } : existing)))
    }
    setResizeSessionOriginalRatios(undefined)
    const proceed = pendingResizeAction
    setPendingResizeAction(null)
    proceed?.()
  }

  /** Hides this screen's own editing controls behind the shared PIN — only offered once one's actually been set from the admin dashboard, since there'd otherwise be no way back in. Routed through `requestPendingResizeAction` first, same reasoning as `handleStepStage`: locking is another way of stepping away from whatever stage a pane was just resized on. */
  const handleLockScreen = () => {
    requestPendingResizeAction(() => {
      setScreens(screens.map((existing) => (existing.screenID === screen.screenID ? { ...existing, locked: true } : existing)))
    })
  }

  /** Restores this screen's own editing controls, once `UnlockScreenModal` confirms the right PIN was entered. */
  const handleUnlock = () => {
    setScreens(screens.map((existing) => (existing.screenID === screen.screenID ? { ...existing, locked: false } : existing)))
    setUnlockModalOpen(false)
  }

  /** Toggles this screen's own opt-in to the shared screensaver schedule — live, same as `handleResizeDivider`, so it's reflected instantly on any other open tab of this same screen. */
  const handleUseScreensaverChange = (useScreensaver: boolean) => {
    setScreens(screens.map((existing) => (existing.screenID === screen.screenID ? { ...existing, useScreensaver } : existing)))
  }

  /** Toggles the live screensaver preview, independent of the actual schedule — see `ScreenConfig.screensaverTestActive`. */
  const handleTestScreensaverChange = (screensaverTestActive: boolean) => {
    setScreens(screens.map((existing) => (existing.screenID === screen.screenID ? { ...existing, screensaverTestActive } : existing)))
  }

  /** Writes the screen's own background color straight to the persisted screen, live — no draft/restore step, unlike the whole-screen scaler's own fields. */
  const handleScreenBackgroundColorChange = (backgroundColor: string) => {
    setScreens(screens.map((existing) => (existing.screenID === screen.screenID ? { ...existing, backgroundColor } : existing)))
  }

  /** Writes the screen's own whole-screen background image straight to the persisted screen, live — same reasoning as `handleScreenBackgroundColorChange`. */
  const handleScreenBackgroundImageChange = (backgroundImage: BackgroundImage | undefined) => {
    setScreens(screens.map((existing) => (existing.screenID === screen.screenID ? { ...existing, backgroundImage } : existing)))
  }

  /** Resets the slot (content/color), its text-size drafts, and which stage tab is active back to the values captured when the editor was opened — the actual persisting still only happens once the editor closes. The whole-screen scaler restores itself internally. */
  const handleRestore = () => {
    setDraftSlot(originalSlot)
    setDraftTextSizes(originalTextSizes)
    setDraftSlotTextSizes(originalSlotTextSizes)
    setActiveStage(initialStage)
  }

  /** The slot as it should be persisted right now: the active stage's own live text-size draft folded into its content checkpoint (when there's more than one stage) and into the slot's own shared/fallback checkpoint unconditionally — the same "fold in the active stage" step `handleActiveStageChange` also does before switching away. */
  const finalizeDraftSlot = (): ScreenSlot => {
    const flushedSlot = flushStageTextSizeIntoSlot(draftSlot, activeStage, draftTextSizes, hasMultipleStages)
    return { ...flushedSlot, textSizes: writeStageCheckpoint(flushedSlot.textSizes, activeStage, draftSlotTextSizes) }
  }

  /** A slot's own single consolidated background image at a stage — the content's own override if it has one, else the slot's shared one — same resolution `PaneEditor`'s own `backgroundImage` prop is fed everywhere else. */
  const effectiveBackgroundImage = (slot: ScreenSlot, atStage: number) => resolveContentBackgroundImage(resolveSlotContent(slot, atStage), resolveSlotBackgroundImage(slot, atStage))

  /** Compares `originalSlot`/`draftSlot` at the currently active stage (plus the separately-tracked text-size drafts) into a plain-language summary of what this editing session actually touched — drives `KeepEditPrompt`, and gates whether `requestCloseEditor` shows it at all (nothing to report means nothing to ask about). */
  const detectSlotEditChanges = (): SlotEditChanges => ({
    content: contentSignature(resolveSlotContent(originalSlot, activeStage)) !== contentSignature(resolveSlotContent(draftSlot, activeStage)),
    textSizes: JSON.stringify(originalTextSizes) !== JSON.stringify(draftTextSizes),
    backgroundColor: resolveSlotBackgroundColor(originalSlot, activeStage) !== resolveSlotBackgroundColor(draftSlot, activeStage),
    backgroundImage: JSON.stringify(effectiveBackgroundImage(originalSlot, activeStage)) !== JSON.stringify(effectiveBackgroundImage(draftSlot, activeStage)),
    language: resolveSlotLanguage(originalSlot, activeStage) !== resolveSlotLanguage(draftSlot, activeStage),
    layout: false,
  })

  /** Persists whatever the draft currently holds — just the active stage's own checkpoint — then closes the editor. Also what `KeepEditPrompt`'s own "keep here only" resolves to. */
  const closeEditor = () => {
    setScreens(
      screens.map((existing) => {
        if (existing.screenID !== screen.screenID) return existing
        if (editingTarget === 'screen') {
          if (!screenDraftSnapshot) return existing
          return { ...existing, textSizes: screenDraftSnapshot.textSizes, slots: screenDraftSnapshot.slots }
        }
        if (editingTarget) {
          const { slotIndex } = editingTarget
          const slots = existing.slots.map((slot, index) => (index === slotIndex ? finalizeDraftSlot() : slot)) as ScreenConfig['slots']
          return { ...existing, slots }
        }
        return existing
      }),
    )
    setEditingTarget(null)
    setShowKeepEditPrompt(false)
  }

  /**
   * What every way the slot editor's modal can exit (its own "Done"
   * button, ×, Escape, clicking outside it) is actually wired to now. With
   * more than one stage and at least one real change to report, shows
   * `KeepEditPrompt` instead of closing outright. Dismissing the prompt
   * itself (its own ×/Escape/outside-click) falls through to `closeEditor`
   * — the same "keep here only" outcome closing always had before this
   * prompt existed — so a stray dismissal never silently discards work.
   * The whole-screen editor, a single-stage screen, and an edit-free
   * session all skip the prompt and close straight away, same as before.
   */
  const requestCloseEditor = () => {
    if (showKeepEditPrompt) {
      closeEditor()
      return
    }
    if (typeof editingTarget === 'object' && editingTarget !== null && hasMultipleStages && Object.values(detectSlotEditChanges()).some(Boolean)) {
      setShowKeepEditPrompt(true)
      return
    }
    closeEditor()
  }

  /**
   * `KeepEditPrompt`'s own "keep for next step(s) too" — persists the active
   * stage's edit same as `closeEditor`, then overwrites every later stage's
   * own checkpoint for this exact slot (content, its text size, background
   * color, language override) with that identical, just-edited result.
   * Background image isn't propagated separately — with more than one stage
   * (the only case this ever runs in), `PaneEditor`'s single consolidated
   * picker always writes it onto `content` (see `SlotEditor`'s own
   * `setBackgroundImage`), so the `content` propagation below already
   * carries it forward, same as text size needs no propagation line of its
   * own here.
   */
  const handleKeepForNextSteps = () => {
    if (typeof editingTarget !== 'object' || editingTarget === null) return
    const { slotIndex } = editingTarget
    const finalSlot = finalizeDraftSlot()
    const contentAtStage = resolveSlotContent(finalSlot, activeStage)
    const backgroundColorAtStage = resolveSlotBackgroundColor(finalSlot, activeStage)
    const languageAtStage = resolveSlotLanguage(finalSlot, activeStage)

    let propagatedSlot = finalSlot
    for (let futureStage = activeStage + 1; futureStage <= (screen.stageCount ?? 1); futureStage++) {
      propagatedSlot = {
        ...propagatedSlot,
        content: writeStageCheckpoint(propagatedSlot.content, futureStage, contentAtStage),
        backgroundColor: writeStageCheckpoint(propagatedSlot.backgroundColor, futureStage, backgroundColorAtStage),
        language: writeStageCheckpoint(propagatedSlot.language, futureStage, languageAtStage),
      }
    }

    setScreens(
      screens.map((existing) =>
        existing.screenID === screen.screenID
          ? { ...existing, slots: existing.slots.map((slot, index) => (index === slotIndex ? propagatedSlot : slot)) as ScreenConfig['slots'] }
          : existing,
      ),
    )
    setEditingTarget(null)
    setShowKeepEditPrompt(false)
  }

  /** `KeepEditPrompt`'s own "remove edits" — discards every change made this editing session. Unlike `closeEditor`, never writes anything back, since the persisted screen already matches `originalSlot`. */
  const handleRemoveEdits = () => {
    setEditingTarget(null)
    setShowKeepEditPrompt(false)
  }

  const resizeToFitBlocked = typeof editingTarget === 'object' && editingTarget !== null && isResizeToFitConflict(screen.slots, editingTarget.slotIndex, activeStage)

  /** What a fresh switch to "Event image"/"Event details" in the currently open slot editor should default its own `eventOrdinal` to — see `findSiblingEventOrdinal`. */
  const suggestedEventOrdinal =
    typeof editingTarget === 'object' && editingTarget !== null
      ? (findSiblingEventOrdinal(
          screen.slots.filter((_, index) => index !== editingTarget.slotIndex),
          activeStage,
        ) ?? 1)
      : 1

  const screensaverActive = Boolean(screen.useScreensaver && (screen.screensaverTestActive || isWithinScreensaverWindow(screensaverSchedule, now)))

  return (
    <div
      className={`screen-display${screen.hideScrollbar ? ' screen-display--hide-scrollbar' : ''}${screen.locked ? ' screen-display--locked' : ''}`}
      style={screenAppearanceToCssVars(activeTextSizes, screen.backgroundColor ?? DEFAULT_SCREEN_BACKGROUND_COLOR, screen.borderColor, screen.backgroundImage)}
      onContextMenu={(event) => screen.locked && event.preventDefault()}
    >
      {screen.backgroundImage && (
        <div className="screen-display__bg">
          <div className="screen-display__bg-image" style={{ backgroundImage: `url(${screen.backgroundImage.imageUrl})` }} />
          {screen.backgroundImage.overlay !== 'none' && <div className={`screen-display__bg-overlay screen-display__bg-overlay--${screen.backgroundImage.overlay}`} />}
        </div>
      )}
      <ScreenToolbar>
        {!screen.locked && (
          <>
            <span className="screen-toolbar__label">{screen.name}</span>
            {screen.useStages && (screen.stageCount ?? 1) > 1 && (
              <>
                <span className="screen-toolbar__label screen-toolbar__label--stage">
                  {t('screenDisplay.stageIndicator', { current: forcedStage ?? stage, total: screen.stageCount ?? 1 })}
                </span>
                <StagePlaybackControls
                  stageCount={screen.stageCount ?? 1}
                  stage={forcedStage ?? stage}
                  onScrub={handleScrubToStage}
                  onStep={handleStepStage}
                  playing={!manuallyPaused}
                  onTogglePlaying={() => setManuallyPaused((current) => !current)}
                  fastForward={fastForward}
                  onToggleFastForward={() => setFastForward((current) => !current)}
                  disabled={editingTarget !== null || unlockModalOpen}
                />
              </>
            )}
            <FullscreenToggle />
            <button type="button" className="screen-toolbar__button" onClick={openScreenEditor}>
              {t('screenDisplay.editSizes')}
            </button>
          </>
        )}
        {screen.locked ? (
          <button
            type="button"
            className="screen-toolbar__button screen-toolbar__button--icon"
            onClick={() => setUnlockModalOpen(true)}
            aria-label={t('screenDisplay.lock.unlockButton')}
            title={t('screenDisplay.lock.unlockButton')}
          >
            <LockIcon />
          </button>
        ) : (
          pin && (
            <button type="button" className="screen-toolbar__button" onClick={handleLockScreen}>
              {t('screenDisplay.lock.lockButton')}
            </button>
          )
        )}
      </ScreenToolbar>
      <SplitLayout
        key={screen.screenID}
        screen={effectiveScreen}
        resolveTextSizes={resolveTextSizes}
        onEditSlide={screen.locked ? undefined : openSlotEditor}
        stage={stage}
        forcedStage={forcedStage}
        onResizeDivider={screen.locked ? undefined : handleResizeDivider}
        onDragStateChange={handleDragStateChange}
        onDropImage={screen.locked ? undefined : handleDropImage}
        defaultPaneLanguage={defaultPaneLanguage}
      />

      {screensaverActive && (
        <div className="screen-display__screensaver">
          {screen.screensaverTestActive && (
            <span
              className="screen-display__screensaver-test-label"
              style={{ top: `${screensaverTestLabelPosition.top}%`, left: `${screensaverTestLabelPosition.left}%` }}
            >
              {t('screenDisplay.screensaverTestLabel')}
            </span>
          )}
        </div>
      )}

      <UnlockScreenModal open={unlockModalOpen} onClose={() => setUnlockModalOpen(false)} onUnlock={handleUnlock} />

      <Modal open={pendingResizeAction !== null} onClose={resolveResizeKeepHere} title={t('screenDisplay.keepEditPrompt.title')}>
        <KeepEditPrompt changes={RESIZE_CHANGES} onKeepHere={resolveResizeKeepHere} onKeepForNextSteps={resolveResizeKeepForNextSteps} onRemoveEdits={resolveResizeRemoveEdits} />
      </Modal>

      <Modal
        open={editingTarget !== null}
        onClose={requestCloseEditor}
        title={
          editingTarget === 'screen'
            ? t('screenDisplay.textSizeEditor.title')
            : showKeepEditPrompt
              ? t('screenDisplay.keepEditPrompt.title')
              : t('screenDisplay.slotEditorTitle')
        }
        route={
          editingTarget === 'screen'
            ? screenSubview === 'background'
              ? t('admin.screens.backgroundLabel')
              : undefined
            : typeof editingTarget === 'object' && editingTarget !== null && !showKeepEditPrompt
              ? slotEditorRoute
              : undefined
        }
      >
        {editingTarget === 'screen' ? (
          screenSubview === 'background' ? (
            <>
              <BackButton onClick={() => setScreenSubview(null)}>{t('admin.common.back')}</BackButton>
              <BackgroundEditor
                backgroundColor={screen.backgroundColor ?? DEFAULT_SCREEN_BACKGROUND_COLOR}
                onBackgroundColorChange={handleScreenBackgroundColorChange}
                backgroundImage={screen.backgroundImage}
                onBackgroundImageChange={handleScreenBackgroundImageChange}
              />
            </>
          ) : (
            <GlobalTextSizeScaler
              screen={screen}
              onChange={setScreenDraftSnapshot}
              screensaver={
                screensaverSchedule
                  ? {
                      enabled: screen.useScreensaver ?? false,
                      onEnabledChange: handleUseScreensaverChange,
                      testActive: screen.screensaverTestActive ?? false,
                      onTestActiveChange: handleTestScreensaverChange,
                    }
                  : undefined
              }
              onOpenBackground={() => setScreenSubview('background')}
              onDone={requestCloseEditor}
            />
          )
        ) : showKeepEditPrompt ? (
          <KeepEditPrompt
            changes={detectSlotEditChanges()}
            onKeepHere={closeEditor}
            onKeepForNextSteps={handleKeepForNextSteps}
            onRemoveEdits={handleRemoveEdits}
          />
        ) : (
          <SlotEditor
            id={typeof editingTarget === 'object' && editingTarget !== null ? `slot-${editingTarget.slotIndex}` : 'slot'}
            slot={draftSlot}
            onSlotChange={setDraftSlot}
            useStages={Boolean(screen.useStages)}
            stageCount={screen.stageCount ?? 1}
            activeStage={activeStage}
            onActiveStageChange={handleActiveStageChange}
            textSizes={draftTextSizes}
            onTextSizesChange={setDraftTextSizes}
            slotTextSizes={draftSlotTextSizes}
            onSlotTextSizesChange={setDraftSlotTextSizes}
            resizeToFitBlocked={resizeToFitBlocked}
            suggestedEventOrdinal={suggestedEventOrdinal}
            defaultLanguage={defaultPaneLanguage}
            onRouteChange={setSlotEditorRoute}
            onRestore={handleRestore}
            onDone={requestCloseEditor}
          />
        )}
      </Modal>
    </div>
  )
}
