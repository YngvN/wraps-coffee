// Tests for which language receipts print in.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { resolveReceiptLanguage } from './receiptLanguage'

test('receipts are Norwegian unless the store chose another language', () => {
  assert.equal(resolveReceiptLanguage(undefined), 'no')
  assert.equal(resolveReceiptLanguage({}), 'no')
  assert.equal(resolveReceiptLanguage({ receiptLanguage: 'en' }), 'en')
  assert.equal(resolveReceiptLanguage({ receiptLanguage: 'xx' as never }), 'no')
})
