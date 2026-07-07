import { useState, type FormEvent } from 'react'
import { Button, Checkbox, Input } from '../../../components'
import { useScreens } from '../../../hooks/useScreens'
import { useLanguage } from '../../../i18n'
import { DEFAULT_SCREEN_BACKGROUND_COLOR, DEFAULT_TEXT_SIZES, type ScreenConfig, type ScreenSlot, type SplitBigPosition, type SplitDirection, type TextSizes } from '../../../types/screen'
import { hasOwnTextSizeFields, isSlotActive, type SlideTarget } from '../../../utils/screenSlots'
import { resolveContentTextSizes } from '../../../utils/textSizeVars'
import { BackgroundColorPicker } from '../../screens/BackgroundColorPicker'
import { GlobalTextSizeScaler, type SizeSnapshot } from '../../screens/GlobalTextSizeScaler'
import { SlotFieldGroup } from '../../screens/SlotFieldGroup'
import { TextSizeEditor } from '../../screens/TextSizeEditor'
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

/** A slot with no selection yet. */
const EMPTY_SLOT: ScreenSlot = { isSlideshow: false, contents: [{ kind: 'none' }] }

/** The next unused "<prefix> N" name (starting at 1), so a new screen never defaults to a name that collides with an existing one. */
function nextDefaultScreenName(screens: ScreenConfig[], prefix: string): string {
  const existingNames = new Set(screens.map((existing) => existing.name))
  let n = 1
  while (existingNames.has(`${prefix} ${n}`)) n++
  return `${prefix} ${n}`
}

/**
 * Create/edit form for a single screen: a "Global" tab with name, the
 * screen's own background color, how many of its 4 slots are actually shown
 * (`slotCount`) plus their on-screen arrangement, whether/what color the
 * borders between panes use, and — one tab per slot, so each gets its own
 * room — that slot's own "Slideshow" toggle, content list, background
 * color, and (per slide) text size. Everything available from the
 * display's own in-place editors is available here too, so the whole
 * screen can be configured externally without ever opening the live
 * display. Reducing `slotCount` never clears a hidden slot's own
 * content/settings — its tab stays fully editable, just visually marked as
 * not currently shown — so dialing it back up (or mis-saving with it lower
 * than intended) can't lose any data; only deleting the whole screen does.
 */
export function ScreenForm({ screen, onSave, onCancel }: ScreenFormProps) {
  const { t } = useLanguage()
  const [screens, setScreens] = useScreens()
  /** Which text-size editor is open: the whole screen's default (as a relative percentage scale), one specific slide's own (absolute), or none. */
  const [editingTarget, setEditingTarget] = useState<'global' | SlideTarget | null>(null)
  const [liveTextSizes, setLiveTextSizes] = useState<TextSizes>(screen?.textSizes ?? DEFAULT_TEXT_SIZES)
  const [liveUseOwnTextSizes, setLiveUseOwnTextSizes] = useState(false)
  const [name, setName] = useState(() => screen?.name ?? nextDefaultScreenName(screens, t('admin.screens.defaultNamePrefix')))
  const [slotCount, setSlotCount] = useState(screen?.slotCount ?? 4)
  const [slot1, setSlot1] = useState<ScreenSlot>(screen?.slots[0] ?? EMPTY_SLOT)
  const [slot2, setSlot2] = useState<ScreenSlot>(screen?.slots[1] ?? EMPTY_SLOT)
  const [slot3, setSlot3] = useState<ScreenSlot>(screen?.slots[2] ?? EMPTY_SLOT)
  const [slot4, setSlot4] = useState<ScreenSlot>(screen?.slots[3] ?? EMPTY_SLOT)
  /** Which tab is showing: the screen-wide settings, or one specific slot's own. */
  const [activeTab, setActiveTab] = useState<'global' | number>('global')
  const [slideDurationSeconds, setSlideDurationSeconds] = useState(screen?.slideDurationSeconds ?? 10)
  const [splitDirection, setSplitDirection] = useState<SplitDirection>(screen?.splitDirection ?? 'row')
  const [splitBigPosition, setSplitBigPosition] = useState<SplitBigPosition>(screen?.splitBigPosition ?? 'first')
  const [showSlotBorders, setShowSlotBorders] = useState(screen?.showSlotBorders ?? true)
  const [hideScrollbar, setHideScrollbar] = useState(screen?.hideScrollbar ?? false)

  const slotFields: { id: string; label: string; value: ScreenSlot; onChange: (slot: ScreenSlot) => void }[] = [
    { id: 'slot-1', label: t('admin.screens.slot1Label'), value: slot1, onChange: setSlot1 },
    { id: 'slot-2', label: t('admin.screens.slot2Label'), value: slot2, onChange: setSlot2 },
    { id: 'slot-3', label: t('admin.screens.slot3Label'), value: slot3, onChange: setSlot3 },
    { id: 'slot-4', label: t('admin.screens.slot4Label'), value: slot4, onChange: setSlot4 },
  ]
  const activeSlot = typeof activeTab === 'number' ? slotFields[activeTab] : null

  const needsDurationField = slotFields.some(({ value }) => value.isSlideshow)
  /** The freshest persisted version of this screen — reflects any live writes already made this session (background color, text sizes) that this form's own local state doesn't separately track, so neither re-seeding a sub-panel nor the final Save can stomp them with stale data. */
  const latestScreen = screen ? (screens.find((candidate) => candidate.screenID === screen.screenID) ?? screen) : null

  /** Opens the whole-screen percentage scaler. */
  const openGlobalTextSizeEditor = () => {
    if (!screen) return
    setEditingTarget('global')
  }

  /** Opens one slide's own (absolute) text-size editor, seeded from that slide's current effective size. */
  const openSlideTextSizeEditor = (slotIndex: number, contentIndex: number) => {
    if (!screen || !latestScreen) return
    const content = slotFields[slotIndex].value.contents[contentIndex] ?? { kind: 'none' as const }
    const sharedTextSizes = latestScreen.slotTextSizes?.[slotIndex] ?? latestScreen.textSizes ?? DEFAULT_TEXT_SIZES
    const useOwn = hasOwnTextSizeFields(content) && Boolean(content.useOwnTextSizes)
    setLiveTextSizes(resolveContentTextSizes(content, sharedTextSizes))
    setLiveUseOwnTextSizes(useOwn)
    setEditingTarget({ slotIndex, contentIndex })
  }

  /**
   * Writes a slide's text-size change straight to the persisted screen (via
   * `useScreens`, the same localStorage-backed store the display reads
   * from), not just this form's own local draft — so it shows up live on
   * that screen's display immediately, in any other tab/window of this
   * browser already showing it. This is plain browser storage, not a
   * network call, so it keeps working even if the internet drops. Goes to
   * that one slide's own override when its checkbox is on, else the slot's
   * shared size.
   */
  const handleLiveSlideTextSizesChange = (sizes: TextSizes) => {
    setLiveTextSizes(sizes)
    if (!screen || editingTarget === 'global' || editingTarget === null) return
    const { slotIndex, contentIndex } = editingTarget
    setScreens(
      screens.map((existing) => {
        if (existing.screenID !== screen.screenID) return existing
        if (liveUseOwnTextSizes) {
          const slots = existing.slots.map((slot, i) => {
            if (i !== slotIndex) return slot
            const contents = slot.contents.map((content, ci) => (ci === contentIndex && hasOwnTextSizeFields(content) ? { ...content, useOwnTextSizes: true, textSizes: sizes } : content))
            return { ...slot, contents }
          }) as ScreenConfig['slots']
          return { ...existing, slots }
        }
        return { ...existing, slotTextSizes: { ...existing.slotTextSizes, [slotIndex]: sizes } }
      }),
    )
  }

  /** Toggles whether the slide being edited follows its slot's shared size or keeps its own — applied live, same reasoning as `handleLiveSlideTextSizesChange`. */
  const handleUseOwnTextSizesChange = (checked: boolean) => {
    setLiveUseOwnTextSizes(checked)
    if (!screen || editingTarget === 'global' || editingTarget === null) return
    const { slotIndex, contentIndex } = editingTarget
    setScreens(
      screens.map((existing) => {
        if (existing.screenID !== screen.screenID) return existing
        const slots = existing.slots.map((slot, i) => {
          if (i !== slotIndex) return slot
          const contents = slot.contents.map((content, ci) => {
            if (ci !== contentIndex || !hasOwnTextSizeFields(content)) return content
            return checked ? { ...content, useOwnTextSizes: true, textSizes: liveTextSizes } : { ...content, useOwnTextSizes: false }
          })
          return { ...slot, contents }
        }) as ScreenConfig['slots']
        return { ...existing, slots }
      }),
    )
  }

  /** Writes a whole-screen percentage-scaled change (the default, every slot's own size, and every slide's own override) straight to the persisted screen, live — same reasoning as `handleLiveSlideTextSizesChange`. */
  const handleGlobalTextSizesChange = (next: SizeSnapshot) => {
    if (!screen) return
    setScreens(screens.map((existing) => (existing.screenID === screen.screenID ? { ...existing, textSizes: next.textSizes, slotTextSizes: next.slotTextSizes, slots: next.slots } : existing)))
  }

  /** Writes a partial change straight to the persisted screen, live — same reasoning as the text-size handlers: so it shows up on the display immediately, in any other tab/window of this browser already showing it. */
  const liveUpdateScreen = (patch: Partial<ScreenConfig>) => {
    if (!screen) return
    setScreens(screens.map((existing) => (existing.screenID === screen.screenID ? { ...existing, ...patch } : existing)))
  }

  /** Writes the screen's own background color straight to the persisted screen, live. */
  const handleScreenBackgroundColorChange = (color: string) => liveUpdateScreen({ backgroundColor: color })

  /** Writes the pane border color straight to the persisted screen, live. `undefined` goes back to the automatic contrast-based color. */
  const handleBorderColorChange = (color: string | undefined) => liveUpdateScreen({ borderColor: color })

  /** Writes the chosen slot count straight to the persisted screen, live. */
  const handleSlotCountChange = (count: number) => {
    setSlotCount(count)
    liveUpdateScreen({ slotCount: count })
  }

  /** Writes the row/column split direction (2 slots) straight to the persisted screen, live. */
  const handleSplitDirectionChange = (direction: SplitDirection) => {
    setSplitDirection(direction)
    liveUpdateScreen({ splitDirection: direction })
  }

  /** Writes a triple arrangement (3 slots) straight to the persisted screen, live. */
  const handleTripleArrangementChange = (direction: SplitDirection, bigPosition: SplitBigPosition) => {
    setSplitDirection(direction)
    setSplitBigPosition(bigPosition)
    liveUpdateScreen({ splitDirection: direction, splitBigPosition: bigPosition })
  }

  /**
   * Returning from a live-writing sub-panel (the global scaler or a slide's
   * own editor) to the main form — re-seeds the 4 slot fields from the
   * freshest persisted data, since both sub-panels can write straight into
   * a slot's own contents/color/text sizes. Without this, the main form's
   * own (now-stale) local slot state would stomp those live writes the next
   * time "Save" is clicked.
   */
  const closeTextSizeEditor = () => {
    const latest = screens.find((candidate) => candidate.screenID === screen?.screenID)
    if (latest) {
      setSlot1(latest.slots[0])
      setSlot2(latest.slots[1])
      setSlot3(latest.slots[2])
      setSlot4(latest.slots[3])
    }
    setEditingTarget(null)
  }

  if (editingTarget === 'global' && screen) {
    return (
      <GlobalTextSizeScaler
        screen={latestScreen ?? screen}
        onChange={handleGlobalTextSizesChange}
        backgroundColor={latestScreen?.backgroundColor ?? DEFAULT_SCREEN_BACKGROUND_COLOR}
        onBackgroundColorChange={handleScreenBackgroundColorChange}
        onDone={closeTextSizeEditor}
      />
    )
  }

  if (editingTarget && typeof editingTarget === 'object') {
    const editingSlot = slotFields[editingTarget.slotIndex].value
    const editingSlotActiveCount = editingSlot.contents.filter((content) => content.kind !== 'none').length
    const showOwnTextSizeOption = editingSlot.isSlideshow && editingSlotActiveCount > 1
    return (
      <TextSizeEditor
        textSizes={liveTextSizes}
        onChange={handleLiveSlideTextSizesChange}
        ownTextSizes={showOwnTextSizeOption ? { useOwn: liveUseOwnTextSizes, onUseOwnChange: handleUseOwnTextSizesChange } : undefined}
        onDone={closeTextSizeEditor}
      />
    )
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    onSave({
      // Carries forward fields this form has no controls of its own for
      // (right now, none — kept as a safety net for any screen-level field
      // this form doesn't explicitly track) from the freshest persisted
      // data, so a Save right after a live sub-panel edit can't revert it.
      ...(latestScreen ?? screen),
      screenID: screen?.screenID ?? `${Date.now()}`,
      name,
      slotCount,
      slots: [slot1, slot2, slot3, slot4],
      slideDurationSeconds,
      transitionStyle: screen?.transitionStyle ?? 'slide',
      splitDirection,
      splitBigPosition,
      showSlotBorders,
      hideScrollbar,
    })
  }

  return (
    <form className="screen-form" onSubmit={handleSubmit}>
      <div className="screen-form__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'global'}
          className={`screen-form__tab${activeTab === 'global' ? ' screen-form__tab--active' : ''}`}
          onClick={() => setActiveTab('global')}
        >
          {t('admin.screens.globalTabLabel')}
        </button>
        {slotFields.map(({ id, label, value }, index) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === index}
            className={`screen-form__tab${activeTab === index ? ' screen-form__tab--active' : ''}${isSlotActive(value) ? ' screen-form__tab--filled' : ''}${index >= slotCount ? ' screen-form__tab--out-of-range' : ''}`}
            onClick={() => setActiveTab(index)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="screen-form__tab-panel">
        {activeTab === 'global' ? (
          <>
            <Input id="screen-name" label={t('admin.screens.nameLabel')} value={name} onChange={(event) => setName(event.target.value)} required />

            {screen && (
              <BackgroundColorPicker
                backgroundColor={latestScreen?.backgroundColor ?? DEFAULT_SCREEN_BACKGROUND_COLOR}
                onChange={(color) => color !== undefined && handleScreenBackgroundColorChange(color)}
              />
            )}

            {screen && (
              <Button type="button" variant="secondary" onClick={openGlobalTextSizeEditor}>
                {t('admin.screens.editTextSize')}
              </Button>
            )}

            <div className="screen-form__field">
              <span>{t('admin.screens.slotCountLabel')}</span>
              <div className="screen-form__layout-picker">
                {[1, 2, 3, 4].map((count) => (
                  <button
                    key={count}
                    type="button"
                    className={`screen-form__layout-option${slotCount === count ? ' screen-form__layout-option--active' : ''}`}
                    onClick={() => handleSlotCountChange(count)}
                  >
                    {count}
                  </button>
                ))}
              </div>
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

            {slotCount > 1 && (
              <Checkbox
                id="screen-show-slot-borders"
                label={t('admin.screens.showSlotBordersLabel')}
                checked={showSlotBorders}
                onChange={(event) => setShowSlotBorders(event.target.checked)}
              />
            )}

            {slotCount > 1 && showSlotBorders && screen && (
              <BackgroundColorPicker
                backgroundColor={latestScreen?.borderColor}
                onChange={handleBorderColorChange}
                allowTransparent
                label={t('admin.screens.borderColorLabel')}
                transparentLabel={t('admin.screens.autoBorderColorLabel')}
              />
            )}

            <Checkbox
              id="screen-hide-scrollbar"
              label={t('admin.screens.hideScrollbarLabel')}
              checked={hideScrollbar}
              onChange={(event) => setHideScrollbar(event.target.checked)}
            />

            {slotCount === 2 && (
              <div className="screen-form__field">
                <span>{t('admin.screens.splitDirectionLabel')}</span>
                <div className="screen-form__layout-picker">
                  <button
                    type="button"
                    className={`screen-form__layout-option${splitDirection === 'row' ? ' screen-form__layout-option--active' : ''}`}
                    onClick={() => handleSplitDirectionChange('row')}
                  >
                    <LayoutIcon pattern="row" />
                    <span>{t('admin.screens.splitDirectionRowLabel')}</span>
                  </button>
                  <button
                    type="button"
                    className={`screen-form__layout-option${splitDirection === 'column' ? ' screen-form__layout-option--active' : ''}`}
                    onClick={() => handleSplitDirectionChange('column')}
                  >
                    <LayoutIcon pattern="column" />
                    <span>{t('admin.screens.splitDirectionColumnLabel')}</span>
                  </button>
                </div>
              </div>
            )}

            {slotCount === 3 && (
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
                        onClick={() => handleTripleArrangementChange(direction, bigPosition)}
                      >
                        <LayoutIcon pattern={pattern} />
                        <span>{t(`admin.screens.${labelKey}`)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          activeSlot && (
            <>
              <Checkbox
                id={`${activeSlot.id}-slideshow`}
                label={t('admin.screens.slotSlideshowLabel')}
                checked={activeSlot.value.isSlideshow}
                onChange={(event) => activeSlot.onChange({ ...activeSlot.value, isSlideshow: event.target.checked })}
              />

              <SlotFieldGroup
                id={activeSlot.id}
                label={activeSlot.label}
                slot={activeSlot.value}
                onChange={activeSlot.onChange}
                onEditTextSize={screen ? (contentIndex) => openSlideTextSizeEditor(activeTab as number, contentIndex) : undefined}
              />

              <BackgroundColorPicker
                backgroundColor={activeSlot.value.backgroundColor}
                onChange={(color) => activeSlot.onChange({ ...activeSlot.value, backgroundColor: color })}
                allowTransparent
                label={t('screenDisplay.textSizeEditor.slotColorLabel', { number: (activeTab as number) + 1 })}
              />
            </>
          )
        )}
      </div>

      <div className="screen-form__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('admin.common.cancel')}
        </Button>
        <Button type="submit">{t('admin.common.save')}</Button>
      </div>
    </form>
  )
}
