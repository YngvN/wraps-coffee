import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Input, TranslatedText } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useLanguage } from '../../../i18n'
import { login, LoginError } from '../../../lib/localServer'
import './AdminLogin.scss'

/**
 * Owner/staff login screen. Submits credentials to the local LAN server's
 * `/login` endpoint; on success stores the returned session (token, role,
 * allowed sections) and redirects to the dashboard. A wrong password or an
 * unreachable server both surface as an inline error — nothing navigates
 * away until the server actually confirms the login.
 */
export function AdminLogin() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { setActiveSession } = useAdminSession()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const session = await login(username, password)
      setActiveSession(session)
      navigate('/admin/dashboard/overview')
    } catch (err) {
      setError(err instanceof LoginError ? err.message : t('admin.login.error'))
    } finally {
      setSubmitting(false)
    }
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
            autoComplete="username"
            required
          />
          <Input
            id="admin-password"
            label={t('admin.login.passwordLabel')}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
          {error && <Alert variant="error">{error}</Alert>}
          <Button type="submit" disabled={submitting}>
            <TranslatedText id={submitting ? 'admin.login.submitting' : 'admin.login.submit'} />
          </Button>
        </form>
      </Card>
    </div>
  )
}
