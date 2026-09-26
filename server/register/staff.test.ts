// Tests for the register staff list.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { verifyPin } from './pinHash'
import { createStaff, toSummary, updateStaff, type StaffMember, type StaffStore } from './staff'

function memoryStore(): StaffStore {
  let staff: StaffMember[] = []
  let id = 0
  return { read: () => staff, write: (next) => (staff = next), now: () => new Date('2026-09-25T12:00:00Z'), newId: () => `s${++id}` }
}

test('creating staff hashes the PIN and numbers them', () => {
  const store = memoryStore()
  const kari = createStaff(store, { name: ' Kari ', pin: '1234' })
  assert.equal(kari.ok, true)
  if (!kari.ok) return
  assert.equal(kari.member.name, 'Kari')
  assert.equal(kari.member.employeeNumber, '1')
  assert.equal(kari.member.role, 'staff')
  assert.ok(kari.member.pin && verifyPin('1234', kari.member.pin))
  assert.equal(JSON.stringify(toSummary(kari.member)).includes('hash'), false)
  const ola = createStaff(store, { name: 'Ola', pin: '9999', role: 'manager' })
  assert.equal(ola.ok && ola.member.employeeNumber, '2')
})

test('refuses bad input', () => {
  const store = memoryStore()
  assert.deepEqual(createStaff(store, { name: '', pin: '1234' }), { ok: false, reason: 'noName' })
  assert.deepEqual(createStaff(store, { name: 'A', pin: '123' }), { ok: false, reason: 'badPin' })
  assert.deepEqual(createStaff(store, { name: 'A', pin: '12345' }), { ok: false, reason: 'badPin' })
  assert.deepEqual(createStaff(store, { name: 'A', pin: '1234', role: 'owner' }), { ok: false, reason: 'badRole' })
  createStaff(store, { name: 'A', pin: '1234', employeeNumber: '7' })
  assert.deepEqual(createStaff(store, { name: 'B', pin: '1234', employeeNumber: '7' }), { ok: false, reason: 'duplicateEmployeeNumber' })
})

test('updating changes only what is given and can deactivate', () => {
  const store = memoryStore()
  const created = createStaff(store, { name: 'Kari', pin: '1234' })
  if (!created.ok) return assert.fail()
  const updated = updateStaff(store, created.member.id, { active: false, pin: '4321' })
  assert.equal(updated.ok, true)
  if (!updated.ok) return
  assert.equal(updated.member.active, false)
  assert.equal(updated.member.name, 'Kari')
  assert.ok(updated.member.pin && verifyPin('4321', updated.member.pin))
  assert.deepEqual(updateStaff(store, 'nobody', { name: 'X' }), { ok: false, reason: 'unknownStaff' })
})
