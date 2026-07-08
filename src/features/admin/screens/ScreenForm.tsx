import { AnimatePresence, motion } from 'framer-motion'
import { useState, type FormEvent } from 'react'
import { BackButton, Button, Checkbox, Input } from '../../../components'
import { useScreens } from '../../../hooks/useScreens'
import { useScreensaverSchedule } from '../../../hooks/useScreensaverSchedule'
import { useLanguage } from '../../../i18n'
import {
  DEFAULT_SCREEN_BACKGROUND_COLOR,
  DEFAULT_TEXT_SIZES,
  type BackgroundImage,
  type ScreenConfig,
  type ScreenSlot,
  type ScreenSlotContent,
  type ScreenTransitionStyle,
  type SplitBigPosition,
  type SplitDirection,
  type TextSizes,
} from '../../../types/screen'
import { nudgeRatio, type ResizeDirection } from '../../../utils/screenLayout'
import { firstActiveContentIndex, hasOwnTextSizeFields, isSlotActive } from '../../../utils/screenSlots'
import { resolveContentTextSizes } from '../../../utils/textSizeVars'
import { BackgroundColorPicker } from '../../screens/BackgroundColorPicker'
import { BackgroundEditor } from '../../screens/BackgroundEditor'
import { BackgroundImagePicker } from '../../screens/BackgroundImagePicker'
import { GlobalTextSizeScaler, type SizeSnapshot } from '../../screens/GlobalTextSizeScaler'
import { SlideFields } from '../../screens/SlideFields'
import { SlotSlideTabs } from '../../screens/SlotSlideTabs'
import { TextSizeEditor } from '../../screens/TextSizeEditor'
import { LayoutIcon, type LayoutIconPattern } from './LayoutIcon'
import './ScreenForm.scss'

interface ScreenFormProps {
  /** The screen being edited, or `null` when creating a new one. */
  screen: ScreenConfig | null
  onSave: (screen: ScreenConfig) => void
  onCancel: () => void
  /** Reports this form's own currently open sub-view by name (e.g. "Resize panes"), or `undefined` while showing its main tabbed content — lets the parent's `Modal` show it as a "Edit screen - Resize panes" breadcrumb next to its title. */
  onRouteChange?: (route: string | undefined) => void
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
 * (`slotCount`) plus their on-screen arrangement, a "Resize" panel of 4
 * arrows nudging whichever pane divider each one controls 1% at a time (the
 * exact same fields the live display's own draggable dividers adjust, so
 * either one stays in sync with the other), whether/what color the borders
 * between panes use, which animation (fade or slide, plus — for slide —
 * which side it enters from) any rotating slot's own slides use, and — one
 * tab per slot, so each gets its own room — that slot's own "Slideshow"
 * toggle. Once a slot is rotating through more than one slide,
 * its own tab splits further into a "Global" sub-tab (its shared background
 * color/image) and one sub-tab per slide (that slide's own content, its own
 * background-image override, and, once there's more than one active slide,
 * an inline "use own text size" toggle) — mirroring the outer tabs one
 * level deeper. A slot with just one slide skips the sub-tabs and shows
 * that slide's fields, its text size, and its background color/image flat.
 * Everything available from the display's own in-place editors is
 * available here too, so the whole screen can be configured externally
 * without ever opening the live display. Reducing `slotCount` never clears
 * a hidden slot's own content/settings — its tab stays fully editable, just
 * visually marked as not currently shown — so dialing it back up (or
 * mis-saving with it lower than intended) can't lose any data; only
 * deleting the whole screen does.
 */
export function ScreenForm({ screen, onSave, onCancel, onRouteChange }: ScreenFormProps) {
  const { t } = useLanguage()
  const [screens, setScreens] = useScreens()
  const [screensaverSchedule] = useScreensaverSchedule()
  /** Which sub-view (replacing the whole tabbed form until its own Back button is pressed) is open: the whole-screen percentage scaler, the "Arrangement" editor (layout picker plus its own resize D-pad, and its own nested "Borders" sub-menu — see `arrangementShowingBorders`), the "Background" color/image editor, the "Slideshow" (duration/transition/direction) editor, the "Screen saver" editor, the "Other settings" editor, or neither. */
  const [editingTarget, setEditingTarget] = useState<'global' | 'arrangement' | 'background' | 'slideshow' | 'screensaver' | 'other' | null>(null)
  /** Whether the "Arrangement" sub-view is itself showing its own nested "Borders" sub-menu rather than the layout picker/resize D-pad — reset whenever Arrangement (re)opens. */
  const [arrangementShowingBorders, setArrangementShowingBorders] = useState(false)
  const [liveTextSizes, setLiveTextSizes] = useState<TextSizes>(screen?.textSizes ?? DEFAULT_TEXT_SIZES)
  const [liveUseOwnTextSizes, setLiveUseOwnTextSizes] = useState(false)
  /** Which of the active slot's own tabs is showing: its "Global" settings, or one specific slide by index — only meaningful once that slot has more than one slide. */
  const [activeSlideTab, setActiveSlideTab] = useState<'global' | number>('global')
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
  const [useScreensaver, setUseScreensaver] = useState(screen?.useScreensaver ?? false)
  const [transitionStyle, setTransitionStyle] = useState<ScreenTransitionStyle>(screen?.transitionStyle ?? 'fade')

  const slotFields: { id: string; label: string; value: ScreenSlot; onChange: (slot: ScreenSlot) => void }[] = [
    { id: 'slot-1', label: t('admin.screens.slot1Label'), value: slot1, onChange: setSlot1 },
    { id: 'slot-2', label: t('admin.screens.slot2Label'), value: slot2, onChange: setSlot2 },
    { id: 'slot-3', label: t('admin.screens.slot3Label'), value: slot3, onChange: setSlot3 },
    { id: 'slot-4', label: t('admin.screens.slot4Label'), value: slot4, onChange: setSlot4 },
  ]
  const activeSlot = typeof activeTab === 'number' ? slotFields[activeTab] : null
  /** Whether the active slot's own editing surface splits into "Global" + one-tab-per-slide (once it's rotating through slides at all) or stays flat (a single slide, same as the slot itself). */
  const hasSlideTabs = Boolean(activeSlot?.value.isSlideshow)
  const activeSlideIndex = typeof activeSlideTab === 'number' ? activeSlideTab : 0

  const needsDurationField = slotFields.some(({ value }) => value.isSlideshow)
  /** The freshest persisted version of this screen — reflects any live writes already made this session (background color, text sizes) that this form's own local state doesn't separately track, so neither re-seeding a sub-panel nor the final Save can stomp them with stale data. */
  const latestScreen = screen ? (screens.find((candidate) => candidate.screenID === screen.screenID) ?? screen) : null

  /** Switches the outer tab (the screen-wide "Global" settings, or one specific slot), resetting/reseeding the inner slot tab: a slideshow slot lands on its own "Global" sub-tab, a flat (single-slide) one goes straight to its own actually-shown slide's text-size buffer — its first active entry, not necessarily index 0. */
  const handleSelectTab = (tab: 'global' | number) => {
    setActiveTab(tab)
    if (typeof tab !== 'number') {
      setActiveSlideTab('global')
      return
    }
    const innerTab = slotFields[tab].value.isSlideshow ? 'global' : firstActiveContentIndex(slotFields[tab].value.contents)
    setActiveSlideTab(innerTab)
    seedLiveTextSizes(tab, innerTab)
  }

  /** Opens the whole-screen percentage scaler. */
  const openGlobalTextSizeEditor = () => {
    if (!screen) return
    setEditingTarget('global')
    onRouteChange?.(t('admin.screens.editTextSize'))
  }

  /** Opens the screen's own background color/image editor. */
  const openBackgroundEditor = () => {
    if (!screen) return
    setEditingTarget('background')
    onRouteChange?.(t('admin.screens.backgroundLabel'))
  }

  /** Opens the layout picker/resize D-pad editor. */
  const openArrangementEditor = () => {
    setEditingTarget('arrangement')
    setArrangementShowingBorders(false)
    onRouteChange?.(t('admin.screens.splitDirectionLabel'))
  }

  /** Opens Arrangement's own nested "Borders" sub-menu. */
  const openBordersWithinArrangement = () => {
    setArrangementShowingBorders(true)
    onRouteChange?.(`${t('admin.screens.splitDirectionLabel')} - ${t('admin.screens.bordersLabel')}`)
  }

  /** Returns from Arrangement's own nested "Borders" sub-menu back to the layout picker/resize D-pad — one level up, not all the way out to the main form. */
  const closeBordersWithinArrangement = () => {
    setArrangementShowingBorders(false)
    onRouteChange?.(t('admin.screens.splitDirectionLabel'))
  }

  /** Opens the slide duration/transition/direction editor. */
  const openSlideshowEditor = () => {
    setEditingTarget('slideshow')
    onRouteChange?.(t('admin.screens.slideshowLabel'))
  }

  /** Opens the "Use screensaver"/"Test screensaver" editor. */
  const openScreensaverEditor = () => {
    setEditingTarget('screensaver')
    onRouteChange?.(t('admin.screens.screensaverLabel'))
  }

  /** Opens the catch-all "Other settings" editor. */
  const openOtherSettingsEditor = () => {
    setEditingTarget('other')
    onRouteChange?.(t('admin.screens.otherSettingsLabel'))
  }

  /** Closes whichever sub-view is currently open, back to the main tabbed form. */
  const closeSubview = () => {
    setEditingTarget(null)
    onRouteChange?.(undefined)
  }

  /** Seeds the live text-size buffer for one slot's own tab — the slot's shared/fallback value for "Global", else that slide's own resolved value (its own override if it has one, else the shared value). */
  const seedLiveTextSizes = (slotIndex: number, tab: 'global' | number) => {
    if (!screen || !latestScreen) return
    const sharedTextSizes = latestScreen.slotTextSizes?.[slotIndex] ?? latestScreen.textSizes ?? DEFAULT_TEXT_SIZES
    if (tab === 'global') {
      setLiveTextSizes(sharedTextSizes)
      setLiveUseOwnTextSizes(false)
      return
    }
    const content = slotFields[slotIndex].value.contents[tab] ?? { kind: 'none' as const }
    setLiveTextSizes(resolveContentTextSizes(content, sharedTextSizes))
    setLiveUseOwnTextSizes(hasOwnTextSizeFields(content) && Boolean(content.useOwnTextSizes))
  }

  /** Switches the active slot's own active tab (its "Global" settings, or a specific slide by index), reseeding the live text-size buffer to match. */
  const handleActiveSlideTabChange = (tab: 'global' | number) => {
    setActiveSlideTab(tab)
    if (typeof activeTab === 'number') seedLiveTextSizes(activeTab, tab)
  }

  /** Adds a blank slide to the active slot and jumps straight to its own new tab. */
  const handleAddSlide = () => {
    if (!activeSlot) return
    const contents = activeSlot.value.contents.length > 0 ? activeSlot.value.contents : [{ kind: 'none' as const }]
    activeSlot.onChange({ ...activeSlot.value, contents: [...contents, { kind: 'none' }] })
    handleActiveSlideTabChange(contents.length)
  }

  /** Removes one of the active slot's slides and returns to its "Global" tab. */
  const handleRemoveSlide = (index: number) => {
    if (!activeSlot) return
    activeSlot.onChange({ ...activeSlot.value, contents: activeSlot.value.contents.filter((_, i) => i !== index) })
    handleActiveSlideTabChange('global')
  }

  /** Changes one specific slide's own content within the active slot. */
  const handleSlideContentChange = (index: number, content: ScreenSlotContent) => {
    if (!activeSlot) return
    const contents = activeSlot.value.contents.length > 0 ? activeSlot.value.contents : [{ kind: 'none' as const }]
    activeSlot.onChange({ ...activeSlot.value, contents: contents.map((existing, i) => (i === index ? content : existing)) })
  }

  /**
   * Writes the active tab's text-size change straight to the persisted
   * screen (via `useScreens`, the same localStorage-backed store the
   * display reads from), not just this form's own local draft — so it
   * shows up live on that screen's display immediately, in any other
   * tab/window of this browser already showing it. This is plain browser
   * storage, not a network call, so it keeps working even if the internet
   * drops. On a slide's own tab, goes to that slide's own override when its
   * checkbox is on, else (same as the "Global" tab) the slot's shared size.
   * Also mirrors the change into this form's own local slot state, so a
   * subsequent Save can't stomp it with a stale copy.
   */
  const handleLiveTextSizesChange = (sizes: TextSizes) => {
    setLiveTextSizes(sizes)
    if (!screen || typeof activeTab !== 'number') return
    const slotIndex = activeTab

    if (activeSlideTab === 'global' || !liveUseOwnTextSizes) {
      liveUpdateScreen({ slotTextSizes: { ...(latestScreen?.slotTextSizes ?? screen.slotTextSizes), [slotIndex]: sizes } })
      return
    }

    const contentIndex = activeSlideTab
    const updatedSlot: ScreenSlot = {
      ...slotFields[slotIndex].value,
      contents: slotFields[slotIndex].value.contents.map((content, ci) => (ci === contentIndex && hasOwnTextSizeFields(content) ? { ...content, useOwnTextSizes: true, textSizes: sizes } : content)),
    }
    slotFields[slotIndex].onChange(updatedSlot)
    liveUpdateScreen({ slots: slotFields.map((field, i) => (i === slotIndex ? updatedSlot : field.value)) as ScreenConfig['slots'] })
  }

  /** Toggles whether the slide on the active tab follows its slot's shared size or keeps its own — applied live, same reasoning as `handleLiveTextSizesChange`. Never called from the "Global" tab, which has no such toggle. */
  const handleUseOwnTextSizesChange = (checked: boolean) => {
    setLiveUseOwnTextSizes(checked)
    if (!screen || typeof activeTab !== 'number' || activeSlideTab === 'global') return
    const slotIndex = activeTab
    const contentIndex = activeSlideTab
    const updatedSlot: ScreenSlot = {
      ...slotFields[slotIndex].value,
      contents: slotFields[slotIndex].value.contents.map((content, ci) => {
        if (ci !== contentIndex || !hasOwnTextSizeFields(content)) return content
        return checked ? { ...content, useOwnTextSizes: true, textSizes: liveTextSizes } : { ...content, useOwnTextSizes: false }
      }),
    }
    slotFields[slotIndex].onChange(updatedSlot)
    liveUpdateScreen({ slots: slotFields.map((field, i) => (i === slotIndex ? updatedSlot : field.value)) as ScreenConfig['slots'] })
  }

  /** Writes a whole-screen percentage-scaled change (the default, every slot's own size, and every slide's own override) straight to the persisted screen, live — same reasoning as `handleLiveTextSizesChange`. */
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

  /** Writes the screen's own whole-screen background image straight to the persisted screen, live. */
  const handleScreenBackgroundImageChange = (backgroundImage: BackgroundImage | undefined) => liveUpdateScreen({ backgroundImage })

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

  /** Writes the chosen transition style (fade/slide) straight to the persisted screen, live. */
  const handleTransitionStyleChange = (style: ScreenTransitionStyle) => {
    setTransitionStyle(style)
    liveUpdateScreen({ transitionStyle: style })
  }

  /** Nudges the divider a "Resize" arrow direction controls (for the screen's current arrangement) by 1%, live — the exact same fields the display's own draggable dividers adjust, so the two stay in sync no matter which is used to resize. No-ops (button disabled) for a direction with no divider on that axis. */
  const handleNudgeRatio = (direction: ResizeDirection) => {
    if (!latestScreen) return
    const patch = nudgeRatio(latestScreen, direction)
    if (patch) liveUpdateScreen(patch)
  }

  /** Toggles the live screensaver preview straight on the persisted screen — unlike `useScreensaver` itself (a plain field saved along with everything else on Submit), this needs to show up immediately on any open kiosk tab to actually be useful as a test. */
  const handleToggleTestScreensaver = () => {
    if (!latestScreen) return
    liveUpdateScreen({ screensaverTestActive: !latestScreen.screensaverTestActive })
  }

  /**
   * Returning from the whole-screen percentage scaler to the main form —
   * re-seeds the 4 slot fields from the freshest persisted data, since the
   * scaler writes straight into every slot's own contents/color/text
   * sizes. Without this, the main form's own (now-stale) local slot state
   * would stomp those live writes the next time "Save" is clicked.
   */
  const closeGlobalTextSizeEditor = () => {
    const latest = screens.find((candidate) => candidate.screenID === screen?.screenID)
    if (latest) {
      setSlot1(latest.slots[0])
      setSlot2(latest.slots[1])
      setSlot3(latest.slots[2])
      setSlot4(latest.slots[3])
    }
    setEditingTarget(null)
    onRouteChange?.(undefined)
  }

  if (editingTarget === 'global' && screen) {
    return (
      <div className="screen-form__subview">
        <BackButton onClick={closeGlobalTextSizeEditor}>{t('admin.common.back')}</BackButton>
        <GlobalTextSizeScaler screen={latestScreen ?? screen} onChange={handleGlobalTextSizesChange} onDone={closeGlobalTextSizeEditor} />
      </div>
    )
  }

  if (editingTarget === 'background' && latestScreen) {
    return (
      <div className="screen-form__subview">
        <BackButton onClick={closeSubview}>{t('admin.common.back')}</BackButton>
        <BackgroundEditor
          backgroundColor={latestScreen.backgroundColor ?? DEFAULT_SCREEN_BACKGROUND_COLOR}
          onBackgroundColorChange={handleScreenBackgroundColorChange}
          backgroundImage={latestScreen.backgroundImage}
          onBackgroundImageChange={handleScreenBackgroundImageChange}
        />
      </div>
    )
  }

  if (editingTarget === 'slideshow' && screen) {
    return (
      <div className="screen-form__subview">
        <BackButton onClick={closeSubview}>{t('admin.common.back')}</BackButton>
        <Input
          id="screen-slide-duration"
          label={t('admin.screens.slideDurationLabel')}
          type="number"
          min={1}
          value={slideDurationSeconds}
          onChange={(event) => setSlideDurationSeconds(Number(event.target.value))}
        />
        <div className="screen-form__field">
          <span>{t('admin.screens.transitionStyleLabel')}</span>
          <div className="screen-form__layout-picker">
            <button
              type="button"
              className={`screen-form__layout-option${transitionStyle === 'fade' ? ' screen-form__layout-option--active' : ''}`}
              onClick={() => handleTransitionStyleChange('fade')}
            >
              {t('admin.screens.transitionFadeLabel')}
            </button>
            <button
              type="button"
              className={`screen-form__layout-option${transitionStyle === 'slide' ? ' screen-form__layout-option--active' : ''}`}
              onClick={() => handleTransitionStyleChange('slide')}
            >
              {t('admin.screens.transitionSlideLabel')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (editingTarget === 'other') {
    return (
      <div className="screen-form__subview">
        <BackButton onClick={closeSubview}>{t('admin.common.back')}</BackButton>
        <Checkbox
          id="screen-hide-scrollbar"
          label={t('admin.screens.hideScrollbarLabel')}
          checked={hideScrollbar}
          onChange={(event) => setHideScrollbar(event.target.checked)}
        />
      </div>
    )
  }

  if (editingTarget === 'screensaver' && screen) {
    return (
      <div className="screen-form__subview">
        <BackButton onClick={closeSubview}>{t('admin.common.back')}</BackButton>
        <Checkbox
          id="screen-use-screensaver"
          label={t('admin.screens.useScreensaverLabel')}
          checked={useScreensaver}
          onChange={(event) => setUseScreensaver(event.target.checked)}
        />
        {latestScreen && (
          <Button type="button" variant="secondary" onClick={handleToggleTestScreensaver}>
            {latestScreen.screensaverTestActive ? t('admin.screens.stopTestScreensaverButton') : t('admin.screens.testScreensaverButton')}
          </Button>
        )}
      </div>
    )
  }

  if (editingTarget === 'arrangement' && latestScreen && arrangementShowingBorders) {
    return (
      <div className="screen-form__subview">
        <BackButton onClick={closeBordersWithinArrangement}>{t('admin.common.back')}</BackButton>
        <Checkbox
          id="screen-show-slot-borders"
          label={t('admin.screens.showSlotBordersLabel')}
          checked={showSlotBorders}
          onChange={(event) => setShowSlotBorders(event.target.checked)}
        />
        {showSlotBorders && (
          <BackgroundColorPicker
            backgroundColor={latestScreen?.borderColor}
            onChange={handleBorderColorChange}
            allowTransparent
            label={t('admin.screens.borderColorLabel')}
            transparentLabel={t('admin.screens.autoBorderColorLabel')}
          />
        )}
      </div>
    )
  }

  if (editingTarget === 'arrangement' && latestScreen) {
    return (
      <div className="screen-form__subview">
        <BackButton onClick={closeSubview}>{t('admin.common.back')}</BackButton>

        {slotCount === 2 && (
          <div className="screen-form__field">
            <span>{t('admin.screens.splitDirectionLabel')}</span>
            <div className="screen-form__layout-picker">
              <button
                type="button"
                className={`screen-form__layout-option${splitDirection === 'row' ? ' screen-form__layout-option--active' : ''}`}
                onClick={() => handleSplitDirectionChange('row')}
                aria-label={t('admin.screens.splitDirectionRowLabel')}
                title={t('admin.screens.splitDirectionRowLabel')}
              >
                <LayoutIcon pattern="row" />
              </button>
              <button
                type="button"
                className={`screen-form__layout-option${splitDirection === 'column' ? ' screen-form__layout-option--active' : ''}`}
                onClick={() => handleSplitDirectionChange('column')}
                aria-label={t('admin.screens.splitDirectionColumnLabel')}
                title={t('admin.screens.splitDirectionColumnLabel')}
              >
                <LayoutIcon pattern="column" />
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
                const label = t(`admin.screens.${labelKey}`)
                return (
                  <button
                    type="button"
                    key={pattern}
                    className={`screen-form__layout-option${isActive ? ' screen-form__layout-option--active' : ''}`}
                    onClick={() => handleTripleArrangementChange(direction, bigPosition)}
                    aria-label={label}
                    title={label}
                  >
                    <LayoutIcon pattern={pattern} />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="screen-form__field">
          <span>{t('admin.screens.resizeLabel')}</span>
        </div>
        <div className="screen-form__resize-pad" role="group" aria-label={t('admin.screens.resizeLabel')}>
          <button
            type="button"
            className="screen-form__resize-arrow screen-form__resize-arrow--up"
            disabled={!nudgeRatio(latestScreen, 'up')}
            onClick={() => handleNudgeRatio('up')}
            aria-label={t('admin.screens.resizeUpLabel')}
          >
            ▲
          </button>
          <button
            type="button"
            className="screen-form__resize-arrow screen-form__resize-arrow--left"
            disabled={!nudgeRatio(latestScreen, 'left')}
            onClick={() => handleNudgeRatio('left')}
            aria-label={t('admin.screens.resizeLeftLabel')}
          >
            ◀
          </button>
          <button
            type="button"
            className="screen-form__resize-arrow screen-form__resize-arrow--right"
            disabled={!nudgeRatio(latestScreen, 'right')}
            onClick={() => handleNudgeRatio('right')}
            aria-label={t('admin.screens.resizeRightLabel')}
          >
            ▶
          </button>
          <button
            type="button"
            className="screen-form__resize-arrow screen-form__resize-arrow--down"
            disabled={!nudgeRatio(latestScreen, 'down')}
            onClick={() => handleNudgeRatio('down')}
            aria-label={t('admin.screens.resizeDownLabel')}
          >
            ▼
          </button>
        </div>

        <Button type="button" variant="secondary" onClick={openBordersWithinArrangement}>
          {t('admin.screens.bordersLabel')}
        </Button>
      </div>
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
      transitionStyle,
      splitDirection,
      splitBigPosition,
      showSlotBorders,
      hideScrollbar,
      useScreensaver,
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
          onClick={() => handleSelectTab('global')}
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
            onClick={() => handleSelectTab(index)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="screen-form__tab-panel">
        {activeTab === 'global' ? (
          <>
            <Input id="screen-name" label={t('admin.screens.nameLabel')} value={name} onChange={(event) => setName(event.target.value)} required />

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

            {/* Fades and slides in/out as slotCount crosses 1 (`initial={false}` skips this on first mount, since it's not really "appearing"). Animating its own `height` (0 to/from its natural size, `layout` enables interpolating that "auto" value) — rather than just `opacity`/`y` — is what actually makes every field below it glide smoothly into its new position instead of snapping the instant this one's removed from the document flow; those fields only need `layout` themselves to pick up that progressive reflow. `overflow: hidden` keeps the button from spilling out while its own height is still animating. */}
            <AnimatePresence initial={false}>
              {slotCount > 1 && latestScreen && (
                <motion.div
                  key="arrangement"
                  layout
                  initial={{ opacity: 0, y: -12, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -12, height: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  style={{ overflow: 'hidden' }}
                >
                  <Button type="button" variant="secondary" onClick={openArrangementEditor}>
                    {t('admin.screens.splitDirectionLabel')}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {screen && (
              <motion.div layout>
                <Button type="button" variant="secondary" onClick={openBackgroundEditor}>
                  {t('admin.screens.backgroundLabel')}
                </Button>
              </motion.div>
            )}

            {screen && (
              <motion.div layout>
                <Button type="button" variant="secondary" onClick={openGlobalTextSizeEditor}>
                  {t('admin.screens.editTextSize')}
                </Button>
              </motion.div>
            )}

            {needsDurationField && (
              <motion.div layout>
                <Button type="button" variant="secondary" onClick={openSlideshowEditor}>
                  {t('admin.screens.slideshowLabel')}
                </Button>
              </motion.div>
            )}

            {screensaverSchedule && (
              <motion.div layout>
                <Button type="button" variant="secondary" onClick={openScreensaverEditor}>
                  {t('admin.screens.screensaverLabel')}
                </Button>
              </motion.div>
            )}

            <motion.div layout>
              <Button type="button" variant="secondary" onClick={openOtherSettingsEditor}>
                {t('admin.screens.otherSettingsLabel')}
              </Button>
            </motion.div>
          </>
        ) : (
          activeSlot && (
            <>
              <Checkbox
                id={`${activeSlot.id}-slideshow`}
                label={t('admin.screens.slotSlideshowLabel')}
                checked={activeSlot.value.isSlideshow}
                onChange={(event) => {
                  const isSlideshow = event.target.checked
                  activeSlot.onChange({ ...activeSlot.value, isSlideshow })
                  handleActiveSlideTabChange(isSlideshow ? 'global' : firstActiveContentIndex(activeSlot.value.contents))
                }}
              />

              {hasSlideTabs && (
                <SlotSlideTabs
                  slideCount={activeSlot.value.contents.length}
                  activeTab={activeSlideTab}
                  onActiveTabChange={handleActiveSlideTabChange}
                  onAddSlide={handleAddSlide}
                />
              )}

              {hasSlideTabs && activeSlideTab !== 'global' && (
                <>
                  <SlideFields
                    id={`${activeSlot.id}-slide-${activeSlideIndex}`}
                    content={activeSlot.value.contents[activeSlideIndex] ?? { kind: 'none' }}
                    onChange={(content) => handleSlideContentChange(activeSlideIndex, content)}
                    label={`${activeSlot.label} ${activeSlideIndex + 1}`}
                    showOwnBackgroundImage
                  />

                  {activeSlot.value.contents.length > 1 && (
                    <button type="button" className="slot-slide-tabs__remove" onClick={() => handleRemoveSlide(activeSlideIndex)}>
                      {t('admin.screens.removeSlideLabel')}
                    </button>
                  )}

                  {screen && hasOwnTextSizeFields(activeSlot.value.contents[activeSlideIndex] ?? { kind: 'none' }) && (
                    <TextSizeEditor
                      textSizes={liveTextSizes}
                      onChange={handleLiveTextSizesChange}
                      ownTextSizes={
                        activeSlot.value.contents.filter((content) => content.kind !== 'none').length > 1
                          ? { useOwn: liveUseOwnTextSizes, onUseOwnChange: handleUseOwnTextSizesChange }
                          : undefined
                      }
                      onDone={() => handleActiveSlideTabChange('global')}
                    />
                  )}
                </>
              )}

              {!hasSlideTabs && (
                <>
                  <SlideFields
                    id={activeSlot.id}
                    content={activeSlot.value.contents[activeSlideIndex] ?? { kind: 'none' }}
                    onChange={(content) => handleSlideContentChange(activeSlideIndex, content)}
                    label={activeSlot.label}
                  />

                  {screen && hasOwnTextSizeFields(activeSlot.value.contents[activeSlideIndex] ?? { kind: 'none' }) && (
                    <TextSizeEditor textSizes={liveTextSizes} onChange={handleLiveTextSizesChange} />
                  )}
                </>
              )}

              {(!hasSlideTabs || activeSlideTab === 'global') && (
                <>
                  <BackgroundColorPicker
                    backgroundColor={activeSlot.value.backgroundColor}
                    onChange={(color) => activeSlot.onChange({ ...activeSlot.value, backgroundColor: color })}
                    allowTransparent
                    label={t('screenDisplay.textSizeEditor.slotColorLabel', { number: (activeTab as number) + 1 })}
                  />

                  <BackgroundImagePicker
                    id={`${activeSlot.id}-bg-image`}
                    backgroundImage={activeSlot.value.backgroundImage}
                    onChange={(backgroundImage) => activeSlot.onChange({ ...activeSlot.value, backgroundImage })}
                    label={t('admin.screens.slotBackgroundImageLabel', { number: (activeTab as number) + 1 })}
                  />
                </>
              )}
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
