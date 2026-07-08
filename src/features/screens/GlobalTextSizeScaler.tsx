import { useState } from 'react'
import { Button, Checkbox } from '../../components'
import { useLanguage } from '../../i18n'
import { DEFAULT_TEXT_SIZES, type ScreenConfig, type TextSizes } from '../../types/screen'
import { hasOwnTextSizeFields } from '../../utils/screenSlots'
import { mapTimelineValues } from '../../utils/screenStages'
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

/** A snapshot of the screen's default text sizes and every slot as a whole (which — since each slot's `textSizes`/`content` are their own stage timelines — carries every stage's own effective size and override along with it) — together, the 100% reference point. */
export interface SizeSnapshot {
  textSizes: TextSizes
  slots: ScreenConfig['slots']
}

function snapshotFrom(screen: ScreenConfig): SizeSnapshot {
  return { textSizes: screen.textSizes ?? DEFAULT_TEXT_SIZES, slots: screen.slots }
}

/** The "standard" snapshot: the hardcoded default text sizes everywhere (the screen's own, every slot's own at every stage, and every stage's own content override that's currently on), and every slot's (and every stage's own content override of) individual color and background image cleared back to a single fresh stage-1 default. Used by the "Reset" button — unlike "Restore previous", this isn't about undoing this session's edits, it's a hard reset to factory defaults. Each slot's own *content* selections (which stages have what) are left alone — only their sizing/color/image fields are cleared. */
function standardSnapshotFrom(slots: ScreenConfig['slots']): SizeSnapshot {
  const standardSlots = slots.map((slot) => ({
    ...slot,
    backgroundColor: { 1: undefined },
    backgroundImage: { 1: undefined },
    textSizes: { 1: DEFAULT_TEXT_SIZES },
    content:
      mapTimelineValues(slot.content, (content) => ({
        ...(hasOwnTextSizeFields(content) && content.useOwnTextSizes ? { ...content, textSizes: DEFAULT_TEXT_SIZES } : content),
        useOwnBackgroundImage: false,
        backgroundImage: undefined,
      })) ?? slot.content,
  })) as unknown as ScreenConfig['slots']
  return { textSizes: DEFAULT_TEXT_SIZES, slots: standardSlots }
}

interface GlobalTextSizeScalerProps {
  screen: ScreenConfig
  /** Called with the newly-scaled sizes (the default and every slot's own, across every stage), live, on every edit. */
  onChange: (next: SizeSnapshot) => void
  /** Shows the "Use screensaver"/"Test screensaver" section — omit to hide it entirely. Only passed by the on-screen "Edit appearance" panel; the admin form's own percentage scaler doesn't need it since its Global tab already has its own directly. */
  screensaver?: {
    enabled: boolean
    onEnabledChange: (enabled: boolean) => void
    testActive: boolean
    onTestActiveChange: (active: boolean) => void
  }
  /** Shows a "Background" button that navigates to the screen's own background color/image sub-view — omit to hide it. Only passed by the on-screen "Edit appearance" panel; the admin form's Global tab already has its own "Background" button directly, alongside this panel's own "Edit text size" one. */
  onOpenBackground?: () => void
  onDone: () => void
}

/**
 * Scales every text size role by a percentage — 100% means "unchanged".
 * Unlike the display's own (absolute) text-size editor, this doesn't set one
 * shared value: the screen's own default and each slot's own size — at
 * every stage it has one, plus every stage's own content override (for a
 * checkpoint that's opted out of its slot's shared size) — all keep their
 * own current size and are scaled relative to the reference point captured
 * when the panel opened (or reset to, if "Reset" was used since). The
 * screen's own overall background (color and image) lives in its own
 * separate sub-view (`onOpenBackground`), not here, since it's always live
 * and has no restore/reset semantics of its own. "Restore previous" undoes
 * everything back to how the screen was when the panel opened; "Reset"
 * instead sets every size to the hardcoded standard and clears every slot's
 * own color/image (at every stage) back to a single fresh default.
 */
export function GlobalTextSizeScaler({ screen, onChange, screensaver, onOpenBackground, onDone }: GlobalTextSizeScalerProps) {
  const { t } = useLanguage()
  const [baseline] = useState(() => snapshotFrom(screen))
  const [reference, setReference] = useState<SizeSnapshot>(baseline)
  const [percentages, setPercentages] = useState<Record<keyof TextSizes, number>>(ALL_100)
  const [allPercent, setAllPercent] = useState(100)
  const [current, setCurrent] = useState<SizeSnapshot>(baseline)

  /** Scales a single field (the default and every slot's own size/override, at every stage each has one) by `percent`, relative to `reference`. */
  const scaleField = (base: SizeSnapshot, field: keyof TextSizes, percent: number): SizeSnapshot => {
    const scale = percent / 100
    const nextTextSizes = { ...base.textSizes, [field]: reference.textSizes[field] * scale }

    const nextSlots = base.slots.map((slot, slotIndex) => {
      const referenceSlot = reference.slots[slotIndex]
      const nextSlotTextSizes =
        mapTimelineValues(slot.textSizes, (value, stageKey) => {
          if (!value) return value
          const referenceValue = referenceSlot.textSizes[stageKey]
          return { ...value, [field]: (referenceValue ? referenceValue[field] : value[field]) * scale }
        }) ?? slot.textSizes

      const nextContent =
        mapTimelineValues(slot.content, (content, stageKey) => {
          if (!hasOwnTextSizeFields(content) || !content.useOwnTextSizes || !content.textSizes) return content
          const referenceContent = referenceSlot.content[stageKey]
          if (!hasOwnTextSizeFields(referenceContent) || !referenceContent.textSizes) return content
          return { ...content, textSizes: { ...content.textSizes, [field]: referenceContent.textSizes[field] * scale } }
        }) ?? slot.content

      return { ...slot, textSizes: nextSlotTextSizes, content: nextContent }
    }) as ScreenConfig['slots']

    return { textSizes: nextTextSizes, slots: nextSlots }
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
      {onOpenBackground && (
        <Button type="button" variant="secondary" onClick={onOpenBackground}>
          {t('admin.screens.backgroundLabel')}
        </Button>
      )}

      {screensaver && (
        <div className="global-text-size-scaler__screensaver">
          <Checkbox
            id="global-use-screensaver"
            label={t('admin.screens.useScreensaverLabel')}
            checked={screensaver.enabled}
            onChange={(event) => screensaver.onEnabledChange(event.target.checked)}
          />
          <Button type="button" variant="secondary" onClick={() => screensaver.onTestActiveChange(!screensaver.testActive)}>
            {screensaver.testActive ? t('admin.screens.stopTestScreensaverButton') : t('admin.screens.testScreensaverButton')}
          </Button>
        </div>
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
