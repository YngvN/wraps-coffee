import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Input, TranslatedText } from '../../../components'
import { useLanguage } from '../../../i18n'
import './AdminLogin.scss'

/**
 * Owner login screen. Intentionally has no real authentication — there's no
 * backend yet, so submitting the form (with anything entered) simply
 * navigates to the dashboard.
 */
export function AdminLogin() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    navigate('/admin/dashboard/overview')
  }

  return (
    <div className="admin-login">
      <Card className="admin-login__card">
        <form className="admin-login__form" onSubmit={handleSubmit}>
          <TranslatedText as="h1" id="admin.login.title" />
          <Input
            id="admin-username"
            label={t('admin.login.usernameLabel')}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
          <Input
            id="admin-password"
            label={t('admin.login.passwordLabel')}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <Button type="submit">
            <TranslatedText id="admin.login.submit" />
          </Button>
        </form>
      </Card>
    </div>
  )
}
