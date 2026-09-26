// Tests for reading training mode from the journal.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { JournalEntry } from '../../src/types/journal'
import { trainingActive } from './training'

const entry = (seq: number, register: number, type: string) => ({ seq, register, type }) as JournalEntry

test('training mode follows the register’s latest switch, per register', () => {
  assert.equal(trainingActive([], 1), false)
  const entries = [entry(1, 1, 'trainingOn'), entry(2, 2, 'trainingOn'), entry(3, 1, 'sale'), entry(4, 2, 'trainingOff')]
  assert.equal(trainingActive(entries, 1), true)
  assert.equal(trainingActive(entries, 2), false)
  assert.equal(trainingActive([...entries, entry(5, 1, 'trainingOff')], 1), false)
})
