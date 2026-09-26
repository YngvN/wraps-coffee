// Tests for the register's VAT rules and rounding.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { toOre, vatBreakdown, vatOfGross, vatRatePercent } from './vat'

test('food is 15 % taken away and 25 % eaten in; standard is always 25 %; exempt is 0', () => {
  assert.equal(vatRatePercent(undefined, 'takeaway'), 15)
  assert.equal(vatRatePercent('food', 'eatIn'), 25)
  assert.equal(vatRatePercent('standard', 'takeaway'), 25)
  assert.equal(vatRatePercent('exempt', 'eatIn'), 0)
})

test('VAT inside a gross price, in øre', () => {
  // 149 kr at 15 %: 14900 × 15 / 115 = 1943.48 → 1943
  assert.equal(vatOfGross(toOre(149), 15), 1943)
  // 50 kr at 25 %: exactly 10 kr
  assert.equal(vatOfGross(toOre(50), 25), 1000)
  assert.equal(vatOfGross(toOre(50), 0), 0)
})

test('breakdown groups by rate, highest first, and basis + VAT equals gross', () => {
  const lines = vatBreakdown([
    { grossOre: 14900, ratePercent: 15 },
    { grossOre: 5000, ratePercent: 25 },
    { grossOre: 8900, ratePercent: 15 },
  ])
  assert.deepEqual(
    lines.map((line) => [line.ratePercent, line.grossOre]),
    [
      [25, 5000],
      [15, 23800],
    ],
  )
  for (const line of lines) assert.equal(line.basisOre + line.vatOre, line.grossOre)
  // 238 kr at 15 %: 23800 × 15 / 115 = 3104.35 → 3104
  assert.equal(lines[1].vatOre, 3104)
})

test('kroner to øre rounds away float noise', () => {
  assert.equal(toOre(19.9), 1990)
  assert.equal(toOre(0.1 + 0.2), 30)
})

test('a return rounds its VAT like the sale, so the two cancel out', () => {
  // 13900 × 25 / 125 = 2780 exactly; 14950 × 15 / 115 = 1950 exactly; 99 × 15 / 115 = 12.91 → 13
  for (const [gross, rate] of [
    [13900, 25],
    [14950, 15],
    [99, 15],
  ]) {
    assert.equal(vatOfGross(-gross, rate), -vatOfGross(gross, rate))
  }
})
