// Tests for the register cart reducer.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { MAX_LINE_QUANTITY } from '../../../lib/registerPricing'
import { cartReducer, emptyCart } from './cartReducer'

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
