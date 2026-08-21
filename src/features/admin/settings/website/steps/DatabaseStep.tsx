import { useState } from 'react'
import { Alert, Input } from '../../../../../components'
import { useLanguage } from '../../../../../i18n'
import { SetupStep } from '../SetupStep'

interface DatabaseStepProps {
  stepNumber: number
  stepCount: number
  /** The saved value, if any — shown masked so an existing setup can be recognised without exposing the password. */
  savedUrl: string | null
  isSaving: boolean
  saveConnectionString: (value: string) => Promise<void>
  onBack: () => void
  onNext: () => void
}

/** Hides the password segment of a `postgres://user:password@host/db` string, leaving enough to recognise it. */
function maskConnectionString(url: string): string {
  return url.replace(/:\/\/([^:/@]+):([^@]+)@/, '://$1:••••••••@')
}

/**
 * Collects the database connection string.
 *
 * The instruction that matters most here is *where to look*: the string lives
 * on the host's own database page, not in the site's environment-variable
 * list. Looking in the environment variables and finding nothing is the
 * single most likely way to get stuck at this point, because the platform
 * supplies its own database variable at runtime rather than storing it there.
 *
 * The value only leaves this step on "Next", so a half-typed string never
 * restarts the live sync connection.
 */
export function DatabaseStep({ stepNumber, stepCount, savedUrl, isSaving, saveConnectionString, onBack, onNext }: DatabaseStepProps) {
  const { t } = useLanguage()
  const [draft, setDraft] = useState('')

  const hasSaved = Boolean(savedUrl)
  // An already-saved value counts as valid input, so returning to this step
  // doesn't force the string to be pasted again just to move forward.
  const canContinue = draft.trim().length > 0 || hasSaved

  const handleNext = async () => {
    if (draft.trim()) await saveConnectionString(draft)
    onNext()
  }

  return (
    <SetupStep
      stepNumber={stepNumber}
      stepCount={stepCount}
      title={t('admin.settings.website.database.title')}
      intro={t('admin.settings.website.database.intro')}
      onBack={onBack}
      onNext={() => void handleNext()}
      nextDisabled={!canContinue || isSaving}
    >
      <ol className="setup-step__instructions">
        <li>{t('admin.settings.website.database.instructionOpen')}</li>
        <li>{t('admin.settings.website.database.instructionCopy')}</li>
      </ol>

      <Alert variant="info">{t('admin.settings.website.database.notEnvVars')}</Alert>

      <label className="setup-step__field">
        <span>{t('admin.settings.website.database.inputLabel')}</span>
        <Input
          type="text"
          value={draft}
          placeholder={hasSaved ? maskConnectionString(savedUrl!) : 'postgresql://…'}
          disabled={isSaving}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>

      {hasSaved && <p className="setup-step__hint">{t('admin.settings.website.database.alreadySaved')}</p>}
    </SetupStep>
  )
}
