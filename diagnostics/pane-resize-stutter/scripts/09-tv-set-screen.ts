/**
 * Points one paired display at a specific screen for the duration of a diagnostic run, then puts it
 * back. Prints the screen it replaced on every run, so the restore value is always recoverable from
 * the terminal even if the run is interrupted.
 *
 * **Why this writes the assignment and not `admin.displayScreenOverride`:** the override key looks like
 * the natural fit (it is what remote-nav uses, and Display Manager can clear it from the UI), but it is
 * delivered to the device *only* by a device-socket `effective-screen` push (`server/index.ts:2294`).
 * The heartbeat route — the companion's actual once-per-20s source of truth for which screen to show —
 * returns the raw `monitors` array straight off `admin.displayMachines` and never consults
 * `resolveEffectiveScreen` (`server/index.ts:327`). Verified against the real TV on companion 0.2.32:
 * an override wrote and persisted correctly, the hub accepted it, and the device never switched. So an
 * override-based retarget silently does nothing on any device whose device socket isn't live, which is
 * exactly the situation a diagnostic run tends to be in.
 *
 * Writing the assignment also clears any standing override for that machine as a side effect, in the
 * hub's own `admin.displayMachines` branch (spec §D1's "deliberate beats local" precedence) — so this
 * cannot leave the two disagreeing.
 *
 * Takes effect on the device's next heartbeat, so allow ~20s (`HEARTBEAT_INTERVAL_MS` in the
 * companion's own `App.tsx`) before assuming it failed.
 *
 * Args use the `=` form (`--screenId=x`), matching scripts 02/03/07 — NOT the space-separated form
 * `01-seed-screens.ts` uses. Mixing the two fails silently in both directions.
 *
 *   npx tsx diagnostics/pane-resize-stutter/scripts/09-tv-set-screen.ts --machineID=81f52ed2b76c7c0c --screenId=diag-pane-resize-imagepane
 *   npx tsx diagnostics/pane-resize-stutter/scripts/09-tv-set-screen.ts --machineID=81f52ed2b76c7c0c --screenId=screen-e202503b-c6d6-494e-a4a4-82c81f5e9991
 */
import type { DisplayMachine, DisplayScreenOverride } from '../../../src/types/displayMachine'
import { login, openSyncSession } from '../lib/seedClient'

const args = new Map<string, string>()
for (const entry of process.argv.slice(2)) {
  if (!entry.startsWith('--')) continue
  const [key, value] = entry.replace(/^--/, '').split('=')
  args.set(key, value ?? '')
}

const machineID = args.get('machineID')
const screenId = args.get('screenId')
const username = args.get('username') ?? 'admin'
const password = args.get('password') ?? '1234'

if (!machineID) throw new Error('--machineID=<id> is required (see Display Manager, or server/data/admin-displayMachines.json)')
if (!screenId) throw new Error('--screenId=<id> is required')

async function main() {
  const { token } = await login(username, password)
  const session = await openSyncSession(token, ['admin.displayMachines', 'admin.displayScreenOverride'])

  const machines = (session.snapshot['admin.displayMachines'] as DisplayMachine[] | undefined) ?? []
  const target = machines.find((machine) => machine.machineID === machineID)
  if (!target) throw new Error(`No machine ${machineID} in admin.displayMachines — is it still paired?`)

  const previousScreenId = target.monitors[0]?.assignedScreenID ?? null
  if (previousScreenId === screenId) {
    console.log(`${machineID} is already assigned to ${screenId} — nothing to do.`)
    session.close()
    return
  }

  // Every write to a synced key is a wholesale overwrite (`server/store.ts`'s `set()`), so the full
  // array has to be rebuilt here — touching only this machine's own first monitor and leaving every
  // other display, and every other field on this one, exactly as it was.
  const next = machines.map((machine) =>
    machine.machineID === machineID
      ? { ...machine, monitors: machine.monitors.map((monitor, index) => (index === 0 ? { ...monitor, assignedScreenID: screenId } : monitor)) }
      : machine,
  )

  session.write('admin.displayMachines', next)
  console.log(`Assigned ${machineID} -> ${screenId}`)
  console.log(`RESTORE WITH: --machineID=${machineID} --screenId=${previousScreenId ?? '<none>'}`)

  const overrides = (session.snapshot['admin.displayScreenOverride'] as DisplayScreenOverride[] | undefined) ?? []
  if (overrides.some((entry) => entry.machineID === machineID)) {
    console.log('(a standing screen override for this machine is cleared by the hub as a side effect of this write)')
  }
  console.log('Takes effect on the device\'s next heartbeat — allow ~20s.')

  // The write is fire-and-forget over the socket; give the hub a moment to persist it before the
  // process exits and takes the connection with it.
  await new Promise((resolve) => setTimeout(resolve, 700))
  session.close()
}

void main()
