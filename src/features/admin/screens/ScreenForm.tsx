import { useState, type FormEvent } from 'react'
import { Button, Input } from '../../../components'
import { useLanguage } from '../../../i18n'
import type { ProductCategory } from '../../../types/product'
import type { ScreenConfig, ScreenLayout, ScreenSlotContent } from '../../../types/screen'
import { CATEGORY_ORDER } from '../products/categoryMeta'
import './ScreenForm.scss'

interface ScreenFormProps {
  /** The screen being edited, or `null` when creating a new one. */
  screen: ScreenConfig | null
  onSave: (screen: ScreenConfig) => void
  onCancel: () => void
}

/** Encodes a slot as a `<select>` option value: "none", "events", or "category:<key>". */
function slotToOptionValue(slot: ScreenSlotContent): string {
  return slot.kind === 'category' ? `category:${slot.category}` : slot.kind
}

/** Decodes a `<select>` option value back into a `ScreenSlotContent`. */
function optionValueToSlot(value: string): ScreenSlotContent {
  if (value === 'none' || value === 'events') return { kind: value }
  return { kind: 'category', category: value.slice('category:'.length) as ProductCategory }
}

/** Create/edit form for a single screen: name, layout, its 2 content slots, and (for slideshow layout) the per-slide duration. */
export function ScreenForm({ screen, onSave, onCancel }: ScreenFormProps) {
  const { t } = useLanguage()
  const [name, setName] = useState(screen?.name ?? '')
  const [layout, setLayout] = useState<ScreenLayout>(screen?.layout ?? 'slideshow')
  const [slot1, setSlot1] = useState<ScreenSlotContent>(screen?.slots[0] ?? { kind: 'none' })
  const [slot2, setSlot2] = useState<ScreenSlotContent>(screen?.slots[1] ?? { kind: 'none' })
  const [slideDurationSeconds, setSlideDurationSeconds] = useState(screen?.slideDurationSeconds ?? 10)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    onSave({
      screenID: screen?.screenID ?? `${Date.now()}`,
      name,
      layout,
      slots: [slot1, slot2],
      slideDurationSeconds,
      transitionStyle: screen?.transitionStyle ?? 'fade',
    })
  }

  const slotOptions = (
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
    <form className="screen-form" onSubmit={handleSubmit}>
      <Input id="screen-name" label={t('admin.screens.nameLabel')} value={name} onChange={(event) => setName(event.target.value)} required />

      <label className="screen-form__field">
        <span>{t('admin.screens.layoutLabel')}</span>
        <select value={layout} onChange={(event) => setLayout(event.target.value as ScreenLayout)}>
          <option value="slideshow">{t('admin.screens.layoutSlideshowLabel')}</option>
          <option value="split">{t('admin.screens.layoutSplitLabel')}</option>
        </select>
      </label>

      <div className="screen-form__row">
        <label className="screen-form__field">
          <span>{t('admin.screens.slot1Label')}</span>
          <select value={slotToOptionValue(slot1)} onChange={(event) => setSlot1(optionValueToSlot(event.target.value))}>
            {slotOptions}
          </select>
        </label>
        <label className="screen-form__field">
          <span>{t('admin.screens.slot2Label')}</span>
          <select value={slotToOptionValue(slot2)} onChange={(event) => setSlot2(optionValueToSlot(event.target.value))}>
            {slotOptions}
          </select>
        </label>
      </div>

      {layout === 'slideshow' && (
        <Input
          id="screen-slide-duration"
          label={t('admin.screens.slideDurationLabel')}
          type="number"
          min={1}
          value={slideDurationSeconds}
          onChange={(event) => setSlideDurationSeconds(Number(event.target.value))}
        />
      )}

      <div className="screen-form__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('admin.common.cancel')}
        </Button>
        <Button type="submit">{t('admin.common.save')}</Button>
      </div>
    </form>
  )
}
