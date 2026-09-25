// Tests for GTIN check-digit validation.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { isValidGtin, normalizeGtin } from './gtin'

test('accepts real codes of every supported length', () => {
  assert.equal(isValidGtin('5449000000996'), true) // Coca-Cola 330 ml, EAN-13
  assert.equal(isValidGtin('96385074'), true) // EAN-8
  assert.equal(isValidGtin('036000291452'), true) // UPC-A
  assert.equal(isValidGtin('15449000000993'), true) // GTIN-14
})

test('rejects a wrong check digit, wrong lengths and non-digits', () => {
  assert.equal(isValidGtin('5449000000997'), false)
  assert.equal(isValidGtin('544900000099'), false)
  assert.equal(isValidGtin('54490000009960'), false)
  assert.equal(isValidGtin('544900000099a'), false)
  assert.equal(isValidGtin(''), false)
})

test('normalizeGtin trims and validates', () => {
  assert.equal(normalizeGtin(' 5449000000996\n'), '5449000000996')
  assert.equal(normalizeGtin('WRAPS-PICKUP:x:y'), null)
})
