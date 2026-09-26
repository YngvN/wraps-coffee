/**
 * The register's electronic journal (elektronisk journal, kassasystemforskrifta § 2-7): an append-only
 * record of everything that happens at the registers, kept by the server in `server/data/journal/`.
 * Nothing in it is ever edited or deleted. Every entry is SHA-256 hash-chained to the one before it, so
 * a changed or missing entry shows, and every cash transaction also carries the SAF-T Cash Register
 * signature (RSA-SHA1-1024), chained per cash register. Receipts, X/Z reports and the SAF-T export are
 * all built from it. It never holds a customer's name or phone number, so the 7-day anonymisation of
 * orders doesn't touch it.
 */

/**
 * Cash transactions: each one is signed, in one chain per cash register, and becomes a `cashtransaction`
 * in the SAF-T export (Skatteetaten's example file: sales, returns and training sales only).
 */
export type JournalCashType = 'sale' | 'return' | 'trainingSale'

/** Receipts that are events rather than transactions in SAF-T, but still numbered in their own series. */
export type JournalReceiptEventType = 'copy' | 'proForma'

/** Every other event: a SAF-T `event`. */
export type JournalEventType =
  | JournalReceiptEventType
  | 'drawerOpen'
  | 'float'
  | 'cashCount'
  | 'xReport'
  | 'zReport'
  | 'priceChange'
  | 'lineCorrection'
  | 'void'
  | 'discount'
  | 'signIn'
  | 'signOut'
  | 'cartTakeover'
  | 'trainingOn'
  | 'trainingOff'
  | 'parked'
  | 'resumed'
  | 'staffChange'
  | 'systemStart'

export type JournalType = JournalCashType | JournalEventType

export const JOURNAL_CASH_TYPES: readonly JournalCashType[] = ['sale', 'return', 'trainingSale']

/** Every type that gets a receipt number in its own series (per register and type). */
export const JOURNAL_NUMBERED_TYPES: readonly JournalType[] = ['sale', 'return', 'trainingSale', 'copy', 'proForma']

/** The SAF-T signature of a cash transaction. Amounts are in øre; date and time are Oslo time. */
export interface JournalSignature {
  /** Sequential signed transaction number, per cash register, starting at 1. */
  nr: number
  transDate: string
  transTime: string
  amountInOre: number
  amountExOre: number
  /** Base64 RSA-SHA1 over `previousSignature;transDate;transTime;nr;transAmntIn;transAmntEx`. */
  signature: string
  keyVersion: number
}

/** One journal line. */
export interface JournalEntry {
  /** 1, 2, 3 … across the whole journal, with no gaps. */
  seq: number
  /** When it happened, ISO UTC. */
  at: string
  /** The cash register it happened at, or `null` for something done from the dashboard or by the server. */
  register: number | null
  /** Who did it: a staff id, `admin:<username>` for a dashboard user, or `null` for the server itself. */
  actor: string | null
  type: JournalType
  data: Record<string, unknown>
  /** Present on cash transactions only. */
  signed?: JournalSignature
  /**
   * Receipts only (`JOURNAL_NUMBERED_TYPES`): the receipt's number in its own series — per cash register
   * and per type, so sales, copies, pro formas, returns and training receipts are each numbered 1, 2, 3 …
   * without gaps.
   */
  receiptNumber?: number
  /** `hash` of the entry before, or 64 zeros for the first. */
  prevHash: string
  /** SHA-256 (hex) over everything above. */
  hash: string
}
