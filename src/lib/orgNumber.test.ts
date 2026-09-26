// Tests for Norwegian organisation number validation.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { formatOrgNumber, isValidOrgNumber, normalizeOrgNumber } from './orgNumber'

test('accepts real organisation numbers, with or without spaces', () => {
  // Skatteetaten (974761076) and Brønnøysundregistrene (974760673).
  assert.equal(isValidOrgNumber('974761076'), true)
  assert.equal(isValidOrgNumber('974 760 673'), true)
})

test('rejects a wrong check digit, the wrong length and letters', () => {
  assert.equal(isValidOrgNumber('974761077'), false)
  assert.equal(isValidOrgNumber('97476107'), false)
  assert.equal(isValidOrgNumber('97476107a'), false)
})

test('normalises and formats', () => {
  assert.equal(normalizeOrgNumber('974.761 076'), '974761076')
  assert.equal(formatOrgNumber('974761076'), '974 761 076')
})
