// Tests for the register PIN hash and the per-tablet unlock tokens.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { LOCKOUT_MS, MAX_FAILED_ATTEMPTS, UNLOCK_ABSOLUTE_MS, UNLOCK_IDLE_MS, UnlockManager, hashPin, isValidPin, verifyPin } from './unlock'

const record = hashPin('4321')

function clock() {
  const state = { now: 1_000_000 }
  return { state, now: () => state.now }
}

test('PIN shape and hashing', () => {
  assert.equal(isValidPin('1234'), true)
  assert.equal(isValidPin('123456'), true)
  assert.equal(isValidPin('123'), false)
  assert.equal(isValidPin('12a4'), false)
  assert.equal(isValidPin(1234), false)
  assert.equal(verifyPin('4321', record), true)
  assert.equal(verifyPin('4322', record), false)
  assert.notEqual(hashPin('4321').salt, record.salt)
})

test('no PIN set means nothing unlocks', () => {
  assert.deepEqual(new UnlockManager().attempt('tab', '4321', null), { ok: false, reason: 'noPin' })
})

test('a token works only for its own tablet', () => {
  const manager = new UnlockManager()
  const result = manager.attempt('tab', '4321', record)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(manager.check('tab', result.token), true)
  assert.equal(manager.check('other', result.token), false)
  assert.equal(manager.check('tab', 'wrong'), false)
  manager.lock('tab')
  assert.equal(manager.check('tab', result.token), false)
})

test('tokens expire when idle and after the absolute limit, even when used', () => {
  const { state, now } = clock()
  const manager = new UnlockManager(now)
  const first = manager.attempt('tab', '4321', record)
  if (!first.ok) throw new Error('expected unlock')
  state.now += UNLOCK_IDLE_MS + 1
  assert.equal(manager.check('tab', first.token), false)

  const second = manager.attempt('tab', '4321', record)
  if (!second.ok) throw new Error('expected unlock')
  for (let used = 0; used < UNLOCK_ABSOLUTE_MS; used += UNLOCK_IDLE_MS / 2) {
    state.now += UNLOCK_IDLE_MS / 2
    if (used + UNLOCK_IDLE_MS / 2 < UNLOCK_ABSOLUTE_MS) assert.equal(manager.check('tab', second.token), true)
  }
  state.now += 1
  assert.equal(manager.check('tab', second.token), false)
})

test('too many wrong PINs lock the tablet out, then it can try again', () => {
  const { state, now } = clock()
  const manager = new UnlockManager(now)
  for (let attempt = 1; attempt < MAX_FAILED_ATTEMPTS; attempt++) assert.equal(manager.attempt('tab', '0000', record).ok === false && 'wrongPin', 'wrongPin')
  const locked = manager.attempt('tab', '0000', record)
  assert.equal(locked.ok === false && locked.reason, 'lockedOut')
  const stillLocked = manager.attempt('tab', '4321', record)
  assert.equal(stillLocked.ok === false && stillLocked.reason, 'lockedOut')
  assert.equal(manager.attempt('other', '4321', record).ok, true)
  state.now += LOCKOUT_MS + 1
  const wrongAgain = manager.attempt('tab', '0000', record)
  assert.equal(wrongAgain.ok === false && wrongAgain.reason, 'wrongPin')
  assert.equal(manager.attempt('tab', '4321', record).ok, true)
})

test('lockAll ends every unlock', () => {
  const manager = new UnlockManager()
  const result = manager.attempt('tab', '4321', record)
  if (!result.ok) throw new Error('expected unlock')
  manager.lockAll()
  assert.equal(manager.check('tab', result.token), false)
})
