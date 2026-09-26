/**
 * The people who may use the registers (kassasystemforskrifta § 2-7 asks the journal to name the
 * operator of everything). Each has their own 4-digit PIN, an employee number (the SAF-T `empID`), and a
 * role: `manager` can also edit products, open the till by hand and, in later phases, run reports,
 * returns and training mode. Staff are not dashboard users. A member is never deleted, only made
 * inactive, so every journal entry keeps a name to point at.
 *
 * Stored server-only in `server/data/register-staff.json` with hashed PINs.
 */
import { hashPin, isValidPin, type PinRecord } from './pinHash'

export type StaffRole = 'staff' | 'manager'

export interface StaffMember {
  id: string
  name: string
  employeeNumber: string
  role: StaffRole
  active: boolean
  pin: PinRecord | null
  createdAt: string
}

/** A staff member as anyone outside this module sees them: never the PIN hash. */
export interface StaffSummary {
  id: string
  name: string
  employeeNumber: string
  role: StaffRole
  active: boolean
  hasPin: boolean
}

export interface StaffStore {
  read: () => StaffMember[]
  write: (staff: StaffMember[]) => void
  now: () => Date
  newId: () => string
}

/** What an admin may set. `pin` present means "set this PIN". */
export interface StaffInput {
  name?: unknown
  employeeNumber?: unknown
  role?: unknown
  active?: unknown
  pin?: unknown
}

export type StaffError = 'noName' | 'badRole' | 'badPin' | 'duplicateEmployeeNumber' | 'unknownStaff'

const MAX_NAME_LENGTH = 40
const MAX_EMPLOYEE_NUMBER_LENGTH = 20

export function toSummary(member: StaffMember): StaffSummary {
  return { id: member.id, name: member.name, employeeNumber: member.employeeNumber, role: member.role, active: member.active, hasPin: member.pin !== null }
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/** Adds a staff member (active, with the given PIN). The employee number defaults to the next free number. */
export function createStaff(store: StaffStore, input: StaffInput): { ok: true; member: StaffMember } | { ok: false; reason: StaffError } {
  const staff = store.read()
  const name = clean(input.name, MAX_NAME_LENGTH)
  if (!name) return { ok: false, reason: 'noName' }
  const role = input.role ?? 'staff'
  if (role !== 'staff' && role !== 'manager') return { ok: false, reason: 'badRole' }
  if (!isValidPin(input.pin)) return { ok: false, reason: 'badPin' }
  const highest = staff.reduce((max, member) => Math.max(max, Number(member.employeeNumber) || 0), 0)
  const employeeNumber = clean(input.employeeNumber, MAX_EMPLOYEE_NUMBER_LENGTH) || String(highest + 1)
  if (staff.some((member) => member.employeeNumber === employeeNumber)) return { ok: false, reason: 'duplicateEmployeeNumber' }
  const member: StaffMember = { id: store.newId(), name, employeeNumber, role, active: true, pin: hashPin(input.pin), createdAt: store.now().toISOString() }
  store.write([...staff, member])
  return { ok: true, member }
}

/** Changes one staff member. Only the fields present in `input` change. */
export function updateStaff(store: StaffStore, id: string, input: StaffInput): { ok: true; member: StaffMember; before: StaffMember } | { ok: false; reason: StaffError } {
  const staff = store.read()
  const before = staff.find((member) => member.id === id)
  if (!before) return { ok: false, reason: 'unknownStaff' }
  const member = { ...before }
  if (input.name !== undefined) {
    member.name = clean(input.name, MAX_NAME_LENGTH)
    if (!member.name) return { ok: false, reason: 'noName' }
  }
  if (input.employeeNumber !== undefined) {
    member.employeeNumber = clean(input.employeeNumber, MAX_EMPLOYEE_NUMBER_LENGTH)
    if (!member.employeeNumber || staff.some((other) => other.id !== id && other.employeeNumber === member.employeeNumber)) return { ok: false, reason: 'duplicateEmployeeNumber' }
  }
  if (input.role !== undefined) {
    if (input.role !== 'staff' && input.role !== 'manager') return { ok: false, reason: 'badRole' }
    member.role = input.role
  }
  if (input.active !== undefined) member.active = input.active === true
  if (input.pin !== undefined) {
    if (!isValidPin(input.pin)) return { ok: false, reason: 'badPin' }
    member.pin = hashPin(input.pin)
  }
  store.write(staff.map((candidate) => (candidate.id === id ? member : candidate)))
  return { ok: true, member, before }
}
