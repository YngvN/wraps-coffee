import { useEffect, useState } from 'react'
import { Button, Checkbox } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useLanguage } from '../../../i18n'
import { getFoodoraCredentials, getWoltCredentials, setFoodoraCredentials, setWoltCredentials } from '../../../lib/localServer'
import type { FoodoraCredentials, WoltCredentials } from '../../../types/delivery'
import './TestingSettingsView.scss'

/**
 * Per-integration testing toggles — one independent block per
 * delivery-platform integration, each with its own "Use development
 * environment" checkbox, which picks which of that platform's two base URLs
 * its own adapter (`server/woltAdapter.ts`/`server/foodoraAdapter.ts`)
 * calls. Each block loads/saves the same credentials object as that
 * integration's own card on the Integrations page (`ExtensionsView.tsx`) —
 * this page only ever edits `useDevelopmentEnvironment`, carrying
 * `venueId`/`apiKey` through unchanged, same posture as those cards
 * carrying this flag through unchanged the other way. `admin`/`subadmin`
 * only, reached from Settings → Testing.
 *
 * Foodora's own block has no real hostnames to show yet (no confirmed base
 * URL exists — see `foodoraAdapter.ts`), so its hint text says so instead
 * of naming a development/production host like Wolt's does.
 */
export function TestingSettingsView() {
  const { t } = useLanguage()
  const { session } = useAdminSession()

  const [woltCredentials, setWoltCredentialsState] = useState<WoltCredentials | null>(null)
  const [isLoadingWolt, setIsLoadingWolt] = useState(true)
  const [isSavingWolt, setIsSavingWolt] = useState(false)
  const [woltError, setWoltError] = useState<string | null>(null)
  const [woltSaved, setWoltSaved] = useState(false)

  const [foodoraCredentials, setFoodoraCredentialsState] = useState<FoodoraCredentials | null>(null)
  const [isLoadingFoodora, setIsLoadingFoodora] = useState(true)
  const [isSavingFoodora, setIsSavingFoodora] = useState(false)
  const [foodoraError, setFoodoraError] = useState<string | null>(null)
  const [foodoraSaved, setFoodoraSaved] = useState(false)

  useEffect(() => {
    if (!session) return
    getWoltCredentials(session.token)
      .then(setWoltCredentialsState)
      .catch(() => setWoltError(t('admin.settings.testing.loadError')))
      .finally(() => setIsLoadingWolt(false))
  }, [session, t])

  useEffect(() => {
    if (!session) return
    getFoodoraCredentials(session.token)
      .then(setFoodoraCredentialsState)
      .catch(() => setFoodoraError(t('admin.settings.testing.loadError')))
      .finally(() => setIsLoadingFoodora(false))
  }, [session, t])

  const handleSaveWolt = () => {
    if (!session || !woltCredentials) return
    setIsSavingWolt(true)
    setWoltError(null)
    setWoltSaved(false)
    setWoltCredentials(session.token, woltCredentials)
      .then((saved) => {
        setWoltCredentialsState(saved)
        setWoltSaved(true)
      })
      .catch(() => setWoltError(t('admin.settings.testing.saveError')))
      .finally(() => setIsSavingWolt(false))
  }

  const handleSaveFoodora = () => {
    if (!session || !foodoraCredentials) return
    setIsSavingFoodora(true)
    setFoodoraError(null)
    setFoodoraSaved(false)
    setFoodoraCredentials(session.token, foodoraCredentials)
      .then((saved) => {
        setFoodoraCredentialsState(saved)
        setFoodoraSaved(true)
      })
      .catch(() => setFoodoraError(t('admin.settings.testing.saveError')))
      .finally(() => setIsSavingFoodora(false))
  }

  return (
    <div className="testing-settings">
      {isLoadingWolt || !woltCredentials ? (
        <p>{woltError ?? t('admin.settings.testing.loading')}</p>
      ) : (
        <div className="testing-settings__integration">
          <h2>{t('admin.settings.testing.woltTitle')}</h2>
          <Checkbox
            id="testing-wolt-use-development-environment"
            label={t('admin.settings.testing.woltCheckboxLabel')}
            checked={woltCredentials.useDevelopmentEnvironment}
            onChange={(event) => {
              setWoltSaved(false)
              setWoltCredentialsState({ ...woltCredentials, useDevelopmentEnvironment: event.target.checked })
            }}
          />
          <p className="testing-settings__hint">{t(woltCredentials.useDevelopmentEnvironment ? 'admin.settings.testing.woltDevelopmentHint' : 'admin.settings.testing.woltProductionHint')}</p>
          {woltError && <p className="testing-settings__error">{woltError}</p>}
          <Button onClick={handleSaveWolt} disabled={isSavingWolt}>
            {t('admin.common.save')}
          </Button>
          {woltSaved && <span className="testing-settings__saved">{t('admin.settings.testing.saved')}</span>}
        </div>
      )}

      {isLoadingFoodora || !foodoraCredentials ? (
        <p>{foodoraError ?? t('admin.settings.testing.loading')}</p>
      ) : (
        <div className="testing-settings__integration">
          <h2>{t('admin.settings.testing.foodoraTitle')}</h2>
          <Checkbox
            id="testing-foodora-use-development-environment"
            label={t('admin.settings.testing.foodoraCheckboxLabel')}
            checked={foodoraCredentials.useDevelopmentEnvironment}
            onChange={(event) => {
              setFoodoraSaved(false)
              setFoodoraCredentialsState({ ...foodoraCredentials, useDevelopmentEnvironment: event.target.checked })
            }}
          />
          <p className="testing-settings__hint">{t('admin.settings.testing.foodoraNoUrlHint')}</p>
          {foodoraError && <p className="testing-settings__error">{foodoraError}</p>}
          <Button onClick={handleSaveFoodora} disabled={isSavingFoodora}>
            {t('admin.common.save')}
          </Button>
          {foodoraSaved && <span className="testing-settings__saved">{t('admin.settings.testing.saved')}</span>}
        </div>
      )}
    </div>
  )
}
