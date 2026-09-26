// Tests for X/Z reports built from a fixture journal.
import { strict as assert } from 'node:assert'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Journal } from '../journal/journal'
import type { SigningKey } from '../journal/signing'
import { buildRegisterReport } from './reports'

function journal() {
  let keys: SigningKey[] = []
  const j = new Journal({
    dir: mkdtempSync(join(tmpdir(), 'reports-')),
    keys: { read: () => keys, write: (next) => (keys = next), now: () => new Date() },
    now: () => new Date('2026-09-25T12:00:00Z'),
  })
  j.load()
  return j
}

const line = (quantity: number, unitPriceOre: number, vatRate: number, group = { id: 'wraps', name: 'Wraps' }) => ({
  itemID: group.id,
  name: 'x',
  quantity,
  unitPriceOre,
  vatRate,
  group,
})

function sale(j: Journal, register: number, actor: string, method: string, lines: ReturnType<typeof line>[]) {
  const total = lines.reduce((sum, l) => sum + l.unitPriceOre * l.quantity, 0)
  j.append({ register, actor, type: 'sale', data: { lines, payments: [{ method, amountOre: total }], totalOre: total }, amounts: { inOre: total, exOre: total } })
}

test('a period adds up: sales by group, payment and operator, returns, VAT, counts and expected cash', () => {
  const j = journal()
  j.append({ register: 1, actor: 'kari', type: 'float', data: { amountOre: 50000 } })
  sale(j, 1, 'kari', 'cash', [line(2, 14900, 15)])
  sale(j, 1, 'ola', 'card', [line(1, 9900, 25, { id: 'merch', name: 'Merch' })])
  sale(j, 2, 'per', 'cash', [line(1, 100000, 15)]) // another register: not in register 1's report
  j.append({
    register: 1,
    actor: 'ola',
    type: 'return',
    data: { lines: [line(1, 14900, 15)], payments: [{ method: 'cash', amountOre: -14900 }], totalOre: -14900 },
    amounts: { inOre: -14900, exOre: -12957 },
  })
  j.append({ register: 1, actor: 'kari', type: 'copy', data: { amountOre: 9900 } })
  j.append({ register: 1, actor: 'kari', type: 'proForma', data: { amountOre: 29800 } })
  j.append({ register: 1, actor: 'kari', type: 'void', data: { amountOre: 18900 } })
  j.append({ register: 1, actor: 'kari', type: 'lineCorrection', data: { correction: 'removed', amountOre: 5000 } })
  j.append({ register: 1, actor: 'kari', type: 'lineCorrection', data: { correction: 'decreased', amountOre: 4000 } })
  j.append({ register: 1, actor: 'kari', type: 'drawerOpen', data: {} })
  j.append({ register: 1, actor: 'kari', type: 'drawerOpen', data: {} })

  const report = buildRegisterReport(j.read(), 1, 'X', new Date('2026-09-25T20:00:00Z'))
  assert.deepEqual(report.sales, { count: 2, amountOre: 39700 })
  assert.deepEqual(report.returns, { count: 1, amountOre: -14900 })
  assert.equal(report.netOre, 24800)
  assert.deepEqual(
    report.byGroup.map((g) => [g.id, g.count, g.amountOre]),
    [
      ['wraps', 2, 29800],
      ['merch', 1, 9900],
    ],
  )
  assert.deepEqual(
    report.byPayment.map((p) => [p.method, p.count, p.amountOre]),
    [
      ['cash', 2, 29800 - 14900],
      ['card', 1, 9900],
    ],
  )
  assert.deepEqual(
    report.byOperator.map((o) => [o.staffId, o.amountOre]),
    [
      ['kari', 29800],
      ['ola', 9900],
    ],
  )
  // VAT on sales minus returns: 14900 at 15 % and 9900 at 25 %
  assert.deepEqual(
    report.vat.map((v) => [v.ratePercent, v.grossOre, v.vatOre]),
    [
      [25, 9900, 1980],
      [15, 14900, 1943],
    ],
  )
  assert.equal(report.floatOre, 50000)
  assert.equal(report.expectedCashOre, 50000 + 29800 - 14900)
  assert.deepEqual(report.copies, { count: 1, amountOre: 9900 })
  assert.deepEqual(report.proFormas, { count: 1, amountOre: 29800 })
  assert.deepEqual(report.voids, { count: 1, amountOre: 18900 })
  assert.deepEqual(report.lineCorrections, { removed: { count: 1, amountOre: 5000 }, decreased: { count: 1, amountOre: 4000 } })
  assert.equal(report.drawerOpenings, 2)
  assert.equal(report.zNumber, undefined)
  assert.deepEqual(report.grandTotal, { salesOre: 39700, returnsOre: -14900, netOre: 24800 })
})

test('a Z report numbers itself and closes the period; grand totals carry on', () => {
  const j = journal()
  sale(j, 1, 'kari', 'cash', [line(1, 10000, 15)])
  const first = buildRegisterReport(j.read(), 1, 'Z', new Date())
  assert.equal(first.zNumber, 1)
  j.append({ register: 1, actor: 'kari', type: 'zReport', data: { number: 1 } })
  sale(j, 1, 'kari', 'card', [line(1, 5000, 15)])
  const second = buildRegisterReport(j.read(), 1, 'Z', new Date())
  assert.equal(second.zNumber, 2)
  assert.deepEqual(second.sales, { count: 1, amountOre: 5000 })
  assert.ok(second.from)
  assert.deepEqual(second.grandTotal, { salesOre: 15000, returnsOre: 0, netOre: 15000 })
  // The float belongs to a period: none has been counted since the Z.
  assert.equal(second.floatOre, null)
})
