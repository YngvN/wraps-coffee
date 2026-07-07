import { Checkbox, Input } from '../../components'
import { useLanguage } from '../../i18n'
import type { ProductCategory } from '../../types/product'
import type { ScreenSlotContent } from '../../types/screen'
import { CATEGORY_ORDER } from '../admin/products/categoryMeta'
import { BackgroundImagePicker } from './BackgroundImagePicker'
import './SlideFields.scss'

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

interface SlideFieldsProps {
  /** Stable identifier for this one slide, used to build unique ids for its own fields. */
  id: string
  content: ScreenSlotContent
  onChange: (content: ScreenSlotContent) => void
  /** Accessible label for the content-kind selector. */
  label: string
  /**
   * Shows a "use own background image" checkbox (and, when checked, its
   * picker) — only meaningful when this slide is one of several sharing a
   * slideshow-enabled slot, so it has its slot's own background image to
   * opt out of in the first place.
   */
  showOwnBackgroundImage?: boolean
}

/**
 * One slide's own fields: what it shows (a content-kind selector), its own
 * URL/fill-container fields when set to "Image", and — for a slide that's
 * one of several in a slideshow-enabled slot — a toggle to opt out of its
 * slot's own background image and use its own instead.
 */
export function SlideFields({ id, content, onChange, label, showOwnBackgroundImage }: SlideFieldsProps) {
  const { t } = useLanguage()

  const setImageUrl = (imageUrl: string) => onChange({ kind: 'image', imageUrl })

  const setImageFillContainer = (fillContainer: boolean) => {
    if (content.kind !== 'image') return
    onChange({ ...content, fit: fillContainer ? 'cover' : 'contain' })
  }

  return (
    <div className="slide-fields">
      <select aria-label={label} value={contentToOptionValue(content)} onChange={(event) => onChange(optionValueToContent(event.target.value))}>
        <option value="none">{t('admin.screens.slotNoneLabel')}</option>
        <option value="events">{t('admin.screens.slotEventsLabel')}</option>
        <option value="image">{t('admin.screens.slotImageLabel')}</option>
        {CATEGORY_ORDER.map((category) => (
          <option key={category} value={`category:${category}`}>
            {t(`menu.categories.${category}.title`)}
          </option>
        ))}
      </select>

      {content.kind === 'image' && (
        <>
          <Input id={`${id}-image-url`} label={t('admin.screens.imageUrlLabel')} value={content.imageUrl} onChange={(event) => setImageUrl(event.target.value)} />
          <Checkbox
            id={`${id}-image-fill`}
            label={t('admin.screens.imageFillContainerLabel')}
            checked={content.fit === 'cover'}
            onChange={(event) => setImageFillContainer(event.target.checked)}
          />
        </>
      )}

      {showOwnBackgroundImage && (
        <>
          <Checkbox
            id={`${id}-own-bg-image`}
            label={t('admin.screens.useOwnBackgroundImageLabel')}
            checked={Boolean(content.useOwnBackgroundImage)}
            onChange={(event) => onChange({ ...content, useOwnBackgroundImage: event.target.checked })}
          />
          {content.useOwnBackgroundImage && (
            <BackgroundImagePicker id={`${id}-bg-image`} backgroundImage={content.backgroundImage} onChange={(backgroundImage) => onChange({ ...content, backgroundImage })} />
          )}
        </>
      )}
    </div>
  )
}
