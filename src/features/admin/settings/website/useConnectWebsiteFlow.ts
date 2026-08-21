import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAdminSession } from '../../../../hooks/useAdminSession'
import { getDeveloperKey, getNeonUrl, regenerateDeveloperKey, setNeonUrl, testWebsiteConnection, type NeonSettings } from '../../../../lib/localServer'
import { DEFAULT_NEON_SYNC_CONFIG, type NeonSyncConfig } from '../../../../types/sync'
import { findWebsiteProvider, type WebsiteConnectionTestResult, type WebsiteProviderId, type WebsiteSetupStepId } from '../../../../types/websiteProvider'

/**
 * State and navigation for the guided "Connect to website" setup.
 *
 * Kept out of the view so the step components stay presentational, and so the
 * one genuinely fiddly rule — *where the flow should open* — lives in a single
 * readable place (`firstIncompleteStep`).
 *
 * **Step position is local state, not a route.** Each step is a transient
 * position inside one task rather than a destination worth bookmarking, and
 * the browser's Back button should leave the setup rather than walk backwards
 * through it. Resuming is handled by opening on the first step that isn't
 * already satisfied, which covers re-entry better than a URL would: the flow
 * reflects what is actually saved, not where someone happened to stop.
 */

/** What the flow is currently showing. `'picker'` and `'summary'` bookend the provider's own steps. */
export type ConnectWebsiteScreen = 'picker' | 'summary' | WebsiteSetupStepId

interface ConnectWebsiteFlow {
  screen: ConnectWebsiteScreen
  /** `1` when moving forward, `-1` when going back — drives `SlideTransition`. */
  direction: 1 | -1
  provider: WebsiteProviderId | null
  settings: NeonSettings | null
  developerKey: string | null
  isLoading: boolean
  isSaving: boolean
  isTesting: boolean
  testResult: WebsiteConnectionTestResult | null
  error: string | null
  /** Position within the chosen provider's steps, for the "Step 2 of 5" indicator. */
  stepNumber: number
  stepCount: number
  chooseProvider: (id: WebsiteProviderId) => void
  goNext: () => void
  goBack: () => void
  /** Jumps straight to a step from the summary, so a single value can be corrected without re-walking the flow. */
  goToStep: (step: ConnectWebsiteScreen) => void
  ensureDeveloperKey: () => Promise<void>
  saveConnectionString: (value: string) => Promise<void>
  saveWebsiteUrl: (value: string) => Promise<void>
  saveSyncConfig: (config: NeonSyncConfig) => Promise<void>
  runTest: () => Promise<void>
}

/**
 * The step a returning user should land on.
 *
 * Walks the provider's own steps in order and stops at the first one whose
 * value isn't saved yet. `prerequisite` is skipped when anything at all has
 * been configured — having a connection string is proof the site exists, so
 * asking again would be busywork. `address` is optional, so it never blocks;
 * only a missing connection string can hold the flow back.
 */
function firstIncompleteStep(steps: WebsiteSetupStepId[], settings: NeonSettings | null, developerKey: string | null): ConnectWebsiteScreen {
  const hasConnection = Boolean(settings?.url)
  if (hasConnection) return 'summary'

  for (const step of steps) {
    if (step === 'prerequisite') continue
    if (step === 'keys' && !developerKey) return 'keys'
    if (step === 'database') return 'database'
  }

  return steps[0] ?? 'summary'
}

/** Drives the guided website setup. Call once, from `ConnectWebsiteView`. */
export function useConnectWebsiteFlow(): ConnectWebsiteFlow {
  const { session } = useAdminSession()

  const [screen, setScreen] = useState<ConnectWebsiteScreen>('picker')
  const [direction, setDirection] = useState<1 | -1>(1)
  const [provider, setProvider] = useState<WebsiteProviderId | null>(null)
  const [settings, setSettings] = useState<NeonSettings | null>(null)
  const [developerKey, setDeveloperKey] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<WebsiteConnectionTestResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const steps = useMemo(() => (provider ? (findWebsiteProvider(provider)?.steps ?? []) : []), [provider])

  useEffect(() => {
    if (!session) return
    let active = true

    Promise.all([getNeonUrl(session.token), getDeveloperKey(session.token)])
      .then(([loadedSettings, key]) => {
        if (!active) return
        setSettings(loadedSettings)
        setDeveloperKey(key)

        // An existing connection means the provider question is already
        // answered in practice, so skip straight to the summary rather than
        // asking someone to re-pick what they evidently chose before.
        if (loadedSettings.url) {
          setProvider('netlify')
          setScreen('summary')
        }
      })
      .catch(() => {
        if (active) setError('load')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [session])

  const chooseProvider = useCallback(
    (id: WebsiteProviderId) => {
      const chosen = findWebsiteProvider(id)
      if (!chosen?.supported) return
      setProvider(id)
      setDirection(1)
      setScreen(firstIncompleteStep(chosen.steps, settings, developerKey))
    },
    [settings, developerKey],
  )

  const goToStep = useCallback((step: ConnectWebsiteScreen) => {
    setDirection(1)
    setScreen(step)
  }, [])

  const goNext = useCallback(() => {
    setDirection(1)
    setScreen((current) => {
      const index = steps.indexOf(current as WebsiteSetupStepId)
      if (index === -1 || index === steps.length - 1) return 'summary'
      return steps[index + 1]
    })
  }, [steps])

  const goBack = useCallback(() => {
    setDirection(-1)
    setScreen((current) => {
      if (current === 'summary') return steps[steps.length - 1] ?? 'picker'
      const index = steps.indexOf(current as WebsiteSetupStepId)
      if (index <= 0) return 'picker'
      return steps[index - 1]
    })
  }, [steps])

  /** Wraps a save so every call site gets the same in-flight flag and error handling. */
  const runSave = useCallback(
    async (save: () => Promise<NeonSettings>) => {
      if (!session) return
      setIsSaving(true)
      setError(null)
      try {
        setSettings(await save())
      } catch {
        setError('save')
      } finally {
        setIsSaving(false)
      }
    },
    [session],
  )

  const ensureDeveloperKey = useCallback(async () => {
    if (!session || developerKey) return
    setIsSaving(true)
    setError(null)
    try {
      setDeveloperKey(await regenerateDeveloperKey(session.token))
    } catch {
      setError('save')
    } finally {
      setIsSaving(false)
    }
  }, [session, developerKey])

  const saveConnectionString = useCallback(
    (value: string) => runSave(() => setNeonUrl(session!.token, { url: value.trim() || null })),
    [runSave, session],
  )

  const saveWebsiteUrl = useCallback(
    (value: string) => runSave(() => setNeonUrl(session!.token, { websiteUrl: value.trim() || null })),
    [runSave, session],
  )

  const saveSyncConfig = useCallback((config: NeonSyncConfig) => runSave(() => setNeonUrl(session!.token, { sync: config })), [runSave, session])

  const runTest = useCallback(async () => {
    if (!session) return
    setIsTesting(true)
    setError(null)
    try {
      setTestResult(await testWebsiteConnection(session.token))
    } catch {
      setError('test')
    } finally {
      setIsTesting(false)
    }
  }, [session])

  const stepIndex = steps.indexOf(screen as WebsiteSetupStepId)

  return {
    screen,
    direction,
    provider,
    settings,
    developerKey,
    isLoading,
    isSaving,
    isTesting,
    testResult,
    error,
    stepNumber: stepIndex === -1 ? 0 : stepIndex + 1,
    stepCount: steps.length,
    chooseProvider,
    goNext,
    goBack,
    goToStep,
    ensureDeveloperKey,
    saveConnectionString,
    saveWebsiteUrl,
    saveSyncConfig,
    // `settings` may be null before the first load resolves; the summary
    // renders a loading state until then, so callers never see a stale sync
    // config.
    runTest,
  }
}

/** The sync config to show while settings are still loading. */
export const FALLBACK_SYNC_CONFIG: NeonSyncConfig = DEFAULT_NEON_SYNC_CONFIG
