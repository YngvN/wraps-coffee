import { Checkbox, ImageUploadField } from '../../components'
import { useExtensionsConfig } from '../../hooks/useExtensionsConfig'
import { useLanguage } from '../../i18n'
import type { ProductCategory } from '../../types/product'
import type { ScreenSlotContent } from '../../types/screen'
import { CATEGORY_ORDER } from '../admin/products/categoryMeta'
import { clampImageResizeScale, IMAGE_RESIZE_MAX_VIEWPORT_FRACTION, MAX_IMAGE_RESIZE_SCALE, MIN_IMAGE_RESIZE_SCALE } from '../../utils/screenLayout'
import { getSmallUrl } from '../../utils/responsiveImage'
import './SlideFields.scss'

/** Encodes a slide's content as a `<select>` option value: "none", "menu", "events", "image", "transit", "weather", or "category:<key>". */
function contentToOptionValue(content: ScreenSlotContent): string {
  return content.kind === 'category' ? `category:${content.category}` : content.kind
}

/** Decodes a `<select>` option value back into a `ScreenSlotContent`. An "image"/"transit" slide starts with an empty URL/stop id, filled in via its own field below the selector. */
function optionValueToContent(value: string): ScreenSlotContent {
  if (value === 'none' || value === 'menu' || value === 'events' || value === 'weather') return { kind: value }
  if (value === 'image') return { kind: 'image', imageUrl: '' }
  if (value === 'transit') return { kind: 'transit', stopId: '' }
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
   * Disables the "Resize slot to fit image" checkbox, with an explanatory
   * tooltip, when some other slot's content already resolves to a
   * resize-to-fit image at this same stage — only one is allowed active at
   * once, to keep a stage from resizing more than one pane at a time. Never
   * disables an already-checked box, so this slide can always turn its own
   * back off regardless.
   */
  resizeToFitBlocked?: boolean
}

/**
 * One slide's own fields: what it shows (a content-kind selector), its own
 * URL/fill-container/resize-to-fit/resize-scale fields when set to "Image"
 * (resize-to-fit makes the slide's own *pane* grow or shrink to match the
 * image's aspect ratio, capped at its own resize-scale percentage of the
 * screen's viewport, defaulting to 40% but also adjustable by dragging the
 * pane's own border on the live display — see `SplitLayout`), a checkbox
 * per category when set to "Full menu" (letting the full menu be split
 * across more than one screen — each gets its own subset checked). This
 * slide's own background image (an override of its slot's shared one) is
 * edited alongside the slot's own, in the "Background" sub-menu, not here.
 */
export function SlideFields({ id, content, onChange, label, resizeToFitBlocked }: SlideFieldsProps) {
  const { t } = useLanguage()
  const [extensionsConfig] = useExtensionsConfig()

  /** Starts a fresh image slide when switching the selector to "Image"; otherwise just updates the URL in place, keeping this slide's other own fields (fit, resize-to-fit, background image) intact. */
  const setImageUrl = (imageUrl: string) => {
    if (content.kind !== 'image') {
      onChange({ kind: 'image', imageUrl })
      return
    }
    onChange({ ...content, imageUrl })
  }

  const setImageFillContainer = (fillContainer: boolean) => {
    if (content.kind !== 'image') return
    onChange({ ...content, fit: fillContainer ? 'cover' : 'contain' })
  }

  const setImageResizeToFit = (resizeToFit: boolean) => {
    if (content.kind !== 'image') return
    onChange({ ...content, resizeToFit })
  }

  /** `resizeScale` is stored as a 0-1 fraction of the viewport but edited here as a whole-number percentage, matching how an arrangement's own dividers are edited elsewhere. */
  const setImageResizeScalePercent = (percent: number) => {
    if (content.kind !== 'image') return
    onChange({ ...content, resizeScale: clampImageResizeScale(percent / 100) })
  }

  const setTransitStopId = (stopId: string) => {
    if (content.kind !== 'transit') return
    onChange({ ...content, stopId })
  }

  /** Toggles one category in/out of a "Full menu" slide's own `categories` — starting from every category checked (the standard, when `categories` is still absent) so unchecking the first one narrows it down from there, rather than from an empty set. */
  const toggleMenuCategory = (category: ProductCategory, checked: boolean) => {
    if (content.kind !== 'menu') return
    const current = content.categories ?? CATEGORY_ORDER
    const next = checked ? [...current, category] : current.filter((existing) => existing !== category)
    onChange({ ...content, categories: CATEGORY_ORDER.filter((existing) => next.includes(existing)) })
  }

  return (
    <div className="slide-fields">
      <select aria-label={label} value={contentToOptionValue(content)} onChange={(event) => onChange(optionValueToContent(event.target.value))}>
        <option value="none">{t('admin.screens.slotNoneLabel')}</option>
        <option value="menu">{t('admin.screens.slotMenuLabel')}</option>
        <option value="events">{t('admin.screens.slotEventsLabel')}</option>
        <option value="image">{t('admin.screens.slotImageLabel')}</option>
        <option value="transit">{t('admin.screens.slotTransitLabel')}</option>
        <option value="weather">{t('admin.screens.slotWeatherLabel')}</option>
        {CATEGORY_ORDER.map((category) => (
          <option key={category} value={`category:${category}`}>
            {t(`menu.categories.${category}.title`)}
          </option>
        ))}
      </select>

      {content.kind === 'image' && (
        <>
          <ImageUploadField id={`${id}-image-url`} value={content.imageUrl} onChange={setImageUrl} />
          <Checkbox
            id={`${id}-image-fill`}
            label={t('admin.screens.imageFillContainerLabel')}
            checked={content.fit === 'cover'}
            onChange={(event) => setImageFillContainer(event.target.checked)}
          />
          <Checkbox
            id={`${id}-image-resize-to-fit`}
            label={t('admin.screens.resizeToFitImageLabel')}
            checked={Boolean(content.resizeToFit)}
            onChange={(event) => setImageResizeToFit(event.target.checked)}
            disabled={resizeToFitBlocked && !content.resizeToFit}
            title={resizeToFitBlocked && !content.resizeToFit ? t('admin.screens.resizeToFitBlockedTooltip') : undefined}
          />
          {content.resizeToFit && (
            <label className="slide-fields__slider">
              <span>
                {t('admin.screens.resizeScaleLabel')} — {Math.round((content.resizeScale ?? IMAGE_RESIZE_MAX_VIEWPORT_FRACTION) * 100)}%
              </span>
              <input
                type="range"
                min={MIN_IMAGE_RESIZE_SCALE * 100}
                max={MAX_IMAGE_RESIZE_SCALE * 100}
                value={Math.round((content.resizeScale ?? IMAGE_RESIZE_MAX_VIEWPORT_FRACTION) * 100)}
                onChange={(event) => setImageResizeScalePercent(Number(event.target.value))}
              />
            </label>
          )}

          {content.imageUrl && (
            <div className="slide-fields__preview">
              <span className="slide-fields__preview-label">{t('admin.screens.imagePreviewLabel')}</span>
              <div className="slide-fields__preview-screen">
                <img
                  src={getSmallUrl(content.imageUrl)}
                  alt=""
                  className="slide-fields__preview-image"
                  style={
                    content.resizeToFit
                      ? {
                          maxWidth: `${Math.round((content.resizeScale ?? IMAGE_RESIZE_MAX_VIEWPORT_FRACTION) * 100)}%`,
                          maxHeight: `${Math.round((content.resizeScale ?? IMAGE_RESIZE_MAX_VIEWPORT_FRACTION) * 100)}%`,
                          objectFit: 'contain',
                        }
                      : { width: '100%', height: '100%', objectFit: content.fit === 'cover' ? 'cover' : 'contain' }
                  }
                />
              </div>
            </div>
          )}
        </>
      )}

      {content.kind === 'menu' && (
        <div className="slide-fields__categories">
          <span className="slide-fields__categories-label">{t('admin.screens.menuCategoriesLabel')}</span>
          {CATEGORY_ORDER.map((category) => (
            <Checkbox
              key={category}
              id={`${id}-category-${category}`}
              label={t(`menu.categories.${category}.title`)}
              checked={(content.categories ?? CATEGORY_ORDER).includes(category)}
              onChange={(event) => toggleMenuCategory(category, event.target.checked)}
            />
          ))}
        </div>
      )}

      {content.kind === 'transit' &&
        (extensionsConfig.transit.selectedStops.length > 0 ? (
          <select aria-label={t('admin.screens.transitStopLabel')} value={content.stopId ?? ''} onChange={(event) => setTransitStopId(event.target.value)}>
            <option value="" disabled>
              {t('admin.screens.transitStopLabel')}
            </option>
            {extensionsConfig.transit.selectedStops.map((stop) => (
              <option key={stop.id} value={stop.id}>
                {stop.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="slide-fields__hint">{t('admin.screens.transitNoStopsConfiguredLabel')}</p>
        ))}
    </div>
  )
}
