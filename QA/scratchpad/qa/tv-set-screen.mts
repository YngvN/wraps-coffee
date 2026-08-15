/**
 * Scratchpad-only helper — not part of the app. Points the paired Android TV companion at a given
 * screen id by writing an `admin.displayScreenOverride` entry over the local server's own sync
 * WebSocket (the same write the admin dashboard's Remote Screen Navigation makes), so a TV test run
 * can switch fixtures without driving the dashboard UI.
 *
 * Usage: npx tsx QA/scratchpad/qa/tv-set-screen.mts <screenId> [machineID]
 */
import { WebSocket } from 'ws'

const WS_ORIGIN = process.env.QA_WS_ORIGIN ?? 'http://localhost:4000'
/** The paired Xiaomi Mi TV Stick's own machine id (see `server/data/admin-displayMachines.json`). */
const DEFAULT_MACHINE_ID = '81f52ed2b76c7c0c'

async function login(): Promise<string> {
  const res = await fetch(`${WS_ORIGIN}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: '1234' }),
  })
  if (!res.ok) throw new Error(`login failed: ${res.status}`)
  return ((await res.json()) as { token: string }).token
}

async function main() {
  const screenId = process.argv[2]
  const machineID = process.argv[3] ?? DEFAULT_MACHINE_ID
  if (!screenId) throw new Error('usage: tv-set-screen.mts <screenId> [machineID]')

  const token = await login()
  const socket = new WebSocket(WS_ORIGIN.replace(/^http/, 'ws'))

  await new Promise<void>((resolve, reject) => {
    socket.on('error', reject)
    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'hello', keys: ['admin.displayScreenOverride'] }))
    })
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString()) as { type: string; state?: Record<string, { value: unknown }>; key?: string; value?: unknown }
      if (message.type === 'snapshot') {
        const current = (message.state?.['admin.displayScreenOverride']?.value as { machineID: string; screenId: string; setAt: string }[] | undefined) ?? []
        const next = [...current.filter((entry) => entry.machineID !== machineID), { machineID, screenId, setAt: new Date().toISOString() }]
        socket.send(JSON.stringify({ type: 'write', key: 'admin.displayScreenOverride', value: next, token }))
        return
      }
      if (message.type === 'update' && message.key === 'admin.displayScreenOverride') {
        console.log(`[tv-set-screen] ${machineID} -> ${screenId}`)
        socket.close()
        resolve()
      }
    })
    setTimeout(() => reject(new Error('timed out waiting for the write to echo back')), 15000)
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
