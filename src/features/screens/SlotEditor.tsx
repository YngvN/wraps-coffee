import { Input } from '../../components'
import { useLanguage } from '../../i18n'
import type { BackgroundImage, ScreenSlot, ScreenSlotContent, TextSizes } from '../../types/screen'
import { resolveSlotBackgroundColor, resolveSlotBackgroundImage, resolveSlotContent, writeStageCheckpoint } from '../../utils/screenStages'
import { BackgroundImagePicker } from './BackgroundImagePicker'
import { SlideFields } from './SlideFields'
import './SlotEditor.scss'
import { StageTabs } from './StageTabs'
import { TextSizeEditor } from './TextSizeEditor'

interface SlotEditorProps {
  /** Stable identifier for this slot (e.g. "slot-1"), used to build unique field ids. */
  id: string
  slot: ScreenSlot
  /** Live content/color changes for this slot. */
  onSlotChange: (slot: ScreenSlot) => void
  /** Whether the screen has shared stages on at all. */
  useStages: boolean
  /** Total shared stages — only meaningful while `useStages` is true. */
  stageCount: number
  /** Which stage this editor's own tab bar (shown when `useStages && stageCount > 1`) currently has selected. */
  activeStage: number
  onActiveStageChange: (stage: number) => void
  /** The screen's own shared rotation speed — only shown (and editable here) once there's more than one stage to rotate through. */
  slideDurationSeconds: number
  onSlideDurationChange: (seconds: number) => void
  /** The currently active stage's own resolved content text sizes. */
  textSizes: TextSizes
  onTextSizesChange: (textSizes: TextSizes) => void
  ownTextSizes?: { useOwn: boolean; onUseOwnChange: (useOwn: boolean) => void }
  /** The slot's own shared (fallback) text sizes at the active stage. */
  slotTextSizes: TextSizes
  onSlotTextSizesChange: (textSizes: TextSizes) => void
  /** Disables the content editor's "Resize slot to fit image" checkbox when another slot already has one active at this same stage. */
  resizeToFitBlocked?: boolean
  onRestore: () => void
  onDone: () => void
}

/**
 * The display's per-slot "Edit slot" panel. Once the screen has shared
 * stages on with more than one, a stage-tab bar (mirroring the admin
 * dashboard's own one level deeper) lets the owner jump between stages;
 * every field below — content, own background color/image, and
 * shared/fallback text size — is resolved from (and edits write back into)
 * that slot's own independent timeline at whichever stage is currently
 * selected (see `src/utils/screenStages.ts`). With stages off (or only one
 * stage), the tab bar is hidden and every field is simply the slot's one
 * static stage-1 checkpoint. Neither the rotation timer (a screen-wide
 * setting, applied live immediately) nor which stage is active is part of
 * the draft the caller persists once this panel closes — everything else
 * is.
 */
export function SlotEditor({
  id,
  slot,
  onSlotChange,
  useStages,
  stageCount,
  activeStage,
  onActiveStageChange,
  slideDurationSeconds,
  onSlideDurationChange,
  textSizes,
  onTextSizesChange,
  ownTextSizes,
  slotTextSizes,
  onSlotTextSizesChange,
  resizeToFitBlocked,
  onRestore,
  onDone,
}: SlotEditorProps) {
  const { t } = useLanguage()
  const hasMultipleStages = useStages && stageCount > 1
  const content = resolveSlotContent(slot, activeStage)
  const backgroundColor = resolveSlotBackgroundColor(slot, activeStage)
  const backgroundImage = resolveSlotBackgroundImage(slot, activeStage)

  const setContent = (nextContent: ScreenSlotContent) => onSlotChange({ ...slot, content: writeStageCheckpoint(slot.content, activeStage, nextContent) })
  const setBackgroundColor = (nextColor: string | undefined) => onSlotChange({ ...slot, backgroundColor: writeStageCheckpoint(slot.backgroundColor, activeStage, nextColor) })
  const setBackgroundImage = (nextImage: BackgroundImage | undefined) => onSlotChange({ ...slot, backgroundImage: writeStageCheckpoint(slot.backgroundImage, activeStage, nextImage) })

  return (
    <div className="slot-editor">
      {hasMultipleStages && <StageTabs stageCount={stageCount} activeStage={activeStage} onActiveStageChange={onActiveStageChange} />}

      <SlideFields
        id={id}
        content={content}
        onChange={setContent}
        label={hasMultipleStages ? t('screenDisplay.textSizeEditor.stageTabLabel', { number: activeStage }) : t('screenDisplay.textSizeEditor.slotContentLabel')}
        resizeToFitBlocked={resizeToFitBlocked}
      />

      <span className="slot-editor__label">{t('screenDisplay.textSizeEditor.backgroundImageLabel')}</span>
      <BackgroundImagePicker id={`${id}-bg-image`} backgroundImage={backgroundImage} onChange={setBackgroundImage} />

      <span className="slot-editor__label">{t('screenDisplay.textSizeEditor.ownBackgroundImageLabel')}</span>
      <BackgroundImagePicker
        id={`${id}-own-bg-image`}
        backgroundImage={content.backgroundImage}
        onChange={(ownBackgroundImage) => setContent({ ...content, backgroundImage: ownBackgroundImage })}
      />

      {hasMultipleStages && (
        <Input
          id={`${id}-duration`}
          label={t('screenDisplay.textSizeEditor.slideDurationLabel')}
          type="number"
          min={1}
          value={slideDurationSeconds}
          onChange={(event) => onSlideDurationChange(Number(event.target.value))}
        />
      )}

      <TextSizeEditor
        textSizes={ownTextSizes?.useOwn ? textSizes : slotTextSizes}
        onChange={ownTextSizes?.useOwn ? onTextSizesChange : onSlotTextSizesChange}
        backgroundColor={backgroundColor}
        onBackgroundColorChange={setBackgroundColor}
        allowTransparentBackground
        ownTextSizes={ownTextSizes}
        onRestore={onRestore}
        onDone={onDone}
      />
    </div>
  )
}
