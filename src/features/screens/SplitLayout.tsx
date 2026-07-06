import { useLanguage } from '../../i18n'
import type { ScreenConfig, TextSizes } from '../../types/screen'
import { textSizesToCssVars } from '../../utils/textSizeVars'
import { SlotContent } from './SlotContent'
import { SlotEditButton } from './SlotEditButton'
import './SplitLayout.scss'

interface SplitLayoutProps {
  screen: ScreenConfig
  /** Resolves the effective (persisted, or live-drafted while being edited) text sizes for the slot at a given original index. */
  resolveSlotTextSizes: (slotIndex: number) => TextSizes
  /** Called when a pane's hover-revealed edit button is clicked, with that slot's original index (0-3). */
  onEditSlot: (slotIndex: number) => void
}

/**
 * Shows a screen's active (non-"none") slots at once, with no rotation or
 * animation. Handles 0-4 active slots: 1 fills the screen; 2 split side by
 * side or stacked per `splitDirection`; 3 feature the first active slot in
 * a full row/column with the other two sharing the rest as small squares,
 * per `splitDirection` + `splitBigPosition`; 4 form an even 2x2 grid.
 * Hovering any pane reveals a small button to edit that slot's own text sizes.
 */
export function SplitLayout({ screen, resolveSlotTextSizes, onEditSlot }: SplitLayoutProps) {
  const { t } = useLanguage()
  const activeEntries = screen.slots.map((slot, index) => ({ slot, index })).filter((entry) => entry.slot.kind !== 'none')
  const direction = screen.splitDirection ?? 'row'
  const bigPosition = screen.splitBigPosition ?? 'first'

  if (activeEntries.length === 0) {
    return (
      <div className="split-layout split-layout--empty">
        <p>{t('screenDisplay.emptyLabel')}</p>
      </div>
    )
  }

  if (activeEntries.length === 1) {
    const [{ slot, index }] = activeEntries
    return (
      <div className="split-layout split-layout--single">
        <div className="split-layout__pane" style={textSizesToCssVars(resolveSlotTextSizes(index))}>
          <SlotContent slot={slot} />
          <SlotEditButton onClick={() => onEditSlot(index)} />
        </div>
      </div>
    )
  }

  if (activeEntries.length === 3) {
    const [big, small1, small2] = activeEntries
    return (
      <div className={`split-layout split-layout--triple-${direction}-${bigPosition}`}>
        <div className="split-layout__pane split-layout__pane--big" style={textSizesToCssVars(resolveSlotTextSizes(big.index))}>
          <SlotContent slot={big.slot} />
          <SlotEditButton onClick={() => onEditSlot(big.index)} />
        </div>
        <div className="split-layout__pane split-layout__pane--small1" style={textSizesToCssVars(resolveSlotTextSizes(small1.index))}>
          <SlotContent slot={small1.slot} />
          <SlotEditButton onClick={() => onEditSlot(small1.index)} />
        </div>
        <div className="split-layout__pane split-layout__pane--small2" style={textSizesToCssVars(resolveSlotTextSizes(small2.index))}>
          <SlotContent slot={small2.slot} />
          <SlotEditButton onClick={() => onEditSlot(small2.index)} />
        </div>
      </div>
    )
  }

  return (
    <div className={`split-layout split-layout--${activeEntries.length === 4 ? 'quad' : direction}`}>
      {activeEntries.map(({ slot, index }) => (
        <div className="split-layout__pane" key={index} style={textSizesToCssVars(resolveSlotTextSizes(index))}>
          <SlotContent slot={slot} />
          <SlotEditButton onClick={() => onEditSlot(index)} />
        </div>
      ))}
    </div>
  )
}
