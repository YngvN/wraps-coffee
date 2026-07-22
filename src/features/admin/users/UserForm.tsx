import { useState, type FormEvent } from 'react'
import { Alert, Button, Checkbox, Input } from '../../../components'
import { useLanguage } from '../../../i18n'
import { DASHBOARD_SECTIONS, type AdminRole, type DashboardSection } from '../../../types/sync'
import { sectionNavId } from '../../../utils/dashboardSection'
import './UserForm.scss'

interface UserFormProps {
  /** Roles the current session is allowed to assign — a `subadmin` session omits `'admin'` (see `UsersView`'s own "Subadmin scope" rule), so the picker below only ever offers what the server would actually accept. */
  availableRoles: AdminRole[]
  onSave: (input: { username: string; password: string; role: AdminRole; allowedSections?: DashboardSection[] }) => void
  onCancel: () => void
  /** Server-reported error (e.g. "That username is already taken") — `UsersView` owns this, since it's the one that knows whether the request actually failed. */
  error?: string | null
  submitting?: boolean
}

/** Add-user form: username, password, role, and — only for the `limited` role, which has no meaning otherwise — which dashboard sections that account is scoped to. */
export function UserForm({ availableRoles, onSave, onCancel, error, submitting }: UserFormProps) {
  const { t } = useLanguage()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<AdminRole>(availableRoles[0])
  const [allowedSections, setAllowedSections] = useState<DashboardSection[]>([])

  const toggleSection = (section: DashboardSection, checked: boolean) => {
    setAllowedSections((current) => (checked ? [...current, section] : current.filter((existing) => existing !== section)))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSave({ username: username.trim(), password, role, allowedSections: role === 'limited' ? allowedSections : undefined })
  }

  return (
    <form className="user-form" onSubmit={handleSubmit}>
      <Input id="user-username" label={t('admin.users.usernameLabel')} value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" required />
      <Input
        id="user-password"
        label={t('admin.users.passwordLabel')}
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="new-password"
        required
      />

      <label className="user-form__field">
        <span>{t('admin.users.roleLabel')}</span>
        <select value={role} onChange={(event) => setRole(event.target.value as AdminRole)}>
          {availableRoles.map((option) => (
            <option key={option} value={option}>
              {t(`admin.users.roles.${option}`)}
            </option>
          ))}
        </select>
      </label>

      {role === 'limited' && (
        <fieldset className="user-form__sections">
          <legend>{t('admin.users.allowedSectionsLabel')}</legend>
          {DASHBOARD_SECTIONS.map((section) => (
            <Checkbox
              key={section}
              id={`user-section-${section}`}
              label={t(`admin.nav.${sectionNavId(section)}`)}
              checked={allowedSections.includes(section)}
              onChange={(event) => toggleSection(section, event.target.checked)}
            />
          ))}
        </fieldset>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      <div className="user-form__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('admin.common.cancel')}
        </Button>
        <Button type="submit" disabled={submitting}>
          {t('admin.common.save')}
        </Button>
      </div>
    </form>
  )
}
