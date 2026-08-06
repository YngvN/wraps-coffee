// Strips every "qa-test-" prefixed entry from admin.displayPairingRequests via the real
// generic synced-key WS `write` path (not a direct file edit), so server memory and disk
// stay consistent. Scratchpad-only, not part of the app.
import WebSocket from 'ws'

const TOKEN = process.argv[2]
if (!TOKEN) {
  console.error('Usage: tsx cleanup-all-pending.mts <admin token>')
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
  if (before > filtered.length) {
    const removed = current.filter((request: { machineID: string }) => request.machineID.startsWith('qa-test-'))
    for (const r of removed) console.log('  removing:', r.label, r.machineID)
  }
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
