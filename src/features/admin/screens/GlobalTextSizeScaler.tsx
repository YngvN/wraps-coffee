import { useState } from 'react'
import { Button } from '../../../components'
import { useLanguage } from '../../../i18n'
import { DEFAULT_TEXT_SIZES, type ScreenConfig, type TextSizes } from '../../../types/screen'
import './GlobalTextSizeScaler.scss'

/** One slider row's config: which `TextSizes` field it scales, and its i18n label key (shared with the display's own text-size editor). */
const SLIDERS: { key: keyof TextSizes; labelKey: string }[] = [
  { key: 'heading', labelKey: 'headingLabel' },
  { key: 'itemTitle', labelKey: 'itemTitleLabel' },
  { key: 'description', labelKey: 'descriptionLabel' },
  { key: 'price', labelKey: 'priceLabel' },
  { key: 'itemPrice', labelKey: 'itemPriceLabel' },
]

/** A snapshot of the screen's default text sizes plus each of its 4 slots' own effective sizes, used as the 100% reference point. */
interface SizeSnapshot {
  textSizes: TextSizes
  slotTextSizes: Record<number, TextSizes>
}

function snapshotFrom(screen: ScreenConfig): SizeSnapshot {
  const textSizes = screen.textSizes ?? DEFAULT_TEXT_SIZES
  const slotTextSizes: Record<number, TextSizes> = {}
  ;[0, 1, 2, 3].forEach((index) => {
    slotTextSizes[index] = screen.slotTextSizes?.[index] ?? textSizes
  })
  return { textSizes, slotTextSizes }
}

interface GlobalTextSizeScalerProps {
  screen: ScreenConfig
  /** Called with the newly-scaled sizes (the default plus all 4 slots' own), live, on every slider move. */
  onChange: (next: SizeSnapshot) => void
  onDone: () => void
}

/**
 * Scales every text size role by a percentage — 100% means "unchanged".
 * Unlike the display's own (absolute) text-size editor, this doesn't set one
 * shared value: each slot keeps its own current size and is scaled relative
 * to *that*, so slots that already differ from each other keep differing,
 * just all bigger or all smaller together. The screen's own default is
 * scaled the same way, so any slot added later still matches. The 100%
 * reference point is captured once when this panel opens, so repeatedly
 * nudging a slider scales from that fixed baseline rather than compounding.
 */
export function GlobalTextSizeScaler({ screen, onChange, onDone }: GlobalTextSizeScalerProps) {
  const { t } = useLanguage()
  const [baseline] = useState(() => snapshotFrom(screen))
  const [percentages, setPercentages] = useState<Record<keyof TextSizes, number>>({ heading: 100, itemTitle: 100, description: 100, price: 100, itemPrice: 100 })
  const [current, setCurrent] = useState<SizeSnapshot>(baseline)

  const setPercentage = (field: keyof TextSizes, percent: number) => {
    setPercentages((prev) => ({ ...prev, [field]: percent }))

    const scale = percent / 100
    const nextTextSizes = { ...current.textSizes, [field]: baseline.textSizes[field] * scale }
    const nextSlotTextSizes = { ...current.slotTextSizes }
    ;[0, 1, 2, 3].forEach((index) => {
      nextSlotTextSizes[index] = { ...current.slotTextSizes[index], [field]: baseline.slotTextSizes[index][field] * scale }
    })

    const next = { textSizes: nextTextSizes, slotTextSizes: nextSlotTextSizes }
    setCurrent(next)
    onChange(next)
  }

  return (
    <div className="global-text-size-scaler">
      {SLIDERS.map(({ key, labelKey }) => (
        <label key={key} className="global-text-size-scaler__slider">
          <span>
            {t(`screenDisplay.textSizeEditor.${labelKey}`)} — {percentages[key]}%
          </span>
          <input type="range" min={25} max={300} step={5} value={percentages[key]} onChange={(event) => setPercentage(key, Number(event.target.value))} />
        </label>
      ))}

      <div className="global-text-size-scaler__actions">
        <Button type="button" onClick={onDone}>
          {t('admin.common.done')}
        </Button>
      </div>
    </div>
  )
}
