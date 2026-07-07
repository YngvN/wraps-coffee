import type { CSSProperties } from 'react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Modal } from '../components'
import { FullscreenToggle } from '../features/screens/FullscreenToggle'
import { ScreenToolbar } from '../features/screens/ScreenToolbar'
import { SlideshowLayout } from '../features/screens/SlideshowLayout'
import { SplitLayout } from '../features/screens/SplitLayout'
import { TextSizeEditor } from '../features/screens/TextSizeEditor'
import { useScreens } from '../hooks/useScreens'
import { useLanguage } from '../i18n'
import { DEFAULT_SCREEN_BACKGROUND_COLOR, DEFAULT_TEXT_SIZES, type ScreenConfig, type ScreenSlotContent, type TextSizes } from '../types/screen'
import { getScreenColorVars } from '../utils/screenColors'
import { resolveContentTextSizes, textSizesToCssVars } from '../utils/textSizeVars'
import './ScreenDisplay.scss'

/** Maps a screen's text sizes and background color to the CSS custom properties the whole display (and, by inheritance, any slot without its own override) reads from. */
function screenAppearanceToCssVars(textSizes: TextSizes, backgroundColor: string): CSSProperties {
  return { ...textSizesToCssVars(textSizes), ...getScreenColorVars(backgroundColor) } as CSSProperties
}

/** The persisted (non-live-draft) effective text sizes for a slot as a whole: its own override, else the screen's own, else the global default. Used both as the shared fallback for that slot's slides and as what editing "the slot" (rather than one specific slide) reads/writes. */
function getPersistedSlotTextSizes(screen: ScreenConfig, slotIndex: number): TextSizes {
  return screen.slotTextSizes?.[slotIndex] ?? screen.textSizes ?? DEFAULT_TEXT_SIZES
}

/** Identifies one specific slide being edited: which slot it's in, and its own index within that slot's `contents`. */
interface SlideTarget {
  slotIndex: number
  contentIndex: number
}

/** Which appearance settings are currently open for editing: the whole screen's defaults (incl. background color), one specific slide's text sizes, or nothing. */
type EditingTarget = 'screen' | SlideTarget | null

/**
 * Fullscreen kiosk display for a single configured screen, reached at
 * `/screens/:screenId`. No site chrome. Looks up the screen live via
 * `useScreens()`, so admin edits (or the screen being deleted) made in
 * another tab of the same browser are reflected here without a refresh.
 *
 * Includes two in-place editing entry points, both live-previewed as you
 * drag a slider: the toolbar's "Edit appearance" button edits the whole
 * screen's default text sizes and background color, while hovering any
 * individual slide reveals a small button to edit its own text sizes. For a
 * slide that's part of a slideshow-enabled slot with more than one slide,
 * that editor also offers a checkbox to opt just that slide out of the
 * slot's shared size and give it its own — every other slide in the slot
 * keeps sharing the slot's size either way. Neither editor has a "Save"
 * step — the in-progress draft is written to the persisted screen as soon
 * as it closes (whether via its own "Done" button, the modal's × / Escape,
 * or clicking outside it), and a "Restore previous" button resets the
 * draft back to the values it had when the editor was opened. Any rotation
 * (the screen-level slideshow, or a slot's own in-place one) is paused
 * while an editor is open, so the live preview isn't pulled out from under
 * the slide being edited.
 */
export function ScreenDisplay() {
  const { t } = useLanguage()
  const { screenId } = useParams<{ screenId: string }>()
  const [screens, setScreens] = useScreens()
  const screen = screens.find((candidate) => candidate.screenID === screenId)
  const [editingTarget, setEditingTarget] = useState<EditingTarget>(null)
  const [draftTextSizes, setDraftTextSizes] = useState<TextSizes>(DEFAULT_TEXT_SIZES)
  const [draftUseOwnTextSizes, setDraftUseOwnTextSizes] = useState(false)
  const [draftBackgroundColor, setDraftBackgroundColor] = useState(DEFAULT_SCREEN_BACKGROUND_COLOR)
  const [originalTextSizes, setOriginalTextSizes] = useState<TextSizes>(DEFAULT_TEXT_SIZES)
  const [originalUseOwnTextSizes, setOriginalUseOwnTextSizes] = useState(false)
  const [originalBackgroundColor, setOriginalBackgroundColor] = useState(DEFAULT_SCREEN_BACKGROUND_COLOR)

  if (!screen) {
    return (
      <div className="screen-display screen-display--not-found" style={getScreenColorVars(DEFAULT_SCREEN_BACKGROUND_COLOR) as CSSProperties}>
        <h1>{t('screenDisplay.notFound.title')}</h1>
        <p>{t('screenDisplay.notFound.message')}</p>
      </div>
    )
  }

  const activeTextSizes = editingTarget === 'screen' ? draftTextSizes : (screen.textSizes ?? DEFAULT_TEXT_SIZES)
  const activeBackgroundColor = editingTarget === 'screen' ? draftBackgroundColor : (screen.backgroundColor ?? DEFAULT_SCREEN_BACKGROUND_COLOR)

  /**
   * Resolves the sizes a given slide should render with right now: the live
   * draft if that exact slide is the one being edited; else its own
   * persisted override (independent of anything else being edited); else
   * the screen-level draft if the whole screen is being edited; else the
   * slot's persisted effective value.
   */
  const resolveTextSizes = (slotIndex: number, contentIndex: number, content: ScreenSlotContent): TextSizes => {
    const isThisSlideBeingEdited = typeof editingTarget === 'object' && editingTarget !== null && editingTarget.slotIndex === slotIndex && editingTarget.contentIndex === contentIndex
    if (isThisSlideBeingEdited) return draftTextSizes
    if (content.kind !== 'none' && content.useOwnTextSizes && content.textSizes) return content.textSizes
    if (editingTarget === 'screen') return draftTextSizes
    return getPersistedSlotTextSizes(screen, slotIndex)
  }

  const openScreenEditor = () => {
    const currentTextSizes = screen.textSizes ?? DEFAULT_TEXT_SIZES
    const currentBackgroundColor = screen.backgroundColor ?? DEFAULT_SCREEN_BACKGROUND_COLOR
    setDraftTextSizes(currentTextSizes)
    setOriginalTextSizes(currentTextSizes)
    setDraftBackgroundColor(currentBackgroundColor)
    setOriginalBackgroundColor(currentBackgroundColor)
    setEditingTarget('screen')
  }

  const openSlideEditor = (slotIndex: number, contentIndex: number) => {
    const content = screen.slots[slotIndex]?.contents[contentIndex] ?? { kind: 'none' as const }
    const sharedTextSizes = getPersistedSlotTextSizes(screen, slotIndex)
    const useOwn = content.kind !== 'none' && Boolean(content.useOwnTextSizes)
    const effective = resolveContentTextSizes(content, sharedTextSizes)
    setDraftTextSizes(effective)
    setOriginalTextSizes(effective)
    setDraftUseOwnTextSizes(useOwn)
    setOriginalUseOwnTextSizes(useOwn)
    setEditingTarget({ slotIndex, contentIndex })
  }

  /** Resets the draft (and, when applicable, the own-size checkbox/background color) back to the values captured when the editor was opened — the actual persisting still only happens once the editor closes. */
  const handleRestore = () => {
    setDraftTextSizes(originalTextSizes)
    setDraftUseOwnTextSizes(originalUseOwnTextSizes)
    if (editingTarget === 'screen') setDraftBackgroundColor(originalBackgroundColor)
  }

  /** Persists whatever the draft currently holds, then closes the editor. Wired to every way the modal can exit (its own "Done" button, ×, Escape, and clicking outside it), so there's no separate save step to remember. */
  const closeEditor = () => {
    setScreens(
      screens.map((existing) => {
        if (existing.screenID !== screen.screenID) return existing
        if (editingTarget === 'screen') return { ...existing, textSizes: draftTextSizes, backgroundColor: draftBackgroundColor }
        if (editingTarget) {
          const { slotIndex, contentIndex } = editingTarget
          const slots = existing.slots.map((slot, index) => {
            if (index !== slotIndex) return slot
            const contents = slot.contents.map((content, i) => {
              if (i !== contentIndex || content.kind === 'none') return content
              return draftUseOwnTextSizes ? { ...content, useOwnTextSizes: true, textSizes: draftTextSizes } : { ...content, useOwnTextSizes: false }
            })
            return { ...slot, contents }
          }) as ScreenConfig['slots']
          const slotTextSizes = draftUseOwnTextSizes ? existing.slotTextSizes : { ...existing.slotTextSizes, [slotIndex]: draftTextSizes }
          return { ...existing, slots, slotTextSizes }
        }
        return existing
      }),
    )
    setEditingTarget(null)
  }

  const editingSlot = typeof editingTarget === 'object' && editingTarget !== null ? screen.slots[editingTarget.slotIndex] : undefined
  const editingSlotActiveCount = editingSlot ? editingSlot.contents.filter((content) => content.kind !== 'none').length : 0
  const showOwnTextSizeOption = Boolean(editingSlot?.isSlideshow) && editingSlotActiveCount > 1

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
      {screen.layout === 'slideshow' ? (
        <SlideshowLayout key={screen.screenID} screen={screen} resolveTextSizes={resolveTextSizes} onEditSlide={openSlideEditor} paused={editingTarget !== null} />
      ) : (
        <SplitLayout key={screen.screenID} screen={screen} resolveTextSizes={resolveTextSizes} onEditSlide={openSlideEditor} paused={editingTarget !== null} />
      )}

      <Modal
        open={editingTarget !== null}
        onClose={closeEditor}
        title={editingTarget === 'screen' ? t('screenDisplay.textSizeEditor.title') : t('screenDisplay.slotTextSizeEditorTitle')}
      >
        <TextSizeEditor
          textSizes={draftTextSizes}
          onChange={setDraftTextSizes}
          backgroundColor={editingTarget === 'screen' ? draftBackgroundColor : undefined}
          onBackgroundColorChange={editingTarget === 'screen' ? setDraftBackgroundColor : undefined}
          ownTextSizes={showOwnTextSizeOption ? { useOwn: draftUseOwnTextSizes, onUseOwnChange: setDraftUseOwnTextSizes } : undefined}
          onRestore={handleRestore}
          onDone={closeEditor}
        />
      </Modal>
    </div>
  )
}
