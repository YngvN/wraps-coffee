import type { ScreenConfig } from '../../types/screen'
import { SlotContent } from './SlotContent'
import './SplitLayout.scss'

interface SplitLayoutProps {
  screen: ScreenConfig
}

/** Shows both of a screen's slots at once, side by side, with no rotation or animation. A lone non-"none" slot expands to fill the space. */
export function SplitLayout({ screen }: SplitLayoutProps) {
  const [slot1, slot2] = screen.slots
  const slot1Active = slot1.kind !== 'none'
  const slot2Active = slot2.kind !== 'none'

  return (
    <div className={`split-layout${slot1Active && slot2Active ? '' : ' split-layout--single'}`}>
      {slot1Active && (
        <div className="split-layout__pane">
          <SlotContent slot={slot1} />
        </div>
      )}
      {slot2Active && (
        <div className="split-layout__pane">
          <SlotContent slot={slot2} />
        </div>
      )}
    </div>
  )
}
