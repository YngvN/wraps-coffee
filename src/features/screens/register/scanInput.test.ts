// Tests for telling a wedge scanner's burst from typing, and for classifying what was scanned.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { EMPTY_BURST, MAX_CHAR_GAP_MS, feedKey, type BurstState } from './scanBurst'
import { classifyScan } from './scanPayload'

/** Types `text` then Enter, `gapMs` apart, returning what was scanned (if anything). */
function type(text: string, gapMs: number, enterGapMs = gapMs, start: BurstState = EMPTY_BURST): string | undefined {
  let state = start
  let at = 1000
  for (const key of text) {
    at += gapMs
    state = feedKey(state, key, at).state
  }
  return feedKey(state, 'Enter', at + enterGapMs).scanned
}

test('a fast burst ending in Enter is a scan', () => {
  assert.equal(type('5449000000996', 4), '5449000000996')
  assert.equal(type('5449000000996', 4, 400), '5449000000996') // Enter sent separately
})

test('typing speed never makes a scan', () => {
  assert.equal(type('5449000000996', MAX_CHAR_GAP_MS + 60), undefined)
  assert.equal(type('12345', 4), undefined) // too short
  assert.equal(type('5449000000996', 4, 5000), undefined) // Enter much later
})

test('shift for capitals does not break a QR burst', () => {
  let state = EMPTY_BURST
  let at = 0
  for (const key of ['Shift', 'W', 'Shift', 'R', 'A', 'P', 'S', '-', 'P', 'I', 'C', 'K', 'U', 'P', ':', 'x']) {
    at += 3
    state = feedKey(state, key, at).state
  }
  assert.equal(feedKey(state, 'Enter', at + 3).scanned, 'WRAPS-PICKUP:x')
})

test('a slow key before the burst is dropped, not prepended', () => {
  const slow = feedKey(EMPTY_BURST, '7', 0).state
  let state = slow
  let at = 5000
  for (const key of '5449000000996') {
    at += 4
    state = feedKey(state, key, at).state
  }
  assert.equal(feedKey(state, 'Enter', at + 4).scanned, '5449000000996')
})

test('classifies pickup QRs, barcodes and noise', () => {
  assert.deepEqual(classifyScan(' wraps-pickup:abc:7K3M9Q2A '), { kind: 'pickup', payload: 'wraps-pickup:abc:7K3M9Q2A' })
  assert.deepEqual(classifyScan('5449000000996'), { kind: 'barcode', code: '5449000000996' })
  assert.deepEqual(classifyScan('5449000000997'), { kind: 'unknown', raw: '5449000000997' })
  assert.deepEqual(classifyScan('https://example.com'), { kind: 'unknown', raw: 'https://example.com' })
})
