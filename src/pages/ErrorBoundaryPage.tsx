import { useState } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { Button, Card, TranslatedText } from '../components'
import { useLanguage } from '../i18n'
import './ErrorBoundaryPage.scss'

/** Placeholder inbox — replace with wherever crash reports should actually land before shipping. */
const CRASH_REPORT_EMAIL = 'crash-reports@example.com'

/** A short one-line description of `error`, for the report body — every shape `useRouteError` can return (a thrown `Error`, a route's own `Response`/status, or any other thrown value) reduced to plain text. */
function describeError(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`
  if (error instanceof Error) return error.stack ?? error.message
  return String(error)
}

/**
 * The app's own top-level `errorElement` (see `main.tsx`'s router config) —
 * replaces React Router's own default error screen for any render error
 * that escapes a route, in either the admin dashboard or the kiosk screen
 * display (this can render standalone, with no admin chrome around it, so
 * it doesn't assume any layout is present). "Go back" is a plain full page
 * reload (not `history.back()` — the error is almost always a stale render
 * state, not a wrong URL, so re-fetching this exact page is what actually
 * clears it) rather than a client-side re-render, since the error may well
 * be coming from state a client-side re-render alone can't recover from.
 * "Send crash report" opens the user's own email client via `mailto:`
 * (there's no crash-reporting backend to post to instead) prefilled with
 * the current URL and the error's own message/stack.
 */
export function ErrorBoundaryPage() {
  const { t } = useLanguage()
  const error = useRouteError()
  const [reportSent, setReportSent] = useState(false)

  const handleSendReport = () => {
    const subject = encodeURIComponent(t('errorBoundary.reportSubject'))
    const body = encodeURIComponent(`${window.location.href}\n\n${describeError(error)}`)
    window.location.href = `mailto:${CRASH_REPORT_EMAIL}?subject=${subject}&body=${body}`
    setReportSent(true)
  }

  const handleGoBack = () => window.location.reload()

  return (
    <div className="error-boundary-page">
      <Card className="error-boundary-page__card">
        <TranslatedText as="h1" id="errorBoundary.title" />
        <TranslatedText as="p" id="errorBoundary.description" className="error-boundary-page__description" />
        {reportSent && <p className="error-boundary-page__sent">{t('errorBoundary.reportSent')}</p>}
        <div className="error-boundary-page__actions">
          <Button type="button" variant="secondary" onClick={handleGoBack}>
            {t('errorBoundary.goBackButton')}
          </Button>
          <Button type="button" onClick={handleSendReport}>
            {t('errorBoundary.sendReportButton')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
