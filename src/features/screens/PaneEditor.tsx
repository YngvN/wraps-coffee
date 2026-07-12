import { useState } from 'react'
import { BackButton, Button, SlideTransition } from '../../components'
import { useBackLevel } from '../../hooks/useBackLevel'
import { useLanguage, type LanguageCode } from '../../i18n'
import { goBack } from '../../lib/backStack'
import type { BackgroundImage, ScreenSlotContent, TextSizes } from '../../types/screen'
import { hasOwnTextSizeFields } from '../../utils/screenSlots'
import { BackgroundColorPicker } from './BackgroundColorPicker'
import { BackgroundImagePicker } from './BackgroundImagePicker'
import './PaneEditor.scss'
import { PaneLanguagePicker } from './PaneLanguagePicker'
import { SlideFields } from './SlideFields'
import { StageTabs } from './StageTabs'
import { TextSizeEditor } from './TextSizeEditor'

/** Which of `PaneEditor`'s own 4 views is currently showing — reset to `'main'` whenever the pane being edited changes (`id`), so switching panes never leaves a stale sub-view open. */
type PaneEditorSubview = 'main' | 'text-size' | 'background' | 'language'

interface PaneEditorProps {
  /** Stable identifier for the pane being edited (e.g. "slot-1"), used to build unique field ids and to reset back to the main view when it changes. */
  id: string
  content: ScreenSlotContent
  onContentChange: (content: ScreenSlotContent) => void
  backgroundColor: string | undefined
  onBackgroundColorChange: (color: string | undefined) => void
  /** Already resolved by the caller: the content's own override if it has one, else the pane's shared one (see `resolveContentBackgroundImage`) — edited here as a single field regardless of which of those two it actually lives on; the caller's own `onBackgroundImageChange` decides where a change is written back to. */
  backgroundImage: BackgroundImage | undefined
  onBackgroundImageChange: (image: BackgroundImage | undefined) => void
  textSizes: TextSizes
  onTextSizesChange: (sizes: TextSizes) => void
  /** `undefined` means "use the cafe's own Standard pane language" (see `useDefaultPaneLanguage`) — the caller's own `onLanguageChange` decides where an explicit override is written back to. */
  language: LanguageCode | undefined
  onLanguageChange: (language: LanguageCode | undefined) => void
  /** The Standard pane language's own current value — shown on the "Language" sub-view's own "Standard" button so it's clear what inheriting it actually means right now (see `PaneLanguagePicker`). */
  defaultLanguage: LanguageCode
  useStages: boolean
  stageCount: number
  activeStage: number
  onActiveStageChange: (stage: number) => void
  /** Accessible label for the content-kind selector. */
  label: string
  resizeToFitBlocked?: boolean
  /** Forwarded straight to `SlideFields` — see its own doc comment. */
  suggestedEventOrdinal: number
  /** Reports this editor's own currently open sub-view by name (undecorated — just "Background"/"Edit text size", or `undefined` back on the main view), so the caller can prefix its own breadcrumb (e.g. "Pane 1 - Background") however it sees fit. */
  onRouteChange?: (route: string | undefined) => void
  /** Resets the draft back to what it was when this editor opened. Omit (along with `onDone`) for a usage with no such notion — everything already applies live with no "previous" snapshot of its own (the admin form's per-pane tab). */
  onRestore?: () => void
  /** Closes this editor (or, for the admin form's inline tab, returns to the pane's own "Global" tab). Omit to hide the button entirely. */
  onDone?: () => void
  /** Hides this editor's own sub-view Back button — set by a caller (the admin form's per-pane tab) that already has its own single Back button one level up, covering this sub-view too via the same shared browser-back stack (see `useBackLevel`); the live display's own editor, with no such button elsewhere, leaves this on (the default). */
  hideBackButton?: boolean
}

/**
 * One pane's full settings, shared by both places a pane can be edited from
 * — the admin dashboard's own per-slot tab (`ScreenForm`) and the live
 * display's own "Edit pane" modal (`SlotEditor`) — so the two work
 * identically and neither has fields the other lacks. Owns its own 3-view
 * submenu navigation (main / "Edit text size" / "Background" / "Language")
 * internally, sliding between them the same way `ScreenForm`'s own outer
 * sub-views do (see `SlideTransition`). The main view shows the
 * content-kind picker (`SlideFields`), then "Edit text size" (only for a
 * content kind that has its own text, see `hasOwnTextSizeFields`),
 * "Background", and "Language" buttons opening their own sub-view, followed
 * by `onRestore`/`onDone` if the caller provides them.
 * Every field here is presentational/controlled — resolved values in,
 * `onChange` callbacks out — so callers with genuinely different
 * persistence models (`ScreenForm` applies every change live and
 * immediately; the live display's own editor collects them in a draft first)
 * can each wire it up with their own handlers without this component
 * needing to know which.
 */
export function PaneEditor({
  id,
  content,
  onContentChange,
  backgroundColor,
  onBackgroundColorChange,
  backgroundImage,
  onBackgroundImageChange,
  textSizes,
  onTextSizesChange,
  language,
  onLanguageChange,
  defaultLanguage,
  useStages,
  stageCount,
  activeStage,
  onActiveStageChange,
  label,
  resizeToFitBlocked,
  suggestedEventOrdinal,
  onRouteChange,
  onRestore,
  onDone,
  hideBackButton,
}: PaneEditorProps) {
  const { t } = useLanguage()
  const [subview, setSubview] = useState<PaneEditorSubview>('main')
  const [direction, setDirection] = useState<1 | -1>(1)
  const hasMultipleStages = useStages && stageCount > 1

  const openTextSize = () => {
    setDirection(1)
    setSubview('text-size')
    onRouteChange?.(t('admin.screens.editTextSize'))
  }

  const openBackground = () => {
    setDirection(1)
    setSubview('background')
    onRouteChange?.(t('admin.screens.backgroundLabel'))
  }

  const openLanguage = () => {
    setDirection(1)
    setSubview('language')
    onRouteChange?.(t('admin.screens.languageLabel'))
  }

  const closeSubview = () => {
    setDirection(-1)
    setSubview('main')
    onRouteChange?.(undefined)
  }

  /** Registers this editor's own open sub-view as one level of the shared browser-back stack (see `useBackLevel`) — its own Back button (or, when `hideBackButton` hides it, a caller's own one level up) closes it via the exact same `goBack` either way. */
  useBackLevel(subview !== 'main', closeSubview)

  if (subview === 'text-size') {
    return (
      <SlideTransition viewKey={`${id}-text-size`} direction={direction}>
        <div className="pane-editor__subview">
          {!hideBackButton && <BackButton onClick={goBack}>{t('admin.common.back')}</BackButton>}
          <TextSizeEditor textSizes={textSizes} onChange={onTextSizesChange} onRestore={onRestore} onDone={onDone} />
        </div>
      </SlideTransition>
    )
  }

  if (subview === 'background') {
    return (
      <SlideTransition viewKey={`${id}-background`} direction={direction}>
        <div className="pane-editor__subview">
          {!hideBackButton && <BackButton onClick={goBack}>{t('admin.common.back')}</BackButton>}
          <BackgroundColorPicker backgroundColor={backgroundColor} onChange={onBackgroundColorChange} allowTransparent />
          <span className="pane-editor__label">{t('screenDisplay.textSizeEditor.backgroundImageLabel')}</span>
          <BackgroundImagePicker id={`${id}-bg-image`} backgroundImage={backgroundImage} onChange={onBackgroundImageChange} />
        </div>
      </SlideTransition>
    )
  }

  if (subview === 'language') {
    return (
      <SlideTransition viewKey={`${id}-language`} direction={direction}>
        <div className="pane-editor__subview">
          {!hideBackButton && <BackButton onClick={goBack}>{t('admin.common.back')}</BackButton>}
          <PaneLanguagePicker language={language} onChange={onLanguageChange} defaultLanguage={defaultLanguage} />
        </div>
      </SlideTransition>
    )
  }

  return (
    <SlideTransition viewKey={`${id}-main`} direction={direction}>
      <div className="pane-editor">
        {hasMultipleStages && <StageTabs stageCount={stageCount} activeStage={activeStage} onActiveStageChange={onActiveStageChange} />}

        <SlideFields
          id={id}
          content={content}
          onChange={onContentChange}
          label={label}
          resizeToFitBlocked={resizeToFitBlocked}
          suggestedEventOrdinal={suggestedEventOrdinal}
        />

        {hasOwnTextSizeFields(content) && (
          <Button type="button" variant="secondary" className="pane-editor__menu-button" onClick={openTextSize}>
            {t('admin.screens.editTextSize')}
            <span aria-hidden="true">→</span>
          </Button>
        )}

        <Button type="button" variant="secondary" className="pane-editor__menu-button" onClick={openBackground}>
          {t('admin.screens.backgroundLabel')}
          <span aria-hidden="true">→</span>
        </Button>

        <Button type="button" variant="secondary" className="pane-editor__menu-button" onClick={openLanguage}>
          {t('admin.screens.languageLabel')}
          <span aria-hidden="true">→</span>
        </Button>

        {(onRestore || onDone) && (
          <div className="pane-editor__actions">
            {onRestore && (
              <Button type="button" variant="secondary" onClick={onRestore}>
                {t('screenDisplay.textSizeEditor.restorePrevious')}
              </Button>
            )}
            {onDone && (
              <Button type="button" onClick={onDone}>
                {t('screenDisplay.textSizeEditor.done')}
              </Button>
            )}
          </div>
        )}
      </div>
    </SlideTransition>
  )
}
