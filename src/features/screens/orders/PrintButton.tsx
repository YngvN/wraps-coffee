import type { MouseEvent } from 'react'
import { CheckIcon, PrinterIcon, Spinner } from '../../../components'
import { useLanguage } from '../../../i18n'
import type { PrintStatus } from './useBoardPrinting'
import './PrintButton.scss'

interface PrintButtonProps {
  status: PrintStatus | undefined
  onPrint: () => void
  /** Matches the arrows it sits between. */
  size?: 'normal' | 'large'
}

/**
 * Prints the order's receipt. Shows a spinner while the job is on its way, a tick for a moment once the
 * printer accepted it, and a warning mark (with the reason as its tooltip and label) if it failed —
 * tapping again retries. Stops propagation, so on a card it never also opens the details.
 */
export function PrintButton({ status, onPrint, size = 'normal' }: PrintButtonProps) {
  const { t } = useLanguage()
  const failed = typeof status === 'object'
  const label = failed ? t('screenDisplay.orders.printFailed', { error: status.error }) : t('screenDisplay.orders.print')

  const handle = (event: MouseEvent) => {
    event.stopPropagation()
    onPrint()
  }

  return (
    <button
      type="button"
      className={`order-print order-print--${size}${failed ? ' order-print--failed' : ''}`}
      onClick={handle}
      disabled={status === 'printing'}
      aria-label={label}
      title={label}
    >
      {status === 'printing' ? <Spinner size="sm" /> : status === 'printed' ? <CheckIcon /> : failed ? <span className="order-print__warning">!</span> : <PrinterIcon />}
    </button>
  )
}

/** The line under the buttons after a failed print — tablets have no hover, so the button's tooltip alone would never be seen. The server's own (English, technical) reason stays in the tooltip. */
export function PrintError({ status }: { status: PrintStatus | undefined }) {
  const { t } = useLanguage()
  if (typeof status !== 'object') return null
  return (
    <p className="order-card__error order-print__error" title={status.error}>
      {t('screenDisplay.orders.printFailedHint')}
    </p>
  )
}
