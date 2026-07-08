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
import { UnlockScreenModal } from '../features/screens/UnlockScreenModal'
import { useScreenLockPin } from '../hooks/useScreenLockPin'
import { useScreens } from '../hooks/useScreens'
import { useScreensaverSchedule } from '../hooks/useScreensaverSchedule'
import { useLanguage } from '../i18n'
import { DEFAULT_SCREEN_BACKGROUND_COLOR, DEFAULT_TEXT_SIZES, type BackgroundImage, type ScreenConfig, type ScreenSlot, type ScreenSlotContent, type TextSizes } from '../types/screen'
import { backgroundImageTextStyle, borderColorStyle, getScreenColorVars } from '../utils/screenColors'
import { isWithinScreensaverWindow } from '../utils/screensaver'
import { hasOwnTextSizeFields, type SlideTarget } from '../utils/screenSlots'
import { resolveContentTextSizes, textSizesToCssVars } from '../utils/textSizeVars'
import './ScreenDisplay.scss'

/** A slot with no selection yet — the starting draft before a slot's own data has been seeded in. */
const EMPTY_SLOT: ScreenSlot = { isSlideshow: false, contents: [{ kind: 'none' }] }

/** Folds a slide's own live text-size draft into `slot`, at `slideIndex` — used both when switching away from that slide's own tab (so its edits aren't lost) and when the whole editor closes. */
function flushSlideTextSizeIntoSlot(slot: ScreenSlot, slideIndex: number, textSizes: TextSizes, useOwn: boolean): ScreenSlot {
  return {
    ...slot,
    contents: slot.contents.map((content, i) => {
      if (i !== slideIndex || !hasOwnTextSizeFields(content)) return content
      return useOwn ? { ...content, useOwnTextSizes: true, textSizes } : { ...content, useOwnTextSizes: false }
    }),
  }
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

/** The persisted (non-live-draft) effective text sizes for a slot as a whole: its own override, else the screen's own, else the global default. Used both as the shared fallback for that slot's slides and as what editing "the slot" (rather than one specific slide) reads/writes. */
function getPersistedSlotTextSizes(screen: ScreenConfig, slotIndex: number): TextSizes {
  return screen.slotTextSizes?.[slotIndex] ?? screen.textSizes ?? DEFAULT_TEXT_SIZES
}

/** Which appearance settings are currently open for editing: the whole screen's defaults (incl. background color), one specific slot (opened via its currently-showing slide), or nothing. */
type EditingTarget = 'screen' | SlideTarget | null

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
 * screen's default, every slot's own size, and every slide's own override
 * all together, relative to whatever each currently is — plus its own
 * "Background" button, opening a sub-view (`BackgroundEditor`) for the
 * screen's own overall background color and an optional whole-screen
 * background image (blurred and scaled to cover, same technique as a
 * slot's own — see `.screen-display__bg`), shown through any pane that
 * doesn't have its own background color/image (a slot's own individual
 * background is only editable from that slot's own editor, not here).
 * Unlike the scaler's own fields, both are always live, with no
 * draft/"restore previous" step. Hovering any individual
 * slide instead reveals a small "Edit slot" button covering that whole
 * slot: its own slideshow toggle plus, once it's rotating through more
 * than one slide, a "Global" tab (the slot's own shared background
 * color/image, the rotation timer, and its shared/fallback text size) and
 * one tab per slide (that slide's own content, its own background-image
 * override, and a checkbox to opt out of the slot's shared text size and
 * give it its own) — mirroring the admin dashboard's own tabs one level
 * deeper. A slot with just one slide skips the tabs and shows that single
 * slide's fields flat. Neither editor has a "Save" step — the in-progress draft is written to the
 * persisted screen as soon as it closes (whether via its own "Done"
 * button, the modal's × / Escape, or clicking outside it), and a "Restore
 * previous" button resets the draft back to the values it had when the
 * editor was opened. Any slot's own in-place rotation is paused while an
 * editor is open, so the live preview isn't pulled out from under the
 * slide being edited.
 *
 * The toolbar's "Lock screen" button (shown only once a PIN's been set from
 * the admin dashboard) collapses the whole toolbar down to a single lock
 * icon button — hiding the screen name, the fullscreen toggle, the "Edit
 * appearance" button, and (via `SplitLayout`) every pane's own
 * hover-revealed edit button plus its draggable resize dividers. Tapping
 * that icon opens `UnlockScreenModal` to ask for that same PIN before
 * restoring all of it. While locked, text/image selection, dragging and
 * the right-click menu are also disabled (`.screen-display--locked`),
 * leaving scrolling as the only thing still possible — and a
 * `fullscreenchange` listener makes a best-effort attempt to hop straight
 * back into fullscreen if it's exited, though it can't actually stop
 * Escape from exiting in the first place; no website can override that.
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
  /** The slot's own shared/fallback text sizes — the "Global" tab's own value, shown once a slot has more than one slide (see `SlotEditor`). */
  const [draftSlotTextSizes, setDraftSlotTextSizes] = useState<TextSizes>(DEFAULT_TEXT_SIZES)
  const [originalSlotTextSizes, setOriginalSlotTextSizes] = useState<TextSizes>(DEFAULT_TEXT_SIZES)
  /** Which of the slot editor's own tabs is active: its "Global" settings, or one specific slide by index — only meaningful once the slot has more than one slide. */
  const [activeSlideTab, setActiveSlideTab] = useState<'global' | number>('global')
  const [pin] = useScreenLockPin()
  const [unlockModalOpen, setUnlockModalOpen] = useState(false)
  const [screensaverTestLabelPosition, setScreensaverTestLabelPosition] = useState(randomScreensaverTestLabelPosition)

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

  const activeTextSizes = editingTarget === 'screen' && screenDraftSnapshot ? screenDraftSnapshot.textSizes : (screen.textSizes ?? DEFAULT_TEXT_SIZES)

  /** The screen as it should currently render: the slot being edited (if any) swapped for its live draft, so content/slideshow/color changes preview immediately, same as text-size changes already do. */
  const effectiveScreen: ScreenConfig =
    typeof editingTarget === 'object' && editingTarget !== null
      ? { ...screen, slots: screen.slots.map((slot, index) => (index === editingTarget.slotIndex ? draftSlot : slot)) as ScreenConfig['slots'] }
      : screen

  /** While a specific slide's own tab is active (not the slot's "Global" one), forces its pane to show that exact slide — so switching a slot editor's own tabs actually previews each slide, live, instead of leaving whatever the rotation had frozen on. */
  const forcedSlide =
    typeof editingTarget === 'object' && editingTarget !== null && typeof activeSlideTab === 'number'
      ? { slotIndex: editingTarget.slotIndex, contentIndex: activeSlideTab }
      : undefined

  /**
   * Resolves the sizes a given slide should render with right now. While
   * editing this exact slot: the live draft if this exact slide's own tab
   * is the active one (so dragging its sliders previews instantly,
   * regardless of whether its "use own size" checkbox is on yet); else its
   * own resolved value against the slot editor's own live "Global" tab
   * draft (which itself may be mid-edit). While the whole screen is being
   * edited: the percentage scaler's own resolved value for this exact
   * slide. Otherwise: its own persisted override if it has one, else the
   * slot's persisted effective value.
   */
  const resolveTextSizes = (slotIndex: number, contentIndex: number, content: ScreenSlotContent): TextSizes => {
    const isEditingThisSlot = typeof editingTarget === 'object' && editingTarget !== null && editingTarget.slotIndex === slotIndex
    if (isEditingThisSlot) {
      if (activeSlideTab === contentIndex) return draftTextSizes
      return resolveContentTextSizes(content, draftSlotTextSizes)
    }

    if (editingTarget === 'screen' && screenDraftSnapshot) {
      const draftContent = screenDraftSnapshot.slots[slotIndex].contents[contentIndex]
      return resolveContentTextSizes(draftContent, screenDraftSnapshot.slotTextSizes[slotIndex])
    }

    return resolveContentTextSizes(content, getPersistedSlotTextSizes(screen, slotIndex))
  }

  const openScreenEditor = () => {
    setScreenDraftSnapshot(null)
    setScreenSubview(null)
    setEditingTarget('screen')
  }

  const openSlideEditor = (slotIndex: number, contentIndex: number) => {
    const slot = screen.slots[slotIndex] ?? EMPTY_SLOT
    const content = slot.contents[contentIndex] ?? { kind: 'none' as const }
    const sharedTextSizes = getPersistedSlotTextSizes(screen, slotIndex)
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
    setActiveSlideTab(contentIndex)
    setEditingTarget({ slotIndex, contentIndex })
  }

  /**
   * Switches which of the slot editor's own tabs is active — the slot's
   * "Global" settings, or a specific slide by index. First folds whatever
   * the currently active slide's own tab holds into `draftSlot` (so
   * navigating away from it can't lose those edits), then reseeds the
   * live draft for the tab being switched to, against the slot's own
   * (possibly just-edited) "Global" shared value.
   */
  const handleActiveSlideTabChange = (nextTab: 'global' | number) => {
    const flushedSlot = typeof activeSlideTab === 'number' ? flushSlideTextSizeIntoSlot(draftSlot, activeSlideTab, draftTextSizes, draftUseOwnTextSizes) : draftSlot
    if (flushedSlot !== draftSlot) setDraftSlot(flushedSlot)

    if (typeof nextTab === 'number') {
      const content = flushedSlot.contents[nextTab] ?? { kind: 'none' as const }
      setDraftTextSizes(resolveContentTextSizes(content, draftSlotTextSizes))
      setDraftUseOwnTextSizes(hasOwnTextSizeFields(content) && Boolean(content.useOwnTextSizes))
    }

    setActiveSlideTab(nextTab)
  }

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

  /** Resets the slot (content/slideshow/color), its text-size drafts, and which tab is active back to the values captured when the editor was opened — the actual persisting still only happens once the editor closes. The whole-screen scaler restores itself internally. */
  const handleRestore = () => {
    setDraftSlot(originalSlot)
    setDraftTextSizes(originalTextSizes)
    setDraftUseOwnTextSizes(originalUseOwnTextSizes)
    setDraftSlotTextSizes(originalSlotTextSizes)
    if (typeof editingTarget === 'object' && editingTarget !== null) setActiveSlideTab(editingTarget.contentIndex)
  }

  /**
   * Persists whatever the draft currently holds, then closes the editor.
   * Wired to every way the modal can exit (its own "Done" button, ×,
   * Escape, and clicking outside it), so there's no separate save step to
   * remember. Once the slot has more than one slide (so its editor shows
   * tabs), the currently active slide tab is folded in first — same as
   * switching tabs does — and the slot's own "Global" tab value is written
   * to its shared size unconditionally, since it's no longer entangled
   * with any one slide's own value the way a flat (single-slide) slot's
   * shared/own distinction still is below. Either way, the flat/tabbed
   * branch itself always applies to `activeSlideTab`'s own index, not the
   * (possibly stale, if the slot's own "Slideshow" toggle was flipped off
   * since) index the editor originally opened on — `activeSlideTab` is
   * kept correctly seeded to whatever's actually loaded into the draft
   * (see `SlotEditor`'s own "Slideshow" checkbox), so it's always the one
   * to trust here.
   */
  const closeEditor = () => {
    const hasSlideTabs = draftSlot.isSlideshow
    setScreens(
      screens.map((existing) => {
        if (existing.screenID !== screen.screenID) return existing
        if (editingTarget === 'screen') {
          if (!screenDraftSnapshot) return existing
          return { ...existing, textSizes: screenDraftSnapshot.textSizes, slotTextSizes: screenDraftSnapshot.slotTextSizes, slots: screenDraftSnapshot.slots }
        }
        if (editingTarget) {
          const { slotIndex, contentIndex } = editingTarget
          const activeContentIndex = typeof activeSlideTab === 'number' ? activeSlideTab : contentIndex
          if (hasSlideTabs) {
            const flushedSlot = flushSlideTextSizeIntoSlot(draftSlot, activeContentIndex, draftTextSizes, draftUseOwnTextSizes)
            const slots = existing.slots.map((slot, index) => (index === slotIndex ? flushedSlot : slot)) as ScreenConfig['slots']
            return { ...existing, slots, slotTextSizes: { ...existing.slotTextSizes, [slotIndex]: draftSlotTextSizes } }
          }
          const contents = draftSlot.contents.map((content, i) => {
            if (i !== activeContentIndex || !hasOwnTextSizeFields(content)) return content
            return draftUseOwnTextSizes ? { ...content, useOwnTextSizes: true, textSizes: draftTextSizes } : { ...content, useOwnTextSizes: false }
          })
          const slots = existing.slots.map((slot, index) => (index === slotIndex ? { ...draftSlot, contents } : slot)) as ScreenConfig['slots']
          const slotTextSizes = draftUseOwnTextSizes ? existing.slotTextSizes : { ...existing.slotTextSizes, [slotIndex]: draftTextSizes }
          return { ...existing, slots, slotTextSizes }
        }
        return existing
      }),
    )
    setEditingTarget(null)
  }

  const editingSlotActiveCount = typeof editingTarget === 'object' && editingTarget !== null ? draftSlot.contents.filter((content) => content.kind !== 'none').length : 0
  const showOwnTextSizeOption = typeof editingTarget === 'object' && editingTarget !== null && draftSlot.isSlideshow && editingSlotActiveCount > 1

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
        onEditSlide={screen.locked ? undefined : openSlideEditor}
        paused={editingTarget !== null || unlockModalOpen}
        forcedSlide={forcedSlide}
        onResizeDivider={screen.locked ? undefined : handleResizeDivider}
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
            slideDurationSeconds={screen.slideDurationSeconds}
            onSlideDurationChange={handleSlideDurationChange}
            textSizes={draftTextSizes}
            onTextSizesChange={setDraftTextSizes}
            ownTextSizes={showOwnTextSizeOption ? { useOwn: draftUseOwnTextSizes, onUseOwnChange: setDraftUseOwnTextSizes } : undefined}
            slotTextSizes={draftSlotTextSizes}
            onSlotTextSizesChange={setDraftSlotTextSizes}
            activeSlideTab={activeSlideTab}
            onActiveSlideTabChange={handleActiveSlideTabChange}
            onRestore={handleRestore}
            onDone={closeEditor}
          />
        )}
      </Modal>
    </div>
  )
}
