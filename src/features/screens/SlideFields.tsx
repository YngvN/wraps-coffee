import { useState } from 'react'
import { Button, Checkbox, ImageUploadField, Input, Textarea } from '../../components'
import { useEvents } from '../../hooks/useEvents'
import { useExtensionsConfig } from '../../hooks/useExtensionsConfig'
import { useMessageBoardPosts } from '../../hooks/useMessageBoardPosts'
import { useMessageBoards } from '../../hooks/useMessageBoards'
import { useScreens } from '../../hooks/useScreens'
import { useLanguage } from '../../i18n'
import type { ProductCategory } from '../../types/product'
import {
  DEFAULT_EVENT_CALENDAR_COUNT,
  DEFAULT_MESSAGE_BOARD_COUNT,
  DEFAULT_MESSAGE_BOARD_ROTATE_SECONDS,
  DEFAULT_QR_CODE_SIZE,
  MIN_QR_CODE_SIZE,
  type EventDisplayMode,
  type MessageBoardDisplayMode,
  type MessageBoardOrder,
  type ScreenSlotContent,
} from '../../types/screen'
import { collectAnnouncementMessages } from '../../utils/announcements'
import { CATEGORY_ORDER } from '../admin/products/categoryMeta'
import { clampImageResizeScale, IMAGE_RESIZE_MAX_VIEWPORT_FRACTION, MAX_IMAGE_RESIZE_SCALE, MIN_IMAGE_RESIZE_SCALE } from '../../utils/screenLayout'
import { formatOrdinal } from '../../utils/formatOrdinal'
import { getSmallUrl } from '../../utils/responsiveImage'
import { MessagePickerModal } from './MessagePickerModal'
import './SlideFields.scss'

const MESSAGE_BOARD_DISPLAY_MODES: MessageBoardDisplayMode[] = ['rotating', 'list', 'single']
const MESSAGE_BOARD_ORDERS: MessageBoardOrder[] = ['newestFirst', 'oldestFirst']

/**
 * Decodes a `<select>` option value back into a `ScreenSlotContent`. An
 * "image"/"qrcode"/"transit"/"messageboard"/"announcement" slide starts
 * with an empty URL/stop id/board id/title+description, filled in via its
 * own field below the selector. An `event:*` value (composite, like the
 * since-removed `category:X` values) picks the `'event'` kind's own
 * `displayMode` — switching to `'image'`/`'details'` keeps
 * `currentContent`'s own `eventOrdinal` if it already had one (switching
 * between the two keeps your pick), else starts from
 * `suggestedEventOrdinal` (see `findSiblingEventOrdinal`).
 */
function optionValueToContent(value: string, currentContent: ScreenSlotContent, suggestedEventOrdinal: number): ScreenSlotContent {
  if (value === 'image') return { kind: 'image', imageUrl: '' }
  if (value === 'qrcode') return { kind: 'qrcode', url: '' }
  if (value === 'transit') return { kind: 'transit', stopId: '' }
  if (value === 'messageboard') return { kind: 'messageboard' }
  if (value === 'announcement') return { kind: 'announcement', title: '', description: '' }
  if (value.startsWith('event:')) {
    const displayMode = value.slice('event:'.length) as EventDisplayMode
    if (displayMode === 'image' || displayMode === 'details') {
      const eventOrdinal =
        currentContent.kind === 'event' && (currentContent.displayMode === 'image' || currentContent.displayMode === 'details') && currentContent.eventOrdinal !== undefined
          ? currentContent.eventOrdinal
          : suggestedEventOrdinal
      return { kind: 'event', displayMode, eventOrdinal }
    }
    return { kind: 'event', displayMode }
  }
  return { kind: value as 'none' | 'menu' | 'weather' }
}

interface SlideFieldsProps {
  /** Stable identifier for this one slide, used to build unique ids for its own fields. */
  id: string
  content: ScreenSlotContent
  onChange: (content: ScreenSlotContent) => void
  /** Accessible label for the content-kind selector. */
  label: string
  /**
   * Disables the "Resize slot to fit image" checkbox, with an explanatory
   * tooltip, when some other slot's content already resolves to a
   * resize-to-fit image at this same stage — only one is allowed active at
   * once, to keep a stage from resizing more than one pane at a time. Never
   * disables an already-checked box, so this slide can always turn its own
   * back off regardless.
   */
  resizeToFitBlocked?: boolean
  /** What a fresh switch to "Event image"/"Event details" should default its own `eventOrdinal` to (see `findSiblingEventOrdinal`) — usually another pane's own choice on the same screen, else `1`. */
  suggestedEventOrdinal: number
}

/**
 * One slide's own fields: what it shows (a content-kind selector), its own
 * URL/fill-container/resize-to-fit/resize-scale fields when set to "Image"
 * (resize-to-fit makes the slide's own *pane* grow or shrink to match the
 * image's aspect ratio, capped at its own resize-scale percentage of the
 * screen's viewport, defaulting to 40% but also adjustable by dragging the
 * pane's own border on the live display — see `SplitLayout`), a checkbox
 * per category when set to "Full menu" (letting the full menu be split
 * across more than one screen — each gets its own subset checked). This
 * slide's own background image (an override of its slot's shared one) is
 * edited alongside the slot's own, in the "Background" sub-menu, not here.
 */
export function SlideFields({ id, content, onChange, label, resizeToFitBlocked, suggestedEventOrdinal }: SlideFieldsProps) {
  const { t, language } = useLanguage()
  const [extensionsConfig] = useExtensionsConfig()
  const [messageBoards] = useMessageBoards()
  const [messageBoardPosts] = useMessageBoardPosts()
  const [screens] = useScreens()
  const [events] = useEvents()
  const [isMessagePickerOpen, setIsMessagePickerOpen] = useState(false)

  /** Starts a fresh image slide when switching the selector to "Image"; otherwise just updates the URL in place, keeping this slide's other own fields (fit, resize-to-fit, background image) intact. */
  const setImageUrl = (imageUrl: string) => {
    if (content.kind !== 'image') {
      onChange({ kind: 'image', imageUrl })
      return
    }
    onChange({ ...content, imageUrl })
  }

  const setImageFillContainer = (fillContainer: boolean) => {
    if (content.kind !== 'image') return
    onChange({ ...content, fit: fillContainer ? 'cover' : 'contain' })
  }

  const setImageResizeToFit = (resizeToFit: boolean) => {
    if (content.kind !== 'image') return
    onChange({ ...content, resizeToFit })
  }

  /** `resizeScale` is stored as a 0-1 fraction of the viewport but edited here as a whole-number percentage, matching how an arrangement's own dividers are edited elsewhere. */
  const setImageResizeScalePercent = (percent: number) => {
    if (content.kind !== 'image') return
    onChange({ ...content, resizeScale: clampImageResizeScale(percent / 100) })
  }

  /** Starts a fresh QR code slide when switching the selector to "QR code"; otherwise just updates the URL in place. */
  const setQrCodeUrl = (url: string) => {
    if (content.kind !== 'qrcode') {
      onChange({ kind: 'qrcode', url })
      return
    }
    onChange({ ...content, url })
  }

  const setQrCodeSize = (size: number) => {
    if (content.kind !== 'qrcode') return
    onChange({ ...content, size })
  }

  const setTransitStopId = (stopId: string) => {
    if (content.kind !== 'transit') return
    onChange({ ...content, stopId })
  }

  /** Toggles one category in/out of a "Full menu" slide's own `categories` — starting from every category checked (the standard, when `categories` is still absent) so unchecking the first one narrows it down from there, rather than from an empty set. */
  const toggleMenuCategory = (category: ProductCategory, checked: boolean) => {
    if (content.kind !== 'menu') return
    const current = content.categories ?? CATEGORY_ORDER
    const next = checked ? [...current, category] : current.filter((existing) => existing !== category)
    onChange({ ...content, categories: CATEGORY_ORDER.filter((existing) => next.includes(existing)) })
  }

  /** Switching boards clears `postId` — a post picked under the old board almost never belongs to the new one. */
  const setMessageBoardId = (boardId: string) => {
    if (content.kind !== 'messageboard') return
    onChange({ ...content, boardId: boardId || undefined, postId: undefined })
  }

  const setMessageBoardDisplayMode = (displayMode: MessageBoardDisplayMode) => {
    if (content.kind !== 'messageboard') return
    onChange({ ...content, displayMode })
  }

  const setMessageBoardPostId = (postId: string) => {
    if (content.kind !== 'messageboard') return
    onChange({ ...content, postId: postId || undefined })
  }

  const setMessageBoardOrder = (order: MessageBoardOrder) => {
    if (content.kind !== 'messageboard') return
    onChange({ ...content, order })
  }

  const setMessageBoardRotateSeconds = (rotateSeconds: number) => {
    if (content.kind !== 'messageboard') return
    onChange({ ...content, rotateSeconds })
  }

  const setMessageBoardCount = (count: number) => {
    if (content.kind !== 'messageboard') return
    onChange({ ...content, count })
  }

  const setAnnouncementTitle = (title: string) => {
    if (content.kind !== 'announcement') return
    onChange({ ...content, title })
  }

  const setAnnouncementDescription = (description: string) => {
    if (content.kind !== 'announcement') return
    onChange({ ...content, description })
  }

  const setEventOrdinal = (eventOrdinal: number) => {
    if (content.kind !== 'event') return
    onChange({ ...content, eventOrdinal })
  }

  const setEventCalendarCount = (count: number) => {
    if (content.kind !== 'event') return
    onChange({ ...content, count })
  }

  const setEventShowPrice = (showPrice: boolean) => {
    if (content.kind !== 'event') return
    onChange({ ...content, showPrice })
  }

  const setEventShowDescription = (showDescription: boolean) => {
    if (content.kind !== 'event') return
    onChange({ ...content, showDescription })
  }

  return (
    <div className="slide-fields">
      <select
        aria-label={label}
        value={content.kind === 'event' ? `event:${content.displayMode ?? 'calendar'}` : content.kind}
        onChange={(event) => onChange(optionValueToContent(event.target.value, content, suggestedEventOrdinal))}
      >
        <option value="none">{t('admin.screens.slotNoneLabel')}</option>
        <option value="menu">{t('admin.screens.slotMenuLabel')}</option>
        <optgroup label={t('admin.screens.slotEventsGroupLabel')}>
          <option value="event:calendar">{t('admin.screens.slotEventCalendarLabel')}</option>
          <option value="event:image">{t('admin.screens.slotEventImageLabel')}</option>
          <option value="event:details">{t('admin.screens.slotEventDetailsLabel')}</option>
          <option value="event:month">{t('admin.screens.slotEventMonthLabel')}</option>
        </optgroup>
        <option value="image">{t('admin.screens.slotImageLabel')}</option>
        <option value="qrcode">{t('admin.screens.slotQrCodeLabel')}</option>
        <option value="transit">{t('admin.screens.slotTransitLabel')}</option>
        <option value="weather">{t('admin.screens.slotWeatherLabel')}</option>
        <option value="messageboard">{t('admin.screens.slotMessageBoardLabel')}</option>
        <option value="announcement">{t('admin.screens.slotAnnouncementLabel')}</option>
      </select>

      {content.kind === 'image' && (
        <>
          <ImageUploadField id={`${id}-image-url`} value={content.imageUrl} onChange={setImageUrl} />
          <Checkbox
            id={`${id}-image-fill`}
            label={t('admin.screens.imageFillContainerLabel')}
            checked={content.fit === 'cover'}
            onChange={(event) => setImageFillContainer(event.target.checked)}
          />
          <Checkbox
            id={`${id}-image-resize-to-fit`}
            label={t('admin.screens.resizeToFitImageLabel')}
            checked={Boolean(content.resizeToFit)}
            onChange={(event) => setImageResizeToFit(event.target.checked)}
            disabled={resizeToFitBlocked && !content.resizeToFit}
            title={resizeToFitBlocked && !content.resizeToFit ? t('admin.screens.resizeToFitBlockedTooltip') : undefined}
          />
          {content.resizeToFit && (
            <label className="slide-fields__slider">
              <span>
                {t('admin.screens.resizeScaleLabel')} — {Math.round((content.resizeScale ?? IMAGE_RESIZE_MAX_VIEWPORT_FRACTION) * 100)}%
              </span>
              <input
                type="range"
                min={MIN_IMAGE_RESIZE_SCALE * 100}
                max={MAX_IMAGE_RESIZE_SCALE * 100}
                value={Math.round((content.resizeScale ?? IMAGE_RESIZE_MAX_VIEWPORT_FRACTION) * 100)}
                onChange={(event) => setImageResizeScalePercent(Number(event.target.value))}
              />
            </label>
          )}

          {content.imageUrl && (
            <div className="slide-fields__preview">
              <span className="slide-fields__preview-label">{t('admin.screens.imagePreviewLabel')}</span>
              <div className="slide-fields__preview-screen">
                <img
                  src={getSmallUrl(content.imageUrl)}
                  alt=""
                  className="slide-fields__preview-image"
                  style={
                    content.resizeToFit
                      ? {
                          maxWidth: `${Math.round((content.resizeScale ?? IMAGE_RESIZE_MAX_VIEWPORT_FRACTION) * 100)}%`,
                          maxHeight: `${Math.round((content.resizeScale ?? IMAGE_RESIZE_MAX_VIEWPORT_FRACTION) * 100)}%`,
                          objectFit: 'contain',
                        }
                      : { width: '100%', height: '100%', objectFit: content.fit === 'cover' ? 'cover' : 'contain' }
                  }
                />
              </div>
            </div>
          )}
        </>
      )}

      {content.kind === 'qrcode' && (
        <>
          <Input id={`${id}-qrcode-url`} type="url" label={t('admin.screens.qrCodeUrlLabel')} value={content.url} onChange={(event) => setQrCodeUrl(event.target.value)} />
          <label className="slide-fields__slider">
            <span>
              {t('admin.screens.qrCodeSizeLabel')} — {content.size ?? DEFAULT_QR_CODE_SIZE}%
            </span>
            <input
              type="range"
              min={MIN_QR_CODE_SIZE}
              max={100}
              value={content.size ?? DEFAULT_QR_CODE_SIZE}
              onChange={(event) => setQrCodeSize(Number(event.target.value))}
            />
          </label>
        </>
      )}

      {content.kind === 'menu' && (
        <div className="slide-fields__categories">
          <span className="slide-fields__categories-label">{t('admin.screens.menuCategoriesLabel')}</span>
          {CATEGORY_ORDER.map((category) => (
            <Checkbox
              key={category}
              id={`${id}-category-${category}`}
              label={t(`menu.categories.${category}.title`)}
              checked={(content.categories ?? CATEGORY_ORDER).includes(category)}
              onChange={(event) => toggleMenuCategory(category, event.target.checked)}
            />
          ))}
        </div>
      )}

      {content.kind === 'transit' &&
        (extensionsConfig.transit.selectedStops.length > 0 ? (
          <select aria-label={t('admin.screens.transitStopLabel')} value={content.stopId ?? ''} onChange={(event) => setTransitStopId(event.target.value)}>
            <option value="" disabled>
              {t('admin.screens.transitStopLabel')}
            </option>
            {extensionsConfig.transit.selectedStops.map((stop) => (
              <option key={stop.id} value={stop.id}>
                {stop.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="slide-fields__hint">{t('admin.screens.transitNoStopsConfiguredLabel')}</p>
        ))}

      {content.kind === 'messageboard' &&
        (messageBoards.length > 0 ? (
          <>
            <select aria-label={t('admin.screens.messageBoardLabel')} value={content.boardId ?? ''} onChange={(event) => setMessageBoardId(event.target.value)}>
              <option value="" disabled>
                {t('admin.screens.messageBoardLabel')}
              </option>
              {messageBoards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </select>

            {content.boardId &&
              (() => {
                const boardPosts = messageBoardPosts.filter((post) => post.boardId === content.boardId)
                return (
                  <>
                    <select
                      aria-label={t('admin.screens.messageBoardDisplayModeLabel')}
                      value={content.displayMode ?? 'rotating'}
                      onChange={(event) => setMessageBoardDisplayMode(event.target.value as MessageBoardDisplayMode)}
                    >
                      {MESSAGE_BOARD_DISPLAY_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {t(`admin.screens.messageBoardDisplayMode.${mode}`)}
                        </option>
                      ))}
                    </select>

                    {/* Shown for every mode, not just "single" — a board with no posts yet renders blank on the live display in every mode, which otherwise looks like a bug rather than "not populated yet". */}
                    {boardPosts.length === 0 && <p className="slide-fields__hint">{t('admin.screens.messageBoardNoPostsLabel')}</p>}

                    {(content.displayMode ?? 'rotating') === 'single' && boardPosts.length > 0 && (
                      <select aria-label={t('admin.screens.messageBoardPostLabel')} value={content.postId ?? ''} onChange={(event) => setMessageBoardPostId(event.target.value)}>
                        <option value="" disabled>
                          {t('admin.screens.messageBoardPostLabel')}
                        </option>
                        {boardPosts.map((post) => (
                          <option key={post.id} value={post.id}>
                            {post.title}
                          </option>
                        ))}
                      </select>
                    )}

                    {content.displayMode === 'list' && (
                      <select
                        aria-label={t('admin.screens.messageBoardOrderLabel')}
                        value={content.order ?? 'newestFirst'}
                        onChange={(event) => setMessageBoardOrder(event.target.value as MessageBoardOrder)}
                      >
                        {MESSAGE_BOARD_ORDERS.map((order) => (
                          <option key={order} value={order}>
                            {t(`admin.screens.messageBoardOrder.${order}`)}
                          </option>
                        ))}
                      </select>
                    )}

                    {(content.displayMode ?? 'rotating') === 'rotating' && (
                      <label className="slide-fields__number-field">
                        <span>{t('admin.screens.messageBoardRotateSecondsLabel')}</span>
                        <input
                          type="number"
                          min={1}
                          value={content.rotateSeconds ?? DEFAULT_MESSAGE_BOARD_ROTATE_SECONDS}
                          onChange={(event) => setMessageBoardRotateSeconds(Number(event.target.value))}
                        />
                      </label>
                    )}

                    {((content.displayMode ?? 'rotating') === 'rotating' || content.displayMode === 'list') && (
                      <label className="slide-fields__number-field">
                        <span>{t('admin.screens.messageBoardCountLabel')}</span>
                        <input type="number" min={1} value={content.count ?? DEFAULT_MESSAGE_BOARD_COUNT} onChange={(event) => setMessageBoardCount(Number(event.target.value))} />
                      </label>
                    )}
                  </>
                )
              })()}
          </>
        ) : (
          <p className="slide-fields__hint">{t('admin.screens.messageBoardNoBoardsLabel')}</p>
        ))}

      {content.kind === 'event' && (content.displayMode ?? 'calendar') === 'calendar' && (
        <label className="slide-fields__number-field">
          <span>{t('admin.screens.eventCalendarCountLabel')}</span>
          <input type="number" min={1} value={content.count ?? DEFAULT_EVENT_CALENDAR_COUNT} onChange={(event) => setEventCalendarCount(Number(event.target.value))} />
        </label>
      )}

      {content.kind === 'event' &&
        (content.displayMode === 'image' || content.displayMode === 'details') &&
        (events.length > 0 ? (
          <select aria-label={t('admin.screens.eventOrdinalLabel')} value={content.eventOrdinal ?? 1} onChange={(event) => setEventOrdinal(Number(event.target.value))}>
            {Array.from({ length: events.length }, (_, index) => index + 1).map((ordinal) => (
              <option key={ordinal} value={ordinal}>
                {t('admin.screens.eventOrdinalOption', { ordinal: formatOrdinal(ordinal, language) })}
              </option>
            ))}
          </select>
        ) : (
          <p className="slide-fields__hint">{t('admin.screens.eventsNoEventsConfiguredLabel')}</p>
        ))}

      {content.kind === 'event' && content.displayMode === 'month' && (
        <>
          <Checkbox id={`${id}-event-show-price`} label={t('admin.screens.eventShowPriceLabel')} checked={Boolean(content.showPrice)} onChange={(event) => setEventShowPrice(event.target.checked)} />
          <Checkbox
            id={`${id}-event-show-description`}
            label={t('admin.screens.eventShowDescriptionLabel')}
            checked={Boolean(content.showDescription)}
            onChange={(event) => setEventShowDescription(event.target.checked)}
          />
        </>
      )}

      {content.kind === 'announcement' && (
        <>
          <Button type="button" variant="secondary" onClick={() => setIsMessagePickerOpen(true)}>
            {t('admin.screens.copyMessageButton')}
          </Button>
          <Input
            id={`${id}-announcement-title`}
            label={t('admin.screens.announcementTitleLabel')}
            value={content.title}
            onChange={(event) => setAnnouncementTitle(event.target.value)}
          />
          <Textarea
            id={`${id}-announcement-description`}
            label={t('admin.screens.announcementDescriptionLabel')}
            value={content.description}
            onChange={(event) => setAnnouncementDescription(event.target.value)}
          />
          <MessagePickerModal
            open={isMessagePickerOpen}
            onClose={() => setIsMessagePickerOpen(false)}
            messages={collectAnnouncementMessages(screens)}
            onSelect={(message) => {
              onChange({ ...content, title: message.title, description: message.description })
              setIsMessagePickerOpen(false)
            }}
          />
        </>
      )}
    </div>
  )
}
