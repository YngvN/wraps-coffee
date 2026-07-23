import { Button, CollapsibleSection } from '../../components'
import { useLanguage, type LanguageCode } from '../../i18n'
import type { BackgroundImage, ScreenSlotContent, TextSizes } from '../../types/screen'
import { hasOwnTextSizeFields } from '../../utils/screenSlots'
import { BackgroundColorPicker } from './BackgroundColorPicker'
import { BackgroundImagePicker } from './BackgroundImagePicker'
import './PaneEditor.scss'
import { PaneLanguagePicker } from './PaneLanguagePicker'
import { SlideFields } from './SlideFields'
import { StageTabs } from './StageTabs'
import { TextSizeEditor } from './TextSizeEditor'

interface PaneEditorProps {
  /** Stable identifier for the pane being edited (e.g. "slot-1"), used to build unique field ids. */
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
  /** Whether this pane's content shrinks to fit or is allowed to overflow (vertically) and scroll instead — see `ScreenSlot.overflowMode`. */
  overflowMode: 'shrink' | 'scroll'
  onOverflowModeChange: (mode: 'shrink' | 'scroll') => void
  /** `undefined` means "use the cafe's own Standard pane language" (see `useDefaultPaneLanguage`) — the caller's own `onLanguageChange` decides where an explicit override is written back to. */
  language: LanguageCode | undefined
  onLanguageChange: (language: LanguageCode | undefined) => void
  /** The Standard pane language's own current value — shown on the "Language" section's own "Standard" button so it's clear what inheriting it actually means right now (see `PaneLanguagePicker`). */
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
  /**
   * Wipes this pane's content/background/text-size back to a fresh blank
   * slot. Renders a "Pane" section with this (and `onDeletePane`, if given)
   * as plain action rows — omit both to skip that section entirely, for a
   * caller (the admin form's per-pane tab) that already has its own
   * separate Split/Clear/Delete buttons elsewhere and would otherwise show
   * the same actions twice.
   */
  onClearPane?: () => void
  /** Deletes this pane from the arrangement, handing its space to its sibling. Only shown alongside `onClearPane` when `canDeletePane` is also true (never the tree's only leaf). */
  onDeletePane?: () => void
  canDeletePane?: boolean
}

/**
 * One pane's full settings, shared by both places a pane can be edited from
 * — the admin dashboard's own per-slot tab (`ScreenForm`) and the live
 * display's own floating "Edit pane" panel (`SlotEditor`) — so the two work
 * identically and neither has fields the other lacks. The content-kind
 * picker (`SlideFields`) renders first, always visible; "Edit text size"
 * (only for a content kind that has its own text, see
 * `hasOwnTextSizeFields`), "Background", and "Language" each render as a
 * `CollapsibleSection` inline below it — collapsed by default, Figma/XD
 * sidebar-style, rather than swapping out the whole view the way this used
 * to navigate to a separate sub-view. A non-collapsible "Pane" section
 * (Clear/Delete) only appears for a caller that actually wants those actions
 * here — see `onClearPane`'s own doc comment.
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
  overflowMode,
  onOverflowModeChange,
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
  onClearPane,
  onDeletePane,
  canDeletePane,
}: PaneEditorProps) {
  const { t } = useLanguage()
  const hasMultipleStages = useStages && stageCount > 1

  return (
    <div className="pane-editor">
      {hasMultipleStages && <StageTabs stageCount={stageCount} activeStage={activeStage} onActiveStageChange={onActiveStageChange} />}

      <SlideFields id={id} content={content} onChange={onContentChange} label={label} resizeToFitBlocked={resizeToFitBlocked} suggestedEventOrdinal={suggestedEventOrdinal} />

      {hasOwnTextSizeFields(content) && (
        <CollapsibleSection label={t('admin.screens.editTextSize')}>
          <TextSizeEditor textSizes={textSizes} onChange={onTextSizesChange} overflowMode={overflowMode} onOverflowModeChange={onOverflowModeChange} />
        </CollapsibleSection>
      )}

      <CollapsibleSection label={t('admin.screens.backgroundLabel')}>
        <BackgroundColorPicker backgroundColor={backgroundColor} onChange={onBackgroundColorChange} allowTransparent />
        <span className="pane-editor__label">{t('screenDisplay.textSizeEditor.backgroundImageLabel')}</span>
        <BackgroundImagePicker id={`${id}-bg-image`} backgroundImage={backgroundImage} onChange={onBackgroundImageChange} />
      </CollapsibleSection>

      <CollapsibleSection label={t('admin.screens.languageLabel')}>
        <PaneLanguagePicker language={language} onChange={onLanguageChange} defaultLanguage={defaultLanguage} />
      </CollapsibleSection>

      {(onClearPane || onDeletePane) && (
        <div className="pane-editor__pane-section">
          <span className="pane-editor__pane-section-label">{t('screenDisplay.panelPaneSectionLabel')}</span>
          <div className="pane-editor__pane-section-actions">
            {onClearPane && (
              <Button type="button" variant="secondary" onClick={onClearPane}>
                {t('admin.screens.clearPaneButton')}
              </Button>
            )}
            {onDeletePane && canDeletePane && (
              <Button type="button" variant="secondary" onClick={onDeletePane}>
                {t('admin.screens.deletePaneButton')}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
