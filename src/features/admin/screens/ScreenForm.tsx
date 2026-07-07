import { useState, type FormEvent } from 'react'
import { Button, Checkbox, Input } from '../../../components'
import { useScreens } from '../../../hooks/useScreens'
import { useLanguage } from '../../../i18n'
import { DEFAULT_TEXT_SIZES, type ScreenConfig, type ScreenLayout, type ScreenSlot, type SplitBigPosition, type SplitDirection, type TextSizes } from '../../../types/screen'
import { isSlotActive } from '../../../utils/screenSlots'
import { GlobalTextSizeScaler, type SizeSnapshot } from '../../screens/GlobalTextSizeScaler'
import { TextSizeEditor } from '../../screens/TextSizeEditor'
import { LayoutIcon, type LayoutIconPattern } from './LayoutIcon'
import './ScreenForm.scss'
import { SlotFieldGroup } from './SlotFieldGroup'

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

/** A slot with no selection yet. */
const EMPTY_SLOT: ScreenSlot = { isSlideshow: false, contents: [{ kind: 'none' }] }

/**
 * Create/edit form for a single screen: name, layout, a single "Slideshows"
 * checkbox that (when on) gives every one of the up to 4 content slots its
 * own growable list of slides to rotate through in place — instead of just
 * one selector each — and the shared per-slide duration, shown whenever it's
 * needed (the whole screen is a 'slideshow', or "Slideshows" is on). When
 * `layout` is 'split', an icon-based arrangement picker appears once exactly
 * 2 or 3 slots are active (4 active slots always form an even 2x2 grid,
 * needing no choice; 0-1 active slots need no arrangement either).
 */
export function ScreenForm({ screen, onSave, onCancel }: ScreenFormProps) {
  const { t } = useLanguage()
  const [screens, setScreens] = useScreens()
  /** Which text-size editor is open: the whole screen's default (as a relative percentage scale), one specific slot's own (absolute), or none. */
  const [editingTarget, setEditingTarget] = useState<'global' | number | null>(null)
  const [liveTextSizes, setLiveTextSizes] = useState<TextSizes>(screen?.textSizes ?? DEFAULT_TEXT_SIZES)
  const [name, setName] = useState(screen?.name ?? '')
  const [layout, setLayout] = useState<ScreenLayout>(screen?.layout ?? 'slideshow')
  const [slot1, setSlot1] = useState<ScreenSlot>(screen?.slots[0] ?? EMPTY_SLOT)
  const [slot2, setSlot2] = useState<ScreenSlot>(screen?.slots[1] ?? EMPTY_SLOT)
  const [slot3, setSlot3] = useState<ScreenSlot>(screen?.slots[2] ?? EMPTY_SLOT)
  const [slot4, setSlot4] = useState<ScreenSlot>(screen?.slots[3] ?? EMPTY_SLOT)
  const [slideshowEnabled, setSlideshowEnabled] = useState(() => (screen?.slots ?? []).some((slot) => slot.isSlideshow))
  const [slideDurationSeconds, setSlideDurationSeconds] = useState(screen?.slideDurationSeconds ?? 10)
  const [splitDirection, setSplitDirection] = useState<SplitDirection>(screen?.splitDirection ?? 'row')
  const [splitBigPosition, setSplitBigPosition] = useState<SplitBigPosition>(screen?.splitBigPosition ?? 'first')
  const [showSlotBorders, setShowSlotBorders] = useState(screen?.showSlotBorders ?? true)
  const [hideScrollbar, setHideScrollbar] = useState(screen?.hideScrollbar ?? false)

  const slots = [slot1, slot2, slot3, slot4]
  const activeCount = slots.filter(isSlotActive).length
  const needsDurationField = layout === 'slideshow' || slideshowEnabled

  /** Toggles "Slideshows" for all 4 slots at once, keeping each slot's already-chosen slide(s). */
  const toggleSlideshowEnabled = (checked: boolean) => {
    setSlideshowEnabled(checked)
    setSlot1((slot) => ({ ...slot, isSlideshow: checked }))
    setSlot2((slot) => ({ ...slot, isSlideshow: checked }))
    setSlot3((slot) => ({ ...slot, isSlideshow: checked }))
    setSlot4((slot) => ({ ...slot, isSlideshow: checked }))
  }

  /** Opens the whole-screen percentage scaler. */
  const openGlobalTextSizeEditor = () => {
    if (!screen) return
    setEditingTarget('global')
  }

  /** Opens one slot's own (absolute) text-size editor, seeded from that slot's current effective size. */
  const openSlotTextSizeEditor = (index: number) => {
    if (!screen) return
    setLiveTextSizes(screen.slotTextSizes?.[index] ?? screen.textSizes ?? DEFAULT_TEXT_SIZES)
    setEditingTarget(index)
  }

  /**
   * Writes a single slot's text-size change straight to the persisted screen
   * (via `useScreens`, the same localStorage-backed store the display reads
   * from), not just this form's own local draft — so it shows up live on
   * that screen's display immediately, in any other tab/window of this
   * browser already showing it. This is plain browser storage, not a
   * network call, so it keeps working even if the internet drops.
   */
  const handleLiveSlotTextSizesChange = (sizes: TextSizes) => {
    setLiveTextSizes(sizes)
    if (!screen || typeof editingTarget !== 'number') return
    setScreens(screens.map((existing) => (existing.screenID === screen.screenID ? { ...existing, slotTextSizes: { ...existing.slotTextSizes, [editingTarget]: sizes } } : existing)))
  }

  /** Writes a whole-screen percentage-scaled change (the default, every slot's own size, and every slide's own override) straight to the persisted screen, live — same reasoning as `handleLiveSlotTextSizesChange`. */
  const handleGlobalTextSizesChange = (next: SizeSnapshot) => {
    if (!screen) return
    setScreens(screens.map((existing) => (existing.screenID === screen.screenID ? { ...existing, textSizes: next.textSizes, slotTextSizes: next.slotTextSizes, slots: next.slots } : existing)))
  }

  const closeTextSizeEditor = () => setEditingTarget(null)

  if (editingTarget === 'global' && screen) {
    return <GlobalTextSizeScaler screen={screen} onChange={handleGlobalTextSizesChange} onDone={closeTextSizeEditor} />
  }

  if (typeof editingTarget === 'number') {
    return <TextSizeEditor textSizes={liveTextSizes} onChange={handleLiveSlotTextSizesChange} onDone={closeTextSizeEditor} />
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    onSave({
      screenID: screen?.screenID ?? `${Date.now()}`,
      name,
      layout,
      slots: [slot1, slot2, slot3, slot4],
      slideDurationSeconds,
      transitionStyle: screen?.transitionStyle ?? 'slide',
      splitDirection,
      splitBigPosition,
      showSlotBorders,
      hideScrollbar,
    })
  }

  const slotFields: { id: string; label: string; value: ScreenSlot; onChange: (slot: ScreenSlot) => void }[] = [
    { id: 'slot-1', label: t('admin.screens.slot1Label'), value: slot1, onChange: setSlot1 },
    { id: 'slot-2', label: t('admin.screens.slot2Label'), value: slot2, onChange: setSlot2 },
    { id: 'slot-3', label: t('admin.screens.slot3Label'), value: slot3, onChange: setSlot3 },
    { id: 'slot-4', label: t('admin.screens.slot4Label'), value: slot4, onChange: setSlot4 },
  ]

  return (
    <form className="screen-form" onSubmit={handleSubmit}>
      <Input id="screen-name" label={t('admin.screens.nameLabel')} value={name} onChange={(event) => setName(event.target.value)} required />

      {screen && (
        <Button type="button" variant="secondary" onClick={openGlobalTextSizeEditor}>
          {t('admin.screens.editTextSize')}
        </Button>
      )}

      <label className="screen-form__field">
        <span>{t('admin.screens.layoutLabel')}</span>
        <select value={layout} onChange={(event) => setLayout(event.target.value as ScreenLayout)}>
          <option value="slideshow">{t('admin.screens.layoutSlideshowLabel')}</option>
          <option value="split">{t('admin.screens.layoutSplitLabel')}</option>
        </select>
      </label>

      <Checkbox
        id="screen-slideshow-enabled"
        label={t('admin.screens.slotSlideshowLabel')}
        checked={slideshowEnabled}
        onChange={(event) => toggleSlideshowEnabled(event.target.checked)}
      />

      <div className="screen-form__row">
        {slotFields.map(({ id, label, value, onChange }, index) => (
          <SlotFieldGroup key={id} label={label} slot={value} onChange={onChange} onEditTextSize={screen ? () => openSlotTextSizeEditor(index) : undefined} />
        ))}
      </div>

      {needsDurationField && (
        <Input
          id="screen-slide-duration"
          label={t('admin.screens.slideDurationLabel')}
          type="number"
          min={1}
          value={slideDurationSeconds}
          onChange={(event) => setSlideDurationSeconds(Number(event.target.value))}
        />
      )}

      {layout === 'split' && (
        <Checkbox
          id="screen-show-slot-borders"
          label={t('admin.screens.showSlotBordersLabel')}
          checked={showSlotBorders}
          onChange={(event) => setShowSlotBorders(event.target.checked)}
        />
      )}

      <Checkbox
        id="screen-hide-scrollbar"
        label={t('admin.screens.hideScrollbarLabel')}
        checked={hideScrollbar}
        onChange={(event) => setHideScrollbar(event.target.checked)}
      />

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
