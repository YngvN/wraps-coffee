// Tests for cash register numbering.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { registerForDevice, renameRegister, type CashRegister, type CashRegisterStore } from './registers'

function memoryStore(initial: CashRegister[] = []): CashRegisterStore {
  let registers = initial
  return { read: () => registers, write: (next) => (registers = next), now: () => new Date('2026-09-25T12:00:00Z') }
}

test('a tablet gets the next number once and keeps it', () => {
  const store = memoryStore()
  assert.equal(registerForDevice(store, 'tablet-a').number, 1)
  assert.equal(registerForDevice(store, 'tablet-b').number, 2)
  assert.equal(registerForDevice(store, 'tablet-a').number, 1)
  assert.equal(store.read().length, 2)
  assert.equal(registerForDevice(store, 'tablet-a').name, 'Kasse 1')
})

test('numbers are never reused, even after a gap', () => {
  const store = memoryStore([{ deviceId: 'old', number: 3, name: 'Kasse 3', createdAt: '' }])
  assert.equal(registerForDevice(store, 'new').number, 4)
})

test('renaming trims, refuses blanks and unknown numbers', () => {
  const store = memoryStore()
  registerForDevice(store, 'tablet-a')
  assert.equal(renameRegister(store, 1, '  Disken  ')?.name, 'Disken')
  assert.equal(renameRegister(store, 1, '   '), null)
  assert.equal(renameRegister(store, 9, 'Bar'), null)
  assert.equal(registerForDevice(store, 'tablet-a').name, 'Disken')
})
