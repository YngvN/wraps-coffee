import type { ScreenSlotContent } from '../../types/screen'
import { AnnouncementSlide } from './AnnouncementSlide'
import { CatalogueSlide } from './CatalogueSlide'
import { EventCalendarSlide } from './EventCalendarSlide'
import { EventDetailsSlide } from './EventDetailsSlide'
import { EventImageSlide } from './EventImageSlide'
import { EventMonthSlide } from './EventMonthSlide'
import { ImageSlide } from './ImageSlide'
import { MessageBoardSlide } from './MessageBoardSlide'
import { QrCodeSlide } from './QrCodeSlide'
import { TransitSlide } from './TransitSlide'
import { WeatherSlide } from './WeatherSlide'

interface SlotContentProps {
  slot: ScreenSlotContent
}

/** Renders whatever a screen slot is configured to show. */
export function SlotContent({ slot }: SlotContentProps) {
  if (slot.kind === 'catalogue') return <CatalogueSlide catalogueId={slot.catalogueId} categories={slot.categories} />
  if (slot.kind === 'event') {
    const displayMode = slot.displayMode ?? 'calendar'
    if (displayMode === 'image') return <EventImageSlide eventOrdinal={slot.eventOrdinal ?? 1} />
    if (displayMode === 'details') return <EventDetailsSlide eventOrdinal={slot.eventOrdinal ?? 1} />
    if (displayMode === 'month') return <EventMonthSlide showPrice={slot.showPrice} showDescription={slot.showDescription} />
    return <EventCalendarSlide count={slot.count} />
  }
  if (slot.kind === 'image') return <ImageSlide imageUrl={slot.imageUrl} fit={slot.fit} resizeToFit={slot.resizeToFit} />
  if (slot.kind === 'qrcode') return <QrCodeSlide url={slot.url} size={slot.size} />
  if (slot.kind === 'transit') return <TransitSlide stopId={slot.stopId} />
  if (slot.kind === 'weather') return <WeatherSlide />
  if (slot.kind === 'announcement') return <AnnouncementSlide title={slot.title} description={slot.description} />
  if (slot.kind === 'messageboard')
    return (
      <MessageBoardSlide boardId={slot.boardId} displayMode={slot.displayMode} postId={slot.postId} order={slot.order} rotateSeconds={slot.rotateSeconds} count={slot.count} />
    )
  return null
}
