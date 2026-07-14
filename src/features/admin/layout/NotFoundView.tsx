import { useNavigate } from 'react-router-dom'
import { Button, TranslatedText } from '../../../components'
import { useLanguage } from '../../../i18n'
import './NotFoundView.scss'

/** Shown inside the dashboard shell (sidebar still visible) for any `/admin/dashboard/*` path that doesn't match a real section — reached either directly, or via `NotFoundRedirect` for a logged-in admin who hit a bad URL entirely outside `/admin/dashboard/*`. A logged-out visitor never sees this: `AdminDashboard` itself already redirects to `/admin/login` first. */
export function NotFoundView() {
  const { t } = useLanguage()
  const navigate = useNavigate()

  return (
    <div className="not-found-view">
      <TranslatedText as="h1" id="admin.notFound.title" />
      <TranslatedText as="p" id="admin.notFound.description" />
      <Button onClick={() => navigate('/admin/dashboard/overview')}>{t('admin.notFound.backButton')}</Button>
    </div>
  )
}
