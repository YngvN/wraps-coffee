import { useCallback, useEffect, useState } from 'react'
import type { DisplayUpdateProgress } from '../../../types/displayMachine'

const BATCH_SIZE = 3

/** `targetUpdateId` for a Tier 1 (OTA) push, `targetVersionCode` for a Tier 2/3 (APK) push — see `DisplayUpdateProgress`'s own doc comment for why exactly one is ever set. */
export type QueuedUpdate = { machineID: string; targetUpdateId: string } | { machineID: string; targetVersionCode: number }

interface BulkUpdateRunnerState {
  queue: QueuedUpdate[]
  currentBatch: QueuedUpdate[]
  failed: string[]
}

/**
 * "Update all" staging (Update Channel spec §5.6) — batches of `BATCH_SIZE`,
 * the next batch only starting once every machine in the current one has
 * either confirmed (its own `DisplayUpdateProgress` entry disappears — see
 * `mergeDisplayMachineHeartbeat` in `server/index.ts`) or failed, aborting
 * the whole run on the first `update-failed`. Each queued machine carries
 * its own target (`targetUpdateId` or `targetVersionCode`, see
 * `QueuedUpdate`) rather than one shared value for the whole run — a fleet
 * can have displays on more than one `runtimeVersion` or update tier at
 * once, each with its own "current" bundle/build to resolve against.
 *
 * New code, no existing concurrency-limiter elsewhere in this codebase to
 * reuse — updating every screen in a venue simultaneously means a bad
 * release takes the whole site dark at once, staging turns that into one
 * dark screen and a stopped rollout.
 *
 * Kept local to `displayManager/` (feature-specific batching semantics),
 * not generalized into `src/lib/` — see this plan's own note on why this
 * differs from `src/lib/uploadManager.ts`'s module-store pattern: progress
 * here is genuinely server-authoritative (a synced key every admin tab
 * already sees), so there's no need for a parallel client-local store, just
 * this batching state machine layered on top of it.
 */
export function useBulkUpdateRunner(progress: DisplayUpdateProgress[], startUpdatesFor: (entries: QueuedUpdate[]) => void) {
  const [state, setState] = useState<BulkUpdateRunnerState | null>(null)

  const startBulkUpdate = useCallback(
    (entries: QueuedUpdate[]) => {
      if (entries.length === 0) return
      const currentBatch = entries.slice(0, BATCH_SIZE)
      setState({ queue: entries.slice(BATCH_SIZE), currentBatch, failed: [] })
      startUpdatesFor(currentBatch)
    },
    [startUpdatesFor],
  )

  const abortBulkUpdate = useCallback(() => setState(null), [])

  useEffect(() => {
    if (!state || state.currentBatch.length === 0) return

    const stillInFlight = state.currentBatch.filter(({ machineID }) =>
      progress.some((entry) => entry.machineID === machineID && entry.status !== 'update-failed'),
    )
    const justFailed = state.currentBatch
      .map(({ machineID }) => machineID)
      .filter((machineID) => progress.some((entry) => entry.machineID === machineID && entry.status === 'update-failed'))

    if (justFailed.length > 0) {
      // Abort on the first failure, per spec §5.6 — the failed machine's own badge (via its
      // still-present `update-failed` DisplayUpdateProgress entry) stays visible; this only stops
      // the *queue* from advancing to further batches. `queueMicrotask` here, not a plain
      // synchronous call, per this codebase's own `react-hooks/set-state-in-effect` rule (see
      // CLAUDE.md's "Deep-linkable admin views" section for the same fix elsewhere).
      queueMicrotask(() => setState((current) => (current ? { queue: [], currentBatch: [], failed: [...current.failed, ...justFailed] } : current)))
      return
    }
    if (stillInFlight.length > 0) return // batch still in flight — wait for the next progress update

    if (state.queue.length === 0) {
      queueMicrotask(() => setState(null)) // every batch confirmed, run complete
      return
    }
    const nextBatch = state.queue.slice(0, BATCH_SIZE)
    const remainingQueue = state.queue.slice(BATCH_SIZE)
    const { failed } = state
    queueMicrotask(() => setState({ queue: remainingQueue, currentBatch: nextBatch, failed }))
    startUpdatesFor(nextBatch)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `state`/`startUpdatesFor` are read fresh each run but intentionally not re-triggering this effect on their own; only a `progress` change (a heartbeat clearing an entry, or the failure sweep marking one) should ever advance the queue.
  }, [progress])

  const running = state !== null && (state.currentBatch.length > 0 || state.queue.length > 0)
  return { running, failedMachineIDs: state?.failed ?? [], startBulkUpdate, abortBulkUpdate }
}
