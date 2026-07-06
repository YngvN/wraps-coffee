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
import { DEFAULT_SCREEN_BACKGROUND_COLOR, DEFAULT_TEXT_SIZES, type ScreenConfig, type TextSizes } from '../types/screen'
import { getScreenColorVars } from '../utils/screenColors'
import { textSizesToCssVars } from '../utils/textSizeVars'
import './ScreenDisplay.scss'

/** Maps a screen's text sizes and background color to the CSS custom properties the whole display (and, by inheritance, any slot without its own override) reads from. */
function screenAppearanceToCssVars(textSizes: TextSizes, backgroundColor: string): CSSProperties {
  return { ...textSizesToCssVars(textSizes), ...getScreenColorVars(backgroundColor) } as CSSProperties
}

/** The persisted (non-live-draft) effective text sizes for a slot: its own override, else the screen's own, else the global default. */
function getPersistedSlotTextSizes(screen: ScreenConfig, slotIndex: number): TextSizes {
  return screen.slotTextSizes?.[slotIndex] ?? screen.textSizes ?? DEFAULT_TEXT_SIZES
}

/** Which appearance settings are currently open for editing: the whole screen's defaults (incl. background color), one specific slot's text sizes, or nothing. */
type EditingTarget = 'screen' | number | null

/**
 * Fullscreen kiosk display for a single configured screen, reached at
 * `/screens/:screenId`. No site chrome. Looks up the screen live via
 * `useScreens()`, so admin edits (or the screen being deleted) made in
 * another tab of the same browser are reflected here without a refresh.
 *
 * Includes two in-place editing entry points, both live-previewed before
 * saving: the toolbar's "Edit appearance" button edits the whole screen's
 * default text sizes and background color, while hovering any individual
 * slot's pane reveals a small button to override just that slot's text
 * sizes (e.g. making one category's text bigger than the rest).
 */
export function ScreenDisplay() {
  const { t } = useLanguage()
  const { screenId } = useParams<{ screenId: string }>()
  const [screens, setScreens] = useScreens()
  const screen = screens.find((candidate) => candidate.screenID === screenId)
  const [editingTarget, setEditingTarget] = useState<EditingTarget>(null)
  const [draftTextSizes, setDraftTextSizes] = useState<TextSizes>(DEFAULT_TEXT_SIZES)
  const [draftBackgroundColor, setDraftBackgroundColor] = useState(DEFAULT_SCREEN_BACKGROUND_COLOR)

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

  /** Resolves the sizes a given slot should render with right now: its own live draft if that slot is being edited, its own saved override, or (if the whole screen is being edited and this slot has no override of its own) the screen-level draft, else the persisted effective value. */
  const resolveSlotTextSizes = (slotIndex: number): TextSizes => {
    if (editingTarget === slotIndex) return draftTextSizes
    const slotOverride = screen.slotTextSizes?.[slotIndex]
    if (slotOverride) return slotOverride
    if (editingTarget === 'screen') return draftTextSizes
    return screen.textSizes ?? DEFAULT_TEXT_SIZES
  }

  const openScreenEditor = () => {
    setDraftTextSizes(screen.textSizes ?? DEFAULT_TEXT_SIZES)
    setDraftBackgroundColor(screen.backgroundColor ?? DEFAULT_SCREEN_BACKGROUND_COLOR)
    setEditingTarget('screen')
  }

  const openSlotEditor = (slotIndex: number) => {
    setDraftTextSizes(getPersistedSlotTextSizes(screen, slotIndex))
    setEditingTarget(slotIndex)
  }

  const closeEditor = () => setEditingTarget(null)

  const handleSave = () => {
    setScreens(
      screens.map((existing) => {
        if (existing.screenID !== screen.screenID) return existing
        if (editingTarget === 'screen') return { ...existing, textSizes: draftTextSizes, backgroundColor: draftBackgroundColor }
        if (typeof editingTarget === 'number') return { ...existing, slotTextSizes: { ...existing.slotTextSizes, [editingTarget]: draftTextSizes } }
        return existing
      }),
    )
    closeEditor()
  }

  return (
    <div className="screen-display" style={screenAppearanceToCssVars(activeTextSizes, activeBackgroundColor)}>
      <ScreenToolbar>
        <FullscreenToggle />
        <button type="button" className="screen-toolbar__button" onClick={openScreenEditor}>
          {t('screenDisplay.editSizes')}
        </button>
      </ScreenToolbar>
      {screen.layout === 'slideshow' ? (
        <SlideshowLayout key={screen.screenID} screen={screen} resolveSlotTextSizes={resolveSlotTextSizes} onEditSlot={openSlotEditor} />
      ) : (
        <SplitLayout key={screen.screenID} screen={screen} resolveSlotTextSizes={resolveSlotTextSizes} onEditSlot={openSlotEditor} />
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
          onSave={handleSave}
          onCancel={closeEditor}
        />
      </Modal>
    </div>
  )
}
