import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, HelpTip, Spinner } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useLanguage } from '../../../i18n'
import {
  applyAppUpdate,
  checkForAppUpdate,
  getAppUpdateConfig,
  getAppUpdateStatus,
  setAppUpdateConfig,
} from '../../../lib/localServer'
import type { AppUpdateConfig, AppUpdateState, UpdatePlan } from '../../../types/appUpdate'
import './AppUpdateSettingsView.scss'

/** How often the progress poll runs while an update is in flight. */
const POLL_INTERVAL_MS = 2000

/**
 * Settings → App updates: pulls the newest code from GitHub and applies it, so
 * shipping a change no longer means carrying the Windows installer to the
 * kiosk.
 *
 * `admin` only (not subadmin) — this page downloads and runs code from the
 * internet, which is a higher bar than editing content. The server enforces
 * the same gate on every `/app-update/*` route; this is only the UI half.
 *
 * The progress feed deliberately polls rather than using the sync WebSocket:
 * the server reporting progress is the process that gets killed partway
 * through the update, so a request that simply fails is the expected signal for
 * the "restarting" phase rather than an error worth showing.
 */
export function AppUpdateSettingsView() {
  const { t } = useLanguage()
  const { session } = useAdminSession()

  const [config, setConfig] = useState<AppUpdateConfig | null>(null)
  const [tokenInput, setTokenInput] = useState('')
  const [branchInput, setBranchInput] = useState('')
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)

  const [plan, setPlan] = useState<UpdatePlan | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [checkedClean, setCheckedClean] = useState(false)

  const [state, setState] = useState<AppUpdateState | null>(null)
  const [installedVersion, setInstalledVersion] = useState<string | null>(null)
  const [serverUnreachable, setServerUnreachable] = useState(false)

  const isRunning = state?.status === 'running'

  useEffect(() => {
    if (!session) return
    getAppUpdateConfig(session.token)
      .then((loaded) => {
        setConfig(loaded)
        setBranchInput(loaded.branch)
      })
      .catch(() => setCheckError(t('admin.settings.appUpdate.loadError')))
  }, [session, t])

  const poll = useCallback(async () => {
    if (!session) return
    const result = await getAppUpdateStatus(session.token)
    if (!result) {
      // No answer at all. During an update that means the server is being
      // restarted, which is the normal path, not a failure.
      setServerUnreachable(true)
      return
    }
    setServerUnreachable(false)
    setState(result.state)
    setInstalledVersion(result.installedVersion)
  }, [session])

  // `queueMicrotask` rather than calling `poll` straight from the effect body:
  // a synchronous setState inside an effect trips this codebase's lint rule.
  useEffect(() => {
    queueMicrotask(() => void poll())
  }, [poll])

  // Poll only while something is actually happening — including while the
  // server is unreachable, since that is how an in-progress restart looks.
  useEffect(() => {
    if (!isRunning && !serverUnreachable) return
    const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [isRunning, serverUnreachable, poll])

  const handleSaveConfig = () => {
    if (!session) return
    setIsSavingConfig(true)
    setConfigSaved(false)
    setAppUpdateConfig(session.token, {
      // An untouched token field must not clear the stored token, so only send
      // it when the admin actually typed something.
      ...(tokenInput ? { token: tokenInput } : {}),
      ...(branchInput ? { branch: branchInput } : {}),
    })
      .then((saved) => {
        setConfig(saved)
        setTokenInput('')
        setConfigSaved(true)
      })
      .catch(() => setCheckError(t('admin.settings.appUpdate.saveError')))
      .finally(() => setIsSavingConfig(false))
  }

  const handleCheck = () => {
    if (!session) return
    setIsChecking(true)
    setCheckError(null)
    setPlan(null)
    setCheckedClean(false)
    checkForAppUpdate(session.token)
      .then((result) => {
        if (!result.ok) {
          setCheckError(result.error)
          return
        }
        if (result.updateAvailable) setPlan(result.plan)
        else setCheckedClean(true)
      })
      .catch(() => setCheckError(t('admin.settings.appUpdate.checkError')))
      .finally(() => setIsChecking(false))
  }

  const handleApply = () => {
    if (!session || !plan) return
    const warning = plan.lockfileChanged
      ? t('admin.settings.appUpdate.confirmWithDeps', { count: String(plan.changed.length) })
      : t('admin.settings.appUpdate.confirm', { count: String(plan.changed.length) })
    if (!window.confirm(warning)) return
    setCheckError(null)
    void applyAppUpdate(session.token).then((result) => {
      if (!result.ok) setCheckError(result.error ?? t('admin.settings.appUpdate.applyError'))
      else void poll()
    })
  }

  if (!session) return null

  return (
    <div className="app-update">
      <Card className="app-update__card">
        <div className="app-update__versions">
          <div>
            <TranslatedLabel id="admin.settings.appUpdate.installedLabel" />
            <strong>{installedVersion ?? '—'}</strong>
          </div>
          {config ? (
            <div>
              <TranslatedLabel id="admin.settings.appUpdate.trackingLabel" />
              <strong>
                {config.owner}/{config.repo} · {config.branch}
              </strong>
            </div>
          ) : null}
        </div>
      </Card>

      {isRunning || serverUnreachable ? (
        <UpdateProgress state={state} serverUnreachable={serverUnreachable} />
      ) : (
        <>
          <Card className="app-update__card">
            <h2>{t('admin.settings.appUpdate.tokenTitle')}</h2>
            <p className="app-update__hint">
              {t('admin.settings.appUpdate.tokenHelp')}
              <HelpTip text={t('admin.settings.appUpdate.tokenTip')} />
            </p>
            <label className="app-update__field">
              <span>{t('admin.settings.appUpdate.tokenLabel')}</span>
              <input
                type="password"
                autoComplete="off"
                value={tokenInput}
                placeholder={config?.hasToken ? `${t('admin.settings.appUpdate.tokenStored')} ${config.tokenHint ?? ''}` : t('admin.settings.appUpdate.tokenPlaceholder')}
                onChange={(event) => setTokenInput(event.target.value)}
              />
            </label>
            <label className="app-update__field">
              <span>{t('admin.settings.appUpdate.branchLabel')}</span>
              <input type="text" value={branchInput} onChange={(event) => setBranchInput(event.target.value)} />
            </label>
            <div className="app-update__actions">
              <Button variant="secondary" onClick={handleSaveConfig} disabled={isSavingConfig}>
                {isSavingConfig ? t('admin.settings.appUpdate.saving') : t('admin.common.save')}
              </Button>
              {configSaved ? <span className="app-update__saved">{t('admin.settings.appUpdate.savedLabel')}</span> : null}
            </div>
          </Card>

          <Card className="app-update__card">
            <h2>{t('admin.settings.appUpdate.checkTitle')}</h2>
            <div className="app-update__actions">
              <Button variant="secondary" onClick={handleCheck} disabled={isChecking || !config?.hasToken}>
                {isChecking ? t('admin.settings.appUpdate.checking') : t('admin.settings.appUpdate.check')}
              </Button>
              {plan ? (
                <Button variant="primary" onClick={handleApply}>
                  {t('admin.settings.appUpdate.apply')}
                </Button>
              ) : null}
            </div>
            {!config?.hasToken ? <p className="app-update__hint">{t('admin.settings.appUpdate.needsToken')}</p> : null}
            {checkError ? <Alert variant="error">{checkError}</Alert> : null}
            {checkedClean ? <Alert variant="success">{t('admin.settings.appUpdate.upToDate')}</Alert> : null}
            {plan ? <PlanSummary plan={plan} /> : null}
          </Card>

          {state && state.status !== 'running' ? <LastRun state={state} /> : null}
        </>
      )}
    </div>
  )
}

/** A label/value pair's label half — keeps the markup readable where a `TranslatedText` would nest awkwardly. */
function TranslatedLabel({ id }: { id: string }) {
  const { t } = useLanguage()
  return <span className="app-update__label">{t(id)}</span>
}

/** What a pending update would change, shown before the admin commits to it. */
function PlanSummary({ plan }: { plan: UpdatePlan }) {
  const { t } = useLanguage()
  return (
    <div className="app-update__plan">
      <p className="app-update__plan-headline">
        {t('admin.settings.appUpdate.available', { version: plan.remoteVersion, sha: plan.shortSha })}
      </p>
      <p className="app-update__commit">{plan.commitMessage}</p>
      <ul className="app-update__stats">
        <li>{t('admin.settings.appUpdate.filesChanged', { count: String(plan.changed.length) })}</li>
        {plan.removed.length ? <li>{t('admin.settings.appUpdate.filesRemoved', { count: String(plan.removed.length) })}</li> : null}
        {plan.lockfileChanged ? <li>{t('admin.settings.appUpdate.depsChanged')}</li> : null}
      </ul>
      {plan.launcherScriptsChanged.length ? (
        <Alert variant="warning" title={t('admin.settings.appUpdate.launcherTitle')}>
          {t('admin.settings.appUpdate.launcherBody', { files: plan.launcherScriptsChanged.join(', ') })}
        </Alert>
      ) : null}
      <details className="app-update__files">
        <summary>{t('admin.settings.appUpdate.showFiles')}</summary>
        <ul>
          {plan.changed.map((file) => (
            <li key={file.path}>{file.path}</li>
          ))}
        </ul>
      </details>
    </div>
  )
}

/** Live progress. Everything else on the page is hidden while this shows, so nobody navigates mid-update. */
function UpdateProgress({ state, serverUnreachable }: { state: AppUpdateState | null; serverUnreachable: boolean }) {
  const { t } = useLanguage()
  const step = serverUnreachable ? 'restarting' : (state?.step ?? 'downloading')
  const percent = serverUnreachable ? 97 : (state?.percent ?? 0)
  return (
    <Card className="app-update__card app-update__card--progress">
      <div className="app-update__progress-head">
        <Spinner size="md" />
        <h2>{t('admin.settings.appUpdate.updating')}</h2>
      </div>
      <p className="app-update__step">{t(`admin.settings.appUpdate.step.${step}`)}</p>
      <div className="app-update__bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="app-update__bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="app-update__hint">{t('admin.settings.appUpdate.doNotNavigate')}</p>
    </Card>
  )
}

/** The outcome of the previous run, including the build log when it failed — the only way to diagnose a kiosk you can't reach. */
function LastRun({ state }: { state: AppUpdateState }) {
  const { t } = useLanguage()
  if (state.status === 'succeeded') {
    return (
      <Alert variant="success" title={t('admin.settings.appUpdate.succeededTitle')}>
        {t('admin.settings.appUpdate.succeededBody', { version: state.toVersion })}
      </Alert>
    )
  }
  return (
    <Alert variant="error" title={t('admin.settings.appUpdate.failedTitle')}>
      <p>{state.error ?? t('admin.settings.appUpdate.failedBody')}</p>
      {state.logTail?.length ? (
        <details className="app-update__files">
          <summary>{t('admin.settings.appUpdate.showLog')}</summary>
          <pre className="app-update__log">{state.logTail.join('\n')}</pre>
        </details>
      ) : null}
    </Alert>
  )
}
