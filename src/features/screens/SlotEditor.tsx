import { Checkbox, Input } from '../../components'
import { useLanguage } from '../../i18n'
import type { ScreenSlot, ScreenSlotContent, TextSizes } from '../../types/screen'
import { BackgroundImagePicker } from './BackgroundImagePicker'
import { SlideFields } from './SlideFields'
import './SlotEditor.scss'
import { SlotSlideTabs } from './SlotSlideTabs'
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
  /** The currently active slide's own text sizes — outside a slideshow, this is simply the slot's one and only slide. */
  textSizes: TextSizes
  onTextSizesChange: (textSizes: TextSizes) => void
  ownTextSizes?: { useOwn: boolean; onUseOwnChange: (useOwn: boolean) => void }
  /** The slot's own shared (fallback) text sizes, shown on its "Global" tab — only relevant once this slot has more than one slide to share it. */
  slotTextSizes: TextSizes
  onSlotTextSizesChange: (textSizes: TextSizes) => void
  /** Which tab is active: the slot's own "Global" settings, or one specific slide by its index in `contents` — only meaningful (and only shown) once this slot has more than one slide. */
  activeSlideTab: 'global' | number
  onActiveSlideTabChange: (tab: 'global' | number) => void
  onRestore: () => void
  onDone: () => void
}

/**
 * The display's per-slot "Edit slot" panel. A slot with a single slide (not
 * a slideshow) shows one flat set of fields: its content, own background
 * color/image, and text size. Once it's rotating through more than one
 * slide, those settings split into tabs — mirroring the admin dashboard's
 * own "Global + one tab per slot" pattern one level deeper — with a
 * "Global" tab for the slot's own shared settings (its background
 * color/image, the shared rotation timer, and its shared/fallback text
 * size) and one tab per slide for that slide's own content, its own
 * background-image override, and (when it has text of its own) a checkbox
 * to opt out of the slot's shared text size and keep its own. Neither the
 * timer (a screen-wide setting, applied live immediately) nor which tab is
 * active is part of the draft the caller persists once this panel closes —
 * everything else is.
 */
export function SlotEditor({
  id,
  slot,
  onSlotChange,
  slideDurationSeconds,
  onSlideDurationChange,
  textSizes,
  onTextSizesChange,
  ownTextSizes,
  slotTextSizes,
  onSlotTextSizesChange,
  activeSlideTab,
  onActiveSlideTabChange,
  onRestore,
  onDone,
}: SlotEditorProps) {
  const { t } = useLanguage()
  const contents = slot.contents.length > 0 ? slot.contents : [{ kind: 'none' as const }]
  const activeCount = contents.filter((content) => content.kind !== 'none').length
  const hasSlideTabs = slot.isSlideshow
  const needsDurationField = slot.isSlideshow && activeCount > 1
  const activeSlideIndex = typeof activeSlideTab === 'number' ? activeSlideTab : 0

  const setContentAt = (index: number, content: ScreenSlotContent) => {
    onSlotChange({ ...slot, contents: contents.map((existing, i) => (i === index ? content : existing)) })
  }

  const addSlide = () => {
    onSlotChange({ ...slot, contents: [...contents, { kind: 'none' }] })
    onActiveSlideTabChange(contents.length)
  }

  const removeSlide = (index: number) => {
    onSlotChange({ ...slot, contents: contents.filter((_, i) => i !== index) })
    onActiveSlideTabChange('global')
  }

  return (
    <div className="slot-editor">
      <Checkbox
        id={`${id}-slideshow`}
        label={t('screenDisplay.textSizeEditor.slideshowLabel')}
        checked={slot.isSlideshow}
        onChange={(event) => onSlotChange({ ...slot, isSlideshow: event.target.checked })}
      />

      {hasSlideTabs && <SlotSlideTabs slideCount={contents.length} activeTab={activeSlideTab} onActiveTabChange={onActiveSlideTabChange} onAddSlide={addSlide} />}

      {hasSlideTabs && activeSlideTab !== 'global' ? (
        <>
          <SlideFields
            id={`${id}-slide-${activeSlideIndex}`}
            content={contents[activeSlideIndex] ?? { kind: 'none' }}
            onChange={(content) => setContentAt(activeSlideIndex, content)}
            label={t('screenDisplay.textSizeEditor.slideTabLabel', { number: activeSlideIndex + 1 })}
            showOwnBackgroundImage
          />

          {contents.length > 1 && (
            <button type="button" className="slot-slide-tabs__remove" onClick={() => removeSlide(activeSlideIndex)}>
              {t('admin.screens.removeSlideLabel')}
            </button>
          )}

          <TextSizeEditor textSizes={textSizes} onChange={onTextSizesChange} ownTextSizes={ownTextSizes} onRestore={onRestore} onDone={onDone} />
        </>
      ) : (
        <>
          {!hasSlideTabs && <SlideFields id={id} content={contents[0]} onChange={(content) => setContentAt(0, content)} label={t('screenDisplay.textSizeEditor.slotContentLabel')} />}

          <BackgroundImagePicker
            id={`${id}-bg-image`}
            backgroundImage={slot.backgroundImage}
            onChange={(backgroundImage) => onSlotChange({ ...slot, backgroundImage })}
          />

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
            textSizes={hasSlideTabs ? slotTextSizes : textSizes}
            onChange={hasSlideTabs ? onSlotTextSizesChange : onTextSizesChange}
            backgroundColor={slot.backgroundColor}
            onBackgroundColorChange={(backgroundColor) => onSlotChange({ ...slot, backgroundColor })}
            allowTransparentBackground
            ownTextSizes={hasSlideTabs ? undefined : ownTextSizes}
            onRestore={onRestore}
            onDone={onDone}
          />
        </>
      )}
    </div>
  )
}
