import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { useLanguage } from '../../../i18n'
import type { ScanNotice } from './useRegisterScans'

/** How long a scan notice stays up. */
const NOTICE_MS = 3500

interface RegisterScanNoticeProps {
  notice: { notice: ScanNotice; seq: number } | null
  onDismiss: () => void
  /** Offered with "lookup unavailable": add the product by hand instead of waiting. */
  onQuickAdd: (barcode: string) => void
}

const TONE: Record<ScanNotice['kind'], 'ok' | 'attention' | 'error'> = {
  added: 'ok',
  soldOutAdded: 'attention',
  draft: 'attention',
  unknownBarcode: 'error',
  lookupUnavailable: 'error',
  unreadable: 'error',
  pickupDisabled: 'error',
  offline: 'error',
  drawerOpened: 'ok',
  drawerFailed: 'error',
  drawerNoPrinter: 'error',
}

/** The short banner after each product scan, coloured like its scan sound (ok / needs a look / failed). Replaced by the next scan, gone after a few seconds. */
export function RegisterScanNotice({ notice, onDismiss, onQuickAdd }: RegisterScanNoticeProps) {
  const { t } = useLanguage()

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(onDismiss, NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice, onDismiss])

  const value = notice?.notice
  const text = value
    ? t(`screenDisplay.register.notice.${value.kind}`, {
        name: 'name' in value ? value.name : '',
        code: 'code' in value ? value.code : '',
      })
    : ''

  return (
    <div className="register__notice-slot" aria-live="polite">
      <AnimatePresence>
        {value && notice && (
          <motion.div
            key={notice.seq}
            className={`register__notice register__notice--${TONE[value.kind]}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.16 }}
          >
            <span>{text}</span>
            {value.kind === 'lookupUnavailable' && (
              <button type="button" className="register__bar-button" onClick={() => onQuickAdd(value.code)}>
                {t('screenDisplay.register.addByHand')}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
