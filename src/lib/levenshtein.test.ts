import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { levenshteinDistance } from './levenshtein'

test('identical strings have distance 0', () => {
  assert.equal(levenshteinDistance('mocha', 'mocha'), 0)
})

test('empty-string distance equals the other string length', () => {
  assert.equal(levenshteinDistance('', 'mocha'), 5)
  assert.equal(levenshteinDistance('mocha', ''), 5)
})

test('single substitution is distance 1', () => {
  assert.equal(levenshteinDistance('pizzza', 'pizza'), 1)
})

test('single insertion/deletion is distance 1', () => {
  assert.equal(levenshteinDistance('moka', 'mokka'), 1)
})

test('two edits is distance 2, not 1', () => {
  assert.equal(levenshteinDistance('kaffe', 'kaffi'), 1)
  assert.equal(levenshteinDistance('kaffe', 'kaffei'), 1)
  assert.equal(levenshteinDistance('kaffe', 'koffi'), 2)
})
