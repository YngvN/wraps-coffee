// Tests for the register's legal-details readiness check.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { EMPTY_LEGAL_DETAILS, missingLegalDetails } from './storeLegal'

test('everything is missing without legal details', () => {
  assert.deepEqual(missingLegalDetails({}), ['companyName', 'orgNumber', 'streetAddress', 'postalCode', 'city'])
  assert.deepEqual(missingLegalDetails(null), ['companyName', 'orgNumber', 'streetAddress', 'postalCode', 'city'])
})

test('complete details pass; a bad org number or postal code does not', () => {
  const legal = { ...EMPTY_LEGAL_DETAILS, companyName: 'Wraps AS', orgNumber: '974 761 076', streetAddress: 'Ulvenveien 1', postalCode: '0581', city: 'Oslo' }
  assert.deepEqual(missingLegalDetails({ legal }), [])
  assert.deepEqual(missingLegalDetails({ legal: { ...legal, orgNumber: '974761077' } }), ['orgNumber'])
  assert.deepEqual(missingLegalDetails({ legal: { ...legal, postalCode: '581' } }), ['postalCode'])
})
