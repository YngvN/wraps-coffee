import { useEffect, useState } from 'react'
import { Button, Card, Input } from '../../../../components'
import { useAdminSession } from '../../../../hooks/useAdminSession'
import { useLanguage } from '../../../../i18n'
import { fetchCashRegisters, renameCashRegister, type CashRegisterSummary } from '../../../../lib/registerAdminApi'
import './RegisterSettingsView.scss'

/**
 * Settings → Register: every tablet that has opened the register, as a numbered cash register. The
 * number is printed on every receipt and report and never changes (or gets reused), so only the name
 * can be edited here. A tablet appears the first time it opens a Register screen.
 */
export function CashRegistersCard() {
  const { t } = useLanguage()
  const { session } = useAdminSession()
  const token = session?.token
  const [registers, setRegisters] = useState<CashRegisterSummary[] | null>(null)
  const [names, setNames] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let alive = true
    fetchCashRegisters(token)
      .then((list) => {
        if (!alive) return
        setRegisters(list)
        setNames(Object.fromEntries(list.map((register) => [register.number, register.name])))
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => {
      alive = false
    }
  }, [token])

  const save = async (number: number) => {
    if (!token) return
    setError(null)
    try {
      await renameCashRegister(token, number, names[number] ?? '')
      setRegisters((list) => list?.map((register) => (register.number === number ? { ...register, name: names[number].trim() } : register)) ?? list)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  return (
    <Card className="register-settings">
      <h2>{t('admin.settings.register.registersTitle')}</h2>
      <p className="register-settings__hint">{t('admin.settings.register.registersHint')}</p>
      {registers === null && !error && <p className="register-settings__status">{t('admin.settings.register.loading')}</p>}
      {registers?.length === 0 && <p className="register-settings__status">{t('admin.settings.register.registersEmpty')}</p>}
      {registers?.map((register) => {
        const name = names[register.number] ?? ''
        const changed = name.trim() !== register.name && name.trim() !== ''
        return (
          <form
            key={register.number}
            className="register-settings__register"
            onSubmit={(event) => {
              event.preventDefault()
              if (changed) void save(register.number)
            }}
          >
            <span className="register-settings__register-number">{t('admin.settings.register.registerNumber', { number: register.number })}</span>
            <Input
              id={`cash-register-${register.number}`}
              aria-label={t('admin.settings.register.registerName')}
              value={name}
              maxLength={40}
              onChange={(event) => setNames({ ...names, [register.number]: event.target.value })}
            />
            <Button type="submit" disabled={!changed}>
              {t('admin.settings.register.renameRegister')}
            </Button>
          </form>
        )
      })}
      {error && <p className="register-settings__error">{error}</p>}
    </Card>
  )
}
