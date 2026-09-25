/**
 * Small server-only JSON files in `server/data/` — for data that must never be a synced key (a
 * secret, or something too large to broadcast to every display). Every write is mirrored to the
 * backup folder, the same `writeFileSync` + `mirrorFile` pair `server/store.ts` uses, so anything
 * stored here is covered by the backup without further wiring.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mirrorFile } from './backup'

/** The same directory `server/store.ts` keeps synced keys in. */
export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data')

/** Absolute path of a file in `DATA_DIR`. */
export function dataFilePath(name: string): string {
  return join(DATA_DIR, name)
}

/** Reads `name` as JSON, or returns `fallback` when it doesn't exist or can't be parsed. */
export function readDataFile<T>(name: string, fallback: T): T {
  const path = dataFilePath(name)
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch (error) {
    console.error(`[data] ${name} is unreadable, using the default:`, error)
    return fallback
  }
}

/** Writes `value` to `name` as JSON and mirrors it to the backup folder. */
export function writeDataFile(name: string, value: unknown): void {
  const path = dataFilePath(name)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value), 'utf-8')
  mirrorFile(path)
}
