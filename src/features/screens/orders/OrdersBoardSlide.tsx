import { AnimatePresence, LayoutGroup, MotionConfig } from 'framer-motion'
import { useMemo, useState } from 'react'
import { UndoToast } from '../../../components'
import { useClockFormatPreference } from '../../../hooks/useClockFormatPreference'
import { useNow } from '../../../hooks/useNow'
import { useLanguage } from '../../../i18n'
import type { OrderRecord, OrderSource } from '../../../types/order'
import { DEFAULT_ORDERS_AGE_WARN_MINUTES, DEFAULT_ORDERS_HISTORY_HOURS, DEFAULT_ORDERS_NOTE_KEYWORDS } from '../../../types/screen'
import { formatClockTime } from '../../../utils/clockFormat'
import { BoardClock } from './BoardClock'
import { OrderCard } from './OrderCard'
import { BOARD_COLUMNS, columnOf, customerOrderLabel, historyOrders, laneOf, sortByPickup, summariseItems, type BoardColumn, type OrderLane } from './orderColumns'
import { OrderDetailSheet } from './OrderDetailSheet'
import { OrderHistoryDrawer } from './OrderHistoryDrawer'
import { PaneLanguageScope } from '../PaneLanguageScope'
import { OrdersSettingsMenu } from './OrdersSettingsMenu'
import { useNewOrderAlert } from './useNewOrderAlert'
import { useOfflineSince } from './useOfflineSince'
import { useOrderBoard } from './useOrderBoard'
import { useOrdersLanguage, type OrdersLanguage } from './useOrdersLanguage'
import { useOrdersTheme } from './useOrdersTheme'
import { useBoardPrinting } from './useBoardPrinting'
import { readDeviceId } from './readDeviceId'
import './OrdersBoard.scss'

interface OrdersBoardSlideProps {
  touchControl?: boolean
  sources?: OrderSource[]
  historyHours?: number
  groupDelivery?: boolean
  chime?: boolean
  ageWarnMinutes?: [number, number]
  noteKeywords?: string[]
}

/**
 * The staff order board for an `'orders'` pane in `'staff'` mode: Incoming → Doing → Done, each
 * optionally split into Pickup and Delivery lanes, a clock and a "To make" strip summing the items in Doing, a
 * History drawer for today's picked-up/cancelled orders, an undo toast after every move, and a ⚙ menu
 * for the board's own light/dark look and language (both remembered per device). Its colours and font
 * are fixed, independent of the screen — see `OrdersBoard.scss`.
 *
 * Touch only works when the pane's `touchControl` is on *and* the page was opened by a companion
 * device (`?deviceId=`); the server enforces the same rule independently, see
 * `POST /display-orders/status`. While the sync connection is down the arrows are disabled, since a
 * change made against stale data could undo someone else's.
 */
function OrdersBoard({
  language: languageChoice,
  onLanguageChange,
  touchControl,
  sources,
  historyHours = DEFAULT_ORDERS_HISTORY_HOURS,
  groupDelivery = true,
  chime = true,
  ageWarnMinutes = DEFAULT_ORDERS_AGE_WARN_MINUTES,
  noteKeywords = DEFAULT_ORDERS_NOTE_KEYWORDS,
}: OrdersBoardSlideProps & { language: OrdersLanguage; onLanguageChange: (language: OrdersLanguage) => void }) {
  const { t, language } = useLanguage()
  const [clockFormat] = useClockFormatPreference()
  const nowMs = useNow(30_000)
  const now = useMemo(() => new Date(nowMs), [nowMs])
  const [deviceId] = useState(readDeviceId)
  const interactive = Boolean(touchControl && deviceId)
  const board = useOrderBoard(sources, interactive ? deviceId : null)
  const offlineSince = useOfflineSince()
  const [openId, setOpenId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [theme, setTheme] = useOrdersTheme()
  const printing = useBoardPrinting(interactive ? deviceId : null)

  const byColumn = useMemo(() => {
    const groups: Record<BoardColumn, OrderRecord[]> = {
      incoming: [],
      doing: [],
      done: [],
      history: [],
    }
    for (const order of board.orders) groups[columnOf(order.status)].push(order)
    for (const column of BOARD_COLUMNS) groups[column] = sortByPickup(groups[column])
    return groups
  }, [board.orders])
  const history = useMemo(() => historyOrders(byColumn.history, now, historyHours), [byColumn.history, now, historyHours])
  const toMake = useMemo(() => summariseItems(byColumn.doing), [byColumn.doing])
  const flashing = useNewOrderAlert(byColumn.incoming, chime)

  const locked = offlineSince !== null
  const openOrder = openId ? board.orders.find((order) => order.id === openId) : undefined
  // An order that vanished from the data (e.g. deleted upstream) closes its sheet for good, rather than
  // leaving `openId` set so the sheet pops back open by itself if that order ever reappears.
  if (openId && !openOrder) setOpenId(null)
  const moved = board.lastMove ? board.orders.find((order) => order.id === board.lastMove?.orderId) : undefined
  const movedColumn = board.lastMove ? columnOf(board.lastMove.to) : undefined
  const toastMessage =
    moved && board.lastMove && movedColumn
      ? t('screenDisplay.orders.moved', {
          name: customerOrderLabel(moved).name,
          column:
            movedColumn === 'history' ? t(`screenDisplay.orders.${board.lastMove.to === 'cancelled' ? 'cancelled' : 'pickedUp'}`) : t(`screenDisplay.orders.column.${movedColumn}`),
        })
      : null

  const renderCards = (orders: OrderRecord[]) => (
    <AnimatePresence initial={false} mode="popLayout">
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          now={now}
          ageWarnMinutes={ageWarnMinutes}
          noteKeywords={noteKeywords}
          interactive={interactive}
          locked={locked || board.busy.has(order.id)}
          failedMessage={board.failed[order.id]}
          flashing={flashing.has(order.id)}
          onOpen={() => setOpenId(order.id)}
          onMove={(to) => board.move(order, to)}
          onPrint={printing.available ? () => printing.print(order) : undefined}
          printStatus={printing.status[order.id]}
        />
      ))}
    </AnimatePresence>
  )

  const renderLane = (orders: OrderRecord[], lane: OrderLane) =>
    orders.length > 0 && (
      <section className={`orders-board__lane orders-board__lane--${lane}`}>
        <h3 className="orders-board__lane-title">{t(`screenDisplay.orders.lane.${lane}`)}</h3>
        {renderCards(orders)}
      </section>
    )

  return (
    // `reducedMotion="user"` turns every card glide and overlay slide below into an instant change when
    // the OS asks for reduced motion — one switch here instead of one check per animation.
    <MotionConfig reducedMotion="user">
      <div className={interactive ? 'orders-board orders-board--interactive' : 'orders-board'} data-orders-theme={theme}>
        {offlineSince && (
          <div className="orders-board__offline">
            {t('screenDisplay.orders.offline', {
              time: formatClockTime(offlineSince, language, clockFormat),
            })}
          </div>
        )}

        <div className="orders-board__bar">
          <BoardClock />
          <div className="orders-board__to-make">
            <span className="orders-board__to-make-label">{t('screenDisplay.orders.toMake')}</span>
            {toMake.length === 0 ? (
              <span className="orders-board__muted">–</span>
            ) : (
              toMake.map((item) => <span key={item.name} className="orders-board__to-make-item">{`${item.quantity}× ${item.name}`}</span>)
            )}
          </div>
          {interactive && (
            <button type="button" className="orders-board__history-button" onClick={() => setHistoryOpen(true)}>
              {t('screenDisplay.orders.history')} <span className="orders-board__count">{history.length}</span>
            </button>
          )}
          <OrdersSettingsMenu theme={theme} onThemeChange={setTheme} language={languageChoice} onLanguageChange={onLanguageChange} printing={interactive ? printing : undefined} />
        </div>

        <LayoutGroup>
          <div className="orders-board__columns">
            {BOARD_COLUMNS.map((column) => {
              const orders = byColumn[column]
              return (
                <section key={column} className={`orders-board__column orders-board__column--${column}`}>
                  <h2 className="orders-board__column-title">
                    {t(`screenDisplay.orders.column.${column}`)} <span className="orders-board__count">{orders.length}</span>
                  </h2>
                  <div className="orders-board__cards">
                    {orders.length === 0 && <p className="orders-board__muted">{t('screenDisplay.orders.empty')}</p>}
                    {groupDelivery ? (
                      <>
                        {renderLane(
                          orders.filter((order) => laneOf(order) === 'pickup'),
                          'pickup',
                        )}
                        {renderLane(
                          orders.filter((order) => laneOf(order) === 'delivery'),
                          'delivery',
                        )}
                      </>
                    ) : (
                      renderCards(orders)
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        </LayoutGroup>

        <AnimatePresence>
          {historyOpen && (
            <OrderHistoryDrawer
              orders={history}
              locked={locked}
              busy={board.busy}
              onMove={board.move}
              onOpen={(order) => setOpenId(order.id)}
              onClose={() => setHistoryOpen(false)}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {interactive && openOrder && (
            <OrderDetailSheet
              order={openOrder}
              noteKeywords={noteKeywords}
              locked={locked || board.busy.has(openOrder.id)}
              failedMessage={board.failed[openOrder.id]}
              onMove={(to) => board.move(openOrder, to)}
              onClose={() => setOpenId(null)}
              onPrint={printing.available ? () => printing.print(openOrder) : undefined}
              printStatus={printing.status[openOrder.id]}
            />
          )}
        </AnimatePresence>
        <UndoToast message={toastMessage} actionLabel={t('screenDisplay.orders.undo')} onAction={board.undo} onDismiss={board.dismissLastMove} resetKey={board.lastMove?.seq} />
      </div>
    </MotionConfig>
  )
}

/**
 * The staff order board for an `'orders'` pane in `'staff'` mode — see `OrdersBoard` above. This outer
 * layer only applies the language picked in the board's ⚙ menu (`useOrdersLanguage`): the board always
 * renders inside a `PaneLanguageScope`, set to the pane's own language while the choice is `'auto'`, so
 * switching language never remounts the board (no lost open sheet, undo toast or new-order memory).
 */
export function OrdersBoardSlide(props: OrdersBoardSlideProps) {
  const { language: paneLanguage } = useLanguage()
  const [choice, setChoice] = useOrdersLanguage()
  return (
    <PaneLanguageScope language={choice === 'auto' ? paneLanguage : choice}>
      <OrdersBoard {...props} language={choice} onLanguageChange={setChoice} />
    </PaneLanguageScope>
  )
}
