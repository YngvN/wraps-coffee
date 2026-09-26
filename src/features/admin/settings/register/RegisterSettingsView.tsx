import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Input } from '../../../../components'
import { useStoreSettings } from '../../../../hooks/useStoreSettings'
import { missingLegalDetails } from '../../../../utils/storeLegal'
import { useAdminSession } from '../../../../hooks/useAdminSession'
import { useLanguage } from '../../../../i18n'
import { fetchRegisterStaffList, saveRegisterStaff, type RegisterStaffInput, type RegisterStaffMember } from '../../../../lib/registerAdminApi'
import { CashRegistersCard } from './CashRegistersCard'
import { JournalHealthCard } from './JournalHealthCard'
import { ZReportsCard } from './ZReportsCard'
import { SaftCard } from './SaftCard'
import { RegisterStaffRow } from './RegisterStaffRow'
import './RegisterSettingsView.scss'

/**
 * Settings → Register: the staff who may use the registers (each with their own 4-digit PIN and a role —
 * a manager can also edit products), the numbered cash registers, the Z reports, the SAF-T export (with
 * each category's article group), and the electronic journal's health.
 * The server keeps only PIN hashes and never sends them back. Warns at the top while the company
 * details receipts need are incomplete, since the registers refuse to sell until they are.
 */
export function RegisterSettingsView() {
  const { t } = useLanguage()
  const { session } = useAdminSession()
  const token = session?.token
  const [staff, setStaff] = useState<RegisterStaffMember[] | null>(null)
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [role, setRole] = useState<RegisterStaffMember['role']>('staff')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [storeSettings] = useStoreSettings()
  const navigate = useNavigate()
  const legalMissing = missingLegalDetails(storeSettings).length > 0

  useEffect(() => {
    if (!token) return
    let alive = true
    fetchRegisterStaffList(token)
      .then((list) => {
        if (alive) setStaff(list)
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => {
      alive = false
    }
  }, [token])

  const errorText = useCallback(
    (reason: unknown) => {
      const code = reason instanceof Error ? reason.message : String(reason)
      const known = ['noName', 'badRole', 'badPin', 'duplicateEmployeeNumber', 'unknownStaff']
      return known.includes(code) ? t(`admin.settings.register.staffError.${code}`) : code
    },
    [t],
  )

  const save = async (input: RegisterStaffInput, id?: string) => {
    if (!token) return
    setError(null)
    try {
      const saved = await saveRegisterStaff(token, input, id)
      setStaff((list) => (id ? (list ?? []).map((member) => (member.id === id ? saved : member)) : [...(list ?? []), saved]))
    } catch (reason) {
      setError(errorText(reason))
      throw reason
    }
  }

  const add = async () => {
    setBusy(true)
    try {
      await save({ name, pin, role })
      setName('')
      setPin('')
      setRole('staff')
    } catch {
      // Shown by `save`.
    } finally {
      setBusy(false)
    }
  }

  const pinValid = /^\d{4}$/.test(pin)
  const sorted = [...(staff ?? [])].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'nb'))

  return (
    <>
      {legalMissing && (
        <Alert variant="warning" title={t('admin.settings.register.legalMissingTitle')}>
          <p>{t('admin.settings.register.legalMissingBody')}</p>
          <Button type="button" onClick={() => navigate('/admin/dashboard/settings/store/legal')}>
            {t('admin.legal.title')}
          </Button>
        </Alert>
      )}
      <Card className="register-settings">
        <h2>{t('admin.settings.register.staffTitle')}</h2>
        <p className="register-settings__hint">{t('admin.settings.register.staffHint')}</p>
        {staff === null && !error && <p className="register-settings__status">{t('admin.settings.register.loading')}</p>}
        {staff?.length === 0 && <p className="register-settings__status">{t('admin.settings.register.noStaffYet')}</p>}
        <ul className="register-staff">
          {sorted.map((member) => (
            <RegisterStaffRow key={member.id} member={member} onSave={(input) => save(input, member.id)} />
          ))}
        </ul>
        <form
          className="register-staff__form register-staff__form--add"
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim() && pinValid) void add()
          }}
        >
          <h3>{t('admin.settings.register.addStaff')}</h3>
          <Input id="new-staff-name" label={t('admin.settings.register.staffName')} value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
          <Input
            id="new-staff-pin"
            label={t('admin.settings.register.pinLabel')}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={4}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
            error={pin !== '' && !pinValid ? t('admin.settings.register.pinFormat') : undefined}
          />
          <label className="register-staff__field">
            <span>{t('admin.settings.register.roleLabel')}</span>
            <select value={role} onChange={(event) => setRole(event.target.value as RegisterStaffMember['role'])}>
              <option value="staff">{t('admin.settings.register.role.staff')}</option>
              <option value="manager">{t('admin.settings.register.role.manager')}</option>
            </select>
          </label>
          <div className="register-settings__actions">
            <Button type="submit" disabled={busy || !name.trim() || !pinValid}>
              {t('admin.settings.register.addStaff')}
            </Button>
          </div>
        </form>
        {error && <p className="register-settings__error">{error}</p>}
      </Card>
      <CashRegistersCard />
      <ZReportsCard />
      <SaftCard />
      <JournalHealthCard />
    </>
  )
}
