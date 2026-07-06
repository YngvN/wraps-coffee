import type { ScreenSlotContent } from '../../types/screen'
import { CategorySlide } from './CategorySlide'
import { EventsSlide } from './EventsSlide'

interface SlotContentProps {
  slot: ScreenSlotContent
}

/** Renders whatever a screen slot is configured to show. */
export function SlotContent({ slot }: SlotContentProps) {
  if (slot.kind === 'category') return <CategorySlide category={slot.category} />
  if (slot.kind === 'events') return <EventsSlide />
  return null
}
