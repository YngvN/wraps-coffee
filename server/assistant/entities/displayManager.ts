import { DISPLAY_MAX_IMAGE_PX_OPTIONS, DISPLAY_RENDER_WIDTH_OPTIONS, type DisplayMachine, type DisplayMaxImagePx, type DisplayRenderWidth } from '../../../src/types/displayMachine'
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
  /** Machine-level, not per-monitor — same as `machineLabel`. See `DisplayMachine.maxImagePx`. */
  maxImagePx: DisplayMaxImagePx
  /** Machine-level, not per-monitor — same as `maxImagePx` above. See `DisplayMachine.renderWidthPx`. */
  renderWidthPx: DisplayRenderWidth
}

interface DisplayManagerFields {
  machineLabel: string | null
  assignedScreenName: string | null
  maxImagePx: string | null
  renderWidthPx: string | null
}

function findMonitor(machineID: string, monitorId: string): DisplayManagerDraft | null {
  const machine = liveMachines().find((candidate) => candidate.machineID === machineID)
  const monitor = machine?.monitors.find((candidate) => candidate.id === monitorId)
  if (!machine || !monitor) return null
  return {
    machineID,
    monitorId,
    monitorLabel: monitor.label,
    machineLabel: machine.customLabel ?? machine.label,
    assignedScreenID: monitor.assignedScreenID,
    maxImagePx: machine.maxImagePx ?? 'auto',
    renderWidthPx: machine.renderWidthPx ?? 'auto',
  }
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
 *
 * Also deliberately excludes approving a `mobile` (ADHDisplay Companion)
 * pairing request (`admin.displayPairingRequests`, `POST
 * /display-machines/:machineID/approve`) — same reasoning as "forget a
 * machine" above, just in the other direction: it's at least as
 * security-sensitive, since it's what lets a new physical device start
 * rendering real content. Approval is now a one-click, no-secret action —
 * the only real check left is a human actually looking at the pending
 * device's label/last-seen (and its on-screen `machineID` suffix) and
 * matching it against the physical box in front of them. A chat-triggered
 * approval has no way to do that visual confirmation among several pending
 * devices, so it's exactly the kind of action that stays a deliberate human
 * click, not an assistant guessing at one. No adapter for it here; stays a
 * manual-only Display Manager UI action.
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
        // Deliberately NOT in `confabulationRiskFields`: unlike `assignedScreenName`, whose valid
        // values are live screen names the model has to ground in current state, this is a small
        // fixed context-free enum — the exact case that rule carves out as safe.
        maxImagePx: nullable({
          type: 'string',
          enum: DISPLAY_MAX_IMAGE_PX_OPTIONS.map((option) => String(option)),
          description:
            'Ceiling on how large an image this display downloads and decodes, in pixels of width. "auto" lets it choose from how large the image is actually shown; a number caps it for a slower or older unit.',
        }),
        // Same "small fixed context-free enum" reasoning as `maxImagePx` above — deliberately not a
        // `confabulationRiskFields` entry.
        renderWidthPx: nullable({
          type: 'string',
          enum: DISPLAY_RENDER_WIDTH_OPTIONS.map((option) => String(option)),
          description:
            'The CSS layout width this display designs against, in pixels — not its panel resolution, and it does not change how many pixels are drawn. "auto" follows the device. Raise it when text on a busy screen renders too small or gets cut off; 1920 is the recommended tier.',
        }),
      },
      required: ['machineLabel', 'assignedScreenName', 'maxImagePx', 'renderWidthPx'],
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
    // Round-tripped through the string form the schema uses, then validated against the real option
    // list, so an out-of-range value falls back to what's already stored rather than being written.
    const requestedCap = fields.maxImagePx
    const parsedCap = requestedCap === 'auto' ? 'auto' : Number(requestedCap)
    const maxImagePx = requestedCap !== null && (DISPLAY_MAX_IMAGE_PX_OPTIONS as readonly unknown[]).includes(parsedCap) ? (parsedCap as DisplayMaxImagePx) : base.maxImagePx
    // Same round-trip-then-validate treatment as `maxImagePx` directly above.
    const requestedWidth = fields.renderWidthPx
    const parsedWidth = requestedWidth === 'auto' ? 'auto' : Number(requestedWidth)
    const renderWidthPx =
      requestedWidth !== null && (DISPLAY_RENDER_WIDTH_OPTIONS as readonly unknown[]).includes(parsedWidth) ? (parsedWidth as DisplayRenderWidth) : base.renderWidthPx
    return { ...base, machineLabel: fields.machineLabel ?? base.machineLabel, assignedScreenID, maxImagePx, renderWidthPx }
  },

  validate(): AssistantValidationIssue[] {
    return []
  },

  reviewComponent() {
    return 'existingForm'
  },
}
