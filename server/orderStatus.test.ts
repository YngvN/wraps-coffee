// Tests for setOrderStatus / screenAllowsOrderTouch against an in-memory store.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { OrderRecord, OrderStatus } from '../src/types/order'
import type { ScreenConfig } from '../src/types/screen'
import { isOrderStatus, screenAllowsOrderTouch, screenHasRegister, setOrderStatus, type OrderKey, type OrderStatusDeps } from './orderStatus'

function order(id: string, status: OrderStatus = 'received', extra: Partial<OrderRecord> = {}): OrderRecord {
  return { id, items: [], totalPrice: 0, customerName: 'A', customerPhone: '', pickupTime: '12:00', status, createdAt: '2026-09-25T10:00:00Z', ...extra }
}

/** An in-memory store plus a log of every side effect, with a hook to run code while a platform push is in flight. */
function makeDeps(initial: Partial<Record<OrderKey, OrderRecord[]>>, options: { failPush?: boolean; duringPush?: (data: Record<OrderKey, OrderRecord[]>) => void } = {}) {
  const data: Record<OrderKey, OrderRecord[]> = { 'admin.orders': [], 'admin.woltOrders': [], 'admin.foodoraOrders': [], 'admin.registerOrders': [], ...initial }
  const log: string[] = []
  const push = (platform: string) => async (externalId: string, status: OrderStatus) => {
    log.push(`${platform}:${externalId}:${status}`)
    options.duringPush?.(data)
    if (options.failPush) throw new Error('rejected')
  }
  const deps: OrderStatusDeps = {
    readOrders: (key) => data[key],
    applyUpdate: (key, value) => {
      data[key as OrderKey] = value as OrderRecord[]
      log.push(`apply:${key}`)
    },
    pushWebsite: (key) => log.push(`neon:${key}`),
    pushWolt: push('wolt'),
    pushFoodora: push('foodora'),
  }
  return { data, log, deps }
}

test('website order: patched locally and pushed to Neon', async () => {
  const { data, log, deps } = makeDeps({ 'admin.orders': [order('a'), order('b')] })
  const result = await setOrderStatus(deps, 'b', 'preparing')
  assert.equal(result.ok, true)
  assert.deepEqual(data['admin.orders'].map((o) => o.status), ['received', 'preparing'])
  assert.deepEqual(log, ['apply:admin.orders', 'neon:admin.orders'])
})

test('wolt order: pushed with externalId before the local change', async () => {
  const { data, log, deps } = makeDeps({ 'admin.woltOrders': [order('w1', 'ready', { source: 'wolt', externalId: 'ext-9' })] })
  const result = await setOrderStatus(deps, 'w1', 'completed')
  assert.equal(result.ok, true)
  assert.deepEqual(log, ['wolt:ext-9:completed', 'apply:admin.woltOrders'])
  assert.equal(data['admin.woltOrders'][0].status, 'completed')
})

test('a rejected platform push changes nothing locally', async () => {
  const { data, log, deps } = makeDeps({ 'admin.foodoraOrders': [order('f1', 'ready', { source: 'foodora' })] }, { failPush: true })
  const result = await setOrderStatus(deps, 'f1', 'completed')
  assert.equal(result.ok, false)
  assert.equal(result.ok === false && result.reason, 'pushFailed')
  assert.equal(data['admin.foodoraOrders'][0].status, 'ready')
  assert.deepEqual(log, ['foodora:f1:completed'])
})

test('an order a poller inserts while the push is in flight survives', async () => {
  const { data, deps } = makeDeps(
    { 'admin.woltOrders': [order('w1', 'ready', { source: 'wolt' })] },
    { duringPush: (store) => (store['admin.woltOrders'] = [...store['admin.woltOrders'], order('w2', 'received', { source: 'wolt' })]) },
  )
  await setOrderStatus(deps, 'w1', 'completed')
  assert.deepEqual(
    data['admin.woltOrders'].map((o) => [o.id, o.status]),
    [
      ['w1', 'completed'],
      ['w2', 'received'],
    ],
  )
})

test('unknown id, and an id outside onlyKey, are notFound', async () => {
  const { deps } = makeDeps({ 'admin.orders': [order('a')] })
  assert.deepEqual(await setOrderStatus(deps, 'zzz', 'ready'), { ok: false, reason: 'notFound' })
  assert.deepEqual(await setOrderStatus(deps, 'a', 'ready', 'admin.woltOrders'), { ok: false, reason: 'notFound' })
})

test('isOrderStatus rejects anything outside the enum', () => {
  assert.equal(isOrderStatus('ready'), true)
  assert.equal(isOrderStatus('READY'), false)
  assert.equal(isOrderStatus(undefined), false)
  assert.equal(isOrderStatus(3), false)
})

function screenWith(content: unknown): ScreenConfig {
  return { screenID: 's', paneSlots: { p1: { content: { 1: { kind: 'time' }, 2: content } } } } as unknown as ScreenConfig
}

test('screenAllowsOrderTouch: only a staff pane with touchControl, at any stage', () => {
  assert.equal(screenAllowsOrderTouch(screenWith({ kind: 'orders', mode: 'staff', touchControl: true })), true)
  assert.equal(screenAllowsOrderTouch(screenWith({ kind: 'orders', mode: 'staff' })), false)
  assert.equal(screenAllowsOrderTouch(screenWith({ kind: 'orders', mode: 'customer', touchControl: true })), false)
  assert.equal(screenAllowsOrderTouch(screenWith(undefined)), false)
  assert.equal(screenAllowsOrderTouch(undefined), false)
})

test('register order: patched locally, never pushed anywhere', async () => {
  const { data, log, deps } = makeDeps({ 'admin.registerOrders': [order('r1', 'received', { source: 'register' })] })
  const result = await setOrderStatus(deps, 'r1', 'preparing')
  assert.equal(result.ok, true)
  assert.equal(data['admin.registerOrders'][0].status, 'preparing')
  assert.deepEqual(log, ['apply:admin.registerOrders'])
})

test('screenHasRegister: true only with a register pane at some stage', () => {
  const screen = (content: unknown) => ({ screenID: 's', paneSlots: { p1: { content: { 0: content } } } }) as unknown as ScreenConfig
  assert.equal(screenHasRegister(screen({ kind: 'register' })), true)
  assert.equal(screenHasRegister(screen({ kind: 'orders', mode: 'staff', touchControl: true })), false)
  assert.equal(screenHasRegister(undefined), false)
})
