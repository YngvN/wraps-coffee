import { useState } from 'react'
import { useLanguage } from '../../../i18n'
import { printOnUsbPrinter } from '../../../lib/companionBridge'
import { jobBytes } from '../../../lib/registerReceiptApi'
import { runReport, setTrainingMode } from '../../../lib/registerReportApi'
import type { OrdersPrinterChoice } from '../../../types/printer'
import type { RegisterReport } from '../../../types/registerReport'
import { RegisterAmountPad } from './RegisterAmountPad'
import { RegisterSheet } from './RegisterSheet'

interface RegisterReportSheetProps {
  deviceId: string
  printerChoice: OrdersPrinterChoice
  /** Whether the register is in training mode now. */
  training: boolean
  /** After training mode was switched: the register reloads its state. */
  onTrainingChanged: () => void
  /** After a Z report: the period is closed, so the register asks for a new float. */
  onClosedDay: () => void
  onClose: () => void
}

/**
 * Reports for a manager: an X report (the period so far, changes nothing) at any time, and the Z report
 * that closes the day — after counting the cash in the drawer, which the report compares against what
 * should be there — and switching training mode on and off (the day can't be closed while it's on). Both
 * reports print on the tablet's printer (every field the regulation asks for) and show
 * the main figures here.
 */
export function RegisterReportSheet({ deviceId, printerChoice, training, onTrainingChanged, onClosedDay, onClose }: RegisterReportSheetProps) {
  const { t } = useLanguage()
  const [mode, setMode] = useState<'choose' | 'count'>('choose')
  const [counted, setCounted] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<RegisterReport | null>(null)
  const kr = (ore: number) => t('menu.price', { price: ore / 100 })

  const run = async (kind: 'X' | 'Z') => {
    setBusy(true)
    setError(null)
    try {
      const result = await runReport(deviceId, kind === 'Z' ? { kind, countedCashOre: Number(counted || 0) * 100 } : { kind }, printerChoice)
      if (!result.ok) return setError(t(`screenDisplay.register.reportError.${result.reason}`))
      if (result.via === 'device' && result.data && printerChoice.startsWith('usb:')) await printOnUsbPrinter(printerChoice.slice('usb:'.length), jobBytes(result.data))
      setReport(result.report)
      if (!result.printed) setError(t('screenDisplay.register.reportNotPrinted'))
      if (kind === 'Z') onClosedDay()
    } catch {
      setError(t('screenDisplay.register.reportError.offline'))
    } finally {
      setBusy(false)
    }
  }

  const toggleTraining = async () => {
    setBusy(true)
    setError(null)
    try {
      await setTrainingMode(deviceId, !training)
      onTrainingChanged()
      onClose()
    } catch {
      setError(t('screenDisplay.register.reportError.offline'))
    } finally {
      setBusy(false)
    }
  }

  const title = report
    ? report.kind === 'Z'
      ? t('screenDisplay.register.zDone', { number: report.zNumber ?? '' })
      : t('screenDisplay.register.xDone')
    : t('screenDisplay.register.reportsTitle')

  return (
    <RegisterSheet title={title} onClose={onClose} className="register-sheet--pay">
      <div className="register-pin">
        {report ? (
          <dl className="register-report">
            <dt>{t('report.sales')}</dt>
            <dd>{`${kr(report.sales.amountOre)} (${report.sales.count})`}</dd>
            <dt>{t('report.returns')}</dt>
            <dd>{`${kr(report.returns.amountOre)} (${report.returns.count})`}</dd>
            <dt>{t('report.net')}</dt>
            <dd>{kr(report.netOre)}</dd>
            <dt>{t('report.vatTotal')}</dt>
            <dd>{kr(report.vat.reduce((sum, vat) => sum + vat.vatOre, 0))}</dd>
            <dt>{t('report.expectedCash')}</dt>
            <dd>{kr(report.expectedCashOre)}</dd>
            {report.cashCount && (
              <>
                <dt>{t('report.countedCash')}</dt>
                <dd>{kr(report.cashCount.countedOre)}</dd>
                <dt>{t('report.difference')}</dt>
                <dd className={report.cashCount.differenceOre === 0 ? undefined : 'register-report__off'}>{kr(report.cashCount.differenceOre)}</dd>
              </>
            )}
          </dl>
        ) : mode === 'choose' ? (
          <>
            <p className="register-pin__message">{t('screenDisplay.register.reportsHint')}</p>
            <button type="button" className="order-sheet__action" onClick={() => void run('X')} disabled={busy}>
              {t('screenDisplay.register.runX')}
            </button>
            <button type="button" className="order-sheet__action register__pay" onClick={() => setMode('count')} disabled={busy || training}>
              {t('screenDisplay.register.startZ')}
            </button>
            <button type="button" className="order-sheet__action" onClick={() => void toggleTraining()} disabled={busy}>
              {training ? t('screenDisplay.register.trainingOff') : t('screenDisplay.register.trainingOn')}
            </button>
          </>
        ) : (
          <>
            <p className="register-pin__message">{t('screenDisplay.register.countPrompt')}</p>
            <RegisterAmountPad value={counted} onChange={setCounted} />
            <button type="button" className="order-sheet__action register__pay" onClick={() => void run('Z')} disabled={busy || counted === ''}>
              {t('screenDisplay.register.runZ', { amount: t('menu.price', { price: Number(counted || 0) }) })}
            </button>
          </>
        )}
        {error && (
          <p className="register-pin__message register-pin__message--error" role="alert">
            {error}
          </p>
        )}
      </div>
    </RegisterSheet>
  )
}
