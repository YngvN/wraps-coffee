// Tests for the register cart reducer.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { MAX_LINE_QUANTITY } from '../../../lib/registerPricing'
import { cartJournalEvent, cartReducer, emptyCart } from './cartReducer'

test('adding the same product bumps its line', () => {
  let cart = emptyCart('sale-1')
  cart = cartReducer(cart, { type: 'add', productId: 'soda' })
  cart = cartReducer(cart, { type: 'add', productId: 'wrap' })
  cart = cartReducer(cart, { type: 'add', productId: 'soda' })
  assert.deepEqual(
    cart.lines.map((line) => [line.productId, line.quantity]),
    [
      ['soda', 2],
      ['wrap', 1],
    ],
  )
})

test('quantities stay between 1 and the maximum; remove is explicit', () => {
  let cart = cartReducer(emptyCart('s'), { type: 'add', productId: 'a' })
  cart = cartReducer(cart, { type: 'setQuantity', productId: 'a', quantity: 0 })
  assert.equal(cart.lines[0].quantity, 1)
  cart = cartReducer(cart, { type: 'setQuantity', productId: 'a', quantity: 500 })
  assert.equal(cart.lines[0].quantity, MAX_LINE_QUANTITY)
  assert.equal(cartReducer(cart, { type: 'add', productId: 'a' }), cart)
  cart = cartReducer(cart, { type: 'remove', productId: 'a' })
  assert.deepEqual(cart.lines, [])
})

test('a confirmed sold-out sale sticks to the line', () => {
  let cart = cartReducer(emptyCart('s'), { type: 'add', productId: 'a' })
  cart = cartReducer(cart, { type: 'add', productId: 'a', allowSoldOut: true })
  assert.equal(cart.lines[0].allowSoldOut, true)
})

test('reset starts a new sale but keeps the serving choice', () => {
  let cart = cartReducer(emptyCart('sale-1'), { type: 'setServing', serving: 'eatIn' })
  cart = cartReducer(cart, { type: 'add', productId: 'a' })
  cart = cartReducer(cart, { type: 'setCustomerName', name: 'Kari' })
  cart = cartReducer(cart, { type: 'reset', clientOrderId: 'sale-2' })
  assert.deepEqual(cart, { lines: [], serving: 'eatIn', clientOrderId: 'sale-2', customerName: '' })
})

test('cart changes the journal must record: removed or lowered lines, and clearing a full cart', () => {
  const cart = { ...emptyCart('c1'), lines: [{ productId: 'wrap', quantity: 3 }] }
  assert.deepEqual(cartJournalEvent(cart, { type: 'setQuantity', productId: 'wrap', quantity: 1 }), {
    kind: 'lineCorrection',
    correction: 'decreased',
    lines: [{ productId: 'wrap', quantity: 2 }],
    serving: 'takeaway',
  })
  assert.deepEqual(cartJournalEvent(cart, { type: 'remove', productId: 'wrap' })?.lines, [{ productId: 'wrap', quantity: 3 }])
  assert.equal(cartJournalEvent(cart, { type: 'setQuantity', productId: 'wrap', quantity: 0 })?.kind === 'lineCorrection', true)
  assert.equal(cartJournalEvent(cart, { type: 'setQuantity', productId: 'wrap', quantity: 4 }), null)
  assert.equal(cartJournalEvent(cart, { type: 'add', productId: 'wrap' }), null)
  assert.deepEqual(cartJournalEvent(cart, { type: 'clear' })?.kind, 'void')
  assert.equal(cartJournalEvent(emptyCart('c2'), { type: 'clear' }), null)
})
