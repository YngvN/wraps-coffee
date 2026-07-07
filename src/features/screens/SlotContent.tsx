import type { ScreenSlotContent } from '../../types/screen'
import { CategorySlide } from './CategorySlide'
import { EventsSlide } from './EventsSlide'
import { ImageSlide } from './ImageSlide'

interface SlotContentProps {
  slot: ScreenSlotContent
}

/** Renders whatever a screen slot is configured to show. */
export function SlotContent({ slot }: SlotContentProps) {
  if (slot.kind === 'category') return <CategorySlide category={slot.category} />
  if (slot.kind === 'events') return <EventsSlide />
  if (slot.kind === 'image') return <ImageSlide imageUrl={slot.imageUrl} />
  return null
}
