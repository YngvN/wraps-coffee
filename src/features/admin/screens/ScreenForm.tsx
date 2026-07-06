import { useState, type FormEvent } from 'react'
import { Button, Input } from '../../../components'
import { useLanguage } from '../../../i18n'
import type { ProductCategory } from '../../../types/product'
import type { ScreenConfig, ScreenLayout, ScreenSlotContent, SplitBigPosition, SplitDirection } from '../../../types/screen'
import { CATEGORY_ORDER } from '../products/categoryMeta'
import { LayoutIcon, type LayoutIconPattern } from './LayoutIcon'
import './ScreenForm.scss'

interface ScreenFormProps {
  /** The screen being edited, or `null` when creating a new one. */
  screen: ScreenConfig | null
  onSave: (screen: ScreenConfig) => void
  onCancel: () => void
}

/** The 4 arrangements available when exactly 3 of a screen's slots are active. */
const TRIPLE_ARRANGEMENTS: { pattern: LayoutIconPattern; direction: SplitDirection; bigPosition: SplitBigPosition; labelKey: string }[] = [
  { pattern: 'triple-row-first', direction: 'row', bigPosition: 'first', labelKey: 'tripleRowFirstLabel' },
  { pattern: 'triple-row-second', direction: 'row', bigPosition: 'second', labelKey: 'tripleRowSecondLabel' },
  { pattern: 'triple-column-first', direction: 'column', bigPosition: 'first', labelKey: 'tripleColumnFirstLabel' },
  { pattern: 'triple-column-second', direction: 'column', bigPosition: 'second', labelKey: 'tripleColumnSecondLabel' },
]

/** Encodes a slot as a `<select>` option value: "none", "events", or "category:<key>". */
function slotToOptionValue(slot: ScreenSlotContent): string {
  return slot.kind === 'category' ? `category:${slot.category}` : slot.kind
}

/** Decodes a `<select>` option value back into a `ScreenSlotContent`. */
function optionValueToSlot(value: string): ScreenSlotContent {
  if (value === 'none' || value === 'events') return { kind: value }
  return { kind: 'category', category: value.slice('category:'.length) as ProductCategory }
}

/**
 * Create/edit form for a single screen: name, layout, its up to 4 content
 * slots, and (for slideshow layout) the per-slide duration. When `layout`
 * is 'split', an icon-based arrangement picker appears once exactly 2 or 3
 * slots are active (4 active slots always form an even 2x2 grid, needing no
 * choice; 0-1 active slots need no arrangement either).
 */
export function ScreenForm({ screen, onSave, onCancel }: ScreenFormProps) {
  const { t } = useLanguage()
  const [name, setName] = useState(screen?.name ?? '')
  const [layout, setLayout] = useState<ScreenLayout>(screen?.layout ?? 'slideshow')
  const [slot1, setSlot1] = useState<ScreenSlotContent>(screen?.slots[0] ?? { kind: 'none' })
  const [slot2, setSlot2] = useState<ScreenSlotContent>(screen?.slots[1] ?? { kind: 'none' })
  const [slot3, setSlot3] = useState<ScreenSlotContent>(screen?.slots[2] ?? { kind: 'none' })
  const [slot4, setSlot4] = useState<ScreenSlotContent>(screen?.slots[3] ?? { kind: 'none' })
  const [slideDurationSeconds, setSlideDurationSeconds] = useState(screen?.slideDurationSeconds ?? 10)
  const [splitDirection, setSplitDirection] = useState<SplitDirection>(screen?.splitDirection ?? 'row')
  const [splitBigPosition, setSplitBigPosition] = useState<SplitBigPosition>(screen?.splitBigPosition ?? 'first')

  const activeCount = [slot1, slot2, slot3, slot4].filter((slot) => slot.kind !== 'none').length

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    onSave({
      screenID: screen?.screenID ?? `${Date.now()}`,
      name,
      layout,
      slots: [slot1, slot2, slot3, slot4],
      slideDurationSeconds,
      transitionStyle: screen?.transitionStyle ?? 'fade',
      splitDirection,
      splitBigPosition,
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

  const slotFields: { label: string; value: ScreenSlotContent; onChange: (slot: ScreenSlotContent) => void }[] = [
    { label: t('admin.screens.slot1Label'), value: slot1, onChange: setSlot1 },
    { label: t('admin.screens.slot2Label'), value: slot2, onChange: setSlot2 },
    { label: t('admin.screens.slot3Label'), value: slot3, onChange: setSlot3 },
    { label: t('admin.screens.slot4Label'), value: slot4, onChange: setSlot4 },
  ]

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
        {slotFields.map(({ label, value, onChange }, index) => (
          <label className="screen-form__field" key={index}>
            <span>{label}</span>
            <select value={slotToOptionValue(value)} onChange={(event) => onChange(optionValueToSlot(event.target.value))}>
              {slotOptions}
            </select>
          </label>
        ))}
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

      {layout === 'split' && activeCount === 2 && (
        <div className="screen-form__field">
          <span>{t('admin.screens.splitDirectionLabel')}</span>
          <div className="screen-form__layout-picker">
            <button type="button" className={`screen-form__layout-option${splitDirection === 'row' ? ' screen-form__layout-option--active' : ''}`} onClick={() => setSplitDirection('row')}>
              <LayoutIcon pattern="row" />
              <span>{t('admin.screens.splitDirectionRowLabel')}</span>
            </button>
            <button
              type="button"
              className={`screen-form__layout-option${splitDirection === 'column' ? ' screen-form__layout-option--active' : ''}`}
              onClick={() => setSplitDirection('column')}
            >
              <LayoutIcon pattern="column" />
              <span>{t('admin.screens.splitDirectionColumnLabel')}</span>
            </button>
          </div>
        </div>
      )}

      {layout === 'split' && activeCount === 3 && (
        <div className="screen-form__field">
          <span>{t('admin.screens.splitDirectionLabel')}</span>
          <div className="screen-form__layout-picker">
            {TRIPLE_ARRANGEMENTS.map(({ pattern, direction, bigPosition, labelKey }) => {
              const isActive = splitDirection === direction && splitBigPosition === bigPosition
              return (
                <button
                  type="button"
                  key={pattern}
                  className={`screen-form__layout-option${isActive ? ' screen-form__layout-option--active' : ''}`}
                  onClick={() => {
                    setSplitDirection(direction)
                    setSplitBigPosition(bigPosition)
                  }}
                >
                  <LayoutIcon pattern={pattern} />
                  <span>{t(`admin.screens.${labelKey}`)}</span>
                </button>
              )
            })}
          </div>
        </div>
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
