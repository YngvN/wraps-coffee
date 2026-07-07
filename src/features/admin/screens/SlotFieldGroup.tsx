import { useLanguage } from '../../../i18n'
import type { ProductCategory } from '../../../types/product'
import type { ScreenSlot, ScreenSlotContent } from '../../../types/screen'
import { CATEGORY_ORDER } from '../products/categoryMeta'
import './SlotFieldGroup.scss'

/** Encodes a slide's content as a `<select>` option value: "none", "events", or "category:<key>". */
function contentToOptionValue(content: ScreenSlotContent): string {
  return content.kind === 'category' ? `category:${content.category}` : content.kind
}

/** Decodes a `<select>` option value back into a `ScreenSlotContent`. */
function optionValueToContent(value: string): ScreenSlotContent {
  if (value === 'none' || value === 'events') return { kind: value }
  return { kind: 'category', category: value.slice('category:'.length) as ProductCategory }
}

interface SlotFieldGroupProps {
  label: string
  slot: ScreenSlot
  onChange: (slot: ScreenSlot) => void
  /** Opens this slot's own text-size editor. Omitted (hiding the button) when there's no persisted screen yet to write live edits to. */
  onEditTextSize?: () => void
}

/**
 * One screen slot's fields: a single content selector, or — when the
 * screen-wide "Slideshows" checkbox is on (`slot.isSlideshow`, kept in sync
 * across all 4 slots by the parent form) — a list of selectors the slot
 * rotates through in place, with a "+ Add slide" button to grow the list.
 * The rotation speed is the screen's own shared `slideDurationSeconds`
 * field, not set here.
 */
export function SlotFieldGroup({ label, slot, onChange, onEditTextSize }: SlotFieldGroupProps) {
  const { t } = useLanguage()
  const contents = slot.contents.length > 0 ? slot.contents : [{ kind: 'none' as const }]

  const setContentAt = (index: number, content: ScreenSlotContent) => {
    onChange({ ...slot, contents: contents.map((existing, i) => (i === index ? content : existing)) })
  }

  const addSlide = () => onChange({ ...slot, contents: [...contents, { kind: 'none' }] })
  const removeSlide = (index: number) => onChange({ ...slot, contents: contents.filter((_, i) => i !== index) })

  const options = (
    <>
      <option value="none">{t('admin.screens.slotNoneLabel')}</option>
      <option value="events">{t('admin.screens.slotEventsLabel')}</option>
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
        {onEditTextSize && (
          <button type="button" className="slot-field-group__edit-text-size" onClick={onEditTextSize}>
            {t('admin.screens.editTextSize')}
          </button>
        )}
      </div>

      {slot.isSlideshow ? (
        <>
          {contents.map((content, index) => (
            <div className="slot-field-group__row" key={index}>
              <select
                aria-label={`${label} ${index + 1}`}
                value={contentToOptionValue(content)}
                onChange={(event) => setContentAt(index, optionValueToContent(event.target.value))}
              >
                {options}
              </select>
              {contents.length > 1 && (
                <button type="button" className="slot-field-group__remove" onClick={() => removeSlide(index)} aria-label={t('admin.screens.removeSlideLabel')}>
                  ×
                </button>
              )}
            </div>
          ))}
          <button type="button" className="slot-field-group__add" onClick={addSlide}>
            {t('admin.screens.addSlide')}
          </button>
        </>
      ) : (
        <select aria-label={label} value={contentToOptionValue(contents[0])} onChange={(event) => setContentAt(0, optionValueToContent(event.target.value))}>
          {options}
        </select>
      )}
    </div>
  )
}
