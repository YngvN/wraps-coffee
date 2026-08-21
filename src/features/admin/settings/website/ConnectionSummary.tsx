import { Button, Checkbox, NumberInput } from '../../../../components'
import { useLanguage } from '../../../../i18n'
import type { NeonSettings } from '../../../../lib/localServer'
import { MAX_POLL_INTERVAL_SECONDS, MIN_POLL_INTERVAL_SECONDS, type NeonSyncConfig } from '../../../../types/sync'
import type { ConnectWebsiteScreen } from './useConnectWebsiteFlow'

interface ConnectionSummaryProps {
  settings: NeonSettings
  isSaving: boolean
  saveSyncConfig: (config: NeonSyncConfig) => Promise<void>
  onEditStep: (step: ConnectWebsiteScreen) => void
  onRunTest: () => void
}

/** Hides the password segment of a connection string, leaving enough to recognise which database it points at. */
function maskConnectionString(url: string): string {
  return url.replace(/:\/\/([^:/@]+):([^@]+)@/, '://$1:••••••••@')
}

/**
 * What a configured connection looks like: what is set, what it does, and a
 * way to change any single part without walking the whole flow again.
 *
 * This is where the setup lands once complete, and where a returning user
 * arrives instead of being asked questions they already answered. It also
 * holds the update-speed choice, which is a genuine preference rather than a
 * setup step — nobody needs to decide it while first connecting, but it should
 * be adjustable afterwards.
 */
export function ConnectionSummary({ settings, isSaving, saveSyncConfig, onEditStep, onRunTest }: ConnectionSummaryProps) {
  const { t } = useLanguage()
  const { sync } = settings

  const update = (patch: Partial<NeonSyncConfig>) => void saveSyncConfig({ ...sync, ...patch })

  return (
    <section className="connection-summary">
      <p className="connection-summary__lead">{t('admin.settings.website.summary.connected')}</p>

      <dl className="connection-summary__facts">
        <div>
          <dt>{t('admin.settings.website.summary.databaseLabel')}</dt>
          <dd>
            <code>{settings.url ? maskConnectionString(settings.url) : t('admin.settings.website.summary.notSet')}</code>
            <Button type="button" variant="secondary" onClick={() => onEditStep('database')}>
              {t('admin.common.edit')}
            </Button>
          </dd>
        </div>
        <div>
          <dt>{t('admin.settings.website.summary.addressLabel')}</dt>
          <dd>
            <code>{settings.websiteUrl ?? t('admin.settings.website.summary.notSet')}</code>
            <Button type="button" variant="secondary" onClick={() => onEditStep('address')}>
              {t('admin.common.edit')}
            </Button>
          </dd>
        </div>
      </dl>

      <h4>{t('admin.settings.website.summary.speedTitle')}</h4>
      <p className="setup-step__hint">{t('admin.settings.website.summary.speedIntro')}</p>

      <NumberInput
        label={t('admin.settings.website.summary.intervalLabel')}
        value={sync.pollIntervalSeconds}
        min={MIN_POLL_INTERVAL_SECONDS}
        max={MAX_POLL_INTERVAL_SECONDS}
        step={30}
        disabled={isSaving}
        onChange={(seconds) => update({ pollIntervalSeconds: seconds })}
      />
      <Checkbox
        label={t('admin.settings.website.summary.openingHoursLabel')}
        checked={sync.pollOnlyDuringOpeningHours}
        disabled={isSaving}
        onChange={(event) => update({ pollOnlyDuringOpeningHours: event.target.checked })}
      />
      <p className="setup-step__hint">{t('admin.settings.website.summary.openingHoursHint')}</p>

      <div className="setup-step__actions">
        <Button type="button" variant="secondary" onClick={onRunTest}>
          {t('admin.settings.website.summary.testAgain')}
        </Button>
      </div>
    </section>
  )
}
