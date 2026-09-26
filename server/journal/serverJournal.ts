/**
 * The server's one electronic journal (see `journal.ts`): opened at startup from `server/data/journal/`
 * with the signing keys in `register-signing-keys.json`, both mirrored to the backup. It's checked
 * straight away; any problem is logged and shown in every open admin tab, and the result is kept for
 * Settings → Register. A `systemStart` entry marks every start.
 */
import { mirrorFile } from '../backup'
import { dataFilePath, readDataFile, writeDataFile } from '../dataFile'
import { Journal, type JournalProblem } from './journal'
import type { SigningKey, SigningKeyStore } from './signing'

/** Opens the server's journal and checks it, reporting any problem found. */
export function openServerJournal(reportProblem: (message: string, detail?: string) => void) {
  const keys: SigningKeyStore = {
    read: () => readDataFile<SigningKey[]>('register-signing-keys.json', []),
    write: (value) => writeDataFile('register-signing-keys.json', value),
    now: () => new Date(),
  }
  const journal = new Journal({ dir: dataFilePath('journal'), keys, now: () => new Date(), onWrite: mirrorFile })
  let health: { problems: JournalProblem[]; checkedAt: string } = { problems: journal.load(), checkedAt: new Date().toISOString() }
  const report = () => {
    if (health.problems.length === 0) return
    const summary = health.problems
      .slice(0, 5)
      .map((problem) => `${problem.file}${problem.seq ? ` #${problem.seq}` : ''}: ${problem.detail}`)
      .join('; ')
    console.error(`[journal] ${health.problems.length} problem(s) found: ${summary}`)
    reportProblem('The register journal failed its integrity check', summary)
  }
  report()
  journal.append({ register: null, actor: null, type: 'systemStart', data: { problems: health.problems.length } })
  const verify = () => {
    health = { problems: journal.verify(), checkedAt: new Date().toISOString() }
    report()
    return health
  }
  return { journal, health: () => health, verify }
}
