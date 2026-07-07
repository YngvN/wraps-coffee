import { useState } from 'react'
import { Button } from '../../components'
import { useLanguage } from '../../i18n'
import { DEFAULT_TEXT_SIZES, type ScreenConfig, type TextSizes } from '../../types/screen'
import { hasOwnTextSizeFields } from '../../utils/screenSlots'
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

/** A snapshot of the screen's default text sizes, each of its 4 slots' own effective sizes, and every slide's own text-size override (if it has one) — together, the 100% reference point. `slots` also carries each slot's own background color. */
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

/** The "standard" snapshot: the hardcoded default text sizes everywhere (the screen's own, every slot's own, and every slide's own override that's currently on), and every slot's (and slide's own override of) individual color and background image cleared. Used by the "Reset" button — unlike "Restore previous", this isn't about undoing this session's edits, it's a hard reset to factory defaults. */
function standardSnapshotFrom(slots: ScreenConfig['slots']): SizeSnapshot {
  const slotTextSizes: Record<number, TextSizes> = { 0: DEFAULT_TEXT_SIZES, 1: DEFAULT_TEXT_SIZES, 2: DEFAULT_TEXT_SIZES, 3: DEFAULT_TEXT_SIZES }
  const standardSlots = slots.map((slot) => ({
    ...slot,
    backgroundColor: undefined,
    backgroundImage: undefined,
    contents: slot.contents.map((content) => ({
      ...(hasOwnTextSizeFields(content) && content.useOwnTextSizes ? { ...content, textSizes: DEFAULT_TEXT_SIZES } : content),
      useOwnBackgroundImage: false,
      backgroundImage: undefined,
    })),
  })) as ScreenConfig['slots']
  return { textSizes: DEFAULT_TEXT_SIZES, slotTextSizes, slots: standardSlots }
}

interface GlobalTextSizeScalerProps {
  screen: ScreenConfig
  /** Called with the newly-scaled sizes (the default, every slot's own, and every slide's own override) plus any slot color change, live, on every edit. */
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
 * relative to the reference point captured when the panel opened (or reset
 * to, if "Reset" was used since). Only the screen's own overall background
 * color is editable here — a slot's own individual color is only editable
 * from that slot's own editor, to keep this panel about the whole screen.
 * "Restore previous" undoes everything back to how the screen was when the
 * panel opened; "Reset" instead sets every size to the hardcoded standard
 * and clears every slot's own color back to transparent, leaving the
 * screen's own background color alone.
 */
export function GlobalTextSizeScaler({ screen, onChange, backgroundColor, onBackgroundColorChange, onDone }: GlobalTextSizeScalerProps) {
  const { t } = useLanguage()
  const [baseline] = useState(() => snapshotFrom(screen))
  const [originalBackgroundColor] = useState(() => backgroundColor)
  const [reference, setReference] = useState<SizeSnapshot>(baseline)
  const [percentages, setPercentages] = useState<Record<keyof TextSizes, number>>(ALL_100)
  const [allPercent, setAllPercent] = useState(100)
  const [current, setCurrent] = useState<SizeSnapshot>(baseline)

  /** Scales a single field (the default, every slot's own, and every slide's own override) by `percent`, relative to `reference`. */
  const scaleField = (base: SizeSnapshot, field: keyof TextSizes, percent: number): SizeSnapshot => {
    const scale = percent / 100
    const nextTextSizes = { ...base.textSizes, [field]: reference.textSizes[field] * scale }

    const nextSlotTextSizes = { ...base.slotTextSizes }
    ;[0, 1, 2, 3].forEach((index) => {
      nextSlotTextSizes[index] = { ...base.slotTextSizes[index], [field]: reference.slotTextSizes[index][field] * scale }
    })

    const nextSlots = base.slots.map((slot, slotIndex) => ({
      ...slot,
      contents: slot.contents.map((content, contentIndex) => {
        if (!hasOwnTextSizeFields(content) || !content.useOwnTextSizes || !content.textSizes) return content
        const referenceContent = reference.slots[slotIndex].contents[contentIndex]
        if (!hasOwnTextSizeFields(referenceContent) || !referenceContent.textSizes) return content
        return { ...content, textSizes: { ...content.textSizes, [field]: referenceContent.textSizes[field] * scale } }
      }),
    })) as ScreenConfig['slots']

    return { textSizes: nextTextSizes, slotTextSizes: nextSlotTextSizes, slots: nextSlots }
  }

  const setPercentage = (field: keyof TextSizes, percent: number) => {
    setPercentages((prev) => ({ ...prev, [field]: percent }))
    const next = scaleField(current, field, percent)
    setCurrent(next)
    onChange(next)
  }

  /** The "All" slider — scales every role by the same percentage in one pass, so the individual sliders below move to reflect their new size together, instead of drifting out of sync one call at a time. */
  const setAllPercentage = (percent: number) => {
    setAllPercent(percent)
    setPercentages({ heading: percent, itemTitle: percent, description: percent, price: percent, itemPrice: percent })
    const next = SLIDERS.reduce((acc, { key }) => scaleField(acc, key, percent), current)
    setCurrent(next)
    onChange(next)
  }

  /** Undoes everything back to how the screen was when this panel opened. */
  const handleRestore = () => {
    setPercentages(ALL_100)
    setAllPercent(100)
    setReference(baseline)
    setCurrent(baseline)
    onChange(baseline)
    if (onBackgroundColorChange && originalBackgroundColor !== undefined) onBackgroundColorChange(originalBackgroundColor)
  }

  /** Hard-resets every size to the standard default and clears every slot's own color — a fresh 100% reference point, not tied to how the screen looked when the panel opened. Leaves the screen's own background color untouched. */
  const handleReset = () => {
    const standard = standardSnapshotFrom(current.slots)
    setPercentages(ALL_100)
    setAllPercent(100)
    setReference(standard)
    setCurrent(standard)
    onChange(standard)
  }

  return (
    <div className="global-text-size-scaler">
      {backgroundColor !== undefined && onBackgroundColorChange && (
        <BackgroundColorPicker backgroundColor={backgroundColor} onChange={(color) => color !== undefined && onBackgroundColorChange(color)} />
      )}

      <label className="global-text-size-scaler__slider global-text-size-scaler__slider--all">
        <span>
          {t('screenDisplay.textSizeEditor.allLabel')} — {allPercent}%
        </span>
        <input type="range" min={25} max={300} step={5} value={allPercent} onChange={(event) => setAllPercentage(Number(event.target.value))} />
      </label>

      {SLIDERS.map(({ key, labelKey }) => (
        <label key={key} className="global-text-size-scaler__slider">
          <span>
            {t(`screenDisplay.textSizeEditor.${labelKey}`)} — {percentages[key]}%
          </span>
          <input type="range" min={25} max={300} step={5} value={percentages[key]} onChange={(event) => setPercentage(key, Number(event.target.value))} />
        </label>
      ))}

      <div className="global-text-size-scaler__actions">
        <Button type="button" variant="secondary" onClick={handleReset}>
          {t('screenDisplay.textSizeEditor.reset')}
        </Button>
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
