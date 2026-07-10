import type { ScreenSlotContent } from '../../types/screen'
import { CategorySlide } from './CategorySlide'
import { EventsSlide } from './EventsSlide'
import { FullMenuSlide } from './FullMenuSlide'
import { ImageSlide } from './ImageSlide'
import { MessageBoardSlide } from './MessageBoardSlide'
import { TransitSlide } from './TransitSlide'
import { WeatherSlide } from './WeatherSlide'

interface SlotContentProps {
  slot: ScreenSlotContent
}

/** Renders whatever a screen slot is configured to show. */
export function SlotContent({ slot }: SlotContentProps) {
  if (slot.kind === 'category') return <CategorySlide category={slot.category} />
  if (slot.kind === 'menu') return <FullMenuSlide categories={slot.categories} />
  if (slot.kind === 'events') return <EventsSlide />
  if (slot.kind === 'image') return <ImageSlide imageUrl={slot.imageUrl} fit={slot.fit} resizeToFit={slot.resizeToFit} />
  if (slot.kind === 'transit') return <TransitSlide stopId={slot.stopId} />
  if (slot.kind === 'weather') return <WeatherSlide />
  if (slot.kind === 'messageboard')
    return (
      <MessageBoardSlide boardId={slot.boardId} displayMode={slot.displayMode} postId={slot.postId} order={slot.order} rotateSeconds={slot.rotateSeconds} count={slot.count} />
    )
  return null
}
