/** Norwegian organisation numbers: nine digits, the last a MOD11 check digit (weights 3, 2, 7, 6, 5, 4, 3, 2). */

const WEIGHTS = [3, 2, 7, 6, 5, 4, 3, 2]

/** The digits of `input` with spaces and dots removed, e.g. "923 456 783" → "923456783". */
export function normalizeOrgNumber(input: string): string {
  return input.replace(/[\s.]/g, '')
}

/** Whether `input` (spaces allowed) is a valid organisation number, check digit included. */
export function isValidOrgNumber(input: string): boolean {
  const digits = normalizeOrgNumber(input)
  if (!/^\d{9}$/.test(digits)) return false
  const sum = WEIGHTS.reduce((total, weight, index) => total + weight * Number(digits[index]), 0)
  const remainder = sum % 11
  // A remainder of 1 would need check digit 10, so no valid number has it.
  if (remainder === 1) return false
  const check = remainder === 0 ? 0 : 11 - remainder
  return check === Number(digits[8])
}

/** Groups an organisation number the way it's printed: "923 456 783". */
export function formatOrgNumber(input: string): string {
  const digits = normalizeOrgNumber(input)
  return digits.length === 9 ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}` : digits
}
