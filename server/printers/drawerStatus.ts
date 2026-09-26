/**
 * Whether a network receipt printer's cash drawer is open, from its ESC/POS real-time status
 * (DLE EOT 1): the printer answers one byte, whose bit 2 is the level of the drawer connector's sensor
 * pin. Drawers differ in which level means "open", so each printer says which (`drawerSensor`).
 * kassasystemforskrifta § 2-6 forbids registering sales while an integrated drawer is open; a printer
 * that doesn't answer is `unknown`, which never blocks a sale.
 */
import { Socket } from 'node:net'
import type { ConfiguredPrinter } from '../../src/types/printer'

export type DrawerState = 'open' | 'closed' | 'unknown'

/** DLE EOT n=1: "transmit printer status". */
const STATUS_REQUEST = Buffer.from([0x10, 0x04, 0x01])
const STATUS_TIMEOUT_MS = 800
const DRAWER_PIN_BIT = 0x04

/** What a status byte says about the drawer, given which pin level means open. */
export function drawerStateFromStatus(status: number, sensor: NonNullable<ConfiguredPrinter['drawerSensor']>): DrawerState {
  if (sensor === 'off') return 'unknown'
  const high = (status & DRAWER_PIN_BIT) !== 0
  return high === (sensor === 'openWhenHigh') ? 'open' : 'closed'
}

/** Asks one network printer for its status byte; `null` if it doesn't answer in time. */
function readStatusByte(host: string, port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const socket = new Socket()
    const done = (value: number | null) => {
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(STATUS_TIMEOUT_MS, () => done(null))
    socket.once('error', () => done(null))
    socket.once('data', (data) => done(data.length > 0 ? data[data.length - 1] : null))
    socket.connect(port, host, () => socket.write(STATUS_REQUEST))
  })
}

/** The drawer's state on `printer`: `unknown` unless it's a network printer with a sensor setting that answers. */
export async function readDrawerState(printer: ConfiguredPrinter | null, defaultPort: number): Promise<DrawerState> {
  if (!printer || printer.transport !== 'network' || !printer.host || !printer.drawerSensor || printer.drawerSensor === 'off') return 'unknown'
  const status = await readStatusByte(printer.host, printer.port ?? defaultPort)
  return status === null ? 'unknown' : drawerStateFromStatus(status, printer.drawerSensor)
}
