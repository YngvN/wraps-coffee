/**
 * The electronic journal (see `src/types/journal.ts` for what it is and why). One JSON line per entry,
 * in one file per Oslo month (`2026-09.jsonl`) under the journal directory, only ever appended to:
 * each write is flushed to disk (`fsync`) before `append` returns, then mirrored to the backup folder.
 *
 * `load` reads every file at startup, checks the whole journal (`verifyJournal`) and picks up where it
 * left off. A problem found there is reported, never repaired: the journal is evidence, so a broken
 * entry stays exactly as it is and new entries simply continue after the last one on disk.
 */
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { JOURNAL_CASH_TYPES, JOURNAL_NUMBERED_TYPES, type JournalCashType, type JournalEntry, type JournalSignature, type JournalType } from '../../src/types/journal'
import { osloDate, osloTime } from '../../src/lib/osloTime'
import { currentSigningKey, signingString, signText, verifySignedText, type SigningKeyStore } from './signing'

export const GENESIS_HASH = '0'.repeat(64)

/** What to record. Cash transactions (`JOURNAL_CASH_TYPES`) must carry their amounts, which get signed. */
export interface JournalInput {
  register: number | null
  actor: string | null
  type: JournalType
  data: Record<string, unknown>
  amounts?: { inOre: number; exOre: number }
}

/** Something wrong with the journal on disk. `seq` names the entry where it was found, when there is one. */
export interface JournalProblem {
  kind: 'unreadable' | 'gap' | 'hash' | 'chain' | 'signature' | 'torn'
  file: string
  seq?: number
  detail: string
}

export interface JournalOptions {
  dir: string
  keys: SigningKeyStore
  now: () => Date
  /** Called with a file's path after each write — `mirrorFile`, so the journal is in the backup. */
  onWrite?: (path: string) => void
}

/** SHA-256 over the entry's fields in a fixed order, everything except `hash` itself. */
export function entryHash(entry: Omit<JournalEntry, 'hash'>): string {
  // `receiptNumber` only when there is one, so entries written before it existed still hash the same.
  const receipt = entry.receiptNumber === undefined ? [] : [entry.receiptNumber]
  const canonical = JSON.stringify([entry.seq, entry.at, entry.register, entry.actor, entry.type, entry.data, entry.signed ?? null, ...receipt, entry.prevHash])
  return createHash('sha256').update(canonical).digest('hex')
}

function isCashType(type: JournalType): type is JournalCashType {
  return (JOURNAL_CASH_TYPES as readonly string[]).includes(type)
}

/** Journal files in date order. */
function journalFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => /^\d{4}-\d{2}\.jsonl$/.test(name))
    .sort()
}

/** Every entry in one file, plus any line that couldn't be read. */
function readFile(dir: string, name: string): { entries: JournalEntry[]; problems: JournalProblem[]; torn: boolean } {
  const text = readFileSync(join(dir, name), 'utf-8')
  const problems: JournalProblem[] = []
  const entries: JournalEntry[] = []
  const lines = text.split('\n')
  // A file that doesn't end in a newline had its last write cut off (a crash mid-write).
  const torn = text.length > 0 && !text.endsWith('\n')
  lines.forEach((line, index) => {
    if (!line) return
    try {
      entries.push(JSON.parse(line) as JournalEntry)
    } catch {
      problems.push({ kind: torn && index === lines.length - 1 ? 'torn' : 'unreadable', file: name, detail: `line ${index + 1} is not valid JSON` })
    }
  })
  return { entries, problems, torn }
}

/**
 * Checks a run of entries: sequence numbers without gaps, each `hash` correct and chained to the one
 * before, and every signature valid and chained per cash register. `publicKeys` maps key versions to
 * their public keys.
 */
export function verifyJournal(entries: { file: string; entry: JournalEntry }[], publicKeys: Map<number, string>): JournalProblem[] {
  const problems: JournalProblem[] = []
  let expectedSeq = 1
  let previousHash = GENESIS_HASH
  const chains = new Map<number | null, { nr: number; signature: string }>()
  for (const { file, entry } of entries) {
    if (entry.seq !== expectedSeq) problems.push({ kind: 'gap', file, seq: entry.seq, detail: `expected entry ${expectedSeq}, found ${entry.seq}` })
    expectedSeq = entry.seq + 1
    if (entry.prevHash !== previousHash) problems.push({ kind: 'chain', file, seq: entry.seq, detail: 'does not follow on from the entry before it' })
    const { hash, ...rest } = entry
    if (entryHash(rest) !== hash) problems.push({ kind: 'hash', file, seq: entry.seq, detail: 'its contents were changed after it was written' })
    previousHash = hash
    if (entry.signed) {
      const chain = chains.get(entry.register) ?? { nr: 0, signature: '0' }
      const signed = entry.signed
      if (signed.nr !== chain.nr + 1) problems.push({ kind: 'signature', file, seq: entry.seq, detail: `signed number ${signed.nr} should be ${chain.nr + 1}` })
      const publicKey = publicKeys.get(signed.keyVersion)
      const text = signingString(chain.signature, signed.transDate, signed.transTime, signed.nr, signed.amountInOre, signed.amountExOre)
      if (!publicKey || !verifySignedText(publicKey, text, signed.signature)) problems.push({ kind: 'signature', file, seq: entry.seq, detail: 'the signature does not verify' })
      chains.set(entry.register, { nr: signed.nr, signature: signed.signature })
    }
  }
  return problems
}

/** The server's one journal. Not safe to share between processes: only the server appends. */
export class Journal {
  private readonly options: JournalOptions
  private lastSeq = 0
  private lastHash = GENESIS_HASH
  /** Per cash register: the last signed number and signature, which the next signature chains to. */
  private readonly chains = new Map<number | null, { nr: number; signature: string }>()
  /** `register:type` → the last receipt number used in that series. */
  private readonly receiptNumbers = new Map<string, number>()
  /** Files whose last write was cut off, which need a newline before the next entry. */
  private readonly tornFiles = new Set<string>()
  private loaded = false

  constructor(options: JournalOptions) {
    this.options = options
  }

  /** Reads and checks the whole journal and continues after its last entry. Returns every problem found (none is repaired). */
  load(): JournalProblem[] {
    const { problems, all } = this.scan()
    for (const { entry } of all) {
      this.lastSeq = Math.max(this.lastSeq, entry.seq)
      this.lastHash = entry.hash
      if (entry.signed) this.chains.set(entry.register, { nr: entry.signed.nr, signature: entry.signed.signature })
      if (entry.receiptNumber) this.receiptNumbers.set(`${entry.register}:${entry.type}`, Math.max(entry.receiptNumber, this.receiptNumbers.get(`${entry.register}:${entry.type}`) ?? 0))
    }
    this.loaded = true
    return problems
  }

  /** Reads and checks the whole journal again, without changing where it continues from. */
  verify(): JournalProblem[] {
    return this.scan().problems
  }

  /** Every entry on disk, with every problem found reading and checking them; notes files whose last write was cut off. */
  private scan(): { problems: JournalProblem[]; all: { file: string; entry: JournalEntry }[] } {
    const { dir, keys } = this.options
    const problems: JournalProblem[] = []
    const all: { file: string; entry: JournalEntry }[] = []
    for (const name of journalFiles(dir)) {
      const result = readFile(dir, name)
      problems.push(...result.problems)
      if (result.torn) this.tornFiles.add(name)
      else this.tornFiles.delete(name)
      for (const entry of result.entries) all.push({ file: name, entry })
    }
    problems.push(...verifyJournal(all, new Map(keys.read().map((key) => [key.version, key.publicKeyPem]))))
    return { problems, all }
  }

  /** The newest entry's number (0 when the journal is empty). */
  get length(): number {
    return this.lastSeq
  }

  /** Records one entry, signing it when it's a cash transaction, and returns it once it's safely on disk. */
  append(input: JournalInput): JournalEntry {
    if (!this.loaded) throw new Error('The journal must be loaded before anything is recorded')
    const cash = isCashType(input.type)
    if (cash !== Boolean(input.amounts)) throw new Error(`A ${input.type} entry ${cash ? 'needs' : 'must not have'} amounts`)
    const now = this.options.now()
    let signed: JournalSignature | undefined
    const series = `${input.register}:${input.type}`
    const receiptNumber = JOURNAL_NUMBERED_TYPES.includes(input.type) ? (this.receiptNumbers.get(series) ?? 0) + 1 : undefined
    if (cash && input.amounts) {
      const chain = this.chains.get(input.register) ?? { nr: 0, signature: '0' }
      const key = currentSigningKey(this.options.keys)
      const nr = chain.nr + 1
      const transDate = osloDate(now)
      const transTime = osloTime(now)
      const signature = signText(key, signingString(chain.signature, transDate, transTime, nr, input.amounts.inOre, input.amounts.exOre))
      signed = { nr, transDate, transTime, amountInOre: input.amounts.inOre, amountExOre: input.amounts.exOre, signature, keyVersion: key.version }
    }
    const withoutHash: Omit<JournalEntry, 'hash'> = {
      seq: this.lastSeq + 1,
      at: now.toISOString(),
      register: input.register,
      actor: input.actor,
      type: input.type,
      data: input.data,
      ...(signed ? { signed } : {}),
      ...(receiptNumber ? { receiptNumber } : {}),
      prevHash: this.lastHash,
    }
    const entry: JournalEntry = { ...withoutHash, hash: entryHash(withoutHash) }
    this.write(`${osloDate(now).slice(0, 7)}.jsonl`, JSON.stringify(entry))
    this.lastSeq = entry.seq
    this.lastHash = entry.hash
    if (signed) this.chains.set(input.register, { nr: signed.nr, signature: signed.signature })
    if (receiptNumber) this.receiptNumbers.set(series, receiptNumber)
    return entry
  }

  /** The entry numbered `seq`, which was written at `at` (so only that month's file is read). */
  get(seq: number, at: string): JournalEntry | undefined {
    const name = `${osloDate(new Date(at)).slice(0, 7)}.jsonl`
    if (!existsSync(join(this.options.dir, name))) return undefined
    return readFile(this.options.dir, name).entries.find((entry) => entry.seq === seq)
  }

  /** Every entry from `from` (inclusive) to `to` (exclusive), oldest first; both optional. */
  read(from?: Date, to?: Date): JournalEntry[] {
    const firstMonth = from ? osloDate(from).slice(0, 7) : ''
    const lastMonth = to ? osloDate(to).slice(0, 7) : '9999-99'
    const out: JournalEntry[] = []
    for (const name of journalFiles(this.options.dir)) {
      const month = name.slice(0, 7)
      if (month < firstMonth || month > lastMonth) continue
      for (const entry of readFile(this.options.dir, name).entries) {
        const at = new Date(entry.at)
        if ((from && at < from) || (to && at >= to)) continue
        out.push(entry)
      }
    }
    return out
  }

  /** Appends one line and makes sure it's on disk before returning. */
  private write(name: string, line: string): void {
    mkdirSync(this.options.dir, { recursive: true })
    const path = join(this.options.dir, name)
    const fd = openSync(path, 'a')
    try {
      // Start on a fresh line after a write that was cut off, so the torn line never swallows this one.
      const prefix = this.tornFiles.delete(name) ? '\n' : ''
      writeSync(fd, `${prefix}${line}\n`)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    this.options.onWrite?.(path)
  }
}
