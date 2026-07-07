import { Checkbox, Input } from '../../components'
import { useLanguage } from '../../i18n'
import type { ProductCategory } from '../../types/product'
import type { ScreenSlot, ScreenSlotContent } from '../../types/screen'
import { hasOwnTextSizeFields } from '../../utils/screenSlots'
import { CATEGORY_ORDER } from '../admin/products/categoryMeta'
import './SlotFieldGroup.scss'

/** Encodes a slide's content as a `<select>` option value: "none", "events", "image", or "category:<key>". */
function contentToOptionValue(content: ScreenSlotContent): string {
  return content.kind === 'category' ? `category:${content.category}` : content.kind
}

/** Decodes a `<select>` option value back into a `ScreenSlotContent`. An "image" slide starts with an empty URL, filled in via its own field below the selector. */
function optionValueToContent(value: string): ScreenSlotContent {
  if (value === 'none' || value === 'events') return { kind: value }
  if (value === 'image') return { kind: 'image', imageUrl: '' }
  return { kind: 'category', category: value.slice('category:'.length) as ProductCategory }
}

interface SlotFieldGroupProps {
  /** Stable identifier for this slot (e.g. "slot-1"), used to build unique ids for its own fields. */
  id: string
  label: string
  slot: ScreenSlot
  onChange: (slot: ScreenSlot) => void
  /**
   * Opens the text-size editor for one specific slide, given its own index
   * within `contents` (always 0 outside slideshow mode, since there's only
   * one). Omitted (hiding every edit-text-size button) when there's no
   * persisted screen yet to write live edits to, or when the caller already
   * has its own text-size section elsewhere (the on-screen "Edit slot"
   * panel, which edits whichever one slide is currently showing).
   */
  onEditTextSize?: (contentIndex: number) => void
}

/**
 * One screen slot's fields: a single content selector, or — when
 * `slot.isSlideshow` is on — a list of selectors the slot rotates through in
 * place, with a "+ Add slide" button to grow the list. The rotation speed is
 * the screen's own shared `slideDurationSeconds` field, not set here. A
 * slide set to "Image" shows its own URL field instead of relying on any
 * product/event data. Shared by the admin form (where "Slideshows" is one
 * screen-wide checkbox covering all 4 slots) and the display's own per-slot
 * "Edit slot" panel (where each slot's `isSlideshow` is toggled on its own).
 * In slideshow mode, since each slide can have its own text size, the
 * "Edit text size" button moves from the shared header to each individual
 * slide row.
 */
export function SlotFieldGroup({ id, label, slot, onChange, onEditTextSize }: SlotFieldGroupProps) {
  const { t } = useLanguage()
  const contents = slot.contents.length > 0 ? slot.contents : [{ kind: 'none' as const }]

  const setContentAt = (index: number, content: ScreenSlotContent) => {
    onChange({ ...slot, contents: contents.map((existing, i) => (i === index ? content : existing)) })
  }

  const setImageUrlAt = (index: number, imageUrl: string) => setContentAt(index, { kind: 'image', imageUrl })

  const setImageFillContainerAt = (index: number, fillContainer: boolean) => {
    const content = contents[index]
    if (content.kind !== 'image') return
    setContentAt(index, { ...content, fit: fillContainer ? 'cover' : 'contain' })
  }

  const addSlide = () => onChange({ ...slot, contents: [...contents, { kind: 'none' }] })
  const removeSlide = (index: number) => onChange({ ...slot, contents: contents.filter((_, i) => i !== index) })

  const options = (
    <>
      <option value="none">{t('admin.screens.slotNoneLabel')}</option>
      <option value="events">{t('admin.screens.slotEventsLabel')}</option>
      <option value="image">{t('admin.screens.slotImageLabel')}</option>
      {CATEGORY_ORDER.map((category) => (
        <option key={category} value={`category:${category}`}>
          {t(`menu.categories.${category}.title`)}
        </option>
      ))}
    </>
  )

  return (
    <div className="slot-field-group">
      <div className="slot-field-group__header">
        <span className="slot-field-group__label">{label}</span>
        {!slot.isSlideshow && onEditTextSize && hasOwnTextSizeFields(contents[0]) && (
          <button type="button" className="slot-field-group__edit-text-size" onClick={() => onEditTextSize(0)}>
            {t('admin.screens.editTextSize')}
          </button>
        )}
      </div>

      {slot.isSlideshow ? (
        <>
          {contents.map((content, index) => (
            <div className="slot-field-group__slide" key={index}>
              <div className="slot-field-group__row">
                <select
                  aria-label={`${label} ${index + 1}`}
                  value={contentToOptionValue(content)}
                  onChange={(event) => setContentAt(index, optionValueToContent(event.target.value))}
                >
                  {options}
                </select>
                {onEditTextSize && hasOwnTextSizeFields(content) && (
                  <button type="button" className="slot-field-group__edit-text-size" onClick={() => onEditTextSize(index)}>
                    {t('admin.screens.editTextSize')}
                  </button>
                )}
                {contents.length > 1 && (
                  <button type="button" className="slot-field-group__remove" onClick={() => removeSlide(index)} aria-label={t('admin.screens.removeSlideLabel')}>
                    ×
                  </button>
                )}
              </div>
              {content.kind === 'image' && (
                <>
                  <Input
                    id={`${id}-image-url-${index}`}
                    label={t('admin.screens.imageUrlLabel')}
                    value={content.imageUrl}
                    onChange={(event) => setImageUrlAt(index, event.target.value)}
                  />
                  <Checkbox
                    id={`${id}-image-fill-${index}`}
                    label={t('admin.screens.imageFillContainerLabel')}
                    checked={content.fit === 'cover'}
                    onChange={(event) => setImageFillContainerAt(index, event.target.checked)}
                  />
                </>
              )}
            </div>
          ))}
          <button type="button" className="slot-field-group__add" onClick={addSlide}>
            {t('admin.screens.addSlide')}
          </button>
        </>
      ) : (
        <>
          <select aria-label={label} value={contentToOptionValue(contents[0])} onChange={(event) => setContentAt(0, optionValueToContent(event.target.value))}>
            {options}
          </select>
          {contents[0].kind === 'image' && (
            <>
              <Input id={`${id}-image-url`} label={t('admin.screens.imageUrlLabel')} value={contents[0].imageUrl} onChange={(event) => setImageUrlAt(0, event.target.value)} />
              <Checkbox
                id={`${id}-image-fill`}
                label={t('admin.screens.imageFillContainerLabel')}
                checked={contents[0].fit === 'cover'}
                onChange={(event) => setImageFillContainerAt(0, event.target.checked)}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
