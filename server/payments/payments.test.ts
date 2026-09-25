// Tests for the payment scaffolding: the Vipps request/state mapping, the stubs' refusals, and intents.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { OrderRecord } from '../../src/types/order'
import { EMPTY_CREDENTIALS, parseCredentials, type VippsCredentials } from './credentials'
import { PaymentIntents, INTENT_TTL_MS } from './intents'
import { offeredProviders, type PaymentProvider } from './types'
import { buildCreatePaymentBody, createVippsProvider, mapVippsState } from './vippsAdapter'
import { createZettleProvider } from './zettleAdapter'

test('the Vipps create body uses the confirmed in-person QR fields, amount in øre', () => {
  assert.deepEqual(buildCreatePaymentBody({ reference: 'ref-1', amountMinor: 14900, currency: 'NOK', description: 'Wraps K3' }), {
    amount: { value: 14900, currency: 'NOK' },
    paymentMethod: { type: 'WALLET' },
    reference: 'ref-1',
    userFlow: 'QR',
    customerInteraction: 'CUSTOMER_PRESENT',
    paymentDescription: 'Wraps K3',
  })
})

test('Vipps states map onto ours', () => {
  assert.equal(mapVippsState('CREATED'), 'pending')
  assert.equal(mapVippsState('AUTHORIZED'), 'authorized')
  assert.equal(mapVippsState('ABORTED'), 'cancelled')
  assert.equal(mapVippsState('EXPIRED'), 'expired')
  assert.equal(mapVippsState('TERMINATED'), 'cancelled')
  assert.equal(mapVippsState('SOMETHING_NEW'), 'pending')
})

test('unconfigured providers refuse, and configured ones say they are not implemented', async () => {
  const empty = createVippsProvider(() => EMPTY_CREDENTIALS.vipps)
  assert.equal(empty.isConfigured(), false)
  await assert.rejects(empty.start({ reference: 'r', amountMinor: 1, currency: 'NOK', description: '' }), /not configured/)
  const filled: VippsCredentials = { clientId: 'a', clientSecret: 'b', subscriptionKey: 'c', merchantSerialNumber: 'd', useDevelopmentEnvironment: true }
  const vipps = createVippsProvider(() => filled)
  assert.equal(vipps.isConfigured(), true)
  await assert.rejects(vipps.status('r'), /not implemented yet/)

  const zettle = createZettleProvider(() => ({ clientId: 'app', useDevelopmentEnvironment: true }))
  assert.deepEqual(await zettle.start({ reference: 'r', amountMinor: 1, currency: 'NOK', description: '' }), { kind: 'device', action: 'zettle-charge' })
  await assert.rejects(createZettleProvider(() => EMPTY_CREDENTIALS.zettle).start({ reference: 'r', amountMinor: 1, currency: 'NOK', description: '' }), /not configured/)
})

test('only configured and live providers are offered — saved keys alone never replace manual payment', () => {
  const filled: VippsCredentials = { clientId: 'a', clientSecret: 'b', subscriptionKey: 'c', merchantSerialNumber: 'd', useDevelopmentEnvironment: true }
  assert.deepEqual(offeredProviders([createVippsProvider(() => filled), createZettleProvider(() => ({ clientId: 'x', useDevelopmentEnvironment: true }))]), [])
  assert.deepEqual(
    offeredProviders([fakeProvider, { ...fakeProvider, isConfigured: () => false }]).map((provider) => provider.id),
    ['vipps'],
  )
})

test('parseCredentials trims strings, blanks to null, and only keeps known fields', () => {
  assert.deepEqual(parseCredentials({ clientId: ' id ', clientSecret: '', extra: 'x', useDevelopmentEnvironment: 'yes' }, EMPTY_CREDENTIALS.vipps), {
    clientId: 'id',
    clientSecret: null,
    subscriptionKey: null,
    merchantSerialNumber: null,
    useDevelopmentEnvironment: false,
  })
})

const fakeProvider: PaymentProvider = {
  id: 'vipps',
  method: 'vipps',
  isConfigured: () => true,
  live: true,
  start: async () => ({ kind: 'qr', qrUrl: 'https://qr' }),
  status: async () => 'pending',
  cancel: async () => {},
  refund: async () => {},
}

const cart = { items: [], totalPrice: 149, servedAtCounter: [], status: 'received' as const }
const checkout = { clientOrderId: 'c1', lines: [], serving: 'takeaway' as const, expectedTotal: 149 }

test('an intent creates its order once, only when paid, and only its own tablet sees it', async () => {
  const intents = new PaymentIntents()
  const intent = await intents.start(fakeProvider, 'tab', checkout, cart, 'K1')
  assert.equal(intents.get(intent.id, 'other'), undefined)
  let created = 0
  const onPaid = () => {
    created++
    return { id: 'order-1' } as OrderRecord
  }
  intents.settle(intent, 'pending', onPaid)
  assert.equal(created, 0)
  intents.settle(intent, 'authorized', onPaid)
  intents.settle(intent, 'captured', onPaid)
  assert.equal(created, 1)
  assert.equal(intents.get(intent.id, 'tab')?.order?.id, 'order-1')
})

test('a cancelled intent stays cancelled, and old intents are forgotten', async () => {
  const clock = { now: 0 }
  const intents = new PaymentIntents(() => clock.now)
  const intent = await intents.start(fakeProvider, 'tab', checkout, cart, 'K1')
  intents.settle(intent, 'cancelled', () => undefined)
  intents.settle(intent, 'authorized', () => ({ id: 'late' }) as OrderRecord)
  assert.equal(intent.state, 'cancelled')
  assert.equal(intent.order, undefined)
  clock.now = INTENT_TTL_MS + 1
  assert.equal(intents.get(intent.id, 'tab'), undefined)
})
