// Tests for the barcode catalogue's entries and remembered misses.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { BarcodeEntry } from '../../src/types/barcode'
import { BarcodeCatalogue, MISS_TTL_MS, type CatalogueFile } from './catalogueStore'

function memoryIO(initial: CatalogueFile = { entries: {}, misses: {} }) {
  const state = { file: structuredClone(initial), reads: 0, writes: 0 }
  return {
    state,
    io: {
      read: () => {
        state.reads++
        return structuredClone(state.file)
      },
      write: (file: CatalogueFile) => {
        state.writes++
        state.file = structuredClone(file)
      },
    },
  }
}

const entry: BarcodeEntry = {
  barcode: '5449000000996',
  source: 'openFoodFacts',
  name: { no: 'Coca-Cola', en: 'Coca-Cola' },
  allergens: [],
  allergensToCheck: [],
  updatedAt: '2026-09-25T10:00:00Z',
}

test('entries persist, and saving one forgets its miss', () => {
  const { state, io } = memoryIO()
  const catalogue = new BarcodeCatalogue(io)
  catalogue.rememberMiss(entry.barcode)
  assert.equal(catalogue.isRememberedMiss(entry.barcode), true)
  catalogue.put(entry)
  assert.equal(catalogue.isRememberedMiss(entry.barcode), false)
  assert.deepEqual(state.file.entries[entry.barcode], entry)
  assert.deepEqual(new BarcodeCatalogue(io).get(entry.barcode), entry)
})

test('misses are remembered for a week, then forgotten', () => {
  const clock = { now: Date.parse('2026-09-25T10:00:00Z') }
  const { state, io } = memoryIO()
  const catalogue = new BarcodeCatalogue(io, () => clock.now)
  catalogue.rememberMiss('96385074')
  clock.now += MISS_TTL_MS - 1
  assert.equal(catalogue.isRememberedMiss('96385074'), true)
  clock.now += 2
  assert.equal(catalogue.isRememberedMiss('96385074'), false)
  assert.equal(state.file.misses['96385074'], undefined)
})

test('the file is read only once', () => {
  const { state, io } = memoryIO({ entries: { [entry.barcode]: entry }, misses: {} })
  const catalogue = new BarcodeCatalogue(io)
  catalogue.get(entry.barcode)
  catalogue.get('x')
  catalogue.isRememberedMiss('x')
  assert.equal(state.reads, 1)
  assert.equal(state.writes, 0)
})
