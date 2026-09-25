import { useEffect, useState } from 'react'
import { Button, Checkbox, HelpTip } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useLanguage } from '../../../i18n'
import { getPaymentCredentials, savePaymentCredentials } from '../../../lib/registerAdminApi'
import type { PaymentCredentialsByKind, PaymentCredentialsKind } from '../../../types/payments'

/**
 * One payment integration's block on Settings → Testing: its "Use test environment" switch (Vipps'
 * Merchant Test environment, or Zettle's SDK developer mode), saved with the rest of that
 * integration's credentials — same posture as the Wolt/Foodora blocks, which only ever change
 * `useDevelopmentEnvironment` and carry every other field through unchanged.
 */
export function PaymentTestingToggle({ kind }: { kind: PaymentCredentialsKind }) {
  const { t } = useLanguage()
  const { session } = useAdminSession()
  const [credentials, setCredentials] = useState<PaymentCredentialsByKind[typeof kind] | null>(null)
  const [state, setState] = useState<'loading' | 'idle' | 'saving' | 'saved' | 'error'>('loading')
  const token = session?.token

  useEffect(() => {
    if (!token) return
    let alive = true
    getPaymentCredentials(token, kind)
      .then((value) => {
        if (!alive) return
        setCredentials(value)
        setState('idle')
      })
      .catch(() => {
        if (alive) setState('error')
      })
    return () => {
      alive = false
    }
  }, [token, kind])

  const save = () => {
    if (!token || !credentials) return
    setState('saving')
    savePaymentCredentials(token, kind, credentials).then(
      () => setState('saved'),
      () => setState('error'),
    )
  }

  if (!credentials) return <p>{state === 'error' ? t('admin.settings.testing.loadError') : t('admin.settings.testing.loading')}</p>

  return (
    <div className="testing-settings__integration">
      <h2>{t(`admin.settings.testing.${kind}Title`)}</h2>
      <Checkbox
        id={`testing-${kind}-use-development-environment`}
        label={
          <>
            {t(`admin.settings.testing.${kind}CheckboxLabel`)} <HelpTip text={t(`admin.settings.testing.${kind}Hint`)} />
          </>
        }
        checked={credentials.useDevelopmentEnvironment}
        onChange={(event) => {
          setState('idle')
          setCredentials({ ...credentials, useDevelopmentEnvironment: event.target.checked })
        }}
      />
      {state === 'error' && <p className="testing-settings__error">{t('admin.settings.testing.saveError')}</p>}
      <Button onClick={save} disabled={state === 'saving'}>
        {t('admin.common.save')}
      </Button>
      {state === 'saved' && <span className="testing-settings__saved">{t('admin.settings.testing.saved')}</span>}
    </div>
  )
}
