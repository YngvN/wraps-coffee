import { useLanguage, type LanguageCode } from '../../i18n'
import type { BackgroundImage, ScreenSlot, ScreenSlotContent, TextSizes } from '../../types/screen'
import { resolveContentBackgroundImage } from '../../utils/screenSlots'
import { resolveSlotBackgroundColor, resolveSlotBackgroundImage, resolveSlotContent, resolveSlotLanguage, writeStageCheckpoint } from '../../utils/screenStages'
import { PaneEditor } from './PaneEditor'

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
  /** The currently active stage's own resolved content text sizes — what's actually edited once there's more than one stage. */
  textSizes: TextSizes
  onTextSizesChange: (textSizes: TextSizes) => void
  /** The slot's own shared (fallback) text sizes at the active stage — what's edited instead while there's only one stage, since there's nothing else for a per-content override to differ from. */
  slotTextSizes: TextSizes
  onSlotTextSizesChange: (textSizes: TextSizes) => void
  /** Disables the content editor's "Resize pane to fit image" checkbox when another pane already has one active at this same stage. */
  resizeToFitBlocked?: boolean
  /** Forwarded straight to `PaneEditor` — see its own doc comment. */
  suggestedEventOrdinal: number
  /** The cafe's own Standard pane language (see `useDefaultPaneLanguage`) — what this slot's own language override (if any) is shown/edited relative to. */
  defaultLanguage: LanguageCode
  onRouteChange?: (route: string | undefined) => void
  onRestore: () => void
  onDone: () => void
}

/**
 * The display's per-pane "Edit pane" panel — a thin translation layer over
 * the shared `PaneEditor`: resolves this slot's own stage-timeline fields
 * (content/background color/background image) at whichever stage is
 * currently selected and writes edits back into that same timeline (see
 * `src/utils/screenStages.ts`), and picks which of the two independent
 * text-size timelines (the active stage's own content, or the slot's
 * shared/fallback one) an edit actually targets. With stages off (or only
 * one stage), the tab bar is hidden and every field is simply the slot's
 * one static stage-1 checkpoint. Which stage is active isn't itself part of
 * the draft the caller persists once this panel closes — everything else
 * is. The shared rotation speed (seconds per step) is a screen-wide setting
 * edited from the admin dashboard's own "Steps" panel, not here.
 */
export function SlotEditor({
  id,
  slot,
  onSlotChange,
  useStages,
  stageCount,
  activeStage,
  onActiveStageChange,
  textSizes,
  onTextSizesChange,
  slotTextSizes,
  onSlotTextSizesChange,
  resizeToFitBlocked,
  suggestedEventOrdinal,
  defaultLanguage,
  onRouteChange,
  onRestore,
  onDone,
}: SlotEditorProps) {
  const { t } = useLanguage()
  const hasMultipleStages = useStages && stageCount > 1
  const content = resolveSlotContent(slot, activeStage)
  const backgroundColor = resolveSlotBackgroundColor(slot, activeStage)
  const backgroundImage = resolveContentBackgroundImage(content, resolveSlotBackgroundImage(slot, activeStage))
  const language = resolveSlotLanguage(slot, activeStage)

  const setContent = (nextContent: ScreenSlotContent) => onSlotChange({ ...slot, content: writeStageCheckpoint(slot.content, activeStage, nextContent) })
  const setBackgroundColor = (nextColor: string | undefined) => onSlotChange({ ...slot, backgroundColor: writeStageCheckpoint(slot.backgroundColor, activeStage, nextColor) })
  const setLanguage = (next: LanguageCode | undefined) => onSlotChange({ ...slot, language: writeStageCheckpoint(slot.language, activeStage, next) })

  /** Writes the single consolidated background-image field: to the active stage's own content checkpoint with more than one stage (so each stage's own pane can carry its own distinct image), else to the slot's own shared checkpoint — same split `textSizes` already resolves between, since with just one stage there's nothing for a per-content override to meaningfully differ from. */
  const setBackgroundImage = (next: BackgroundImage | undefined) =>
    hasMultipleStages ? setContent({ ...content, backgroundImage: next }) : onSlotChange({ ...slot, backgroundImage: writeStageCheckpoint(slot.backgroundImage, activeStage, next) })

  return (
    <PaneEditor
      id={id}
      content={content}
      onContentChange={setContent}
      backgroundColor={backgroundColor}
      onBackgroundColorChange={setBackgroundColor}
      backgroundImage={backgroundImage}
      onBackgroundImageChange={setBackgroundImage}
      textSizes={hasMultipleStages ? textSizes : slotTextSizes}
      onTextSizesChange={hasMultipleStages ? onTextSizesChange : onSlotTextSizesChange}
      language={language}
      onLanguageChange={setLanguage}
      defaultLanguage={defaultLanguage}
      useStages={useStages}
      stageCount={stageCount}
      activeStage={activeStage}
      onActiveStageChange={onActiveStageChange}
      label={hasMultipleStages ? t('screenDisplay.textSizeEditor.stageTabLabel', { number: activeStage }) : t('screenDisplay.textSizeEditor.slotContentLabel')}
      resizeToFitBlocked={resizeToFitBlocked}
      suggestedEventOrdinal={suggestedEventOrdinal}
      onRouteChange={onRouteChange}
      onRestore={onRestore}
      onDone={onDone}
    />
  )
}
