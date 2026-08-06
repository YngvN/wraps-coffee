// Concurrency probes for qa-report-display-pairing-2026-08-06.md's own R8/R9.
// Scratchpad-only, not part of the app.
const BASE = 'http://localhost:4000'
const TOKEN = process.argv[2]
if (!TOKEN) {
  console.error('Usage: tsx concurrency-test.mts <admin token>')
  process.exit(1)
}

async function pairingHeartbeat(machineID: string, label: string) {
  const res = await fetch(`${BASE}/display-machines/pairing-heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ machineID, label }),
  })
  return { status: res.status, body: await res.json() }
}

async function approve(machineID: string, pin: string) {
  const res = await fetch(`${BASE}/display-machines/${machineID}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ pin }),
  })
  return { status: res.status, body: await res.json() }
}

async function heartbeat(machineID: string, label: string) {
  const res = await fetch(`${BASE}/display-machines/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ machineID, label, connectionType: 'mobile', monitors: [{ id: 'device', label }] }),
  })
  return { status: res.status, body: await res.json() }
}

async function main() {
  const crypto = await import('node:crypto')

  console.log('=== R8: two simultaneous approve() calls for the SAME device+PIN ===')
  const mId = `qa-test-${crypto.randomUUID()}`
  const created = await pairingHeartbeat(mId, 'QA Test — Device M (concurrent-approve)')
  console.log('created:', created)
  const pin = (created.body as { pin: string }).pin

  const [r1, r2] = await Promise.all([approve(mId, pin), approve(mId, pin)])
  console.log('Result 1:', r1)
  console.log('Result 2:', r2)
  const statuses = [r1.status, r2.status].sort()
  console.log('Status pair:', statuses, statuses[0] === 200 && statuses[1] !== 200 ? '-> exactly one succeeded (expected)' : '-> UNEXPECTED')

  console.log('\n=== R9: approve racing a pairing-heartbeat refresh for the same device ===')
  const nId = `qa-test-${crypto.randomUUID()}`
  const created2 = await pairingHeartbeat(nId, 'QA Test — Device N (approve-vs-refresh)')
  console.log('created:', created2)
  const pin2 = (created2.body as { pin: string }).pin

  const [approveResult, refreshResult] = await Promise.all([
    approve(nId, pin2),
    pairingHeartbeat(nId, 'QA Test — Device N (approve-vs-refresh)'),
  ])
  console.log('Approve result:', approveResult)
  console.log('Concurrent refresh result:', refreshResult)

  // Regardless of which "won" the race, the end state should be internally
  // consistent: either approved (device now in admin.displayMachines) or
  // still cleanly pending — never both, never neither, never a crash.
  const postHeartbeat = await heartbeat(nId, 'QA Test — Device N (approve-vs-refresh)')
  console.log('Post-race heartbeat (mobile):', postHeartbeat)
}

main().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
