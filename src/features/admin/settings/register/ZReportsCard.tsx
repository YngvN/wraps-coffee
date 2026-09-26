import { useEffect, useState } from 'react'
import { Button, Card } from '../../../../components'
import { useAdminSession } from '../../../../hooks/useAdminSession'
import { useLanguage } from '../../../../i18n'
import { fetchZReports, reprintZReport, type ZReportSummary } from '../../../../lib/registerAdminApi'

/**
 * Settings → Register: every Z report the registers have taken (the day's closing), newest first, with
 * its net sales and how far the counted cash was off. Each can be printed again on the default printer,
 * marked KOPI. The reports themselves live in the journal and can't be changed.
 */
export function ZReportsCard() {
  const { t, language } = useLanguage()
  const { session } = useAdminSession()
  const token = session?.token
  const [reports, setReports] = useState<ZReportSummary[] | null>(null)
  const [status, setStatus] = useState<Record<number, string>>({})

  useEffect(() => {
    if (!token) return
    let alive = true
    fetchZReports(token)
      .then((list) => {
        if (alive) setReports(list)
      })
      .catch(() => {
        if (alive) setReports([])
      })
    return () => {
      alive = false
    }
  }, [token])

  const kr = (ore: number) => t('menu.price', { price: ore / 100 })
  const date = (iso: string) => new Date(iso).toLocaleString(language === 'no' ? 'nb-NO' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Oslo' })

  const reprint = async (seq: number) => {
    if (!token) return
    setStatus((current) => ({ ...current, [seq]: t('admin.settings.register.zPrinting') }))
    const result = await reprintZReport(token, seq)
    setStatus((current) => ({ ...current, [seq]: t(`admin.settings.register.zReprint.${result}`) }))
  }

  return (
    <Card className="register-settings">
      <h2>{t('admin.settings.register.zTitle')}</h2>
      <p className="register-settings__hint">{t('admin.settings.register.zHint')}</p>
      {reports === null && <p className="register-settings__status">{t('admin.settings.register.loading')}</p>}
      {reports?.length === 0 && <p className="register-settings__status">{t('admin.settings.register.zEmpty')}</p>}
      <ul className="register-staff">
        {reports?.map((entry) => (
          <li key={entry.seq} className="register-staff__row">
            <span className="register-staff__name">{t('admin.settings.register.zRow', { number: entry.number, register: entry.register, date: date(entry.at) })}</span>
            <span className="register-staff__meta">
              {t('admin.settings.register.zNet', { amount: kr(entry.report.netOre) })}
              {entry.report.cashCount && ` · ${t('admin.settings.register.zDifference', { amount: kr(entry.report.cashCount.differenceOre) })}`}
              {status[entry.seq] && ` · ${status[entry.seq]}`}
            </span>
            <Button type="button" variant="secondary" onClick={() => void reprint(entry.seq)}>
              {t('admin.settings.register.zPrintCopy')}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
