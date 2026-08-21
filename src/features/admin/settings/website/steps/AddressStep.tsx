import { useState } from 'react'
import { Input } from '../../../../../components'
import { useLanguage } from '../../../../../i18n'
import { SetupStep } from '../SetupStep'

interface AddressStepProps {
  stepNumber: number
  stepCount: number
  savedUrl: string | null
  isSaving: boolean
  saveWebsiteUrl: (value: string) => Promise<void>
  onBack: () => void
  onNext: () => void
}

/**
 * Collects the website's public address.
 *
 * Genuinely optional, and said so: without it everything still syncs, the
 * live site just refreshes its own copy on a timer instead of being told
 * immediately. Presenting it as required would be a lie, and skipping it
 * silently would leave someone wondering why their price change takes an hour
 * to appear.
 */
export function AddressStep({ stepNumber, stepCount, savedUrl, isSaving, saveWebsiteUrl, onBack, onNext }: AddressStepProps) {
  const { t } = useLanguage()
  const [draft, setDraft] = useState(savedUrl ?? '')

  const handleNext = async () => {
    if (draft.trim() !== (savedUrl ?? '')) await saveWebsiteUrl(draft)
    onNext()
  }

  return (
    <SetupStep
      stepNumber={stepNumber}
      stepCount={stepCount}
      title={t('admin.settings.website.address.title')}
      intro={t('admin.settings.website.address.intro')}
      onBack={onBack}
      onNext={() => void handleNext()}
      nextDisabled={isSaving}
      nextLabel={draft.trim() ? undefined : t('admin.settings.website.address.skip')}
    >
      <label className="setup-step__field">
        <span>{t('admin.settings.website.address.inputLabel')}</span>
        <Input
          type="url"
          value={draft}
          placeholder="https://example.netlify.app"
          disabled={isSaving}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>

      <p className="setup-step__hint">{t('admin.settings.website.address.optional')}</p>
    </SetupStep>
  )
}
