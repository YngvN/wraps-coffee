import { Checkbox, Input } from '../../components'
import { useLanguage } from '../../i18n'
import type { ScreenSlot, TextSizes } from '../../types/screen'
import './SlotEditor.scss'
import { SlotFieldGroup } from './SlotFieldGroup'
import { TextSizeEditor } from './TextSizeEditor'

interface SlotEditorProps {
  /** Stable identifier for this slot (e.g. "slot-1"), used to build unique field ids. */
  id: string
  slot: ScreenSlot
  /** Live content/slideshow/color changes for this slot. */
  onSlotChange: (slot: ScreenSlot) => void
  /** The screen's own shared rotation speed — only shown (and editable here) when this slot actually rotates. */
  slideDurationSeconds: number
  onSlideDurationChange: (seconds: number) => void
  textSizes: TextSizes
  onTextSizesChange: (textSizes: TextSizes) => void
  ownTextSizes?: { useOwn: boolean; onUseOwnChange: (useOwn: boolean) => void }
  onRestore: () => void
  onDone: () => void
}

/**
 * The display's per-slot "Edit slot" panel: change what this slot shows
 * (its content list, add/remove slides), toggle its own slideshow rotation,
 * adjust the shared rotation timer when that's actually relevant, give this
 * slot its own background color (standard is transparent, showing the
 * screen's own color through), and — reusing `TextSizeEditor` wholesale —
 * its text sizes. Everything but the timer (a screen-wide setting, applied
 * live immediately) is a draft the caller persists once this panel closes.
 */
export function SlotEditor({ id, slot, onSlotChange, slideDurationSeconds, onSlideDurationChange, textSizes, onTextSizesChange, ownTextSizes, onRestore, onDone }: SlotEditorProps) {
  const { t } = useLanguage()
  const activeCount = slot.contents.filter((content) => content.kind !== 'none').length
  const needsDurationField = slot.isSlideshow && activeCount > 1

  return (
    <div className="slot-editor">
      <Checkbox
        id={`${id}-slideshow`}
        label={t('screenDisplay.textSizeEditor.slideshowLabel')}
        checked={slot.isSlideshow}
        onChange={(event) => onSlotChange({ ...slot, isSlideshow: event.target.checked })}
      />

      <SlotFieldGroup id={id} label={t('screenDisplay.textSizeEditor.slotContentLabel')} slot={slot} onChange={onSlotChange} />

      {needsDurationField && (
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
        textSizes={textSizes}
        onChange={onTextSizesChange}
        backgroundColor={slot.backgroundColor}
        onBackgroundColorChange={(backgroundColor) => onSlotChange({ ...slot, backgroundColor })}
        allowTransparentBackground
        ownTextSizes={ownTextSizes}
        onRestore={onRestore}
        onDone={onDone}
      />
    </div>
  )
}
