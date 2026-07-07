import { useState } from 'react'
import { Button } from '../../components'
import { useLanguage } from '../../i18n'
import { DEFAULT_TEXT_SIZES, type ScreenConfig, type TextSizes } from '../../types/screen'
import { BackgroundColorPicker } from './BackgroundColorPicker'
import './GlobalTextSizeScaler.scss'

/** One slider row's config: which `TextSizes` field it scales, and its i18n label key (shared with the display's own text-size editor). */
const SLIDERS: { key: keyof TextSizes; labelKey: string }[] = [
  { key: 'heading', labelKey: 'headingLabel' },
  { key: 'itemTitle', labelKey: 'itemTitleLabel' },
  { key: 'description', labelKey: 'descriptionLabel' },
  { key: 'price', labelKey: 'priceLabel' },
  { key: 'itemPrice', labelKey: 'itemPriceLabel' },
]

const ALL_100: Record<keyof TextSizes, number> = { heading: 100, itemTitle: 100, description: 100, price: 100, itemPrice: 100 }

/** A snapshot of the screen's default text sizes, each of its 4 slots' own effective sizes, and every slide's own text-size override (if it has one) — together, the 100% reference point. */
export interface SizeSnapshot {
  textSizes: TextSizes
  slotTextSizes: Record<number, TextSizes>
  slots: ScreenConfig['slots']
}

function snapshotFrom(screen: ScreenConfig): SizeSnapshot {
  const textSizes = screen.textSizes ?? DEFAULT_TEXT_SIZES
  const slotTextSizes: Record<number, TextSizes> = {}
  ;[0, 1, 2, 3].forEach((index) => {
    slotTextSizes[index] = screen.slotTextSizes?.[index] ?? textSizes
  })
  return { textSizes, slotTextSizes, slots: screen.slots }
}

interface GlobalTextSizeScalerProps {
  screen: ScreenConfig
  /** Called with the newly-scaled sizes (the default, every slot's own, and every slide's own override), live, on every slider move. */
  onChange: (next: SizeSnapshot) => void
  /** Omit both `backgroundColor` and `onBackgroundColorChange` to hide the swatch picker — used by the admin form's percentage scaler, where background color isn't part of this panel. */
  backgroundColor?: string
  onBackgroundColorChange?: (backgroundColor: string) => void
  onDone: () => void
}

/**
 * Scales every text size role by a percentage — 100% means "unchanged".
 * Unlike the display's own (absolute) text-size editor, this doesn't set one
 * shared value: the screen's own default, each slot's own size, and every
 * individual slide's own override (for a slide that's opted out of its
 * slot's shared size) all keep their own current size and are scaled
 * relative to *that*, so things that already differ from each other keep
 * differing, just all bigger or all smaller together. The 100% reference
 * point is captured once when this panel opens, so repeatedly nudging a
 * slider scales from that fixed baseline rather than compounding. "Restore
 * previous" resets every slider back to 100% (and, when shown, the
 * background color) — i.e. back to how the screen looked when the panel
 * opened.
 */
export function GlobalTextSizeScaler({ screen, onChange, backgroundColor, onBackgroundColorChange, onDone }: GlobalTextSizeScalerProps) {
  const { t } = useLanguage()
  const [baseline] = useState(() => snapshotFrom(screen))
  const [originalBackgroundColor] = useState(() => backgroundColor)
  const [percentages, setPercentages] = useState<Record<keyof TextSizes, number>>(ALL_100)
  const [current, setCurrent] = useState<SizeSnapshot>(baseline)

  const setPercentage = (field: keyof TextSizes, percent: number) => {
    setPercentages((prev) => ({ ...prev, [field]: percent }))

    const scale = percent / 100
    const nextTextSizes = { ...current.textSizes, [field]: baseline.textSizes[field] * scale }

    const nextSlotTextSizes = { ...current.slotTextSizes }
    ;[0, 1, 2, 3].forEach((index) => {
      nextSlotTextSizes[index] = { ...current.slotTextSizes[index], [field]: baseline.slotTextSizes[index][field] * scale }
    })

    const nextSlots = current.slots.map((slot, slotIndex) => ({
      ...slot,
      contents: slot.contents.map((content, contentIndex) => {
        if (content.kind === 'none' || !content.useOwnTextSizes || !content.textSizes) return content
        const baselineContent = baseline.slots[slotIndex].contents[contentIndex]
        if (baselineContent.kind === 'none' || !baselineContent.textSizes) return content
        return { ...content, textSizes: { ...content.textSizes, [field]: baselineContent.textSizes[field] * scale } }
      }),
    })) as ScreenConfig['slots']

    const next = { textSizes: nextTextSizes, slotTextSizes: nextSlotTextSizes, slots: nextSlots }
    setCurrent(next)
    onChange(next)
  }

  const handleRestore = () => {
    setPercentages(ALL_100)
    setCurrent(baseline)
    onChange(baseline)
    if (onBackgroundColorChange && originalBackgroundColor !== undefined) onBackgroundColorChange(originalBackgroundColor)
  }

  return (
    <div className="global-text-size-scaler">
      {backgroundColor !== undefined && onBackgroundColorChange && <BackgroundColorPicker backgroundColor={backgroundColor} onChange={onBackgroundColorChange} />}

      {SLIDERS.map(({ key, labelKey }) => (
        <label key={key} className="global-text-size-scaler__slider">
          <span>
            {t(`screenDisplay.textSizeEditor.${labelKey}`)} — {percentages[key]}%
          </span>
          <input type="range" min={25} max={300} step={5} value={percentages[key]} onChange={(event) => setPercentage(key, Number(event.target.value))} />
        </label>
      ))}

      <div className="global-text-size-scaler__actions">
        <Button type="button" variant="secondary" onClick={handleRestore}>
          {t('screenDisplay.textSizeEditor.restorePrevious')}
        </Button>
        <Button type="button" onClick={onDone}>
          {t('screenDisplay.textSizeEditor.done')}
        </Button>
      </div>
    </div>
  )
}
