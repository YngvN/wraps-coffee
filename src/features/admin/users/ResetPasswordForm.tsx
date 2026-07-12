import { useState, type FormEvent } from 'react'
import { Button, Input } from '../../../components'
import { useLanguage } from '../../../i18n'
import './UserForm.scss'

interface ResetPasswordFormProps {
  onSave: (password: string) => void
  onCancel: () => void
}

/** `UsersView`'s own "Reset password" action: a single new-password field, no confirmation of the old one — an admin/subadmin resetting someone else's password doesn't know it to begin with. */
export function ResetPasswordForm({ onSave, onCancel }: ResetPasswordFormProps) {
  const { t } = useLanguage()
  const [password, setPassword] = useState('')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSave(password)
  }

  return (
    <form className="user-form" onSubmit={handleSubmit}>
      <Input
        id="reset-password"
        label={t('admin.users.newPasswordLabel')}
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="new-password"
        required
      />
      <div className="user-form__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('admin.common.cancel')}
        </Button>
        <Button type="submit">{t('admin.common.save')}</Button>
      </div>
    </form>
  )
}
