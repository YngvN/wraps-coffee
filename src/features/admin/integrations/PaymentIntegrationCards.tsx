import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, AnimatedDetails, Button, FetchedLogo, HelpTip, Input, StatusDot } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useLanguage } from '../../../i18n'
import { getPaymentCredentials, savePaymentCredentials } from '../../../lib/registerAdminApi'
import type { PaymentCredentialsByKind, PaymentCredentialsKind } from '../../../types/payments'

/** The credential fields each provider's card asks for, in order, and which of them are secrets. */
const FIELDS: { [K in PaymentCredentialsKind]: { key: Exclude<keyof PaymentCredentialsByKind[K], 'useDevelopmentEnvironment'>; secret: boolean }[] } = {
  vipps: [
    { key: 'clientId', secret: false },
    { key: 'clientSecret', secret: true },
    { key: 'subscriptionKey', secret: true },
    { key: 'merchantSerialNumber', secret: false },
  ],
  zettle: [{ key: 'clientId', secret: false }],
}

const LOGO: Record<PaymentCredentialsKind, { slug: string; label: string }> = {
  vipps: { slug: 'vipps-mobilepay', label: 'Vipps MobilePay' },
  zettle: { slug: 'zettle', label: 'Zettle' },
}

/** Whether every field the provider needs has a value. */
function isComplete<K extends PaymentCredentialsKind>(kind: K, credentials: PaymentCredentialsByKind[K]): boolean {
  return FIELDS[kind].every((field) => Boolean((credentials as unknown as Record<string, unknown>)[field.key as string]))
}

/**
 * One payment integration's card on the Integrations page, in the same fold-out shape as Wolt's and
 * Foodora's: the credentials the server keeps for it (server-only — never a synced key the tablets
 * can read), and a clear note that it's scaffolding: nothing takes real money until the integration is
 * finished against the provider's own documentation. Until then the Register records payments by hand.
 * Opens itself on `?integration=zettle|vipps` (the global search's links).
 */
function PaymentIntegrationCard<K extends PaymentCredentialsKind>({ kind }: { kind: K }) {
  const { t } = useLanguage()
  const { session } = useAdminSession()
  const [searchParams] = useSearchParams()
  const deepLinked = searchParams.get('integration') === kind
  const [open, setOpen] = useState(deepLinked)
  const [saved, setSaved] = useState<PaymentCredentialsByKind[K] | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | { error: string }>('idle')
  const ref = useRef<HTMLDivElement>(null)
  const token = session?.token

  useEffect(() => {
    if (deepLinked) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [deepLinked])

  useEffect(() => {
    if (!token) return
    let alive = true
    getPaymentCredentials(token, kind)
      .then((value) => {
        if (!alive) return
        setSaved(value)
        setDraft(Object.fromEntries(FIELDS[kind].map((field) => [field.key, String((value as unknown as Record<string, unknown>)[field.key as string] ?? '')])))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [token, kind])

  const save = async () => {
    if (!token || !saved) return
    setState('saving')
    try {
      const next = { ...saved, ...Object.fromEntries(FIELDS[kind].map((field) => [field.key, draft[field.key as string]?.trim() || null])) } as PaymentCredentialsByKind[K]
      await savePaymentCredentials(token, kind, next)
      setSaved(next)
      setState('saved')
    } catch (error) {
      setState({ error: error instanceof Error ? error.message : String(error) })
    }
  }

  const configured = saved !== null && isComplete(kind, saved)
  return (
    <div ref={ref}>
      <AnimatedDetails
        className="integration-submenu"
        summaryClassName="integration-submenu__summary"
        bodyClassName="integration-submenu__body"
        open={open}
        onToggle={() => setOpen((current) => !current)}
        summary={
          <>
            <FetchedLogo slug={LOGO[kind].slug} label={LOGO[kind].label} className="integration-submenu__icon" />
            <span className="integration-submenu__title">
              <span className="integration-submenu__brand">{LOGO[kind].label}</span>
              <span className="integration-submenu__label">
                {t(`admin.integrations.payments.${kind}.label`)} <HelpTip text={t(`admin.integrations.payments.${kind}.description`)} />
              </span>
            </span>
            <StatusDot
              // Amber, not green: saved credentials don't make it live — see the scaffolding notice below.
              status={configured ? 'stale' : 'disabled'}
              title={t(configured ? 'admin.integrations.payments.statusSaved' : 'admin.integrations.payments.statusNotConfigured')}
              label={t(configured ? 'admin.integrations.payments.statusSaved' : 'admin.integrations.payments.statusNotConfigured')}
            />
            <span className="integration-submenu__chevron" aria-hidden="true">
              ▸
            </span>
          </>
        }
      >
        <Alert variant="warning">{t('admin.integrations.payments.scaffoldingNotice')}</Alert>
        <p className="integrations-view__hint">{t(`admin.integrations.payments.${kind}.requirements`)}</p>
        {FIELDS[kind].map((field) => (
          <Input
            key={field.key as string}
            id={`integrations-${kind}-${field.key as string}`}
            type={field.secret ? 'password' : 'text'}
            autoComplete="off"
            label={t(`admin.integrations.payments.${kind}.${field.key as string}`)}
            value={draft[field.key as string] ?? ''}
            onChange={(event) => {
              setState('idle')
              setDraft((current) => ({ ...current, [field.key as string]: event.target.value }))
            }}
          />
        ))}
        {typeof state === 'object' && <Alert variant="error">{state.error}</Alert>}
        {state === 'saved' && <Alert variant="success">{t('admin.integrations.payments.saved')}</Alert>}
        <Button type="button" variant="secondary" onClick={() => void save()} disabled={!saved || state === 'saving'}>
          {state === 'saving' ? t('admin.integrations.payments.saving') : t('admin.integrations.payments.save')}
        </Button>
      </AnimatedDetails>
    </div>
  )
}

/** The Zettle and Vipps MobilePay cards, for the Integrations page's "Available" list. */
export function PaymentIntegrationCards() {
  return (
    <>
      <PaymentIntegrationCard kind="zettle" />
      <PaymentIntegrationCard kind="vipps" />
    </>
  )
}
