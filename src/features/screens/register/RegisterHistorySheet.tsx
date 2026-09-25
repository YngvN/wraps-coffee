import { useMemo, useState } from 'react'
import { useClockFormatPreference } from '../../../hooks/useClockFormatPreference'
import { useFoodoraOrders } from '../../../hooks/useFoodoraOrders'
import { useOrders } from '../../../hooks/useOrders'
import { useRegisterOrders } from '../../../hooks/useRegisterOrders'
import { useWoltOrders } from '../../../hooks/useWoltOrders'
import { useLanguage } from '../../../i18n'
import { orderNumber } from '../../../lib/orderNumber'
import type { OrderRecord } from '../../../types/order'
import { formatClockTime } from '../../../utils/clockFormat'
import { PrintButton, PrintError } from '../orders/PrintButton'
import type { BoardPrinting } from '../orders/useBoardPrinting'
import { RegisterSheet } from './RegisterSheet'
import { historyByDay, type HistorySource } from './salesHistory'

/** How many orders the list shows before "Show more" — the history can hold months of sales. */
const PAGE_SIZE = 60

const SOURCES: HistorySource[] = ['all', 'register', 'website', 'delivery']

interface RegisterHistorySheetProps {
  /** Omitted when this tablet can't print (then the list is read-only). */
  printing?: BoardPrinting
  onClose: () => void
}

/**
 * Order history at the register: every order — counter sales, website orders and delivery orders —
 * newest first and grouped by day, with a search (counter number, name, receipt number or item) and a
 * source filter. Each order can print its receipt again, e.g. for a customer who needs a copy. Names
 * and phone numbers are cleared after 7 days, so older orders show their number, time and contents.
 */
export function RegisterHistorySheet({ printing, onClose }: RegisterHistorySheetProps) {
  const { t, language } = useLanguage()
  const [clockFormat] = useClockFormatPreference()
  const [website] = useOrders()
  const [wolt] = useWoltOrders()
  const [foodora] = useFoodoraOrders()
  const [register] = useRegisterOrders()
  const [source, setSource] = useState<HistorySource>('all')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const all = useMemo(() => [...website, ...wolt, ...foodora, ...register], [website, wolt, foodora, register])
  const { days, total } = useMemo(() => historyByDay(all, source, search, limit), [all, source, search, limit])
  const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(language === 'en' ? 'en-GB' : 'nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })
  const number = (order: OrderRecord) => (order.displayNumber ? order.displayNumber : `#${orderNumber(order)}`)
  const sourceLabel = (order: OrderRecord) => t(`screenDisplay.register.historySource.${order.source ?? 'website'}`)

  return (
    <RegisterSheet title={t('screenDisplay.register.historyTitle')} onClose={onClose} className="register-sheet--history">
      <div className="register-history">
        <input
          className="register-history__search"
          value={search}
          placeholder={t('screenDisplay.register.historySearch')}
          onChange={(event) => {
            setSearch(event.target.value)
            setLimit(PAGE_SIZE)
          }}
        />
        <div className="register__chips">
          {SOURCES.map((option) => (
            <button
              key={option}
              type="button"
              className={source === option ? 'register__chip register__chip--active' : 'register__chip'}
              onClick={() => {
                setSource(option)
                setLimit(PAGE_SIZE)
              }}
            >
              {t(`screenDisplay.register.historyFilter.${option}`)}
            </button>
          ))}
        </div>
        {!printing && <p className="register-editor__hint">{t('screenDisplay.register.historyNoPrinter')}</p>}
        {days.length === 0 && <p className="orders-board__muted">{t('screenDisplay.register.historyEmpty')}</p>}
        {days.map((day) => (
          <section key={day.day} className="register-history__day">
            <h3>{dayLabel(day.day)}</h3>
            <ul>
              {day.orders.map((order) => (
                <li key={order.id} className={order.status === 'cancelled' ? 'register-history__order register-history__order--cancelled' : 'register-history__order'}>
                  <div className="register-history__main">
                    <span className="register-history__number">{number(order)}</span>
                    <span>{formatClockTime(new Date(order.createdAt), language, clockFormat)}</span>
                    <span className="register-history__source">{sourceLabel(order)}</span>
                    {order.customerName && <span className="register-history__name">{order.customerName}</span>}
                    {order.status === 'cancelled' && <span className="register__line-flag">{t('screenDisplay.orders.cancelled')}</span>}
                  </div>
                  <p className="register-history__items">{order.items.map((item) => `${item.quantity}× ${item.name}`).join(', ')}</p>
                  <div className="register-history__side">
                    <strong>{t('menu.price', { price: order.totalPrice })}</strong>
                    {order.payment && <span>{t(`screenDisplay.register.method.${order.payment.method}`)}</span>}
                    {printing?.available && <PrintButton status={printing.status[order.id]} onPrint={() => printing.print(order)} size="large" />}
                  </div>
                  {printing && <PrintError status={printing.status[order.id]} />}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {total > limit && (
          <button type="button" className="order-sheet__action" onClick={() => setLimit((current) => current + PAGE_SIZE)}>
            {t('screenDisplay.register.historyMore', { count: total - limit })}
          </button>
        )}
      </div>
    </RegisterSheet>
  )
}
