/**
 * The server's own barcode catalogue: every barcode we've learned about (from Open Food Facts or
 * typed in by staff), plus a short memory of barcodes Open Food Facts didn't know, so neither is ever
 * asked of Open Food Facts twice.
 *
 * Deliberately a server-only file (`barcode-catalogue.json`) rather than a synced key: it only grows,
 * a synced key re-sends its whole value to every display on each write, and the register only ever
 * needs one barcode at a time, which a lookup route answers. It lives in `server/data/` and is written
 * through `writeDataFile`, so the backup mirror covers it.
 */
import type { BarcodeEntry } from '../../src/types/barcode'
import { readDataFile, writeDataFile } from '../dataFile'

/** How long a barcode Open Food Facts didn't know is remembered as unknown before it's asked again (products get added there over time). */
export const MISS_TTL_MS = 7 * 24 * 60 * 60_000

/** The file's shape: entries by barcode, and each remembered miss's ISO time. */
export interface CatalogueFile {
  entries: Record<string, BarcodeEntry>
  misses: Record<string, string>
}

/** Reads and writes the whole catalogue file — injected so tests never touch `server/data`. */
export interface CatalogueIO {
  read: () => CatalogueFile
  write: (file: CatalogueFile) => void
}

const CATALOGUE_FILE = 'barcode-catalogue.json'

/** The real file in `server/data/`. */
export const fileCatalogueIO: CatalogueIO = {
  read: () => readDataFile<CatalogueFile>(CATALOGUE_FILE, { entries: {}, misses: {} }),
  write: (file) => writeDataFile(CATALOGUE_FILE, file),
}

/** The catalogue, loaded once on first use and written back on every change. */
export class BarcodeCatalogue {
  private file: CatalogueFile | null = null
  private readonly io: CatalogueIO
  private readonly now: () => number

  constructor(io: CatalogueIO, now: () => number = Date.now) {
    this.io = io
    this.now = now
  }

  private load(): CatalogueFile {
    if (!this.file) {
      const loaded = this.io.read()
      this.file = { entries: loaded.entries ?? {}, misses: loaded.misses ?? {} }
    }
    return this.file
  }

  private save(): void {
    this.io.write(this.load())
  }

  /** The saved entry for `barcode`, if any. */
  get(barcode: string): BarcodeEntry | undefined {
    return this.load().entries[barcode]
  }

  /** Whether `barcode` is a miss still inside `MISS_TTL_MS`. An expired miss is forgotten here. */
  isRememberedMiss(barcode: string): boolean {
    const file = this.load()
    const missedAt = file.misses[barcode]
    if (!missedAt) return false
    if (this.now() - new Date(missedAt).getTime() < MISS_TTL_MS) return true
    delete file.misses[barcode]
    this.save()
    return false
  }

  /** Saves (or replaces) an entry, and forgets any miss for it. */
  put(entry: BarcodeEntry): void {
    const file = this.load()
    file.entries[entry.barcode] = entry
    delete file.misses[entry.barcode]
    this.save()
  }

  /** Remembers that Open Food Facts doesn't know `barcode`. */
  rememberMiss(barcode: string): void {
    this.load().misses[barcode] = new Date(this.now()).toISOString()
    this.save()
  }
}
