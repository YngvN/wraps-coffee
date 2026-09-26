import { motion } from 'framer-motion'
import { useState } from 'react'
import { CloseIcon, FetchedLogo } from '../../../components'
import { useLanguage } from '../../../i18n'
import type { OrderRecord, OrderStatus } from '../../../types/order'
import { OrderArrows } from './OrderArrows'
import { PrintButton, PrintError } from './PrintButton'
import type { PrintStatus } from './useBoardPrinting'
import { columnOf, matchesNoteKeyword } from './orderColumns'
import { orderNumber } from '../../../lib/orderNumber'

interface OrderDetailSheetProps {
  order: OrderRecord
  noteKeywords: string[]
  locked: boolean
  failedMessage?: string
  onMove: (to: OrderStatus) => void
  onClose: () => void
  /** Present when this board can print — a print button then sits between the arrows, in every column. */
  onPrint?: () => void
  printStatus?: PrintStatus
}

/**
 * The full view of one order, laid over the board inside its own pane (not a page-level modal, so it
 * keeps the board's own look and never covers a neighbouring pane): every item with its price, notes
 * (red when they match an allergy-type keyword), phone, total, the same ← / → arrows as the card with
 * a print button between them when the board can print, and Cancel behind a confirm step. Tapping the
 * dimmed backdrop closes it. It scales in over a fading backdrop (the parent's `AnimatePresence` plays
 * the reverse on close). Stays open after a move, so the new column is visible in the header — the
 * undo toast still covers a mis-tap.
 */
export function OrderDetailSheet({ order, noteKeywords, locked, failedMessage, onMove, onClose, onPrint, printStatus }: OrderDetailSheetProps) {
  const { t } = useLanguage()
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const column = columnOf(order.status)
  const columnLabel = column === 'history' ? t(`screenDisplay.orders.${order.status === 'cancelled' ? 'cancelled' : 'pickedUp'}`) : t(`screenDisplay.orders.column.${column}`)
  // A register sale is already paid and journaled: only a return receipt can undo it, never "cancel".
  const canCancel = order.status !== 'cancelled' && order.status !== 'completed' && order.source !== 'register'

  return (
    <motion.div className="order-sheet" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
      <motion.div
        className={`order-sheet__panel order-card--${order.source ?? 'website'}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 520, damping: 38 }}
      >
        <header className="order-sheet__header">
          {(order.source === 'wolt' || order.source === 'foodora') && (
            <FetchedLogo slug={order.source} label={t(order.source === 'wolt' ? 'admin.orders.sourceWolt' : 'admin.orders.sourceFoodora')} className="order-card__logo" />
          )}
          <h2 className="order-sheet__title">{[orderNumber(order), order.customerName].filter(Boolean).join(' · ')}</h2>
          <span className="order-sheet__column">{columnLabel}</span>
          <button type="button" className="order-sheet__close" onClick={onClose} aria-label={t('screenDisplay.orders.close')}>
            <CloseIcon />
          </button>
        </header>

        <div className="order-sheet__facts">
          <span>{order.pickupTime ? t('screenDisplay.orders.pickupAt', { time: order.pickupTime }) : t('screenDisplay.orders.counterSale')}</span>
          {order.customerPhone && (
            <span>
              {t('screenDisplay.orders.phone')}: {order.customerPhone}
            </span>
          )}
        </div>

        <ul className="order-sheet__items">
          {order.items.map((item) => (
            <li key={item.itemID}>
              <span className="order-sheet__quantity">{item.quantity}×</span>
              <span className="order-sheet__item-name">{item.name}</span>
              <span>{(item.quantity * item.unitPrice).toFixed(0)} kr</span>
            </li>
          ))}
        </ul>

        {order.notes && <p className={matchesNoteKeyword(order.notes, noteKeywords) ? 'order-card__notes order-card__notes--alert' : 'order-card__notes'}>{order.notes}</p>}

        <div className="order-sheet__total">
          {t('screenDisplay.orders.total')}: {order.totalPrice.toFixed(0)} kr
        </div>

        {failedMessage && (
          <p className="order-card__error" title={failedMessage}>
            {t('screenDisplay.orders.pushFailed')}
          </p>
        )}

        <footer className="order-sheet__footer">
          {canCancel &&
            (confirmingCancel ? (
              <div className="order-sheet__confirm">
                <span>{t('screenDisplay.orders.cancelConfirm')}</span>
                <button type="button" className="order-sheet__action order-sheet__action--danger" disabled={locked} onClick={() => onMove('cancelled')}>
                  {t('screenDisplay.orders.cancelYes')}
                </button>
                <button type="button" className="order-sheet__action" onClick={() => setConfirmingCancel(false)}>
                  {t('screenDisplay.orders.cancelNo')}
                </button>
              </div>
            ) : (
              <button type="button" className="order-sheet__action order-sheet__action--danger-outline" onClick={() => setConfirmingCancel(true)}>
                {t('screenDisplay.orders.cancel')}
              </button>
            ))}
          <OrderArrows
            order={order}
            onMove={onMove}
            disabled={locked}
            size="large"
            middle={onPrint ? <PrintButton status={printStatus} onPrint={onPrint} size="large" /> : undefined}
          />
        </footer>
        {onPrint && <PrintError status={printStatus} />}
      </motion.div>
    </motion.div>
  )
}
