import type { NewsSlotSettings } from '../../hooks/useCurrentNewsHeadline'
import type { ScreenSlotContent } from '../../types/screen'
import { AnnouncementSlide } from './AnnouncementSlide'
import { CatalogueSlide } from './CatalogueSlide'
import { EventCalendarSlide } from './EventCalendarSlide'
import { EventDetailsSlide } from './EventDetailsSlide'
import { EventImageSlide } from './EventImageSlide'
import { EventMonthSlide } from './EventMonthSlide'
import { ImageSlide } from './ImageSlide'
import { MessageBoardSlide } from './MessageBoardSlide'
import { NewsSlide } from './NewsSlide'
import { QrCodeSlide } from './QrCodeSlide'
import { TimeSlide } from './TimeSlide'
import { TransitSlide } from './TransitSlide'
import { VideoSlide } from './VideoSlide'
import { WeatherSlide } from './WeatherSlide'

interface SlotContentProps {
  slot: ScreenSlotContent
  /** Every currently-resolved `'news'`-kind pane on this same screen — only consumed by the `'qrcode'` branch (its own "automatic" mode). See `LayoutTree`'s own prop of the same name. */
  newsSlots: NewsSlotSettings[]
  /** Only consumed by the `'news'`/`'qrcode'` branches — see `LayoutTree`'s own prop of the same name. */
  stageTick: number | undefined
  /** Only consumed by the `'video'` branch, and only while its own `restartOnStageOne` is on — the screen's current 1-indexed stage, same value `LayoutPane` itself resolves its own content against. */
  stage: number
  /** Only consumed by the `'video'` branch, and only while its own `advanceStageOnEnd` is on — see `SplitLayout`'s own prop of the same name. */
  onRequestStageAdvance?: () => void
}

/** Renders whatever a screen slot is configured to show. */
export function SlotContent({ slot, newsSlots, stageTick, stage, onRequestStageAdvance }: SlotContentProps) {
  if (slot.kind === 'catalogue') return <CatalogueSlide catalogueId={slot.catalogueId} categories={slot.categories} />
  if (slot.kind === 'event') {
    const displayMode = slot.displayMode ?? 'calendar'
    if (displayMode === 'image') return <EventImageSlide eventOrdinal={slot.eventOrdinal ?? 1} />
    if (displayMode === 'details') return <EventDetailsSlide eventOrdinal={slot.eventOrdinal ?? 1} />
    if (displayMode === 'month') return <EventMonthSlide showPrice={slot.showPrice} showDescription={slot.showDescription} />
    return <EventCalendarSlide count={slot.count} />
  }
  if (slot.kind === 'image') return <ImageSlide imageUrl={slot.imageUrl} fit={slot.fit} resizeToFit={slot.resizeToFit} />
  if (slot.kind === 'video')
    return (
      <VideoSlide
        videoUrl={slot.videoUrl}
        fit={slot.fit}
        removeAudio={slot.removeAudio}
        volume={slot.volume}
        advanceStageOnEnd={slot.advanceStageOnEnd}
        onRequestStageAdvance={onRequestStageAdvance}
        stage={stage}
        restartOnStageOne={slot.restartOnStageOne}
      />
    )
  if (slot.kind === 'qrcode')
    return (
      <QrCodeSlide
        url={slot.url}
        size={slot.size}
        linkMode={slot.linkMode}
        newsSourceMode={slot.newsSourceMode}
        linkedNewsSourceId={slot.linkedNewsSourceId}
        newsSlotOrdinal={slot.newsSlotOrdinal}
        newsSlots={newsSlots}
        stageTick={stageTick}
        showSourceLogo={slot.showSourceLogo}
        useSourceTheme={slot.useSourceTheme}
      />
    )
  if (slot.kind === 'news')
    return (
      <NewsSlide
        sourceIds={slot.sourceIds}
        headlineCount={slot.headlineCount}
        rotateSeconds={slot.rotateSeconds}
        useBrandTheme={slot.useBrandTheme}
        showBrandLogo={slot.showBrandLogo}
        stageTick={stageTick}
      />
    )
  if (slot.kind === 'transit')
    return (
      <TransitSlide
        brand={slot.brand}
        stopId={slot.stopId}
        departureCount={slot.departureCount}
        showPlatform={slot.showPlatform}
        showLineName={slot.showLineName}
        realtimeOnly={slot.realtimeOnly}
        modeFilter={slot.modeFilter}
        iconPack={slot.iconPack}
        useBrandTheme={slot.useBrandTheme}
        showBrandLogo={slot.showBrandLogo}
      />
    )
  if (slot.kind === 'weather')
    return (
      <WeatherSlide
        locationId={slot.locationId}
        forecastHours={slot.forecastHours}
        showWind={slot.showWind}
        showHumidity={slot.showHumidity}
        showPrecipitationProbability={slot.showPrecipitationProbability}
        showUvIndex={slot.showUvIndex}
        showPressure={slot.showPressure}
        iconPack={slot.iconPack}
        useBrandTheme={slot.useBrandTheme}
        showBrandLogo={slot.showBrandLogo}
      />
    )
  if (slot.kind === 'announcement') return <AnnouncementSlide title={slot.title} description={slot.description} />
  if (slot.kind === 'time')
    return (
      <TimeSlide
        displayMode={slot.displayMode}
        units={slot.units}
        blinkColon={slot.blinkColon}
        dateStyle={slot.dateStyle}
        showYear={slot.showYear}
        weekdayStyle={slot.weekdayStyle}
        fontSize={slot.fontSize}
      />
    )
  if (slot.kind === 'messageboard')
    return (
      <MessageBoardSlide boardId={slot.boardId} displayMode={slot.displayMode} postId={slot.postId} order={slot.order} rotateSeconds={slot.rotateSeconds} count={slot.count} />
    )
  return null
}
