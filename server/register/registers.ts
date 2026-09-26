/**
 * Each tablet that uses the Register is one cash register ("kasse") in the legal sense: its number is
 * the register ID printed on every receipt and report, and the unit the journal's signature chain,
 * receipt numbers and Z reports count per. A tablet gets the next number the first time it opens the
 * register, and keeps it for good. Numbers are never reused, even if a tablet is retired, so a number
 * on an old receipt always means the same register.
 *
 * Stored server-only in `server/data/cash-registers.json` (not a synced key: nothing but the server
 * needs the list, and renaming goes through an admin route).
 */

/** One cash register. */
export interface CashRegister {
  /** The tablet's device id (its approved machine id). */
  deviceId: string
  /** 1, 2, … — never reused. */
  number: number
  /** Shown to staff and in admin, e.g. "Kasse 1" or "Disken". */
  name: string
  createdAt: string
}

export interface CashRegisterStore {
  read: () => CashRegister[]
  write: (registers: CashRegister[]) => void
  now: () => Date
}

export const MAX_REGISTER_NAME_LENGTH = 40

/** The register for `deviceId`, creating it with the next free number the first time. */
export function registerForDevice(store: CashRegisterStore, deviceId: string): CashRegister {
  const registers = store.read()
  const existing = registers.find((register) => register.deviceId === deviceId)
  if (existing) return existing
  const number = registers.reduce((highest, register) => Math.max(highest, register.number), 0) + 1
  const created: CashRegister = { deviceId, number, name: `Kasse ${number}`, createdAt: store.now().toISOString() }
  store.write([...registers, created])
  return created
}

/** Renames register `number`. Returns the renamed register, or `null` if there's no such register or the name is blank. */
export function renameRegister(store: CashRegisterStore, number: number, name: unknown): CashRegister | null {
  const clean = typeof name === 'string' ? name.trim().slice(0, MAX_REGISTER_NAME_LENGTH) : ''
  if (!clean) return null
  const registers = store.read()
  const target = registers.find((register) => register.number === number)
  if (!target) return null
  const renamed = { ...target, name: clean }
  store.write(registers.map((register) => (register.number === number ? renamed : register)))
  return renamed
}
