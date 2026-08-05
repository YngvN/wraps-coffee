import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { fold } from './textFold'

// The exact cross-spelling vector table from the resolution-ladder spec — a
// stored name and a Norwegian/English/Italian query variant must fold to
// the same string.
const VECTORS: [string, string][] = [
  ['mokka', 'moka'],
  ['Mocha', 'moka'],
  ['kaffe latte', 'kafelate'],
  ['Caffè Latte', 'kafelate'],
  ['amerikano', 'amerikano'],
  ['Americano', 'amerikano'],
  ['makkiato', 'makiato'],
  ['Macchiato', 'makiato'],
  ['cæsar', 'kaesar'],
  ['Caesar', 'kaesar'],
  ['kortado', 'kortado'],
  ['Cortado', 'kortado'],
  ['espresso', 'espreso'],
  ['Espresso', 'espreso'],
  ['tzatziki', 'tsatsiki'],
  ['Tzatziki', 'tsatsiki'],
]

for (const [input, expected] of VECTORS) {
  test(`fold(${JSON.stringify(input)}) === ${JSON.stringify(expected)}`, () => {
    assert.equal(fold(input), expected)
  })
}

test('is idempotent', () => {
  for (const [input] of VECTORS) assert.equal(fold(fold(input)), fold(input))
})

test('never leaves whitespace or punctuation', () => {
  assert.equal(fold('  Café  Latte!! '), 'kafelate')
})
