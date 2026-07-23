import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { Navigate, useMatch, useParams } from 'react-router-dom'
import { BackButton, Button, Checkbox, FloatingPanel, Modal, RedoIcon } from '../components'
import { DashboardWindowControls } from '../features/admin/layout/DashboardWindowControls'
import { BackgroundEditor } from '../features/screens/BackgroundEditor'
import { BorderSettingsEditor } from '../features/screens/BorderSettingsEditor'
import { FullscreenToggle } from '../features/screens/FullscreenToggle'
import { GlobalTextSizeScaler, type SizeSnapshot } from '../features/screens/GlobalTextSizeScaler'
import { KeepEditPrompt, type SlotEditChanges } from '../features/screens/KeepEditPrompt'
import { NoConnectionIcon } from '../features/screens/NoConnectionIcon'
import { ScreenToolbar } from '../features/screens/ScreenToolbar'
import { SlotEditor } from '../features/screens/SlotEditor'
import { SplitLayout } from '../features/screens/SplitLayout'
import { StagePlaybackControls } from '../features/screens/StagePlaybackControls'
import { useIdleVisibility } from '../features/screens/useIdleVisibility'
import { useAdminSession } from '../hooks/useAdminSession'
import { evictUnusedVideoCache, prewarmVideoCache } from '../hooks/useCachedVideoSrc'
import { useConnectionStatus } from '../hooks/useConnectionStatus'
import { useDefaultPaneLanguage } from '../hooks/useDefaultPaneLanguage'
import { useScreens } from '../hooks/useScreens'
import { useScreensaverSchedule } from '../hooks/useScreensaverSchedule'
import { useLanguage } from '../i18n'
import { reportError } from '../lib/errorNotifications'
import { deleteUpload, isOwnUploadUrl, SessionExpiredError, uploadImage } from '../lib/localServer'
import {
  DEFAULT_SCREEN_BACKGROUND_COLOR,
  DEFAULT_TEXT_SIZES,
  type BackgroundImage,
  type DraftableScreenFields,
  type LayoutNode,
  type PaneId,
  type ScreenConfig,
  type ScreenSlot,
  type ScreenSlotContent,
  type SplitDirection,
  type TextSizes,
} from '../types/screen'
import { findSiblingEventOrdinal } from '../utils/eventOrdinals'
import { generateId } from '../utils/id'
import { computeLayoutGeometry, isContiguousBlock } from '../utils/layoutGeometry'
import { cloneSlot, deleteLeaf, emptySlot, listLeaves, splitLeaf } from '../utils/layoutTree'
import { backgroundImageTextStyle, borderColorStyle, getScreenColorVars } from '../utils/screenColors'
import { isWithinScreensaverWindow } from '../utils/screensaver'
import { hasOwnTextSizeFields, resolveContentBackgroundImage } from '../utils/screenSlots'
import {
  currentStage,
  getPersistedSlotTextSizes,
  isResizeToFitConflict,
  resolveSlotBackgroundColor,
  resolveSlotBackgroundImage,
  resolveSlotContent,
  resolveSlotLanguage,
  resolveSlotLocked,
  resolveSlotTextSizes,
  resolveStageValue,
  writeStageCheckpoint,
} from '../utils/screenStages'
import { resolveContentTextSizes, textSizesToCssVars } from '../utils/textSizeVars'
import './ScreenDisplay.scss'

/** The fixed `KeepEditPrompt` change-summary for the pane-resize fallback prompt below — a divider drag only ever touches the arrangement's own shape/ratios, never a pane's content/text size/background. */
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

/** Maps a screen's text sizes, background color, (if set) its own fixed border color, and (if its own whole-screen background image has a light/dark overlay) the contrast-forced text color that overlay picks, to the CSS custom properties the whole display (and, by inheritance, any pane without its own override) reads from. */
function screenAppearanceToCssVars(textSizes: TextSizes, backgroundColor: string, borderColor: string | undefined, backgroundImage: BackgroundImage | undefined): CSSProperties {
  return {
    ...textSizesToCssVars(textSizes),
    ...getScreenColorVars(backgroundColor),
    ...borderColorStyle(borderColor),
    ...backgroundImageTextStyle(backgroundImage?.overlay),
  } as CSSProperties
}

/** Which appearance settings are currently open for editing: the whole screen's defaults (incl. background color), one specific pane (by id), or nothing. */
type EditingTarget = 'screen' | { leafId: PaneId } | null

/** A random spot for the "Screen saver test" label to sit at, kept well clear of the edges. */
function randomScreensaverTestLabelPosition(): { top: number; left: number } {
  return { top: 10 + Math.random() * 80, left: 10 + Math.random() * 80 }
}

/** Caps how far back `undoStack` remembers — each entry is a full `ScreenConfig` snapshot (its whole `layout`/`paneSlots` tree), so an editing session left open a long time shouldn't let this grow without bound. */
const MAX_UNDO_STACK_LENGTH = 50

/** The result of successfully stepping `screens`/`undoStack`/`redoStack` one entry in either direction — `null` when there's nothing to step to, so the caller can no-op. */
interface UndoRedoStep {
  screens: ScreenConfig[]
  undoStack: ScreenConfig[]
  redoStack: ScreenConfig[]
}

/** Steps `current` (this exact screen) one entry back in `undoStack`, pushing its own present state onto `redoStack` — shared by `ScreenDisplay`'s own toolbar undo button and its Ctrl+Z keyboard handler, which otherwise can't call each other directly (the keyboard listener has to be a hook called unconditionally above the component's own `!screen` early return, before `handleUndo` is even declared). */
function undoScreenState(screens: ScreenConfig[], current: ScreenConfig, undoStack: ScreenConfig[], redoStack: ScreenConfig[]): UndoRedoStep | null {
  if (undoStack.length === 0) return null
  const previous = undoStack[undoStack.length - 1]
  return {
    screens: screens.map((existing) => (existing.screenID === current.screenID ? previous : existing)),
    undoStack: undoStack.slice(0, -1),
    redoStack: [...redoStack, current],
  }
}

/** The inverse of `undoScreenState` — steps `current` one entry forward in `redoStack` instead. */
function redoScreenState(screens: ScreenConfig[], current: ScreenConfig, undoStack: ScreenConfig[], redoStack: ScreenConfig[]): UndoRedoStep | null {
  if (redoStack.length === 0) return null
  const next = redoStack[redoStack.length - 1]
  return {
    screens: screens.map((existing) => (existing.screenID === current.screenID ? next : existing)),
    undoStack: [...undoStack, current],
    redoStack: redoStack.slice(0, -1),
  }
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
 * screen's default and every pane's own size (across every stage they
 * have) all together, relative to whatever each currently is — plus its
 * own "Background" button, opening a sub-view (`BackgroundEditor`) for the
 * screen's own overall background color and an optional whole-screen
 * background image (blurred and scaled to cover, same technique as a
 * pane's own — see `SplitLayout.tsx`'s own `screenBackgroundImage`, which
 * renders it for every one of that component's callers, not just this
 * page), shown through any pane that doesn't have its own background
 * color/image (a pane's own individual background is only editable from
 * that pane's own editor, not here).
 * Unlike the scaler's own fields, both write on every change, with no
 * local draft/"restore previous" step of their own (they're still subject
 * to the toolbar's own Live editing toggle, like everything else — see
 * `applyScreenPatch`). Hovering any individual pane instead
 * reveals a small "Edit pane" button covering that whole pane: once
 * `screen.useStages` is on and there's more than one stage, a stage-tab bar
 * (mirroring the admin dashboard's own one level deeper) lets the owner
 * jump between stages, each showing that pane's own content, background
 * color/image, and shared/fallback text size exactly as resolved at that
 * stage — editing any of them always writes a checkpoint at the stage
 * currently selected, independent of every other field's own timeline (see
 * `src/utils/screenStages.ts`). With `useStages` off (or only one stage),
 * the tab bar is hidden and the pane's fields are simply its one static
 * stage-1 checkpoint. Neither editor has a "Save" step — the in-progress
 * draft is written to the persisted screen as soon as it closes (whether
 * via its own "Done" button, the modal's × / Escape, or clicking outside
 * it), and a "Restore previous" button resets the draft back to the values
 * it had when the editor was opened. On a pane with more than one stage,
 * closing it after a real change instead shows `KeepEditPrompt` first — a
 * summary of what was touched (content, text size, background color/image)
 * plus the choice to keep it just for the stage being edited, overwrite
 * every later stage's own checkpoint for that same pane with it too, or
 * discard the whole session's edits outright (see `requestCloseEditor`).
 * While a pane's editor is open, the
 * whole live display (every pane, not just the one being edited, since
 * every pane shares the same stage sequence) freezes on whichever stage its
 * tab bar currently has selected, instead of continuing its natural
 * rotation, so the preview always shows exactly the stage being edited.
 *
 * Editing is gated on a logged-in admin session in this browser AND being on
 * the dedicated `/screens/editor/:screenId` route rather than the plain
 * `/screens/:screenId` one real kiosk deployments use (see `canEdit`) — no
 * separate PIN/lock step. An editable viewer also gets a
 * "Live editing" checkbox in the toolbar: on (the default) writes straight
 * to the published screen exactly as before; off stages every edit into
 * `screen.draft` instead — invisible to every other viewer (including a
 * different editable viewer who still has Live editing on) until the
 * "Publish" button (shown whenever a draft is pending) merges it onto the
 * published fields and clears it. `viewScreen` (draft-overlaid when
 * previewing, else the plain published screen) is what every read in this
 * component resolves against, so a live-off editor sees their own draft
 * while everyone else keeps seeing the last published version.
 *
 * A screen with its own "Use screensaver" checkbox on (only offered once a
 * shared daily window's been set from the admin dashboard's "Screen saver"
 * button — see `useScreensaverSchedule`) shows a solid black overlay, above
 * the panes but below the toolbar, for as long as the current time falls
 * within that window, or immediately regardless of the time while its own
 * "Test screensaver" button is toggled on. Both the checkbox and the test
 * button are also reachable from the toolbar's own "Edit appearance" panel,
 * live either way.
 */
export function ScreenDisplay() {
  const { t } = useLanguage()
  const { screenId } = useParams<{ screenId: string }>()
  const isEditorRoute = Boolean(useMatch('/screens/editor/:screenId'))
  const { session, clearSession } = useAdminSession()
  const [screens, setScreens] = useScreens()
  const connected = useConnectionStatus()
  const [screensaverSchedule] = useScreensaverSchedule()
  const [defaultPaneLanguage] = useDefaultPaneLanguage()
  /** Drives the editor's own top-right window-chrome buttons (see `DashboardWindowControls` below) fading out after mouse/touch inactivity, same idle window as `ScreenToolbar`'s own — a separate call rather than sharing its state, since the two fade independently and neither needs to know about the other. */
  const windowControlsVisible = useIdleVisibility(3000)
  const screen = screens.find((candidate) => candidate.screenID === screenId)
  const [now, setNow] = useState(() => new Date())
  const [editingTarget, setEditingTarget] = useState<EditingTarget>(null)
  /** Checked via each pane's own `PaneSelectCheckbox` (see `LayoutPane`) — drives the toolbar's "Delete selected"/"Group" buttons, shown once this has 2+ entries. Cleared whenever the editor closes or the arrangement's own leaf set changes, so a deleted/cleared pane can't stay stuck "selected". */
  const [selectedLeafIds, setSelectedLeafIds] = useState<Set<PaneId>>(new Set())
  /** A snapshot of this exact screen (as stored in `screens`, `.draft` and all) from just before each `applyScreenPatch` — Ctrl+Z (see `handleUndo`) pops the most recent one and restores it. Cleared on undo/redo re-populates the other stack instead of clearing — see `handleUndo`/`handleRedo`. Session-local (plain component state, not persisted) — reloading the page starts a fresh history, same as most editors' own undo. */
  const [undoStack, setUndoStack] = useState<ScreenConfig[]>([])
  /** The inverse of `undoStack` — what Ctrl+Shift+Z / the toolbar's own redo button restores, populated only by `handleUndo` itself and cleared by any *new* edit (see `applyScreenPatch`), matching how redo history works everywhere else once you diverge from it with a fresh change. */
  const [redoStack, setRedoStack] = useState<ScreenConfig[]>([])
  const [screenDraftSnapshot, setScreenDraftSnapshot] = useState<SizeSnapshot | null>(null)
  /** Whether the whole-screen editor is showing its own "Background" or "Borders" sub-view instead of the main percentage scaler — reset whenever the editor (re)opens. Both write straight through `applyScreenPatch` on every change (see `handleScreenBackgroundColorChange`/`handleScreenBackgroundImageChange`/`handleShowSlotBordersChange`/`handleBorderColorChange`), so unlike the scaler's own fields neither has any local draft/restore state of its own. */
  const [screenSubview, setScreenSubview] = useState<'background' | 'border' | null>(null)
  const [draftSlot, setDraftSlot] = useState<ScreenSlot>(emptySlot())
  const [originalSlot, setOriginalSlot] = useState<ScreenSlot>(emptySlot())
  const [draftTextSizes, setDraftTextSizes] = useState<TextSizes>(DEFAULT_TEXT_SIZES)
  const [originalTextSizes, setOriginalTextSizes] = useState<TextSizes>(DEFAULT_TEXT_SIZES)
  /** The pane's own shared/fallback text sizes at the currently active stage — shown once a screen has more than one stage (see `SlotEditor`). */
  const [draftSlotTextSizes, setDraftSlotTextSizes] = useState<TextSizes>(DEFAULT_TEXT_SIZES)
  const [originalSlotTextSizes, setOriginalSlotTextSizes] = useState<TextSizes>(DEFAULT_TEXT_SIZES)
  /** Whether `KeepEditPrompt` is currently showing in place of `SlotEditor` — see `handleActiveStageChange`. Reset to `false` every time a pane editor (re)opens. */
  const [showKeepEditPrompt, setShowKeepEditPrompt] = useState(false)
  /** Which stage `KeepEditPrompt` should actually continue on to once resolved, when it's showing because of a stage-tab switch mid-edit rather than the editor closing — `null` in the latter case. See `handleActiveStageChange`/`seedDraftForStage`. */
  const [pendingStageSwitchTarget, setPendingStageSwitchTarget] = useState<number | null>(null)
  /** Which stage the pane editor's own tab bar currently has selected. */
  const [activeStage, setActiveStage] = useState(1)
  /** The stage the pane editor was opened on — what "Restore previous" returns the tab bar to. */
  const [initialStage, setInitialStage] = useState(1)
  /**
   * The screen's own resolved tree, at whichever stage a divider drag
   * began, as it was right before the currently-unresolved "session"
   * started — `undefined` means there's nothing pending to ask about.
   * Captured once, on the rising edge of a divider drag (see
   * `handleDragStateChange`), and cleared again once
   * `requestPendingResizeAction` has asked about (or found nothing to ask
   * about in) whatever's changed since. A divider drag has no modal step of
   * its own to catch this in the way the pane editor's own session does, so
   * this is the fallback: the next time the owner steps to another stage or
   * locks the screen, `KeepEditPrompt` (see `RESIZE_CHANGES`) offers the
   * same "keep here / keep for next steps too / remove edits" choice for
   * whatever pane sizes were just dragged.
   */
  const [resizeSessionOriginalTree, setResizeSessionOriginalTree] = useState<LayoutNode | undefined>(undefined)
  /** The stage `resizeSessionOriginalTree` was captured at — the resize session is always scoped to whichever stage the drag actually happened on. */
  const [resizeSessionStage, setResizeSessionStage] = useState(1)
  /** The next/previous-stage step or lock action waiting on the resize fallback prompt's own resolution — see `requestPendingResizeAction`. */
  const [pendingResizeAction, setPendingResizeAction] = useState<(() => void) | null>(null)
  /** The toolbar's own "Live editing" checkbox — on (the default, matching every prior version of this page) writes straight to the published screen; off stages writes into `screen.draft` instead (see `applyScreenPatch`). */
  const [liveEditing, setLiveEditing] = useState(true)
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
   * content unattended — *unless* this load carries the dashboard's own
   * `launch` marker (see `ScreensView.handleOpenScreen`), which treats
   * "open" as "deploy it" and should autoplay immediately. Checked directly
   * in this lazy initializer (rather than an effect calling `setManuallyPaused`
   * after mount) so the very first render already reflects it.
   */
  const [manuallyPaused, setManuallyPaused] = useState(() => !new URLSearchParams(window.location.search).has('launch'))
  /** The toolbar's own fast-forward toggle — while on, stages advance every 2 seconds instead of the screen's own configured `slideDurationSeconds`. */
  const [fastForward, setFastForward] = useState(false)

  const paused = editingTarget !== null || manuallyPaused

  /**
   * The draft-aware stage-rotation settings — read here (rather than via
   * `viewScreen`, computed further down after the `!screen` early return)
   * since this effect runs above that point; a live-off *editable* viewer
   * previewing a draft stage-count/duration change should have the
   * rotation reflect it, same as everything else `viewScreen` unifies —
   * gated on `session`/`isEditorRoute`/`liveEditing` directly (not just
   * `Boolean(draft)`), so a non-editable viewer (or an editable one with
   * Live editing on) never has their own rotation affected by someone
   * else's pending draft.
   */
  const previewingDraft = Boolean(session) && isEditorRoute && !liveEditing
  const rotationUseStages = (previewingDraft ? screen?.draft?.useStages : undefined) ?? screen?.useStages
  const rotationStageCount = (previewingDraft ? screen?.draft?.stageCount : undefined) ?? screen?.stageCount
  const rotationSlideDuration = (previewingDraft ? screen?.draft?.slideDurationSeconds : undefined) ?? screen?.slideDurationSeconds

  /** Advances the shared stage sequence, paused while any editor (or a divider drag, or the toolbar's own play/pause toggle) is open/active so the preview isn't pulled out from under it — mirrors the same rotation timer `SplitLayout` used to own directly, lifted up here so `ScreenToolbar`'s stage indicator and playback controls can read/drive the same clock. */
  useEffect(() => {
    if (paused || !rotationUseStages || (rotationStageCount ?? 1) <= 1) return
    const timer = setInterval(() => setTick((current) => current + 1), fastForward ? 2000 : (rotationSlideDuration ?? 10) * 1000)
    return () => clearInterval(timer)
  }, [paused, rotationUseStages, rotationStageCount, rotationSlideDuration, fastForward])

  /** Keeps `now` fresh enough for the screensaver's own scheduled window to actually kick in (and end) without needing a refresh, without re-rendering every second for a check that's only ever precise to the minute. */
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(interval)
  }, [])

  /** Every video URL referenced by *any* stage of *any* pane on this screen — walked once here rather than just the currently-active stage/pane, so a stage's video is already downloaded via the Cache API before it ever rotates into view (see `useCachedVideoSrc`'s own doc comment for why a pane's `<video>` element can't itself hand out a placeholder network URL while downloading). */
  const screenVideoUrls = screen
    ? Array.from(
        new Set(Object.values(screen.paneSlots).flatMap((slot) => Object.values(slot.content).flatMap((content) => (content.kind === 'video' ? [content.videoUrl] : [])))),
      )
    : []
  const screenVideoUrlsKey = screenVideoUrls.join(',')
  const hasLoadedScreen = Boolean(screen)

  /** Pre-warms every URL above into the Cache API, and prunes any previously-cached video not in that set (e.g. this display got reassigned to a different screen) — see `prewarmVideoCache`/`evictUnusedVideoCache`'s own doc comments. Best-effort and silent; a pane's own `useCachedVideoSrc` still resolves correctly (just downloading fresh instead of finding a warm cache) if this hasn't finished, or failed, by the time that pane's stage rotates in. */
  useEffect(() => {
    if (!hasLoadedScreen) return
    void prewarmVideoCache(screenVideoUrls)
    void evictUnusedVideoCache(screenVideoUrls)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the stable `screenVideoUrlsKey` string (and `hasLoadedScreen`), not the `screenVideoUrls` array itself, which is a fresh reference every render.
  }, [hasLoadedScreen, screenVideoUrlsKey])

  /**
   * Ctrl+Z / Ctrl+Shift+Z (Cmd on Mac) for undo/redo — only while there's an
   * editable session on this route, and never while focus is inside a text
   * input/textarea/contenteditable (so undoing a typo mid-type in a slide's
   * own text field doesn't instead undo the last *screen*-level edit). Has
   * to be a hook called unconditionally up here, above the `!screen` early
   * return below — `handleUndo`/`handleRedo` aren't declared until after
   * it, so this calls the same shared `undoScreenState`/`redoScreenState`
   * helpers they do instead of those functions directly.
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!screen || !session || !isEditorRoute) return
      if (event.key.toLowerCase() !== 'z' || !(event.metaKey || event.ctrlKey)) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const result = event.shiftKey ? redoScreenState(screens, screen, undoStack, redoStack) : undoScreenState(screens, screen, undoStack, redoStack)
      if (!result) return
      event.preventDefault()
      setScreens(result.screens)
      setUndoStack(result.undoStack)
      setRedoStack(result.redoStack)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [screen, screens, session, isEditorRoute, undoStack, redoStack, setScreens])

  /** While the screensaver's own "Test screensaver" button is on, periodically moves its "Screen saver test" label to a new random spot — same reasoning a real screensaver moves its content around, so nothing sits burned into one spot on the (probably otherwise idle) display for the whole test. */
  useEffect(() => {
    if (!screen?.screensaverTestActive) return
    const interval = setInterval(() => setScreensaverTestLabelPosition(randomScreensaverTestLabelPosition()), 4000)
    return () => clearInterval(interval)
  }, [screen?.screensaverTestActive])

  /**
   * If this display was just launched from the dashboard's "Open" action
   * (see `ScreensView.handleOpenScreen`), best-effort requests fullscreen —
   * treating "open" as "deploy it," not a plain preview. The "starts
   * autoplaying" half of that doesn't belong here: it's `manuallyPaused`'s
   * own lazy initial state above, which needs no `setState` call inside
   * this effect. `requestFullscreen` needs an active user gesture, which a
   * mount effect in a freshly-opened tab typically isn't — attempted
   * anyway (harmless if silently rejected; the toolbar's own
   * `FullscreenToggle` remains the reliable fallback). Strips the marker
   * from the visible URL right after, mount-only.
   */
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('launch')) return
    document.documentElement.requestFullscreen?.().catch(() => {})
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  if (!screen) {
    return (
      <div className="screen-display screen-display--not-found" style={getScreenColorVars(DEFAULT_SCREEN_BACKGROUND_COLOR) as CSSProperties}>
        <h1>{t('screenDisplay.notFound.title')}</h1>
        <p>{t('screenDisplay.notFound.message')}</p>
      </div>
    )
  }

  /**
   * `/screens/editor/:screenId` is the one URL meant to be used for editing
   * (see `canEdit` below), so — unlike the plain `/screens/:screenId` route,
   * which stays silently read-only for anyone without a session — landing
   * here without one sends straight to login instead of just rendering a
   * dead end. This is also what makes the "Editor" link usable from a
   * different device/hostname than wherever the admin dashboard session was
   * created (the admin session lives in this browser origin's own
   * `localStorage`, so a brand new origin has none yet): logging in right
   * here creates a session on THIS origin, and `redirect` sends them
   * straight back to this same screen afterward (see `AdminLogin`).
   */
  if (isEditorRoute && !session) {
    return <Navigate to={`/admin/login?redirect=${encodeURIComponent(window.location.pathname)}`} replace />
  }

  const stage = currentStage(tick, screen)

  /** Whether this browser tab can edit this screen at all — a logged-in admin session, AND only on the dedicated `/screens/editor/:screenId` route (see `isEditorRoute`, `main.tsx`). The plain `/screens/:screenId` route (what "Open"/real kiosk deployments use) is always fully read-only, even for a logged-in session, so a real kiosk display can never be accidentally edited; only the "Editor" link's own URL ever offers editing. Without a session on the editor route, every editing affordance (the toolbar's edit controls, resizing/splitting/clearing/deleting a pane, dropping an image onto one) is hidden entirely, not just disabled — this page is otherwise fully public, so someone who merely happens to load either URL shouldn't be able to touch its layout or content without both conditions. */
  const canEdit = Boolean(session) && isEditorRoute

  /** Whether this editable viewer is currently previewing `screen.draft` instead of the published fields — only while Live editing is off and a draft actually exists (a viewer without a session, or with Live editing on, always sees the plain published screen). */
  const draftActive = canEdit && !liveEditing && Boolean(screen.draft)

  /** The screen as this tab should currently read every field from: draft-overlaid while previewing (see `draftActive`), else identical to the plain published `screen`. Every other read/handler in this component builds on this (not `screen` directly) so a live-off editor's own further edits accumulate onto their own draft instead of resetting from the stale published baseline each time. */
  const viewScreen: ScreenConfig = draftActive ? { ...screen, ...screen.draft } : screen

  /**
   * Routes a draftable-field write to the published screen (Live editing on
   * — every prior version of this page's only mode) or into `screen.draft`
   * instead (off) — the single choke point every content/layout/appearance
   * write in this component goes through, so that choice only has to be
   * made in one place. `patch` should be computed from `viewScreen` (not
   * `screen`), so it correctly builds on whatever's currently showing.
   */
  const applyScreenPatch = (patch: Partial<DraftableScreenFields>) => {
    setUndoStack([...undoStack, screen].slice(-MAX_UNDO_STACK_LENGTH))
    setRedoStack([])
    setScreens(
      screens.map((existing) =>
        existing.screenID === screen.screenID ? (liveEditing ? { ...existing, ...patch } : { ...existing, draft: { ...existing.draft, ...patch } }) : existing,
      ),
    )
  }

  /** Ctrl+Shift+Z (see the keydown handler above) / the toolbar's own redo button — the inverse of undoing (Ctrl+Z only, no toolbar button of its own — see that same keydown handler, which calls `undoScreenState` directly rather than through a named function here). No-op with nothing to redo (including whenever a fresh edit has cleared `redoStack` since the last undo). */
  const handleRedo = () => {
    const result = redoScreenState(screens, screen, undoStack, redoStack)
    if (!result) return
    setScreens(result.screens)
    setUndoStack(result.undoStack)
    setRedoStack(result.redoStack)
  }

  /** Merges the pending draft onto the published fields and clears it — everyone else's own view (which never reads `draft` at all) starts reflecting it immediately. Only ever called while `screen.draft` is actually set (see the toolbar's own Publish button). */
  const handlePublish = () => {
    setScreens(screens.map((existing) => (existing.screenID === screen.screenID ? { ...existing, ...existing.draft, draft: undefined } : existing)))
  }

  const activeTextSizes = editingTarget === 'screen' && screenDraftSnapshot ? screenDraftSnapshot.textSizes : (viewScreen.textSizes ?? DEFAULT_TEXT_SIZES)

  /** The screen as it should currently render: the pane being edited (if any) swapped for its live draft, so content/color changes preview immediately, same as text-size changes already do. */
  const effectiveScreen: ScreenConfig =
    typeof editingTarget === 'object' && editingTarget !== null
      ? { ...viewScreen, paneSlots: { ...viewScreen.paneSlots, [editingTarget.leafId]: draftSlot } }
      : viewScreen

  /** While a pane's editor is open, forces the *whole* display (every pane, not just the one being edited — every pane shares the same stage sequence) to the stage its own tab bar currently has selected, instead of letting it keep naturally rotating. */
  const forcedStage = typeof editingTarget === 'object' && editingTarget !== null ? activeStage : undefined

  /** `selectedLeafIds` narrowed to ids that actually still exist in the currently-resolved arrangement — a checked pane deleted through some other path (or a stage switch to an arrangement that never had it) just silently drops out of this, rather than needing a separate effect to prune the underlying state proactively. Every consumer below reads this, not `selectedLeafIds` directly. */
  const activeSelectedLeafIds = (() => {
    const currentTree = resolveStageValue(viewScreen.layout, forcedStage ?? stage) ?? Object.values(viewScreen.layout)[0]
    const currentIds = new Set(listLeaves(currentTree).map((leaf) => leaf.id))
    return new Set([...selectedLeafIds].filter((id) => currentIds.has(id)))
  })()

  /** Whether the current checkbox selection is eligible for the toolbar's own "Group" action — a directly-adjacent, single contiguous block (see `isContiguousBlock`), not just any 2+ panes. */
  const canGroupSelected =
    activeSelectedLeafIds.size >= 2 && isContiguousBlock(resolveStageValue(viewScreen.layout, forcedStage ?? stage) ?? Object.values(viewScreen.layout)[0], activeSelectedLeafIds)

  /** Whether the pane currently being edited has more than one stage — the deciding factor for whether a text-size edit goes to that stage's own content (`draftTextSizes`) or the pane's shared/fallback size (`draftSlotTextSizes`), both while editing (see `resolveTextSizes` below) and in `SlotEditor` itself. */
  const hasMultipleStages = typeof editingTarget === 'object' && editingTarget !== null && Boolean(viewScreen.useStages) && (viewScreen.stageCount ?? 1) > 1

  /**
   * Resolves the sizes a given pane should render with right now, at
   * `stage`. While editing this exact pane: the live draft —
   * `draftTextSizes` with more than one stage (matching exactly which one
   * `SlotEditor`'s slider is bound to), else `draftSlotTextSizes`. While the
   * whole screen is being edited: the percentage scaler's own resolved
   * value for this exact pane/stage. Otherwise: its own persisted value if
   * it has one at this stage, else the pane's persisted effective value.
   */
  const resolveTextSizes = (leafId: PaneId, stage: number, content: ScreenSlotContent): TextSizes => {
    const isEditingThisPane = typeof editingTarget === 'object' && editingTarget !== null && editingTarget.leafId === leafId
    if (isEditingThisPane) return hasMultipleStages ? draftTextSizes : draftSlotTextSizes

    if (editingTarget === 'screen' && screenDraftSnapshot) {
      const draftSlotSnapshot = screenDraftSnapshot.paneSlots[leafId]
      if (!draftSlotSnapshot) return resolveContentTextSizes(content, screenDraftSnapshot.textSizes)
      const draftContent = resolveSlotContent(draftSlotSnapshot, stage)
      return resolveContentTextSizes(draftContent, resolveSlotTextSizes(draftSlotSnapshot, stage) ?? screenDraftSnapshot.textSizes)
    }

    return resolveContentTextSizes(content, getPersistedSlotTextSizes(viewScreen, leafId, stage))
  }

  const openScreenEditor = () => {
    setScreenDraftSnapshot(null)
    setScreenSubview(null)
    setEditingTarget('screen')
    setManuallyPaused(true)
  }

  /** A plain click (not a resize drag) on any pane divider — see `SplitLayoutDivider`'s own `onBorderClick` — opens straight to the border-settings sub-view rather than the scaler's own default landing view. */
  const openBorderEditor = () => {
    setScreenDraftSnapshot(null)
    setScreenSubview('border')
    setEditingTarget('screen')
    setManuallyPaused(true)
  }

  const openSlotEditor = (leafId: PaneId) => {
    const slot = viewScreen.paneSlots[leafId] ?? emptySlot()
    const openStage = stage
    const content = resolveSlotContent(slot, openStage)
    const sharedTextSizes = getPersistedSlotTextSizes(viewScreen, leafId, openStage)
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
    setEditingTarget({ leafId })
    setSelectedLeafIds(new Set())
    setManuallyPaused(true)
  }

  /**
   * A divider drag starting also counts as "editing the screen" for pause
   * purposes (see `paused`) — only the rising edge forces a pause; the
   * falling edge (drag finished) deliberately leaves it paused, same as
   * closing an editor, until the toolbar's own Play is pressed. The rising
   * edge also seeds `resizeSessionOriginalTree`, but only if nothing's
   * already pending — a second drag before the owner has navigated away (and
   * so been asked about the first one) extends the same session rather than
   * resetting its "before" snapshot.
   */
  const handleDragStateChange = (isDragging: boolean) => {
    if (!isDragging) return
    setManuallyPaused(true)
    setResizeSessionOriginalTree((current) => current ?? resolveStageValue(viewScreen.layout, stage))
    setResizeSessionStage((current) => (resizeSessionOriginalTree === undefined ? stage : current))
  }

  /**
   * The shared tail end of actually moving the pane editor's tab bar to
   * `nextStage`, against `fromSlot` (the pane's own values to reseed the
   * local draft from there — either just-flushed-but-not-yet-persisted, or
   * just persisted/discarded via `KeepEditPrompt`, see
   * `handleActiveStageChange` below). Resets `originalSlot`/the text-size
   * "original" pair to `fromSlot` too, not just `draftSlot` — once this
   * runs, `fromSlot` *is* the new baseline `detectSlotEditChanges` should
   * compare the next stage's own edits against, not whatever the pane
   * looked like when the editor first opened.
   */
  const seedDraftForStage = (fromSlot: ScreenSlot, nextStage: number) => {
    const content = resolveSlotContent(fromSlot, nextStage)
    const sharedTextSizes = resolveSlotTextSizes(fromSlot, nextStage) ?? viewScreen.textSizes ?? DEFAULT_TEXT_SIZES
    const effective = resolveContentTextSizes(content, sharedTextSizes)
    setDraftSlot(fromSlot)
    setOriginalSlot(fromSlot)
    setDraftTextSizes(effective)
    setOriginalTextSizes(effective)
    setDraftSlotTextSizes(sharedTextSizes)
    setOriginalSlotTextSizes(sharedTextSizes)
    setActiveStage(nextStage)
  }

  /**
   * Switches which stage the pane editor's tab bar has selected — straight
   * away if there's nothing to ask about (a single stage, or no real
   * change at the stage being left), else shows `KeepEditPrompt` first (see
   * `pendingStageSwitchTarget`) exactly like closing the editor entirely
   * used to, before this was moved here: continuing to browse other steps
   * mid-edit is the point where an in-progress change could otherwise
   * silently carry forward (or get lost) without ever being asked about,
   * not the point where the modal itself happens to close.
   */
  const handleActiveStageChange = (nextStage: number) => {
    if (hasMultipleStages && Object.values(detectSlotEditChanges()).some(Boolean)) {
      setPendingStageSwitchTarget(nextStage)
      setShowKeepEditPrompt(true)
      return
    }
    seedDraftForStage(finalizeDraftSlot(), nextStage)
  }

  /** Jumps the shared stage sequence straight to `targetStage`, dragged from the toolbar's own scrubber — sets `tick` to whichever value resolves to exactly that stage (see `currentStage`), so it snaps into position instantly regardless of where the natural rotation currently is. If playback is running, the timer just keeps advancing from here next; scrubbing doesn't itself start or stop it. Deliberately ungated by `requestPendingResizeAction` — a continuous scrubber drag firing that check on every step it passes through would interrupt the drag itself; the previous/next-stage buttons (`handleStepStage`) get the check instead, since those are the discrete "I'm done with this stage" gesture. */
  const handleScrubToStage = (targetStage: number) => setTick(targetStage - 1)

  /** The previous/next-stage button pair's own discrete jump — same destination as `handleScrubToStage`, but routed through `requestPendingResizeAction` first, since clicking away from a stage is exactly the moment an unresolved pane resize on it should be asked about. */
  const handleStepStage = (targetStage: number) => requestPendingResizeAction(() => setTick(targetStage - 1))

  /** A video pane's own `advanceStageOnEnd` firing when it finishes playing — advances the shared stage rotation immediately via the same discrete-jump path (and same `requestPendingResizeAction` guard) `handleStepStage` uses for the toolbar's "next stage" button, since a video ending is the same kind of "I'm done with this stage" gesture, just triggered by content instead of a click. Every pane shares one stage sequence, so this advances the whole screen, not just the video's own pane — see `ScreenSlotContent`'s own `advanceStageOnEnd` doc comment. */
  const handleVideoEndedAdvance = () => handleStepStage(stage + 1)

  /**
   * The toolbar's own "Add step" button — appends one more stage, turning
   * `useStages` on if this is the screen's first (mirrors the plain number
   * field in the admin dashboard's own "Stages" tab, just reachable directly
   * from here). The new stage starts as a carry-forward copy of the last one
   * — every field's own per-stage resolution already falls back to its
   * nearest earlier checkpoint (see `resolveStageValue`), so nothing needs
   * seeding here — then jumps the display straight to it, same as stepping
   * forward, so it's obvious the step actually got added. Routed through
   * `requestPendingResizeAction` like `handleStepStage`, since this also
   * navigates away from whichever stage is currently showing.
   */
  const handleAddStage = () => {
    requestPendingResizeAction(() => {
      const nextStageCount = (viewScreen.stageCount ?? 1) + 1
      applyScreenPatch({ useStages: true, stageCount: nextStageCount })
      setTick(nextStageCount - 1)
    })
  }

  /** A divider's new position (or a structural split/delete edit, once that UI lands), dragged/made right on this display — applies (and, with Live editing on, persists) immediately, mirroring the admin dashboard's own inline "Layout" grid writing to the very same `layout` field. The screen's shared rotation timer (seconds per step) is edited from that same admin dashboard's own "Steps" panel, not from this display. `SplitLayout`'s own `onResizeDivider` prop is typed against the wider `Partial<ScreenConfig>` (shared with `ScreenForm.tsx`'s own live preview, which always writes straight through) — the cast here is safe since it only ever actually sends `layout`/`paneSlots`. */
  const handleResizeDivider = (patch: Partial<ScreenConfig>) => applyScreenPatch(patch as Partial<DraftableScreenFields>)

  /**
   * A file dropped directly onto a pane (see `SplitLayout`'s own
   * `onDropImage`) — uploads it and sets that pane's content straight to
   * the result at `fit: 'cover'` (a drag-and-drop is a "fill this pane"
   * gesture, unlike the pane editor's own image field, which defaults to
   * `'contain'`), applied and persisted immediately, same as
   * `handleResizeDivider`. Targets whichever stage is currently being
   * shown/edited (`forcedStage ?? stage`), same rule every other direct
   * pane edit already follows. Requires a logged-in admin session in this
   * same browser (uploads are authenticated — see `ImageUploadField`, which
   * this mirrors); reports a toast instead of silently doing nothing when
   * there isn't one, since a drop is a much more deliberate action than a
   * field simply being disabled.
   */
  const handleDropImage = async (leafId: PaneId, file: File) => {
    if (!session) {
      reportError(t('imageUpload.noSession'))
      return
    }

    const targetStage = forcedStage ?? stage
    const slot = viewScreen.paneSlots[leafId] ?? emptySlot()
    const previousContent = resolveSlotContent(slot, targetStage)

    try {
      const imageUrl = await uploadImage(file, session.token)
      const nextContent: ScreenSlotContent = { kind: 'image', imageUrl, fit: 'cover' }
      const nextSlot: ScreenSlot = { ...slot, content: writeStageCheckpoint(slot.content, targetStage, nextContent) }
      applyScreenPatch({ paneSlots: { ...viewScreen.paneSlots, [leafId]: nextSlot } })
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
   * Splits `leafId` into two along `axis`, always an even 50/50 split, both
   * halves starting with its own duplicated content — hover-triggered from
   * close to the pane's own middle (see `PaneSplitZones`). Applies and
   * persists immediately, same posture as
   * `handleResizeDivider`/`handleDropImage`, targeting whichever stage is
   * currently being shown/edited.
   */
  const handleSplitPane = (leafId: PaneId, axis: SplitDirection, edge: 'start' | 'end') => {
    const targetStage = forcedStage ?? stage
    const tree = resolveStageValue(viewScreen.layout, targetStage)
    if (!tree) return
    const { tree: nextTree, newPaneId } = splitLeaf(tree, leafId, axis, edge)
    const nextLayout = writeStageCheckpoint(viewScreen.layout, targetStage, nextTree)
    const nextPaneSlots = { ...viewScreen.paneSlots, [newPaneId]: cloneSlot(viewScreen.paneSlots[leafId] ?? emptySlot()) }
    applyScreenPatch({ layout: nextLayout, paneSlots: nextPaneSlots })
  }

  /**
   * Splits `leafId` straight into a clean 2x2 of 4 equal panes in one step —
   * the dead-center zone's own action (see `PaneSplitZones`), rather than
   * needing two separate splits to get there. Composes `splitLeaf` three
   * times (a row split, then a column split on each of its two resulting
   * sides) into exactly the aligned shape `LayoutTree.tsx`'s own corner
   * handle already treats as a clean 4-pane grid. All 3 new panes start as
   * duplicates of the original's own content, same as a plain 2-way split
   * already does for its own one new pane.
   */
  const handleSplitPaneFour = (leafId: PaneId) => {
    const targetStage = forcedStage ?? stage
    const tree = resolveStageValue(viewScreen.layout, targetStage)
    if (!tree) return
    const { tree: afterRow, newPaneId: rightId } = splitLeaf(tree, leafId, 'row', 'end')
    const { tree: afterLeftColumn, newPaneId: bottomLeftId } = splitLeaf(afterRow, leafId, 'column', 'end')
    const { tree: afterRightColumn, newPaneId: bottomRightId } = splitLeaf(afterLeftColumn, rightId, 'column', 'end')
    const nextLayout = writeStageCheckpoint(viewScreen.layout, targetStage, afterRightColumn)
    const originalSlot = viewScreen.paneSlots[leafId] ?? emptySlot()
    const nextPaneSlots = {
      ...viewScreen.paneSlots,
      [rightId]: cloneSlot(originalSlot),
      [bottomLeftId]: cloneSlot(originalSlot),
      [bottomRightId]: cloneSlot(originalSlot),
    }
    applyScreenPatch({ layout: nextLayout, paneSlots: nextPaneSlots })
  }

  /** Resets `leafId`'s own content/background/text-size straight back to a fresh blank `ScreenSlot` — independent of `layout` entirely, applied (and, with Live editing on, persisted) immediately. */
  const handleClearPane = (leafId: PaneId) => {
    applyScreenPatch({ paneSlots: { ...viewScreen.paneSlots, [leafId]: emptySlot() } })
  }

  /** Toggles `leafId`'s own lock at whichever stage is currently being viewed/edited — purely an accidental-edit guard (no PIN/confirmation), checkpointed per-stage exactly like every other slot field, so a pane can be locked on one stage and unlocked on another. */
  const handleTogglePaneLock = (leafId: PaneId) => {
    const targetStage = forcedStage ?? stage
    const slot = viewScreen.paneSlots[leafId] ?? emptySlot()
    const nextLocked = !resolveSlotLocked(slot, targetStage)
    applyScreenPatch({ paneSlots: { ...viewScreen.paneSlots, [leafId]: { ...slot, locked: writeStageCheckpoint(slot.locked, targetStage, nextLocked) } } })
  }

  /** Deletes `leafId` — its sibling takes over the freed space. No-op when it's the only pane left (the delete button isn't rendered at all in that case). Closes the pane editor if it happened to be open on the pane just deleted, since there'd be nothing left to edit. */
  const handleDeletePane = (leafId: PaneId) => {
    const targetStage = forcedStage ?? stage
    const tree = resolveStageValue(viewScreen.layout, targetStage)
    if (!tree) return
    const nextTree = deleteLeaf(tree, leafId)
    if (!nextTree) return
    const nextLayout = writeStageCheckpoint(viewScreen.layout, targetStage, nextTree)
    applyScreenPatch({ layout: nextLayout })
    if (typeof editingTarget === 'object' && editingTarget?.leafId === leafId) setEditingTarget(null)
  }

  /** Toggles `leafId`'s own membership in `selectedLeafIds` — see that state's own doc comment. */
  const toggleLeafChecked = (leafId: PaneId) => {
    setSelectedLeafIds((current) => {
      const next = new Set(current)
      if (next.has(leafId)) next.delete(leafId)
      else next.add(leafId)
      return next
    })
  }

  /** Deletes every currently-checked pane in one combined patch (rather than looping `handleDeletePane`, which would each read the same now-stale `viewScreen` within this same synchronous call) — a no-op if that would leave nothing behind (deleting every pane on the screen), same guard as the single-pane delete button already not rendering at all in that case. */
  const handleDeleteSelected = () => {
    const targetStage = forcedStage ?? stage
    let tree = resolveStageValue(viewScreen.layout, targetStage)
    if (!tree) return
    for (const leafId of activeSelectedLeafIds) {
      const nextTree = deleteLeaf(tree, leafId)
      if (!nextTree) return
      tree = nextTree
    }
    applyScreenPatch({ layout: writeStageCheckpoint(viewScreen.layout, targetStage, tree) })
    if (typeof editingTarget === 'object' && editingTarget !== null && activeSelectedLeafIds.has(editingTarget.leafId)) setEditingTarget(null)
    setSelectedLeafIds(new Set())
  }

  /**
   * Gives every currently-checked pane (already confirmed contiguous — see
   * `canGroupSelected` — before this button is even enabled) the same
   * background color as the largest one among them, and a fresh shared
   * `groupId`, both checkpointed at the *current* stage only — grouping (or
   * a later un-group by splitting one back out) never retroactively touches
   * any other stage (see `ScreenSlot.groupId`'s own doc comment). The
   * border between them then renders to match on its own (see
   * `LayoutTree.tsx`), purely derived from every pane in a split sharing the
   * same resolved `groupId` — nothing else needs writing for that part.
   */
  const handleGroupSelected = () => {
    if (!canGroupSelected) return
    const targetStage = forcedStage ?? stage
    const tree = resolveStageValue(viewScreen.layout, targetStage)
    if (!tree) return
    const rectsById = new Map(computeLayoutGeometry(tree).leaves.map((leaf) => [leaf.id, leaf.rect]))
    const largestLeafId = [...activeSelectedLeafIds].reduce((largest, candidate) => {
      const candidateRect = rectsById.get(candidate)
      const largestRect = rectsById.get(largest)
      if (!candidateRect) return largest
      if (!largestRect) return candidate
      return candidateRect.width * candidateRect.height > largestRect.width * largestRect.height ? candidate : largest
    })
    const largestSlot = viewScreen.paneSlots[largestLeafId] ?? emptySlot()
    const sharedColor = resolveSlotBackgroundColor(largestSlot, targetStage) ?? viewScreen.backgroundColor ?? DEFAULT_SCREEN_BACKGROUND_COLOR
    const groupId = generateId()

    const nextPaneSlots = { ...viewScreen.paneSlots }
    for (const leafId of activeSelectedLeafIds) {
      const slot = nextPaneSlots[leafId] ?? emptySlot()
      nextPaneSlots[leafId] = {
        ...slot,
        backgroundColor: writeStageCheckpoint(slot.backgroundColor, targetStage, sharedColor),
        groupId: writeStageCheckpoint(slot.groupId, targetStage, groupId),
      }
    }
    applyScreenPatch({ paneSlots: nextPaneSlots })
  }

  /**
   * Runs `action` immediately if there's no unresolved pane-resize edit to
   * ask about (see `resizeSessionOriginalTree`), else stashes it and shows
   * the resize fallback prompt first — the same "ask before leaving an edit
   * behind" safety net the pane editor's own session already has via
   * `requestCloseEditor`, but for a divider drag made directly on the live
   * view, which has no modal step of its own to normally catch it in. Used
   * by `handleStepStage`. Only actually asks on a screen with more than one
   * stage — with just one, "keep for next step(s) too" is meaningless
   * (there's nothing to propagate to), and a divider drag has already fully
   * persisted the moment it was released either way.
   */
  const requestPendingResizeAction = (action: () => void) => {
    const screenHasMultipleStages = Boolean(viewScreen.useStages) && (viewScreen.stageCount ?? 1) > 1
    const currentResolvedTree = resolveStageValue(viewScreen.layout, resizeSessionStage)
    if (screenHasMultipleStages && resizeSessionOriginalTree !== undefined && JSON.stringify(resizeSessionOriginalTree) !== JSON.stringify(currentResolvedTree)) {
      setPendingResizeAction(() => action)
      return
    }
    setResizeSessionOriginalTree(undefined)
    action()
  }

  /** The resize fallback prompt's own "keep here only" — nothing further to persist, since a divider drag already writes straight to the active stage's own tree checkpoint the moment it's released; just clears the pending session and runs whatever navigation action was waiting on it. */
  const resolveResizeKeepHere = () => {
    setResizeSessionOriginalTree(undefined)
    const proceed = pendingResizeAction
    setPendingResizeAction(null)
    proceed?.()
  }

  /** The resize fallback prompt's own "keep for next step(s) too" — propagates the resize session's own stage's resolved tree forward onto every later stage's own checkpoint, same idea as `handleKeepForNextSteps`, but for the whole arrangement instead of one pane's own content/background/text size. */
  const resolveResizeKeepForNextSteps = () => {
    if (resizeSessionOriginalTree === undefined) return
    const currentResolvedTree = resolveStageValue(viewScreen.layout, resizeSessionStage)
    if (currentResolvedTree) {
      let nextLayout = viewScreen.layout
      for (let futureStage = resizeSessionStage + 1; futureStage <= (viewScreen.stageCount ?? 1); futureStage++) {
        nextLayout = writeStageCheckpoint(nextLayout, futureStage, currentResolvedTree)
      }
      applyScreenPatch({ layout: nextLayout })
    }
    setResizeSessionOriginalTree(undefined)
    const proceed = pendingResizeAction
    setPendingResizeAction(null)
    proceed?.()
  }

  /** The resize fallback prompt's own "remove edits" — reverts the screen's own resize-session stage back to `resizeSessionOriginalTree`, undoing every divider drag made this session, then runs whatever navigation action was waiting on it. */
  const resolveResizeRemoveEdits = () => {
    if (resizeSessionOriginalTree !== undefined) {
      const nextLayout = writeStageCheckpoint(viewScreen.layout, resizeSessionStage, resizeSessionOriginalTree)
      applyScreenPatch({ layout: nextLayout })
    }
    setResizeSessionOriginalTree(undefined)
    const proceed = pendingResizeAction
    setPendingResizeAction(null)
    proceed?.()
  }

  /** Toggles this screen's own opt-in to the shared screensaver schedule — live, always (not gated by Live editing — see `ScreenConfig.draft`'s own doc comment on which fields are ephemeral/always-live), so it's reflected instantly on any other open tab of this same screen. */
  const handleUseScreensaverChange = (useScreensaver: boolean) => {
    setScreens(screens.map((existing) => (existing.screenID === screen.screenID ? { ...existing, useScreensaver } : existing)))
  }

  /** Toggles the live screensaver preview, independent of the actual schedule — see `ScreenConfig.screensaverTestActive`. */
  const handleTestScreensaverChange = (screensaverTestActive: boolean) => {
    setScreens(screens.map((existing) => (existing.screenID === screen.screenID ? { ...existing, screensaverTestActive } : existing)))
  }

  /** Writes the screen's own background color on every change — no local draft/restore step, unlike the whole-screen scaler's own fields (though it's still subject to the toolbar's own Live editing toggle, same as everything else `applyScreenPatch` routes). */
  const handleScreenBackgroundColorChange = (backgroundColor: string) => applyScreenPatch({ backgroundColor })

  /** Writes the screen's own whole-screen background image — same reasoning as `handleScreenBackgroundColorChange`. */
  const handleScreenBackgroundImageChange = (backgroundImage: BackgroundImage | undefined) => applyScreenPatch({ backgroundImage })

  /** Writes whether shared pane borders show at all — same reasoning as `handleScreenBackgroundColorChange`. */
  const handleShowSlotBordersChange = (showSlotBorders: boolean) => applyScreenPatch({ showSlotBorders })

  /** Writes the shared pane borders' own color — same reasoning as `handleScreenBackgroundColorChange`. */
  const handleBorderColorChange = (borderColor: string | undefined) => applyScreenPatch({ borderColor })

  /** Resets the pane (content/color), its text-size drafts, and which stage tab is active back to the values captured when the editor was opened — the actual persisting still only happens once the editor closes. The whole-screen scaler restores itself internally. */
  const handleRestore = () => {
    setDraftSlot(originalSlot)
    setDraftTextSizes(originalTextSizes)
    setDraftSlotTextSizes(originalSlotTextSizes)
    setActiveStage(initialStage)
  }

  /** The pane as it should be persisted right now: the active stage's own live text-size draft folded into its content checkpoint (when there's more than one stage) and into the pane's own shared/fallback checkpoint unconditionally — the same "fold in the active stage" step `handleActiveStageChange` also does before switching away. */
  const finalizeDraftSlot = (): ScreenSlot => {
    const flushedSlot = flushStageTextSizeIntoSlot(draftSlot, activeStage, draftTextSizes, hasMultipleStages)
    return { ...flushedSlot, textSizes: writeStageCheckpoint(flushedSlot.textSizes, activeStage, draftSlotTextSizes) }
  }

  /** A pane's own single consolidated background image at a stage — the content's own override if it has one, else the pane's shared one — same resolution `PaneEditor`'s own `backgroundImage` prop is fed everywhere else. */
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

  /**
   * Once a `KeepEditPrompt` resolution has done its own persist/discard
   * work, this is the shared "what happens now" tail: continue to
   * `pendingStageSwitchTarget` (seeding the local draft from `resultSlot`)
   * if this prompt was showing because of a stage-tab switch mid-edit, or
   * just close the editor entirely otherwise (a prompt shown because the
   * editor itself was closed — no longer actually reachable now that
   * closing never asks this, but harmless to keep as the fallback).
   */
  const resolveKeepEditPrompt = (resultSlot: ScreenSlot) => {
    setShowKeepEditPrompt(false)
    if (pendingStageSwitchTarget !== null) {
      const target = pendingStageSwitchTarget
      setPendingStageSwitchTarget(null)
      seedDraftForStage(resultSlot, target)
    } else {
      setEditingTarget(null)
    }
  }

  /** Persists whatever the draft currently holds — just the active stage's own checkpoint. Closing the pane editor's modal (its own "Done" button, ×, Escape, clicking outside it) always goes straight here now, no prompt — see `handleActiveStageChange` for where that prompt actually lives instead. Also what `KeepEditPrompt`'s own "keep here only" resolves to, on the rarer path where it's showing because of a stage-tab switch (see `resolveKeepEditPrompt`). */
  const closeEditor = () => {
    if (editingTarget === 'screen') {
      if (screenDraftSnapshot) applyScreenPatch({ textSizes: screenDraftSnapshot.textSizes, paneSlots: screenDraftSnapshot.paneSlots })
      setEditingTarget(null)
      setShowKeepEditPrompt(false)
      return
    }
    if (!editingTarget) return
    const { leafId } = editingTarget
    const finalSlot = finalizeDraftSlot()
    applyScreenPatch({ paneSlots: { ...viewScreen.paneSlots, [leafId]: finalSlot } })
    resolveKeepEditPrompt(finalSlot)
  }

  /** What every way the pane editor's modal can exit (its own "Done" button, ×, Escape, clicking outside it) is wired to — always just persists and closes now, no prompt (see `handleActiveStageChange` for where "should this edit propagate?" is actually asked instead, at the point a step change could otherwise silently carry it forward or lose it). */
  const requestCloseEditor = () => {
    closeEditor()
  }

  /**
   * `KeepEditPrompt`'s own "keep for next step(s) too" — persists the active
   * stage's edit same as `closeEditor`, then overwrites every later stage's
   * own checkpoint for this exact pane (content, its text size, background
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
    const { leafId } = editingTarget
    const finalSlot = finalizeDraftSlot()
    const contentAtStage = resolveSlotContent(finalSlot, activeStage)
    const backgroundColorAtStage = resolveSlotBackgroundColor(finalSlot, activeStage)
    const languageAtStage = resolveSlotLanguage(finalSlot, activeStage)

    let propagatedSlot = finalSlot
    for (let futureStage = activeStage + 1; futureStage <= (viewScreen.stageCount ?? 1); futureStage++) {
      propagatedSlot = {
        ...propagatedSlot,
        content: writeStageCheckpoint(propagatedSlot.content, futureStage, contentAtStage),
        backgroundColor: writeStageCheckpoint(propagatedSlot.backgroundColor, futureStage, backgroundColorAtStage),
        language: writeStageCheckpoint(propagatedSlot.language, futureStage, languageAtStage),
      }
    }

    applyScreenPatch({ paneSlots: { ...viewScreen.paneSlots, [leafId]: propagatedSlot } })
    resolveKeepEditPrompt(propagatedSlot)
  }

  /** `KeepEditPrompt`'s own "remove edits" — discards every change made this editing session. Unlike `closeEditor`, never writes anything back, since the persisted screen already matches `originalSlot`. */
  const handleRemoveEdits = () => {
    resolveKeepEditPrompt(originalSlot)
  }

  const editingLeaves = listLeaves(resolveStageValue(viewScreen.layout, activeStage) ?? Object.values(viewScreen.layout)[0]).map((leaf) => ({ id: leaf.id, slot: viewScreen.paneSlots[leaf.id] }))
  const resizeToFitBlocked =
    typeof editingTarget === 'object' && editingTarget !== null && isResizeToFitConflict(editingLeaves, editingTarget.leafId, activeStage)

  /** What a fresh switch to "Event image"/"Event details" in the currently open pane editor should default its own `eventOrdinal` to — see `findSiblingEventOrdinal`. */
  const suggestedEventOrdinal =
    typeof editingTarget === 'object' && editingTarget !== null
      ? (findSiblingEventOrdinal(
          editingLeaves.filter(({ id }) => id !== editingTarget.leafId).map(({ slot }) => slot),
          activeStage,
        ) ?? 1)
      : 1

  const screensaverActive = Boolean(screen.useScreensaver && (screen.screensaverTestActive || isWithinScreensaverWindow(screensaverSchedule, now)))

  /** Set by `/display-connect` (a plain browser tab acting as a display, no Electron/OS-level fullscreen available) so a manual fullscreen button is still reachable — rendered inside the existing `ScreenToolbar`, which already fades out after inactivity on its own. */
  const showFullscreenButton = new URLSearchParams(window.location.search).has('showFullscreenButton')

  return (
    <div
      className={`screen-display${viewScreen.hideScrollbar ? ' screen-display--hide-scrollbar' : ''}`}
      style={screenAppearanceToCssVars(activeTextSizes, viewScreen.backgroundColor ?? DEFAULT_SCREEN_BACKGROUND_COLOR, viewScreen.borderColor, viewScreen.backgroundImage)}
    >
      {!connected && (
        <div className="screen-display__connection-badge" title={t('screenDisplay.noConnection')} aria-label={t('screenDisplay.noConnection')}>
          <NoConnectionIcon />
        </div>
      )}
      {canEdit && <DashboardWindowControls hidden={!windowControlsVisible} />}
      <ScreenToolbar>
        {canEdit && (
          <>
            <span className="screen-toolbar__label">{screen.name}</span>
            {viewScreen.useStages && (viewScreen.stageCount ?? 1) > 1 && (
              <>
                <span className="screen-toolbar__label screen-toolbar__label--stage">
                  {t('screenDisplay.stageIndicator', { current: forcedStage ?? stage, total: viewScreen.stageCount ?? 1 })}
                </span>
                <StagePlaybackControls
                  stageCount={viewScreen.stageCount ?? 1}
                  stage={forcedStage ?? stage}
                  onScrub={handleScrubToStage}
                  onStep={handleStepStage}
                  playing={!manuallyPaused}
                  onTogglePlaying={() => setManuallyPaused((current) => !current)}
                  fastForward={fastForward}
                  onToggleFastForward={() => setFastForward((current) => !current)}
                  disabled={editingTarget !== null}
                />
              </>
            )}
            <button type="button" className="screen-toolbar__button" onClick={handleAddStage} disabled={editingTarget !== null}>
              {t('screenDisplay.addStageButton')}
            </button>
            {activeSelectedLeafIds.size >= 2 && (
              <>
                <button type="button" className="screen-toolbar__button" onClick={handleDeleteSelected} disabled={editingTarget !== null}>
                  {t('screenDisplay.deleteSelectedButton', { count: activeSelectedLeafIds.size })}
                </button>
                <button type="button" className="screen-toolbar__button" onClick={handleGroupSelected} disabled={editingTarget !== null || !canGroupSelected} title={canGroupSelected ? undefined : t('screenDisplay.groupButtonDisabledHint')}>
                  {t('screenDisplay.groupButton')}
                </button>
              </>
            )}
            <button
              type="button"
              className="screen-toolbar__button"
              onClick={handleRedo}
              disabled={editingTarget !== null || redoStack.length === 0}
              aria-label={t('screenDisplay.redoButton')}
              title={t('screenDisplay.redoButton')}
            >
              <RedoIcon />
            </button>
            <FullscreenToggle />
            <button type="button" className="screen-toolbar__button" onClick={openScreenEditor}>
              {t('screenDisplay.editSizes')}
            </button>
            <Checkbox
              id="screen-display-live-editing"
              label={t('screenDisplay.liveEditing')}
              checked={liveEditing}
              onChange={(event) => setLiveEditing(event.target.checked)}
            />
            {screen.draft && (
              <button type="button" className="screen-toolbar__button" onClick={handlePublish}>
                {t('screenDisplay.publish')}
              </button>
            )}
          </>
        )}
        {!canEdit && showFullscreenButton && <FullscreenToggle />}
      </ScreenToolbar>
      <SplitLayout
        key={screen.screenID}
        screen={effectiveScreen}
        resolveTextSizes={resolveTextSizes}
        onEditSlide={canEdit ? openSlotEditor : undefined}
        stage={stage}
        forcedStage={forcedStage}
        tick={tick}
        onResizeDivider={canEdit ? handleResizeDivider : undefined}
        onDragStateChange={handleDragStateChange}
        onDropImage={canEdit ? handleDropImage : undefined}
        onSplitPane={canEdit ? handleSplitPane : undefined}
        onSplitFour={canEdit ? handleSplitPaneFour : undefined}
        onBorderClick={canEdit ? openBorderEditor : undefined}
        onTogglePaneLock={canEdit ? handleTogglePaneLock : undefined}
        selectedLeafIds={activeSelectedLeafIds}
        onToggleChecked={canEdit ? toggleLeafChecked : undefined}
        defaultPaneLanguage={defaultPaneLanguage}
        onRequestStageAdvance={handleVideoEndedAdvance}
        selectedLeafId={typeof editingTarget === 'object' && editingTarget !== null ? editingTarget.leafId : undefined}
        dimUnselectedPanes={typeof editingTarget === 'object' && editingTarget !== null}
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

      <Modal open={pendingResizeAction !== null} onClose={resolveResizeKeepHere} title={t('screenDisplay.keepEditPrompt.title')}>
        <KeepEditPrompt changes={RESIZE_CHANGES} onKeepHere={resolveResizeKeepHere} onKeepForNextSteps={resolveResizeKeepForNextSteps} onRemoveEdits={resolveResizeRemoveEdits} />
      </Modal>

      <Modal
        open={editingTarget === 'screen'}
        onClose={requestCloseEditor}
        title={t('screenDisplay.textSizeEditor.title')}
        route={
          screenSubview === 'background' ? t('admin.screens.backgroundLabel') : screenSubview === 'border' ? t('admin.screens.bordersLabel') : undefined
        }
      >
        {screenSubview === 'background' ? (
          <>
            <BackButton onClick={() => setScreenSubview(null)}>{t('admin.common.back')}</BackButton>
            <BackgroundEditor
              backgroundColor={viewScreen.backgroundColor ?? DEFAULT_SCREEN_BACKGROUND_COLOR}
              onBackgroundColorChange={handleScreenBackgroundColorChange}
              backgroundImage={viewScreen.backgroundImage}
              onBackgroundImageChange={handleScreenBackgroundImageChange}
            />
          </>
        ) : screenSubview === 'border' ? (
          <>
            <BackButton onClick={() => setScreenSubview(null)}>{t('admin.common.back')}</BackButton>
            <BorderSettingsEditor
              showSlotBorders={viewScreen.showSlotBorders ?? false}
              onShowSlotBordersChange={handleShowSlotBordersChange}
              borderColor={viewScreen.borderColor}
              onBorderColorChange={handleBorderColorChange}
            />
          </>
        ) : (
          <GlobalTextSizeScaler
            screen={viewScreen}
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
        )}
      </Modal>

      <FloatingPanel
        open={typeof editingTarget === 'object' && editingTarget !== null}
        onClose={requestCloseEditor}
        title={showKeepEditPrompt ? t('screenDisplay.keepEditPrompt.title') : t('screenDisplay.slotEditorTitle')}
        footer={
          !showKeepEditPrompt && (
            <>
              <Button type="button" variant="secondary" onClick={handleRestore}>
                {t('screenDisplay.textSizeEditor.restorePrevious')}
              </Button>
              <Button type="button" onClick={requestCloseEditor}>
                {t('screenDisplay.textSizeEditor.done')}
              </Button>
            </>
          )
        }
      >
        {showKeepEditPrompt ? (
          <KeepEditPrompt
            changes={detectSlotEditChanges()}
            onKeepHere={closeEditor}
            onKeepForNextSteps={handleKeepForNextSteps}
            onRemoveEdits={handleRemoveEdits}
          />
        ) : (
          <SlotEditor
            id={typeof editingTarget === 'object' && editingTarget !== null ? editingTarget.leafId : 'slot'}
            slot={draftSlot}
            onSlotChange={setDraftSlot}
            useStages={Boolean(viewScreen.useStages)}
            stageCount={viewScreen.stageCount ?? 1}
            activeStage={activeStage}
            onActiveStageChange={handleActiveStageChange}
            textSizes={draftTextSizes}
            onTextSizesChange={setDraftTextSizes}
            slotTextSizes={draftSlotTextSizes}
            onSlotTextSizesChange={setDraftSlotTextSizes}
            resizeToFitBlocked={resizeToFitBlocked}
            suggestedEventOrdinal={suggestedEventOrdinal}
            defaultLanguage={defaultPaneLanguage}
            onClearPane={
              typeof editingTarget === 'object' && editingTarget !== null
                ? () => {
                    handleClearPane(editingTarget.leafId)
                    seedDraftForStage(emptySlot(), activeStage)
                  }
                : undefined
            }
            onDeletePane={typeof editingTarget === 'object' && editingTarget !== null ? () => handleDeletePane(editingTarget.leafId) : undefined}
            canDeletePane={editingLeaves.length > 1}
          />
        )}
      </FloatingPanel>
    </div>
  )
}
