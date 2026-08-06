// Removes the one remaining test artifact this QA cycle couldn't clean up through
// any in-app action (there's no "reject/cancel a pending pairing request" button,
// only "approve" or letting it expire after PIN_TTL_MS) — device B's still-pending
// entry in admin.displayPairingRequests. Goes through the real generic synced-key
// WS `write` path (not a direct file edit) so the server's own in-memory state and
// on-disk file stay consistent, exactly like a real admin action would.
import WebSocket from 'ws'

const TOKEN = process.argv[2]
if (!TOKEN) {
  console.error('Usage: tsx cleanup-pending-b.mts <admin token>')
  process.exit(1)
}

const socket = new WebSocket('ws://localhost:4000')

socket.on('open', () => {
  socket.send(JSON.stringify({ type: 'hello', keys: ['admin.displayPairingRequests'] }))
})

socket.on('message', (raw) => {
  const message = JSON.parse(raw.toString())
  if (message.type !== 'snapshot') return
  const current = message.state?.['admin.displayPairingRequests']?.value ?? []
  const before = current.length
  const filtered = current.filter((request: { machineID: string }) => !request.machineID.startsWith('qa-test-'))
  console.log(`Pending requests before: ${before}, after stripping qa-test- entries: ${filtered.length}`)
  socket.send(JSON.stringify({ type: 'write', key: 'admin.displayPairingRequests', value: filtered, token: TOKEN }))
  setTimeout(() => {
    socket.close()
    process.exit(0)
  }, 500)
})

socket.on('error', (error) => {
  console.error('WS error', error)
  process.exit(1)
})
