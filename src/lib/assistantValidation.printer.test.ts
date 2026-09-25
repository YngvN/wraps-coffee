// Tests for validatePrinterDraft — what the AI assistant (and its review form) accepts for a receipt printer.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { PrinterDraft } from '../types/printer'
import { validatePrinterDraft } from './assistantValidation'

const network: PrinterDraft = { id: 'p', name: 'Kjøkken', transport: 'network', host: '192.168.0.60', paperWidthMm: 80, isDefault: false }
const codes = (draft: PrinterDraft) => validatePrinterDraft(draft).map((issue) => issue.code)

test('a complete network or queue printer passes', () => {
  assert.deepEqual(codes(network), [])
  assert.deepEqual(codes({ ...network, port: 9100 }), [])
  assert.deepEqual(codes({ id: 'q', name: 'Disk', transport: 'system', systemName: 'EPSON_TM_T20III', paperWidthMm: 58, isDefault: true }), [])
})

test('each missing or invalid field is reported', () => {
  assert.deepEqual(codes({ ...network, name: '  ' }), ['nameRequired'])
  assert.deepEqual(codes({ ...network, host: undefined }), ['printerAddressRequired'])
  assert.deepEqual(codes({ ...network, port: 70000 }), ['printerPortInvalid'])
  assert.deepEqual(codes({ ...network, port: 91.5 }), ['printerPortInvalid'])
  assert.deepEqual(codes({ ...network, paperWidthMm: 72 as 80 }), ['printerPaperWidthInvalid'])
  assert.deepEqual(codes({ ...network, transport: 'system', host: undefined }), ['printerQueueRequired'])
})
