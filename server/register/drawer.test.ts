// Tests for when a sale may open the cash drawer, which printer is pulsed, and the pulse itself.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { buildDrawerKick, decodeEscPos } from '../../src/lib/receipt'
import type { OrderRecord } from '../../src/types/order'
import type { ConfiguredPrinter, PrinterSettings } from '../../src/types/printer'
import { SALE_DRAWER_WINDOW_MS, drawerPrinter, saleDrawerRefusal } from './drawer'

const now = Date.parse('2026-09-25T18:00:00Z')
const sale = (extra: Partial<OrderRecord> = {}): OrderRecord => ({
  id: 's1',
  source: 'register',
  items: [],
  totalPrice: 35,
  customerName: '',
  customerPhone: '',
  pickupTime: '',
  status: 'completed',
  createdAt: new Date(now - 10_000).toISOString(),
  payment: { method: 'cash', amount: 35, paidAt: new Date(now - 10_000).toISOString() },
  ...extra,
})

test('a fresh cash sale opens the drawer once, and nothing else does', () => {
  assert.equal(saleDrawerRefusal(sale(), [], now), null)
  assert.equal(saleDrawerRefusal(undefined, [], now), 'unknownOrder')
  assert.equal(saleDrawerRefusal(sale({ source: 'website' }), [], now), 'unknownOrder')
  assert.equal(saleDrawerRefusal(sale({ payment: { method: 'card', amount: 35, paidAt: '' } }), [], now), 'notCash')
  assert.equal(saleDrawerRefusal(sale({ createdAt: new Date(now - SALE_DRAWER_WINDOW_MS - 1).toISOString() }), [], now), 'tooLate')
  assert.equal(saleDrawerRefusal(sale(), [{ at: '', deviceId: 't', reason: 'sale', orderId: 's1', printer: 'p' }], now), 'alreadyOpened')
})

const printer = (id: string, cashDrawer?: boolean): ConfiguredPrinter => ({ id, name: id, transport: 'network', host: '10.0.0.1', paperWidthMm: 80, cashDrawer })

test('the pulse goes to a printer with a drawer, preferring the tablet choice, then the default', () => {
  const settings = (printers: ConfiguredPrinter[], defaultPrinterId: string | null = null): PrinterSettings => ({ printers, defaultPrinterId })
  assert.equal(drawerPrinter(settings([printer('kitchen'), printer('counter', true)], 'kitchen'), 'kitchen')?.id, 'counter')
  assert.equal(drawerPrinter(settings([printer('a', true), printer('b', true)], 'b'), 'a')?.id, 'a')
  assert.equal(drawerPrinter(settings([printer('a', true), printer('b', true)], 'b'), undefined)?.id, 'b')
  assert.equal(drawerPrinter(settings([printer('a'), printer('b')], 'b'), 'a')?.id, 'a')
  assert.equal(drawerPrinter(settings([printer('a'), printer('b')], 'b'), undefined)?.id, 'b')
  assert.equal(drawerPrinter(settings([]), undefined), null)
})

test('the kick job pulses both drawer pins and prints no paper', () => {
  const preview = decodeEscPos(buildDrawerKick())
  assert.equal(preview.drawerPulses, 2)
  assert.deepEqual(preview.lines, [])
  assert.equal(preview.cut, false)
  assert.deepEqual(preview.unknownCommands, [])
})
