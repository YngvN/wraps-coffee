import { useEffect, useState } from 'react'
import { Button, Card, Input } from '../../../../components'
import { useAdminSession } from '../../../../hooks/useAdminSession'
import { useCatalogues } from '../../../../hooks/useCatalogues'
import { useLanguage } from '../../../../i18n'
import { osloDate } from '../../../../lib/osloTime'
import { downloadPublicKey, downloadSaft, fetchCashRegisters, type CashRegisterSummary } from '../../../../lib/registerAdminApi'
import { ARTICLE_GROUP_CODES, DEFAULT_ARTICLE_GROUP } from '../../../../lib/saftArticleGroups'

/**
 * Settings → Register: the SAF-T Cash Register export Skatteetaten can ask for — pick a period (and one
 * register, or all) and download the file, built from the journal. Also where each product category gets
 * its SAF-T article group (Mat, Mineralvann, Annen drikke …), which the file reports sales under.
 */
export function SaftCard() {
  const { t } = useLanguage()
  const { session } = useAdminSession()
  const token = session?.token
  const [catalogues, setCatalogues] = useCatalogues()
  const today = osloDate(new Date())
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`)
  const [to, setTo] = useState(today)
  const [register, setRegister] = useState('')
  const [registers, setRegisters] = useState<CashRegisterSummary[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let alive = true
    fetchCashRegisters(token)
      .then((list) => {
        if (alive) setRegisters(list)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [token])

  const save = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  const download = async (what: 'saft' | 'key') => {
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      if (what === 'key') save(await downloadPublicKey(token), 'kassasystem-offentlig-nokkel.pem')
      else {
        const { blob, filename } = await downloadSaft(token, from, to, register ? Number(register) : undefined)
        save(blob, filename)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const setGroup = (categoryId: string, code: string) =>
    setCatalogues(
      catalogues.map((catalogue) => ({
        ...catalogue,
        categories: catalogue.categories.map((category) =>
          category.id === categoryId ? { ...category, saftArticleGroup: code === DEFAULT_ARTICLE_GROUP ? undefined : code } : category,
        ),
      })),
    )

  return (
    <Card className="register-settings">
      <h2>{t('admin.settings.register.saftTitle')}</h2>
      <p className="register-settings__hint">{t('admin.settings.register.saftHint')}</p>
      <div className="register-saft__period">
        <Input id="saft-from" type="date" label={t('admin.settings.register.saftFrom')} value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
        <Input id="saft-to" type="date" label={t('admin.settings.register.saftTo')} value={to} min={from} onChange={(event) => setTo(event.target.value)} />
        <label className="register-staff__field">
          <span>{t('admin.settings.register.saftRegister')}</span>
          <select value={register} onChange={(event) => setRegister(event.target.value)}>
            <option value="">{t('admin.settings.register.saftAllRegisters')}</option>
            {registers.map((option) => (
              <option key={option.number} value={option.number}>{`${option.name} (${option.number})`}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="register-settings__actions">
        <Button type="button" onClick={() => void download('saft')} disabled={busy || !from || !to || from > to}>
          {busy ? t('admin.settings.register.saftDownloading') : t('admin.settings.register.saftDownload')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void download('key')} disabled={busy}>
          {t('admin.settings.register.publicKeyDownload')}
        </Button>
      </div>
      {error && <p className="register-settings__error">{error}</p>}

      <h3>{t('admin.settings.register.saftGroupsTitle')}</h3>
      <p className="register-settings__hint">{t('admin.settings.register.saftGroupsHint')}</p>
      <ul className="register-staff">
        {catalogues.flatMap((catalogue) =>
          catalogue.categories.map((category) => (
            <li key={category.id} className="register-saft__group">
              <span>{`${catalogue.name.no || catalogue.name.en} › ${category.name.no || category.name.en}`}</span>
              <select value={category.saftArticleGroup ?? DEFAULT_ARTICLE_GROUP} onChange={(event) => setGroup(category.id, event.target.value)}>
                {Object.entries(ARTICLE_GROUP_CODES).map(([code, label]) => (
                  <option key={code} value={code}>{`${code} ${label}`}</option>
                ))}
              </select>
            </li>
          )),
        )}
      </ul>
    </Card>
  )
}
