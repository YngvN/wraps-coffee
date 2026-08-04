import type { DisplayMachine } from '../../../src/types/displayMachine'
import type { ScreenConfig } from '../../../src/types/screen'
import * as store from '../../store'
import { nullable, type AssistantCandidate, type AssistantEntity, type AssistantFillContext, type AssistantJsonSchema, type AssistantValidationIssue } from '../types'

/** Sentinel enum value standing in for "no screen assigned" — `assignedScreenID` itself is `string | null`, but a JSON Schema `enum` can't mix real screen names with a bare `null`, so this is spelled out as its own choice instead (see `messageBoard.ts`'s own precedent for a similarly-opaque-id field, just with human-readable names instead of raw ids here since a screen's own `screenID` is a random opaque string the model has no way to type from a name alone). */
const UNASSIGN_SENTINEL = '(unassigned)'

function liveMachines(): DisplayMachine[] {
  return (store.get('admin.displayMachines')?.value as DisplayMachine[] | undefined) ?? []
}

function liveScreens(): ScreenConfig[] {
  return (store.get('admin.screens')?.value as ScreenConfig[] | undefined) ?? []
}

/** One `(machineID, monitor.id)` pair, not one per machine — a machine can have multiple independently-assignable monitors. `machineLabel` renames the whole parent machine (see `handleLabelChange` in `DisplayManagerView.tsx` — it isn't itself per-monitor), while `assignedScreenID` is this one monitor's own. */
export interface DisplayManagerDraft {
  machineID: string
  monitorId: string
  monitorLabel: string
  machineLabel: string
  assignedScreenID: string | null
}

interface DisplayManagerFields {
  machineLabel: string | null
  assignedScreenName: string | null
}

function findMonitor(machineID: string, monitorId: string): DisplayManagerDraft | null {
  const machine = liveMachines().find((candidate) => candidate.machineID === machineID)
  const monitor = machine?.monitors.find((candidate) => candidate.id === monitorId)
  if (!machine || !monitor) return null
  return { machineID, monitorId, monitorLabel: monitor.label, machineLabel: machine.customLabel ?? machine.label, assignedScreenID: monitor.assignedScreenID }
}

/**
 * Rename a machine, or assign a screen to one of its monitors — `update`
 * only, matching `DisplayManagerView.tsx`'s own two real capabilities
 * (`handleLabelChange`/`handleAssign`). Deliberately excludes "forget a
 * machine" (`handleRemove`): it isn't a plain data delete — it also signals
 * a still-live kiosk window to close itself first — so a wrong chat-
 * triggered "forget" could disconnect a live display. Left out for this
 * pass; a candidate for a future `trigger` action once there's a stronger
 * confirmation path designed for it.
 */
export const displayManagerEntity: AssistantEntity<DisplayManagerDraft> = {
  key: 'displayManager',
  supportedActions: ['update'],
  section: 'displaymanager',
  // Confirmed via real testing: asked only to rename the machine, qwen3:8b fabricated a screen
  // reassignment nobody asked for anyway (it changed a monitor's real current assignment to a
  // different real screen name, not even a plausible-looking guess — a genuine confabulation).
  // This is the same standing risk as `settings.hiddenSidebarItems`/`screen.textSizes` (see those
  // files' own comments and the QA template's Methodology #15), just on a single enum-of-live-names
  // field this time rather than a full compound object/array — broadening that rule further: ANY
  // field whose valid values are grounded in live current-state context (not a fixed, small,
  // context-free enum) is a confabulation-risk candidate, not just full-replacement fields.
  confabulationRiskFields: ['assignedScreenName'],

  fillFieldsSchema(_action, _context: AssistantFillContext, knownDraft?: Partial<DisplayManagerDraft>): AssistantJsonSchema {
    const screenNames = liveScreens().map((screen) => screen.name)
    return {
      type: 'object',
      properties: {
        machineLabel: nullable({ type: 'string', description: "This machine's own display name (renames every monitor on it at once — a machine, not a single monitor, has one label)." }),
        assignedScreenName: nullable({
          type: 'string',
          enum: [...screenNames, UNASSIGN_SENTINEL],
          description: `Which screen this one monitor${knownDraft?.monitorLabel ? ` ("${knownDraft.monitorLabel}")` : ''} shows, by its exact name — or "${UNASSIGN_SENTINEL}" to unassign it (it falls back to the standby screensaver instead).`,
        }),
      },
      required: ['machineLabel', 'assignedScreenName'],
      additionalProperties: false,
    }
  },

  async listCandidates(_action, _context: AssistantFillContext, searchText: string): Promise<AssistantCandidate[]> {
    const needle = searchText.trim().toLowerCase()
    const rows: AssistantCandidate[] = []
    for (const machine of liveMachines()) {
      const machineLabel = machine.customLabel ?? machine.label
      for (const monitor of machine.monitors) {
        const label = `${machineLabel} — ${monitor.label}`
        if (!needle || label.toLowerCase().includes(needle)) rows.push({ id: `${machine.machineID}::${monitor.id}`, label })
      }
    }
    return rows.slice(0, 30)
  },

  async getCurrent(id: string): Promise<DisplayManagerDraft | null> {
    const [machineID, monitorId] = id.split('::')
    return findMonitor(machineID, monitorId)
  },

  // `current` is never null in practice — `supportedActions` has no `create`, so this is only ever
  // called for `update`, which always has a real fetched `getCurrent()` result behind it.
  mergeDraft(_action, current, rawFields): DisplayManagerDraft {
    const fields = rawFields as DisplayManagerFields
    const base = current as DisplayManagerDraft
    let assignedScreenID = base.assignedScreenID
    if (fields.assignedScreenName === UNASSIGN_SENTINEL) assignedScreenID = null
    else if (fields.assignedScreenName) assignedScreenID = liveScreens().find((screen) => screen.name === fields.assignedScreenName)?.screenID ?? assignedScreenID
    return { ...base, machineLabel: fields.machineLabel ?? base.machineLabel, assignedScreenID }
  },

  validate(): AssistantValidationIssue[] {
    return []
  },

  reviewComponent() {
    return 'existingForm'
  },
}
