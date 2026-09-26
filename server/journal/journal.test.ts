// Tests for the electronic journal: chaining, signing, reloading, and that tampering is detected.
import { strict as assert } from 'node:assert'
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { JournalEntry } from '../../src/types/journal'
import { GENESIS_HASH, Journal } from './journal'
import type { SigningKey, SigningKeyStore } from './signing'

/** One key store shared by every journal in a test, like the one key file on a server. */
function keyStore(): SigningKeyStore {
  let keys: SigningKey[] = []
  return { read: () => keys, write: (next) => (keys = next), now: () => new Date('2026-09-25T12:00:00Z') }
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'journal-'))
  const keys = keyStore()
  let clock = new Date('2026-09-25T10:00:00Z')
  const open = () => {
    const journal = new Journal({ dir, keys, now: () => clock })
    return { journal, problems: journal.load() }
  }
  const tick = (ms = 1000) => (clock = new Date(clock.getTime() + ms))
  return { dir, open, tick, file: () => join(dir, readdirSync(dir)[0]) }
}

const sale = (register: number, inOre: number) => ({
  register,
  actor: 'staff-1',
  type: 'sale' as const,
  data: { orderId: `o-${inOre}` },
  amounts: { inOre, exOre: Math.round(inOre / 1.15) },
})

test('entries chain, cash transactions are signed per register, and a reload continues cleanly', () => {
  const t = setup()
  const { journal, problems } = t.open()
  assert.deepEqual(problems, [])
  const first = journal.append({ register: 1, actor: 'staff-1', type: 'signIn', data: {} })
  assert.equal(first.seq, 1)
  assert.equal(first.prevHash, GENESIS_HASH)
  assert.equal(first.signed, undefined)
  t.tick()
  const a = journal.append(sale(1, 14900))
  const b = journal.append(sale(2, 5000))
  const c = journal.append(sale(1, 3000))
  assert.equal(a.prevHash, first.hash)
  assert.deepEqual([a.signed?.nr, b.signed?.nr, c.signed?.nr], [1, 1, 2])
  assert.equal(a.signed?.transTime, '12:00:01')

  const reopened = t.open()
  assert.deepEqual(reopened.problems, [])
  const next = reopened.journal.append(sale(1, 1000))
  assert.equal(next.seq, 5)
  assert.equal(next.prevHash, c.hash)
  assert.equal(next.signed?.nr, 3)
  assert.deepEqual(t.open().problems, [])
})

test('changing an entry on disk is detected', () => {
  const t = setup()
  const { journal } = t.open()
  journal.append(sale(1, 14900))
  journal.append(sale(1, 5000))
  writeFileSync(t.file(), readFileSync(t.file(), 'utf-8').replace('"amountInOre":14900', '"amountInOre":1490'))
  const kinds = t.open().problems.map((problem) => problem.kind)
  assert.ok(kinds.includes('hash'))
  assert.ok(kinds.includes('signature'))
})

test('removing an entry is detected as a gap and a broken chain', () => {
  const t = setup()
  const { journal } = t.open()
  journal.append(sale(1, 100))
  journal.append(sale(1, 200))
  journal.append(sale(1, 300))
  const lines = readFileSync(t.file(), 'utf-8').split('\n')
  writeFileSync(t.file(), [lines[0], lines[2], ''].join('\n'))
  const kinds = t.open().problems.map((problem) => problem.kind)
  assert.ok(kinds.includes('gap'))
  assert.ok(kinds.includes('chain'))
})

test('a write cut off mid-line is reported, and the next entry still starts on its own line', () => {
  const t = setup()
  const { journal } = t.open()
  journal.append(sale(1, 100))
  appendFileSync(t.file(), '{"seq":2,"at":"2026-')
  const reopened = t.open()
  assert.deepEqual(
    reopened.problems.map((problem) => problem.kind),
    ['torn'],
  )
  const next = reopened.journal.append(sale(1, 200))
  assert.equal(next.seq, 2)
  const lines = readFileSync(t.file(), 'utf-8').trimEnd().split('\n')
  assert.equal((JSON.parse(lines[lines.length - 1]) as JournalEntry).seq, 2)
})

test('cash transactions need amounts and other events must not have them', () => {
  const t = setup()
  const { journal } = t.open()
  assert.throws(() => journal.append({ register: 1, actor: null, type: 'sale', data: {} }))
  assert.throws(() => journal.append({ register: 1, actor: null, type: 'drawerOpen', data: {}, amounts: { inOre: 1, exOre: 1 } }))
})

test('read filters by time and spans monthly files', () => {
  const t = setup()
  const { journal } = t.open()
  journal.append(sale(1, 100))
  t.tick(40 * 24 * 3600 * 1000)
  journal.append(sale(1, 200))
  assert.equal(readdirSync(t.dir).length, 2)
  assert.equal(journal.read().length, 2)
  assert.equal(journal.read(new Date('2026-10-01T00:00:00Z')).length, 1)
})

test('receipts are numbered per register and per type, and the numbering survives a reload', () => {
  const t = setup()
  const { journal } = t.open()
  const a = journal.append(sale(1, 100))
  const b = journal.append(sale(1, 200))
  const other = journal.append(sale(2, 300))
  const copy = journal.append({ register: 1, actor: 'staff-1', type: 'copy', data: { amountOre: 100 } })
  const event = journal.append({ register: 1, actor: 'staff-1', type: 'drawerOpen', data: {} })
  assert.deepEqual([a.receiptNumber, b.receiptNumber, other.receiptNumber, copy.receiptNumber, event.receiptNumber], [1, 2, 1, 1, undefined])
  const reopened = t.open()
  assert.equal(reopened.journal.append(sale(1, 400)).receiptNumber, 3)
  assert.equal(reopened.journal.get(b.seq, b.at)?.hash, b.hash)
  assert.equal(reopened.journal.get(99, b.at), undefined)
})

test('changing a receipt number on disk is detected', () => {
  const t = setup()
  const { journal } = t.open()
  journal.append(sale(1, 100))
  writeFileSync(t.file(), readFileSync(t.file(), 'utf-8').replace('"receiptNumber":1', '"receiptNumber":7'))
  assert.ok(t.open().problems.some((problem) => problem.kind === 'hash'))
})
