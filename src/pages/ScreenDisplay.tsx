import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BackButton, Modal } from '../components'
import { BackgroundEditor } from '../features/screens/BackgroundEditor'
import { FullscreenToggle } from '../features/screens/FullscreenToggle'
import { GlobalTextSizeScaler, type SizeSnapshot } from '../features/screens/GlobalTextSizeScaler'
import { LockIcon } from '../features/screens/LockIcon'
import { ScreenToolbar } from '../features/screens/ScreenToolbar'
import { SlotEditor } from '../features/screens/SlotEditor'
import { SplitLayout } from '../features/screens/SplitLayout'
import { StagePlaybackControls } from '../features/screens/StagePlaybackControls'
import { UnlockScreenModal } from '../features/screens/UnlockScreenModal'
import { useScreenLockPin } from '../hooks/useScreenLockPin'
import { useScreens } from '../hooks/useScreens'
import { useScreensaverSchedule } from '../hooks/useScreensaverSchedule'
import { useLanguage } from '../i18n'
import { DEFAULT_SCREEN_BACKGROUND_COLOR, DEFAULT_TEXT_SIZES, type BackgroundImage, type ScreenConfig, type ScreenSlot, type ScreenSlotContent, type TextSizes } from '../types/screen'
import { backgroundImageTextStyle, borderColorStyle, getScreenColorVars } from '../utils/screenColors'
import { isWithinScreensaverWindow } from '../utils/screensaver'
import { hasOwnTextSizeFields } from '../utils/screenSlots'
import { currentStage, isResizeToFitConflict, resolveSlotContent, resolveSlotTextSizes, writeStageCheckpoint } from '../utils/screenStages'
import { resolveContentTextSizes, textSizesToCssVars } from '../utils/textSizeVars'
import './ScreenDisplay.scss'

/** A slot with no checkpoints yet — the starting draft before a slot's own data has been seeded in. */
const EMPTY_SLOT: ScreenSlot = { content: {}, backgroundColor: {}, backgroundImage: {}, textSizes: {} }

/** Folds a stage's own live text-size draft into `slot`'s content timeline, at `stage` — used both when switching away from that stage (so its edits aren't lost) and when the whole editor closes. */
function flushStageTextSizeIntoSlot(slot: ScreenSlot, stage: number, textSizes: TextSizes, useOwn: boolean): ScreenSlot {
  const content = resolveSlotContent(slot, stage)
  if (!hasOwnTextSizeFields(content)) return slot
  const updatedContent = useOwn ? { ...content, useOwnTextSizes: true, textSizes } : { ...content, useOwnTextSizes: false }
  return { ...slot, content: writeStageCheckpoint(slot.content, stage, updatedContent) }
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
 * it had when the editor was opened. While a slot's editor is open, the
 * whole live display (every pane, not just the one being edited, since
 * every slot shares the same stage sequence) freezes on whichever stage its
 * tab bar currently has selected, instead of continuing its natural
 * rotation, so the preview always shows exactly the stage being edited.
 *
 * The toolbar's "Lock screen" button (shown only once a PIN's been set from
 * the admin dashboard) collapses the whole toolbar down to a single lock
 * icon button — hiding the screen name, the stage indicator, the
 * fullscreen toggle, the "Edit appearance" button, and (via `SplitLayout`)
 * every pane's own hover-revealed edit button plus its draggable resize
 * dividers. Tapping that icon opens `UnlockScreenModal` to ask for that
 * same PIN before restoring all of it. While locked, text/image selection,
 * dragging and the right-click menu are also disabled
 * (`.screen-display--locked`), leaving scrolling as the only thing still
 * possible — and a `fullscreenchange` listener makes a best-effort attempt
 * to hop straight back into fullscreen if it's exited, though it can't
 * actually stop Escape from exiting in the first place; no website can
 * override that.
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
  const [screens, setScreens] = useScreens()
  const [screensaverSchedule] = useScreensaverSchedule()
  const screen = screens.find((candidate) => candidate.screenID === screenId)
  const [now, setNow] = useState(() => new Date())
  const [editingTarget, setEditingTarget] = useState<EditingTarget>(null)
  const [screenDraftSnapshot, setScreenDraftSnapshot] = useState<SizeSnapshot | null>(null)
  /** Whether the whole-screen editor is showing its own "Background" sub-view instead of the main percentage scaler — reset whenever the editor (re)opens. Background color/image are always live (see `handleScreenBackgroundColorChange`/`handleScreenBackgroundImageChange`), so unlike the scaler's own fields this has no draft/restore state of its own. */
  const [screenSubview, setScreenSubview] = useState<'background' | null>(null)
  const [draftSlot, setDraftSlot] = useState<ScreenSlot>(EMPTY_SLOT)
  const [originalSlot, setOriginalSlot] = useState<ScreenSlot>(EMPTY_SLOT)
  const [draftTextSizes, setDraftTextSizes] = useState<TextSizes>(DEFAULT_TEXT_SIZES)
  const [draftUseOwnTextSizes, setDraftUseOwnTextSizes] = useState(false)
  const [originalTextSizes, setOriginalTextSizes] = useState<TextSizes>(DEFAULT_TEXT_SIZES)
  const [originalUseOwnTextSizes, setOriginalUseOwnTextSizes] = useState(false)
  /** The slot's own shared/fallback text sizes at the currently active stage — shown once a screen has more than one stage (see `SlotEditor`). */
  const [draftSlotTextSizes, setDraftSlotTextSizes] = useState<TextSizes>(DEFAULT_TEXT_SIZES)
  const [originalSlotTextSizes, setOriginalSlotTextSizes] = useState<TextSizes>(DEFAULT_TEXT_SIZES)
  /** Which stage the slot editor's own tab bar currently has selected. */
  const [activeStage, setActiveStage] = useState(1)
  /** The stage the slot editor was opened on — what "Restore previous" returns the tab bar to. */
  const [initialStage, setInitialStage] = useState(1)
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
   */
  const [manuallyPaused, setManuallyPaused] = useState(false)
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

  /** Whether the slot editor is currently offering (and, if `draftUseOwnTextSizes` is also on, actually using) a per-content override distinct from the slot's own shared/fallback size — only meaningful with more than one stage, since with just one there's nothing for a per-content override to differ from (see `SlotEditor`'s own `ownTextSizes` prop, which mirrors this exact condition). */
  const showOwnTextSizeOption = typeof editingTarget === 'object' && editingTarget !== null && Boolean(screen.useStages) && (screen.stageCount ?? 1) > 1

  /**
   * Resolves the sizes a given slot should render with right now, at
   * `stage`. While editing this exact slot: the live draft — `draftTextSizes`
   * only if the "use own size" option is both offered and actually checked
   * (matching exactly which one `SlotEditor`'s slider is bound to), else
   * `draftSlotTextSizes`, so a live edit to the *shared* size while "use
   * own" is off actually shows up here instead of the (untouched in that
   * case) per-content draft. While the whole screen is being edited: the
   * percentage scaler's own resolved value for this exact slot/stage.
   * Otherwise: its own persisted override if it has one at this stage,
   * else the slot's persisted effective value.
   */
  const resolveTextSizes = (slotIndex: number, stage: number, content: ScreenSlotContent): TextSizes => {
    const isEditingThisSlot = typeof editingTarget === 'object' && editingTarget !== null && editingTarget.slotIndex === slotIndex
    if (isEditingThisSlot) return showOwnTextSizeOption && draftUseOwnTextSizes ? draftTextSizes : draftSlotTextSizes

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
    const useOwn = hasOwnTextSizeFields(content) && Boolean(content.useOwnTextSizes)
    const effective = resolveContentTextSizes(content, sharedTextSizes)
    setDraftSlot(slot)
    setOriginalSlot(slot)
    setDraftTextSizes(effective)
    setOriginalTextSizes(effective)
    setDraftUseOwnTextSizes(useOwn)
    setOriginalUseOwnTextSizes(useOwn)
    setDraftSlotTextSizes(sharedTextSizes)
    setOriginalSlotTextSizes(sharedTextSizes)
    setActiveStage(openStage)
    setInitialStage(openStage)
    setEditingTarget({ slotIndex })
    setManuallyPaused(true)
  }

  /** A divider drag starting also counts as "editing the screen" for pause purposes (see `paused`) — only the rising edge forces a pause; the falling edge (drag finished) deliberately leaves it paused, same as closing an editor, until the toolbar's own Play is pressed. */
  const handleDragStateChange = (isDragging: boolean) => {
    if (isDragging) setManuallyPaused(true)
  }

  /**
   * Switches which stage the slot editor's tab bar has selected. First
   * folds whatever the currently active stage's own draft text-size holds
   * into `draftSlot`'s content timeline, *and* the shared/fallback draft
   * into that same stage's own `textSizes` checkpoint — both independent
   * timelines, both need flushing, or whichever one wasn't currently bound
   * to the visible slider (see `SlotEditor`'s own `ownTextSizes?.useOwn`
   * branch) would otherwise sit edited only in this component's local
   * state, never actually reaching `draftSlot`, and so get silently
   * dropped the next time the stage is switched again before the editor
   * closes. Only then reseeds the live draft for the stage being switched
   * to, against the slot's own (possibly just-flushed) values there.
   */
  const handleActiveStageChange = (nextStage: number) => {
    const flushedSlot = flushStageTextSizeIntoSlot(draftSlot, activeStage, draftTextSizes, draftUseOwnTextSizes)
    const flushedSlotWithSharedSize: ScreenSlot = { ...flushedSlot, textSizes: writeStageCheckpoint(flushedSlot.textSizes, activeStage, draftSlotTextSizes) }
    if (flushedSlotWithSharedSize !== draftSlot) setDraftSlot(flushedSlotWithSharedSize)

    const content = resolveSlotContent(flushedSlotWithSharedSize, nextStage)
    const sharedTextSizes = resolveSlotTextSizes(flushedSlotWithSharedSize, nextStage) ?? screen.textSizes ?? DEFAULT_TEXT_SIZES
    setDraftTextSizes(resolveContentTextSizes(content, sharedTextSizes))
    setDraftUseOwnTextSizes(hasOwnTextSizeFields(content) && Boolean(content.useOwnTextSizes))
    setDraftSlotTextSizes(sharedTextSizes)
    setActiveStage(nextStage)
  }

  /** Jumps the shared stage sequence straight to `targetStage`, dragged from the toolbar's own scrubber — sets `tick` to whichever value resolves to exactly that stage (see `currentStage`), so it snaps into position instantly regardless of where the natural rotation currently is. If playback is running, the timer just keeps advancing from here next; scrubbing doesn't itself start or stop it. */
  const handleScrubToStage = (targetStage: number) => setTick(targetStage - 1)

  /** The screen's shared rotation timer is a live setting, not part of any slot's draft — it applies (and persists) immediately, same as any other admin-dashboard edit. */
  const handleSlideDurationChange = (seconds: number) => {
    setScreens(screens.map((existing) => (existing.screenID === screen.screenID ? { ...existing, slideDurationSeconds: seconds } : existing)))
  }

  /** A divider's new position, dragged right on this display — applies (and persists) immediately, same reasoning as `handleSlideDurationChange`, and mirrors the admin dashboard's own arrow-nudge "Resize" panel writing to the very same fields. */
  const handleResizeDivider = (patch: Partial<ScreenConfig>) => {
    setScreens(screens.map((existing) => (existing.screenID === screen.screenID ? { ...existing, ...patch } : existing)))
  }

  /** Hides this screen's own editing controls behind the shared PIN — only offered once one's actually been set from the admin dashboard, since there'd otherwise be no way back in. */
  const handleLockScreen = () => {
    setScreens(screens.map((existing) => (existing.screenID === screen.screenID ? { ...existing, locked: true } : existing)))
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
    setDraftUseOwnTextSizes(originalUseOwnTextSizes)
    setDraftSlotTextSizes(originalSlotTextSizes)
    setActiveStage(initialStage)
  }

  /**
   * Persists whatever the draft currently holds, then closes the editor.
   * Wired to every way the modal can exit (its own "Done" button, ×,
   * Escape, and clicking outside it), so there's no separate save step to
   * remember. The currently active stage's own content checkpoint (its
   * text-size fields specifically) is folded in first — same as switching
   * stages does — and the slot's shared/fallback text size is written to
   * that same stage's own checkpoint unconditionally, since it's the tier
   * any of that stage's content falls back to whenever it doesn't opt for
   * its own override.
   */
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
          const flushedSlot = flushStageTextSizeIntoSlot(draftSlot, activeStage, draftTextSizes, draftUseOwnTextSizes)
          const finalSlot: ScreenSlot = { ...flushedSlot, textSizes: writeStageCheckpoint(flushedSlot.textSizes, activeStage, draftSlotTextSizes) }
          const slots = existing.slots.map((slot, index) => (index === slotIndex ? finalSlot : slot)) as ScreenConfig['slots']
          return { ...existing, slots }
        }
        return existing
      }),
    )
    setEditingTarget(null)
  }

  const resizeToFitBlocked = typeof editingTarget === 'object' && editingTarget !== null && isResizeToFitConflict(screen.slots, editingTarget.slotIndex, activeStage)

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

      <Modal
        open={editingTarget !== null}
        onClose={closeEditor}
        title={editingTarget === 'screen' ? t('screenDisplay.textSizeEditor.title') : t('screenDisplay.slotEditorTitle')}
        route={editingTarget === 'screen' && screenSubview === 'background' ? t('admin.screens.backgroundLabel') : undefined}
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
              onDone={closeEditor}
            />
          )
        ) : (
          <SlotEditor
            id={typeof editingTarget === 'object' && editingTarget !== null ? `slot-${editingTarget.slotIndex}` : 'slot'}
            slot={draftSlot}
            onSlotChange={setDraftSlot}
            useStages={Boolean(screen.useStages)}
            stageCount={screen.stageCount ?? 1}
            activeStage={activeStage}
            onActiveStageChange={handleActiveStageChange}
            slideDurationSeconds={screen.slideDurationSeconds}
            onSlideDurationChange={handleSlideDurationChange}
            textSizes={draftTextSizes}
            onTextSizesChange={setDraftTextSizes}
            ownTextSizes={showOwnTextSizeOption ? { useOwn: draftUseOwnTextSizes, onUseOwnChange: setDraftUseOwnTextSizes } : undefined}
            slotTextSizes={draftSlotTextSizes}
            onSlotTextSizesChange={setDraftSlotTextSizes}
            resizeToFitBlocked={resizeToFitBlocked}
            onRestore={handleRestore}
            onDone={closeEditor}
          />
        )}
      </Modal>
    </div>
  )
}
