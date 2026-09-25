import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Alert, Button, Card, Checkbox, Input, TranslatedText } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useLanOrigin } from '../../../hooks/useLanOrigin'
import { useStoreSettings } from '../../../hooks/useStoreSettings'
import { useLanguage } from '../../../i18n'
import { login, LoginError } from '../../../lib/localServer'
import { StoreBrandHeader } from '../layout/StoreBrandHeader'
import './AdminLogin.scss'

/** Only a bare `/screens/editor/:screenId` path is honored as a post-login `redirect` target (see `ScreenDisplay`'s own redirect here) — anything else falls back to the dashboard, so this can't be turned into an open redirect via a crafted query param. */
const REDIRECT_TARGET_PATTERN = /^\/screens\/editor\/[^/]+$/

/**
 * Owner/staff login screen. Submits credentials to the local LAN server's
 * `/login` endpoint; on success stores the returned session (token, role,
 * allowed sections) and redirects either to the dashboard, or — if a
 * `?redirect=` query param points back to a screen's own editor URL (see
 * `ScreenDisplay`, which sends here when its `/screens/editor/:screenId`
 * route is opened with no session on this browser origin yet) — straight
 * back to that screen, now with a session on this origin. "Stay signed in"
 * (on by default) keeps the session across browser restarts; unchecked, it
 * ends when the tab/browser closes (see `useAdminSession`). A wrong password
 * or an unreachable server both surface as an inline error — nothing
 * navigates away until the server actually confirms the login.
 *
 * Also offers a "Show QR code" toggle that reveals a QR code encoding this
 * same login page's URL, addressed by this machine's LAN IP instead of
 * `localhost`/`127.0.0.1` (same LAN-IP substitution `ScreensView` uses for
 * screen links) — so a phone on the same network can scan it straight to
 * this page rather than someone typing the address in by hand.
 */
export function AdminLogin() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setActiveSession } = useAdminSession()
  const [storeSettings] = useStoreSettings()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [staySignedIn, setStaySignedIn] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)
  const lanOrigin = useLanOrigin()
  const loginUrl = `${lanOrigin}${window.location.pathname}`

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const session = await login(username, password)
      setActiveSession(session, staySignedIn)
      const redirectTarget = searchParams.get('redirect')
      navigate(redirectTarget && REDIRECT_TARGET_PATTERN.test(redirectTarget) ? redirectTarget : '/admin/dashboard/overview')
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
          {storeSettings.name.trim() ? <StoreBrandHeader /> : <TranslatedText as="h1" id="admin.login.title" />}
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
          <Checkbox
            id="admin-stay-signed-in"
            label={t('admin.login.staySignedIn')}
            checked={staySignedIn}
            onChange={(event) => setStaySignedIn(event.target.checked)}
          />
          {error && <Alert variant="error">{error}</Alert>}
          <Button type="submit" disabled={submitting}>
            <TranslatedText id={submitting ? 'admin.login.submitting' : 'admin.login.submit'} />
          </Button>
          <div className="admin-login__qr-toggle">
            <Button type="button" variant="secondary" onClick={() => setShowQr((current) => !current)}>
              <TranslatedText id={showQr ? 'admin.login.hideQr' : 'admin.login.showQr'} />
            </Button>
            <div className={`admin-login__qr${showQr ? ' admin-login__qr--open' : ''}`}>
              <QRCodeSVG value={loginUrl} bgColor="transparent" fgColor="currentColor" className="admin-login__qr-code" />
            </div>
          </div>
        </form>
      </Card>
    </div>
  )
}
