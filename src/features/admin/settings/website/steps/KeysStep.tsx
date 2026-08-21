import { useEffect } from 'react'
import { Alert, CopyableValue, Spinner } from '../../../../../components'
import { useLanguage } from '../../../../../i18n'
import { SetupStep } from '../SetupStep'

interface KeysStepProps {
  stepNumber: number
  stepCount: number
  developerKey: string | null
  isSaving: boolean
  /** Generates a key if none exists yet, so this step is never a dead end. */
  ensureDeveloperKey: () => Promise<void>
  onBack: () => void
  onNext: () => void
}

/** The two environment variables the website needs, both holding the same key. */
const VARIABLE_NAMES = ['API_KEY', 'VITE_API_KEY']

/**
 * Hands over the access key and explains where to paste it.
 *
 * The key itself is generated here if it doesn't exist, so this step can't
 * strand someone on an empty value.
 *
 * Two warnings are stated outright rather than left to be discovered, because
 * both have already cost real time:
 *
 * - **Don't mark the variables as secret.** `VITE_API_KEY` is compiled into
 *   the website's public JavaScript by design, so the host's secret scanner
 *   finds it there and fails the build. Marking it secret asserts a property
 *   the value deliberately doesn't have.
 * - **Redeploy afterwards.** That same compilation happens at build time, so
 *   a value added after the last build isn't in the published site yet.
 */
export function KeysStep({ stepNumber, stepCount, developerKey, isSaving, ensureDeveloperKey, onBack, onNext }: KeysStepProps) {
  const { t } = useLanguage()

  useEffect(() => {
    void ensureDeveloperKey()
  }, [ensureDeveloperKey])

  return (
    <SetupStep
      stepNumber={stepNumber}
      stepCount={stepCount}
      title={t('admin.settings.website.keys.title')}
      intro={t('admin.settings.website.keys.intro')}
      onBack={onBack}
      onNext={onNext}
      nextDisabled={!developerKey}
    >
      {developerKey ? (
        <CopyableValue
          value={developerKey}
          label={t('admin.settings.website.keys.keyLabel')}
          copiedLabel={t('admin.settings.website.keys.copied')}
          ariaLabel={t('admin.settings.website.keys.copyAria')}
        />
      ) : (
        <Spinner />
      )}

      <ol className="setup-step__instructions">
        <li>{t('admin.settings.website.keys.instructionOpen')}</li>
        <li>{t('admin.settings.website.keys.instructionAdd', { names: VARIABLE_NAMES.join(' and ') })}</li>
        <li>{t('admin.settings.website.keys.instructionSameValue')}</li>
      </ol>

      <Alert variant="warning" title={t('admin.settings.website.keys.notSecretTitle')}>
        {t('admin.settings.website.keys.notSecretBody')}
      </Alert>

      <Alert variant="warning" title={t('admin.settings.website.keys.redeployTitle')}>
        {t('admin.settings.website.keys.redeployBody')}
      </Alert>

      {isSaving && !developerKey && <p className="setup-step__hint">{t('admin.settings.website.keys.generating')}</p>}
    </SetupStep>
  )
}
