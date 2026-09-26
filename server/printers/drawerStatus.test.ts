// Tests for reading a cash drawer's state from a printer status byte.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { drawerStateFromStatus, readDrawerState } from './drawerStatus'

test('bit 2 of the status byte, read the way the printer is set up', () => {
  assert.equal(drawerStateFromStatus(0x16, 'openWhenHigh'), 'open')
  assert.equal(drawerStateFromStatus(0x12, 'openWhenHigh'), 'closed')
  assert.equal(drawerStateFromStatus(0x16, 'openWhenLow'), 'closed')
  assert.equal(drawerStateFromStatus(0x12, 'openWhenLow'), 'open')
  assert.equal(drawerStateFromStatus(0x16, 'off'), 'unknown')
})

test('no sensor setting, no network printer, or no answer is unknown', async () => {
  assert.equal(await readDrawerState(null, 9100), 'unknown')
  assert.equal(await readDrawerState({ id: 'p', name: 'p', transport: 'system', systemName: 'q', paperWidthMm: 80, drawerSensor: 'openWhenHigh' }, 9100), 'unknown')
  // Nothing listens on port 1 of the loopback: an error, answered as unknown.
  assert.equal(await readDrawerState({ id: 'p', name: 'p', transport: 'network', host: '127.0.0.1', port: 1, paperWidthMm: 80, drawerSensor: 'openWhenHigh' }, 9100), 'unknown')
})
