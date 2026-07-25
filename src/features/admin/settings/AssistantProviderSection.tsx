import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useLanguage } from '../../../i18n'
import { getAssistantCredentialStatus, setAssistantCredentials } from '../../../lib/localServer'

type AssistantProvider = 'local' | 'claude'

/**
 * The assistant chatbox's model provider — "Local (free)" (shown disabled,
 * "coming soon": this app doesn't implement a local/Ollama backend yet, the
 * longer-term goal this whole feature is building toward) vs "Claude API"
 * (the only backend that actually works today). The credential itself lives
 * on the Integrations page's own Claude card, not here — this is purely the
 * provider *choice*, same split as Wolt/Foodora's own enable-toggle vs
 * credentials-card split.
 */
export function AssistantProviderSection() {
  const { t } = useLanguage()
  const { session } = useAdminSession()
  const navigate = useNavigate()
  const [provider, setProvider] = useState<AssistantProvider>('claude')
  const [hasKey, setHasKey] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!session || session.role === 'limited') return
    getAssistantCredentialStatus(session.token)
      .then((status) => {
        setProvider(status.provider)
        setHasKey(status.hasKey)
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
          <input type="radio" name="assistant-provider" checked={false} disabled />
          <span className="advanced-settings__mode-text">
            <strong>
              {t('admin.settings.advanced.assistantProviderLocalLabel')} — {t('admin.settings.advanced.assistantProviderComingSoon')}
            </strong>
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
    </div>
  )
}
