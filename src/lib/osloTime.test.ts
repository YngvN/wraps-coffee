// Tests for Norwegian time, across daylight saving and a UTC day boundary.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { osloDate, osloTime } from './osloTime'

test('summer time is UTC+2, so 22:30 UTC is already the next Oslo day', () => {
  const date = new Date('2026-07-01T22:30:05Z')
  assert.equal(osloDate(date), '2026-07-02')
  assert.equal(osloTime(date), '00:30:05')
})

test('winter time is UTC+1', () => {
  const date = new Date('2026-01-15T11:00:00Z')
  assert.equal(osloDate(date), '2026-01-15')
  assert.equal(osloTime(date), '12:00:00')
})

test('the spring-forward night skips 02:00–03:00', () => {
  // DST starts 2026-03-29 at 01:00 UTC.
  assert.equal(osloTime(new Date('2026-03-29T00:59:59Z')), '01:59:59')
  assert.equal(osloTime(new Date('2026-03-29T01:00:00Z')), '03:00:00')
})
