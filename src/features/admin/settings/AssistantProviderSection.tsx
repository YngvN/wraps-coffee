import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Checkbox } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useLanguage } from '../../../i18n'
import { getAssistantCredentialStatus, setAssistantCredentials } from '../../../lib/localServer'

type AssistantProvider = 'local' | 'claude'

/**
 * The assistant chatbox's model provider — "Claude API" (cloud, needs an
 * API key) vs "Local (free)" (a self-hosted Ollama instance, fully offline —
 * see the Integrations page's Ollama card for its host/model config). The
 * credential/config itself lives on the Integrations page, not here — this
 * is purely the provider *choice*, same split as Wolt/Foodora's own
 * enable-toggle vs credentials-card split.
 */
export function AssistantProviderSection() {
  const { t } = useLanguage()
  const { session } = useAdminSession()
  const navigate = useNavigate()
  const [provider, setProvider] = useState<AssistantProvider>('claude')
  const [hasKey, setHasKey] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [candidateSuggestionsEnabled, setCandidateSuggestionsEnabled] = useState(true)

  useEffect(() => {
    if (!session || session.role === 'limited') return
    getAssistantCredentialStatus(session.token)
      .then((status) => {
        setProvider(status.provider)
        setHasKey(status.hasKey)
        setCandidateSuggestionsEnabled(status.productNameCandidateSuggestionsEnabled)
      })
      .catch(() => {})
  }, [session])

  if (!session || session.role === 'limited') return null

  const handleSelectClaude = () => {
    if (provider === 'claude') return
    setIsSaving(true)
    setAssistantCredentials(session.token, { provider: 'claude' })
      .then((status) => setProvider(status.provider))
      .finally(() => setIsSaving(false))
  }

  const handleSelectLocal = () => {
    if (provider === 'local') return
    setIsSaving(true)
    setAssistantCredentials(session.token, { provider: 'local' })
      .then((status) => setProvider(status.provider))
      .finally(() => setIsSaving(false))
  }

  const handleToggleCandidateSuggestions = () => {
    const next = !candidateSuggestionsEnabled
    setCandidateSuggestionsEnabled(next)
    setIsSaving(true)
    setAssistantCredentials(session.token, { productNameCandidateSuggestionsEnabled: next })
      .then((status) => setCandidateSuggestionsEnabled(status.productNameCandidateSuggestionsEnabled))
      .finally(() => setIsSaving(false))
  }

  return (
    <div className="advanced-settings__section">
      <fieldset className="advanced-settings__modes">
        <legend>{t('admin.settings.advanced.assistantProviderLegend')}</legend>
        <label className="advanced-settings__mode">
          <input type="radio" name="assistant-provider" checked={provider === 'claude'} disabled={isSaving} onChange={handleSelectClaude} />
          <span className="advanced-settings__mode-text">
            <strong>{t('admin.settings.advanced.assistantProviderClaudeLabel')}</strong>
            <span>{t('admin.settings.advanced.assistantProviderClaudeDescription')}</span>
          </span>
        </label>
        <label className="advanced-settings__mode">
          <input type="radio" name="assistant-provider" checked={provider === 'local'} disabled={isSaving} onChange={handleSelectLocal} />
          <span className="advanced-settings__mode-text">
            <strong>{t('admin.settings.advanced.assistantProviderLocalLabel')}</strong>
            <span>{t('admin.settings.advanced.assistantProviderLocalDescription')}</span>
          </span>
        </label>
      </fieldset>

      {provider === 'claude' && !hasKey && (
        <Alert variant="warning">
          {t('admin.settings.advanced.assistantProviderNoKey')}{' '}
          <Button type="button" variant="secondary" onClick={() => navigate('/admin/dashboard/settings?view=integrations')}>
            {t('admin.assistant.configureButton')}
          </Button>
        </Alert>
      )}

      <Checkbox
        checked={candidateSuggestionsEnabled}
        disabled={isSaving}
        onChange={handleToggleCandidateSuggestions}
        label={t('admin.settings.advanced.assistantCandidateSuggestionsLabel')}
      />
    </div>
  )
}
