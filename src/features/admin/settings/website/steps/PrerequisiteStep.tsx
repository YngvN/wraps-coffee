import { Alert, Button } from '../../../../../components'
import { useLanguage } from '../../../../../i18n'
import { SetupStep } from '../SetupStep'

interface PrerequisiteStepProps {
  stepNumber: number
  stepCount: number
  onBack: () => void
  onNext: () => void
}

/**
 * Asks whether the website is already published, before anything else.
 *
 * This dashboard can neither create nor verify a deploy — that needs a code
 * repository and an account on the hosting platform. Rather than walking
 * someone through four steps that cannot possibly work yet, the flow asks up
 * front and says plainly what has to happen elsewhere first.
 *
 * Answering "not yet" is a dead end on purpose. Copying the host's own setup
 * documentation in here would go stale, and would still not be something this
 * page could check.
 */
export function PrerequisiteStep({ stepNumber, stepCount, onBack, onNext }: PrerequisiteStepProps) {
  const { t } = useLanguage()

  return (
    <SetupStep
      stepNumber={stepNumber}
      stepCount={stepCount}
      title={t('admin.settings.website.prerequisite.title')}
      intro={t('admin.settings.website.prerequisite.intro')}
      onBack={onBack}
    >
      <div className="setup-step__actions setup-step__actions--inline">
        <Button type="button" onClick={onNext}>
          {t('admin.settings.website.prerequisite.yes')}
        </Button>
      </div>

      <Alert variant="info">{t('admin.settings.website.prerequisite.notYet')}</Alert>
    </SetupStep>
  )
}
