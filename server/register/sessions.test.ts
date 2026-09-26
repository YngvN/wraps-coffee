// Tests for staff sign-in: the daily PIN, name taps, idle logout, the day boundary and the lockout.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { hashPin } from './pinHash'
import { StaffSessions, MAX_FAILED_ATTEMPTS } from './sessions'
import type { StaffMember } from './staff'

const kari: StaffMember = { id: 'kari', name: 'Kari', employeeNumber: '1', role: 'staff', active: true, pin: hashPin('1234'), createdAt: '' }

function setup(start = '2026-09-25T08:00:00Z') {
  let clock = new Date(start)
  const sessions = new StaffSessions(() => clock)
  const at = (iso: string) => (clock = new Date(iso))
  const tick = (ms: number) => (clock = new Date(clock.getTime() + ms))
  const signIn = (pin?: string, extra: Partial<{ register: number; pinEveryTime: boolean; idleMinutes: number; member: StaffMember }> = {}) =>
    sessions.signIn({
      deviceId: 'tab',
      register: extra.register ?? 1,
      member: extra.member ?? kari,
      pin,
      pinEveryTime: extra.pinEveryTime ?? false,
      idleMinutes: extra.idleMinutes ?? 2,
    })
  return { sessions, at, tick, signIn }
}

test('the PIN is needed once per day per register; after that a name tap is enough', () => {
  const t = setup()
  assert.deepEqual(t.signIn(), { ok: false, reason: 'pinRequired' })
  const first = t.signIn('1234')
  assert.equal(first.ok && first.method, 'pin')
  const tap = t.signIn()
  assert.equal(tap.ok && tap.method, 'tap')
  // Another register still needs the PIN today.
  assert.deepEqual(t.signIn(undefined, { register: 2 }), { ok: false, reason: 'pinRequired' })
})

test('the PIN resets at Oslo midnight, not UTC midnight', () => {
  const t = setup('2026-09-25T20:00:00Z')
  t.signIn('1234')
  t.at('2026-09-25T21:30:00Z') // 23:30 in Oslo
  assert.equal(t.signIn().ok, true)
  t.at('2026-09-25T22:30:00Z') // 00:30 the next day in Oslo
  assert.deepEqual(t.signIn(), { ok: false, reason: 'pinRequired' })
})

test('"PIN every time" always asks', () => {
  const t = setup()
  t.signIn('1234')
  assert.deepEqual(t.signIn(undefined, { pinEveryTime: true }), { ok: false, reason: 'pinRequired' })
})

test('a session ends after its idle time, and the idle time is capped at 10 minutes', () => {
  const t = setup()
  const result = t.signIn('1234', { idleMinutes: 60 })
  assert.equal(result.ok, true)
  if (!result.ok) return
  const token = result.session.token
  t.tick(9 * 60_000)
  assert.ok(t.sessions.check('tab', token))
  t.tick(10 * 60_000 + 1)
  const ended: string[] = []
  assert.equal(
    t.sessions.check('tab', token, (_session, reason) => ended.push(reason)),
    null,
  )
  assert.deepEqual(ended, ['idle'])
})

test('use keeps a session alive; a wrong token never matches', () => {
  const t = setup()
  const result = t.signIn('1234', { idleMinutes: 2 })
  if (!result.ok) return assert.fail()
  for (let i = 0; i < 5; i++) {
    t.tick(90_000)
    assert.ok(t.sessions.check('tab', result.session.token))
  }
  assert.equal(t.sessions.check('tab', 'x'.repeat(48)), null)
})

test('five wrong PINs lock the tablet out', () => {
  const t = setup()
  for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) assert.deepEqual(t.signIn('0000'), { ok: false, reason: 'wrongPin' })
  const locked = t.signIn('0000')
  assert.equal(!locked.ok && locked.reason, 'lockedOut')
  assert.equal(!t.signIn('1234').ok, true)
  t.tick(5 * 60_000 + 1)
  assert.equal(t.signIn('1234').ok, true)
})

test('inactive staff and an admin change end things', () => {
  const t = setup()
  assert.deepEqual(t.signIn('1234', { member: { ...kari, active: false } }), { ok: false, reason: 'inactive' })
  const result = t.signIn('1234')
  if (!result.ok) return assert.fail()
  assert.equal(t.sessions.endAllFor('kari').length, 1)
  assert.equal(t.sessions.check('tab', result.session.token), null)
  assert.deepEqual(t.signIn(), { ok: false, reason: 'pinRequired' })
})

test('the previous person on the tablet is reported, to spot a cart takeover', () => {
  const t = setup()
  const ola: StaffMember = { ...kari, id: 'ola', name: 'Ola' }
  const first = t.signIn('1234')
  assert.equal(first.ok && first.previousStaffId, null)
  const second = t.signIn('1234', { member: ola })
  assert.equal(second.ok && second.previousStaffId, 'kari')
})
