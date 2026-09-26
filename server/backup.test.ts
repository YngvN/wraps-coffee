// Tests that restoring a backup never rolls back the electronic journal.
import { strict as assert } from 'node:assert'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { restoreDataDir } from './backup'

function folder(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'restore-'))
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true })
    writeFileSync(join(dir, name), text)
  }
  return dir
}

const read = (dir: string, name: string) => readFileSync(join(dir, name), 'utf-8')

test('an older backup never shortens the journal, but ordinary files are restored', () => {
  const live = folder({ 'journal/2026-09.jsonl': 'a\nb\nc\n', 'admin-products.json': 'new', 'register-signing-keys.json': 'live-key' })
  const backup = folder({ 'journal/2026-09.jsonl': 'a\n', 'admin-products.json': 'old', 'register-signing-keys.json': 'other-key' })
  assert.deepEqual(restoreDataDir(backup, live), [])
  assert.equal(read(live, 'journal/2026-09.jsonl'), 'a\nb\nc\n')
  assert.equal(read(live, 'admin-products.json'), 'old')
  assert.equal(read(live, 'register-signing-keys.json'), 'live-key')
})

test('a backup that extends the journal (a lost machine) is taken, with its key', () => {
  const live = folder({})
  const backup = folder({ 'journal/2026-09.jsonl': 'a\nb\n', 'journal/2026-08.jsonl': 'x\n', 'register-signing-keys.json': 'backup-key' })
  restoreDataDir(backup, live)
  assert.equal(read(live, 'journal/2026-09.jsonl'), 'a\nb\n')
  assert.equal(read(live, 'journal/2026-08.jsonl'), 'x\n')
  assert.equal(read(live, 'register-signing-keys.json'), 'backup-key')
})

test('a backup journal that disagrees with the one on disk is refused and reported', () => {
  const live = folder({ 'journal/2026-09.jsonl': 'a\nb\n' })
  const backup = folder({ 'journal/2026-09.jsonl': 'a\nX\nc\n' })
  assert.deepEqual(restoreDataDir(backup, live), ['2026-09.jsonl'])
  assert.equal(read(live, 'journal/2026-09.jsonl'), 'a\nb\n')
  assert.equal(existsSync(join(live, 'register-signing-keys.json')), false)
})
