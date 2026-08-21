import { Alert, Card, NavRowList, SlideTransition, Spinner, type NavRowItem } from '../../../../components'
import { useLanguage } from '../../../../i18n'
import { WEBSITE_PROVIDERS, type WebsiteProviderId } from '../../../../types/websiteProvider'
import { useConnectWebsiteFlow } from './useConnectWebsiteFlow'
import { AddressStep } from './steps/AddressStep'
import { DatabaseStep } from './steps/DatabaseStep'
import { KeysStep } from './steps/KeysStep'
import { PrerequisiteStep } from './steps/PrerequisiteStep'
import { TestStep } from './steps/TestStep'
import { ConnectionSummary } from './ConnectionSummary'
import './ConnectWebsiteView.scss'

/**
 * Guided setup for connecting this dashboard to the cafe's public website.
 *
 * Written for someone who has never heard of Postgres: one decision per
 * screen, every value this dashboard can supply already filled in and
 * copyable, plain instructions for the values it can't, and a real connection
 * test at the end that says what is wrong in words rather than leaving a sync
 * error to appear seconds later.
 *
 * This is the only place these settings are edited. The "For developers" page
 * documents the API and shows the developer key, but no longer offers a second
 * set of inputs for the same values.
 *
 * Step position lives in `useConnectWebsiteFlow`, not in the URL — see that
 * hook for why, and for how an existing setup skips straight to its summary.
 */
export function ConnectWebsiteView() {
  const { t } = useLanguage()
  const flow = useConnectWebsiteFlow()

  const providerRows: NavRowItem[] = WEBSITE_PROVIDERS.map((provider) => ({
    id: provider.id,
    label: provider.supported
      ? t(`admin.settings.website.providers.${provider.id}`)
      : t('admin.settings.website.providerUnsupported', { name: t(`admin.settings.website.providers.${provider.id}`) }),
    // An unsupported row stays visible but inert: showing what isn't possible
    // yet is more useful than implying Netlify is the only platform there is.
    onClick: () => provider.supported && flow.chooseProvider(provider.id as WebsiteProviderId),
  }))

  if (flow.isLoading) {
    return (
      <Card>
        <Spinner />
      </Card>
    )
  }

  return (
    <Card>
      {flow.error === 'load' && <Alert variant="error">{t('admin.settings.website.loadError')}</Alert>}
      {flow.error === 'save' && <Alert variant="error">{t('admin.settings.website.saveError')}</Alert>}
      {flow.error === 'test' && <Alert variant="error">{t('admin.settings.website.testError')}</Alert>}

      <SlideTransition viewKey={flow.screen} direction={flow.direction}>
        {flow.screen === 'picker' && (
          <div className="connect-website__picker">
            <p>{t('admin.settings.website.pickerIntro')}</p>
            <NavRowList items={providerRows} />
          </div>
        )}

        {flow.screen === 'prerequisite' && (
          <PrerequisiteStep stepNumber={flow.stepNumber} stepCount={flow.stepCount} onBack={flow.goBack} onNext={flow.goNext} />
        )}

        {flow.screen === 'keys' && (
          <KeysStep
            stepNumber={flow.stepNumber}
            stepCount={flow.stepCount}
            developerKey={flow.developerKey}
            isSaving={flow.isSaving}
            ensureDeveloperKey={flow.ensureDeveloperKey}
            onBack={flow.goBack}
            onNext={flow.goNext}
          />
        )}

        {flow.screen === 'database' && (
          <DatabaseStep
            stepNumber={flow.stepNumber}
            stepCount={flow.stepCount}
            savedUrl={flow.settings?.url ?? null}
            isSaving={flow.isSaving}
            saveConnectionString={flow.saveConnectionString}
            onBack={flow.goBack}
            onNext={flow.goNext}
          />
        )}

        {flow.screen === 'address' && (
          <AddressStep
            stepNumber={flow.stepNumber}
            stepCount={flow.stepCount}
            savedUrl={flow.settings?.websiteUrl ?? null}
            isSaving={flow.isSaving}
            saveWebsiteUrl={flow.saveWebsiteUrl}
            onBack={flow.goBack}
            onNext={flow.goNext}
          />
        )}

        {flow.screen === 'test' && flow.settings && (
          <TestStep
            stepNumber={flow.stepNumber}
            stepCount={flow.stepCount}
            result={flow.testResult}
            isTesting={flow.isTesting}
            runTest={flow.runTest}
            onBack={flow.goBack}
            onFinish={flow.goNext}
          />
        )}

        {flow.screen === 'summary' && flow.settings && (
          <ConnectionSummary
            settings={flow.settings}
            isSaving={flow.isSaving}
            saveSyncConfig={flow.saveSyncConfig}
            onEditStep={flow.goToStep}
            onRunTest={() => flow.goToStep('test')}
          />
        )}
      </SlideTransition>
    </Card>
  )
}
