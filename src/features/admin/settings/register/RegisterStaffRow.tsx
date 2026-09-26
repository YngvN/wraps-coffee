import { useState } from 'react'
import { Button, Checkbox, Input } from '../../../../components'
import { useLanguage } from '../../../../i18n'
import type { RegisterStaffInput, RegisterStaffMember } from '../../../../lib/registerAdminApi'

interface RegisterStaffRowProps {
  member: RegisterStaffMember
  onSave: (input: RegisterStaffInput) => Promise<void>
}

/**
 * One staff member in Settings → Register: name, employee number, role and whether they're active, with
 * an Edit form that can also set a new PIN. A member is never deleted — made inactive instead — so the
 * journal always has a name for everything they did. Saving a new PIN, role or active state signs them
 * out of every register at once.
 */
export function RegisterStaffRow({ member, onSave }: RegisterStaffRowProps) {
  const { t } = useLanguage()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(member.name)
  const [employeeNumber, setEmployeeNumber] = useState(member.employeeNumber)
  const [role, setRole] = useState(member.role)
  const [active, setActive] = useState(member.active)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)

  const pinValid = pin === '' || /^\d{4}$/.test(pin)

  const save = async () => {
    setBusy(true)
    try {
      await onSave({ name, employeeNumber, role, active, ...(pin ? { pin } : {}) })
      setPin('')
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <li className={member.active ? 'register-staff__row' : 'register-staff__row register-staff__row--inactive'}>
        <span className="register-staff__name">{member.name}</span>
        <span className="register-staff__meta">
          {t('admin.settings.register.staffNumber', { number: member.employeeNumber })} · {t(`admin.settings.register.role.${member.role}`)}
          {!member.active && ` · ${t('admin.settings.register.inactive')}`}
          {!member.hasPin && ` · ${t('admin.settings.register.noPinYet')}`}
        </span>
        <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
          {t('admin.settings.register.editStaff')}
        </Button>
      </li>
    )
  }

  return (
    <li className="register-staff__row register-staff__row--editing">
      <form
        className="register-staff__form"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim() && pinValid) void save()
        }}
      >
        <Input id={`staff-name-${member.id}`} label={t('admin.settings.register.staffName')} value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
        <Input
          id={`staff-number-${member.id}`}
          label={t('admin.settings.register.staffNumberLabel')}
          value={employeeNumber}
          maxLength={20}
          onChange={(event) => setEmployeeNumber(event.target.value)}
        />
        <label className="register-staff__field">
          <span>{t('admin.settings.register.roleLabel')}</span>
          <select value={role} onChange={(event) => setRole(event.target.value as RegisterStaffMember['role'])}>
            <option value="staff">{t('admin.settings.register.role.staff')}</option>
            <option value="manager">{t('admin.settings.register.role.manager')}</option>
          </select>
        </label>
        <Input
          id={`staff-pin-${member.id}`}
          label={t('admin.settings.register.newPinLabel')}
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={4}
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
          error={pinValid ? undefined : t('admin.settings.register.pinFormat')}
        />
        <Checkbox id={`staff-active-${member.id}`} label={t('admin.settings.register.activeLabel')} checked={active} onChange={(event) => setActive(event.target.checked)} />
        <div className="register-settings__actions">
          <Button type="submit" disabled={busy || !name.trim() || !pinValid}>
            {t('admin.settings.register.saveStaff')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
            {t('admin.common.cancel')}
          </Button>
        </div>
      </form>
    </li>
  )
}
