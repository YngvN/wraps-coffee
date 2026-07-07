import type { CSSProperties } from 'react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Modal } from '../components'
import { FullscreenToggle } from '../features/screens/FullscreenToggle'
import { GlobalTextSizeScaler, type SizeSnapshot } from '../features/screens/GlobalTextSizeScaler'
import { ScreenToolbar } from '../features/screens/ScreenToolbar'
import { SlotEditor } from '../features/screens/SlotEditor'
import { SplitLayout } from '../features/screens/SplitLayout'
import { useScreens } from '../hooks/useScreens'
import { useLanguage } from '../i18n'
import { DEFAULT_SCREEN_BACKGROUND_COLOR, DEFAULT_TEXT_SIZES, type ScreenConfig, type ScreenSlot, type ScreenSlotContent, type TextSizes } from '../types/screen'
import { getScreenColorVars } from '../utils/screenColors'
import { hasOwnTextSizeFields, type SlideTarget } from '../utils/screenSlots'
import { resolveContentTextSizes, textSizesToCssVars } from '../utils/textSizeVars'
import './ScreenDisplay.scss'

/** A slot with no selection yet — the starting draft before a slot's own data has been seeded in. */
const EMPTY_SLOT: ScreenSlot = { isSlideshow: false, contents: [{ kind: 'none' }] }

/** Maps a screen's text sizes and background color to the CSS custom properties the whole display (and, by inheritance, any slot without its own override) reads from. */
function screenAppearanceToCssVars(textSizes: TextSizes, backgroundColor: string): CSSProperties {
  return { ...textSizesToCssVars(textSizes), ...getScreenColorVars(backgroundColor) } as CSSProperties
}

/** The persisted (non-live-draft) effective text sizes for a slot as a whole: its own override, else the screen's own, else the global default. Used both as the shared fallback for that slot's slides and as what editing "the slot" (rather than one specific slide) reads/writes. */
function getPersistedSlotTextSizes(screen: ScreenConfig, slotIndex: number): TextSizes {
  return screen.slotTextSizes?.[slotIndex] ?? screen.textSizes ?? DEFAULT_TEXT_SIZES
}

/** Which appearance settings are currently open for editing: the whole screen's defaults (incl. background color), one specific slot (opened via its currently-showing slide), or nothing. */
type EditingTarget = 'screen' | SlideTarget | null

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
 * all together, relative to whatever each currently is — plus, for any slot
 * that already has its own individual color, a swatch picker for that slot
 * (the screen's own overall background color is only editable from the
 * admin dashboard, not here — per-slot color is enough on the display
 * itself). Hovering any individual slide instead reveals a small "Edit
 * slot" button covering that whole slot: its content list (change/add/
 * remove slides), its own slideshow toggle and (when relevant) the shared
 * rotation timer, its own background color (standard is transparent,
 * showing the screen's own color through), and its text sizes — including,
 * for a slide that's part of a slideshow-enabled slot with more than one
 * slide, a checkbox to opt just that slide out of the slot's shared size
 * and give it its own. Neither editor has a "Save" step — the in-progress
 * draft is written to the persisted screen as soon as it closes (whether
 * via its own "Done" button, the modal's × / Escape, or clicking outside
 * it), and a "Restore previous" button resets the draft back to the values
 * it had when the editor was opened. Any slot's own in-place rotation is
 * paused while an editor is open, so the live preview isn't pulled out from
 * under the slide being edited.
 */
export function ScreenDisplay() {
  const { t } = useLanguage()
  const { screenId } = useParams<{ screenId: string }>()
  const [screens, setScreens] = useScreens()
  const screen = screens.find((candidate) => candidate.screenID === screenId)
  const [editingTarget, setEditingTarget] = useState<EditingTarget>(null)
  const [screenDraftSnapshot, setScreenDraftSnapshot] = useState<SizeSnapshot | null>(null)
  const [draftSlot, setDraftSlot] = useState<ScreenSlot>(EMPTY_SLOT)
  const [originalSlot, setOriginalSlot] = useState<ScreenSlot>(EMPTY_SLOT)
  const [draftTextSizes, setDraftTextSizes] = useState<TextSizes>(DEFAULT_TEXT_SIZES)
  const [draftUseOwnTextSizes, setDraftUseOwnTextSizes] = useState(false)
  const [originalTextSizes, setOriginalTextSizes] = useState<TextSizes>(DEFAULT_TEXT_SIZES)
  const [originalUseOwnTextSizes, setOriginalUseOwnTextSizes] = useState(false)

  if (!screen) {
    return (
      <div className="screen-display screen-display--not-found" style={getScreenColorVars(DEFAULT_SCREEN_BACKGROUND_COLOR) as CSSProperties}>
        <h1>{t('screenDisplay.notFound.title')}</h1>
        <p>{t('screenDisplay.notFound.message')}</p>
      </div>
    )
  }

  const activeTextSizes = editingTarget === 'screen' && screenDraftSnapshot ? screenDraftSnapshot.textSizes : (screen.textSizes ?? DEFAULT_TEXT_SIZES)
  const activeBackgroundColor = screen.backgroundColor ?? DEFAULT_SCREEN_BACKGROUND_COLOR

  /** The screen as it should currently render: the slot being edited (if any) swapped for its live draft, so content/slideshow/color changes preview immediately, same as text-size changes already do. */
  const effectiveScreen: ScreenConfig =
    typeof editingTarget === 'object' && editingTarget !== null
      ? { ...screen, slots: screen.slots.map((slot, index) => (index === editingTarget.slotIndex ? draftSlot : slot)) as ScreenConfig['slots'] }
      : screen

  /**
   * Resolves the sizes a given slide should render with right now: the live
   * draft if that exact slide is the one being edited; the whole-screen
   * percentage scaler's live draft (its own resolved value for this exact
   * slide, own-override or not) if the whole screen is being edited; else
   * its own persisted override if it has one; else the slot's persisted
   * effective value.
   */
  const resolveTextSizes = (slotIndex: number, contentIndex: number, content: ScreenSlotContent): TextSizes => {
    const isThisSlideBeingEdited = typeof editingTarget === 'object' && editingTarget !== null && editingTarget.slotIndex === slotIndex && editingTarget.contentIndex === contentIndex
    if (isThisSlideBeingEdited) return draftTextSizes

    if (editingTarget === 'screen' && screenDraftSnapshot) {
      const draftContent = screenDraftSnapshot.slots[slotIndex].contents[contentIndex]
      return resolveContentTextSizes(draftContent, screenDraftSnapshot.slotTextSizes[slotIndex])
    }

    return resolveContentTextSizes(content, getPersistedSlotTextSizes(screen, slotIndex))
  }

  const openScreenEditor = () => {
    setScreenDraftSnapshot(null)
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
    setEditingTarget({ slotIndex, contentIndex })
  }

  /** The screen's shared rotation timer is a live setting, not part of any slot's draft — it applies (and persists) immediately, same as any other admin-dashboard edit. */
  const handleSlideDurationChange = (seconds: number) => {
    setScreens(screens.map((existing) => (existing.screenID === screen.screenID ? { ...existing, slideDurationSeconds: seconds } : existing)))
  }

  /** Resets the slot (content/slideshow/color) and text-size drafts back to the values captured when the editor was opened — the actual persisting still only happens once the editor closes. The whole-screen scaler restores itself internally. */
  const handleRestore = () => {
    setDraftSlot(originalSlot)
    setDraftTextSizes(originalTextSizes)
    setDraftUseOwnTextSizes(originalUseOwnTextSizes)
  }

  /** Persists whatever the draft currently holds, then closes the editor. Wired to every way the modal can exit (its own "Done" button, ×, Escape, and clicking outside it), so there's no separate save step to remember. */
  const closeEditor = () => {
    setScreens(
      screens.map((existing) => {
        if (existing.screenID !== screen.screenID) return existing
        if (editingTarget === 'screen') {
          if (!screenDraftSnapshot) return existing
          return { ...existing, textSizes: screenDraftSnapshot.textSizes, slotTextSizes: screenDraftSnapshot.slotTextSizes, slots: screenDraftSnapshot.slots }
        }
        if (editingTarget) {
          const { slotIndex, contentIndex } = editingTarget
          const contents = draftSlot.contents.map((content, i) => {
            if (i !== contentIndex || !hasOwnTextSizeFields(content)) return content
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

  return (
    <div
      className={`screen-display${screen.hideScrollbar ? ' screen-display--hide-scrollbar' : ''}`}
      style={screenAppearanceToCssVars(activeTextSizes, activeBackgroundColor)}
    >
      <ScreenToolbar>
        <span className="screen-toolbar__label">{screen.name}</span>
        <FullscreenToggle />
        <button type="button" className="screen-toolbar__button" onClick={openScreenEditor}>
          {t('screenDisplay.editSizes')}
        </button>
      </ScreenToolbar>
      <SplitLayout key={screen.screenID} screen={effectiveScreen} resolveTextSizes={resolveTextSizes} onEditSlide={openSlideEditor} paused={editingTarget !== null} />

      <Modal
        open={editingTarget !== null}
        onClose={closeEditor}
        title={editingTarget === 'screen' ? t('screenDisplay.textSizeEditor.title') : t('screenDisplay.slotEditorTitle')}
      >
        {editingTarget === 'screen' ? (
          <GlobalTextSizeScaler screen={screen} onChange={setScreenDraftSnapshot} onDone={closeEditor} />
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
            onRestore={handleRestore}
            onDone={closeEditor}
          />
        )}
      </Modal>
    </div>
  )
}
