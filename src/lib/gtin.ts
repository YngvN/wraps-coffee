/**
 * GTIN (EAN-8, UPC-A, EAN-13, GTIN-14) validation, shared by the Register page (to tell a product
 * barcode from anything else a scanner sends) and the server (so a misread never reaches Open Food
 * Facts, and a stored `Product.barcode` is always a real code).
 */

/** Accepted barcode lengths: EAN-8, UPC-A, EAN-13 and GTIN-14. */
const GTIN_LENGTHS = new Set([8, 12, 13, 14])

/** Whether `code` is a well-formed GTIN whose last digit is the correct GS1 check digit. */
export function isValidGtin(code: string): boolean {
  if (!/^\d+$/.test(code) || !GTIN_LENGTHS.has(code.length)) return false
  const digits = [...code].map(Number)
  const check = digits.pop() as number
  // GS1: from the right (excluding the check digit), weights alternate 3, 1, 3, 1, …
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

/** Trims whitespace around a scanned code, and returns it only if it's a valid GTIN. */
export function normalizeGtin(raw: string): string | null {
  const code = raw.trim()
  return isValidGtin(code) ? code : null
}
