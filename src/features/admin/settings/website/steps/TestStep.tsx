import { useEffect } from 'react'
import { Alert, Button, Spinner } from '../../../../../components'
import { useLanguage } from '../../../../../i18n'
import type { WebsiteCheckResult, WebsiteCheckStatus, WebsiteConnectionTestResult } from '../../../../../types/websiteProvider'
import { SetupStep } from '../SetupStep'

interface TestStepProps {
  stepNumber: number
  stepCount: number
  result: WebsiteConnectionTestResult | null
  isTesting: boolean
  runTest: () => Promise<void>
  onBack: () => void
  onFinish: () => void
}

/** Maps a check's status to the Alert variant that carries the same meaning. */
const VARIANT_BY_STATUS: Record<WebsiteCheckStatus, 'success' | 'warning' | 'error' | 'info'> = {
  ok: 'success',
  warning: 'warning',
  failed: 'error',
  skipped: 'info',
}

/**
 * Runs the connection checks and reports each one in plain language.
 *
 * This is what separates a guided setup from a form with instructions around
 * it. Each check isolates one thing that can be wrong, so the result points at
 * a specific fix — "the keys in your website don't match this one" rather than
 * a sync error naming an internal key name.
 *
 */
export function TestStep({ stepNumber, stepCount, result, isTesting, runTest, onBack, onFinish }: TestStepProps) {
  const { t } = useLanguage()

  // Run once on arrival — the whole point of this step is the answer, so
  // making someone press a button first would just add a click.
  useEffect(() => {
    void runTest()
  }, [runTest])

  const checks = result?.checks ?? []
  const hasFailure = checks.some((check) => check.status === 'failed')

  /** The explanation for one check: its own status text, plus the reason when there is one. */
  const describe = (check: WebsiteCheckResult): string => {
    if (check.reason) return t(`admin.settings.website.test.reasons.${check.id}.${check.reason}`)
    return t(`admin.settings.website.test.status.${check.id}.${check.status}`)
  }

  return (
    <SetupStep
      stepNumber={stepNumber}
      stepCount={stepCount}
      title={t('admin.settings.website.test.title')}
      intro={t('admin.settings.website.test.intro')}
      onBack={onBack}
      onNext={hasFailure ? undefined : onFinish}
      nextLabel={t('admin.settings.website.test.finish')}
      nextDisabled={isTesting}
    >
      {isTesting && !result ? (
        <Spinner />
      ) : (
        <>
          {checks.map((check) => (
            <Alert key={check.id} variant={VARIANT_BY_STATUS[check.status]} title={t(`admin.settings.website.test.checks.${check.id}`)}>
              {describe(check)}
            </Alert>
          ))}

          <div className="setup-step__actions setup-step__actions--inline">
            <Button type="button" variant="secondary" onClick={() => void runTest()} disabled={isTesting}>
              {t('admin.settings.website.test.retry')}
            </Button>
          </div>
        </>
      )}
    </SetupStep>
  )
}
