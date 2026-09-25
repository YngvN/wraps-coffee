/**
 * One barcode lookup, in the order that keeps Open Food Facts traffic to a minimum:
 * 1. our own products (`Product.barcode`) — already sellable;
 * 2. the saved barcode catalogue — a draft from an earlier lookup or a staff quick-add;
 * 3. a remembered miss — Open Food Facts didn't know it within the last week;
 * 4. Open Food Facts itself — and whatever it answers is saved, so step 4 happens once per barcode.
 *
 * Two tablets scanning the same new can at once share one Open Food Facts request.
 */
import type { BarcodeEntry, BarcodeLookupResult } from '../../src/types/barcode'
import type { Product } from '../../src/types/product'
import { normalizeGtin } from '../../src/lib/gtin'
import type { BarcodeCatalogue } from './catalogueStore'
import { downloadOffImage, fetchOffProduct, offProductToEntry, type OffClientDeps } from './openFoodFacts'

/** Attribution stored with every photo taken from Open Food Facts (their images are CC BY-SA). */
export const OFF_IMAGE_CREDIT = 'Open Food Facts contributors, CC BY-SA'

/** What a lookup needs from the server around it. */
export interface BarcodeLookupDeps {
  catalogue: BarcodeCatalogue
  readProducts: () => Product[]
  off: OffClientDeps
  /** Stores a downloaded photo through the upload pipeline (`ingestImageBuffer`); returns its filename. */
  ingestImage: (buffer: Buffer) => Promise<string | null>
  now: () => Date
}

/** Runs lookups, sharing in-flight Open Food Facts requests between callers. */
export class BarcodeLookup {
  private inFlight = new Map<string, Promise<BarcodeLookupResult>>()
  private readonly deps: BarcodeLookupDeps

  constructor(deps: BarcodeLookupDeps) {
    this.deps = deps
  }

  /** Looks `raw` up. `host` is this server's own address as the caller reached it, for the stored photo's URL (same as `handleUpload`). */
  async lookup(raw: string, host: string): Promise<BarcodeLookupResult> {
    const barcode = normalizeGtin(raw)
    if (!barcode) return { kind: 'invalid' }

    const product = this.deps.readProducts().find((candidate) => candidate.barcode === barcode)
    if (product) return { kind: 'product', product }
    const entry = this.deps.catalogue.get(barcode)
    if (entry) return { kind: 'entry', entry }
    if (this.deps.catalogue.isRememberedMiss(barcode)) return { kind: 'unknown' }

    const pending = this.inFlight.get(barcode)
    if (pending) return pending
    const request = this.askOpenFoodFacts(barcode, host).finally(() => this.inFlight.delete(barcode))
    this.inFlight.set(barcode, request)
    return request
  }

  private async askOpenFoodFacts(barcode: string, host: string): Promise<BarcodeLookupResult> {
    const result = await fetchOffProduct(barcode, this.deps.off)
    if (result.kind === 'unavailable') return { kind: 'unavailable', retryAfterMs: result.retryAfterMs }
    if (result.kind === 'notFound') {
      this.deps.catalogue.rememberMiss(barcode)
      console.log(`[barcodes] ${barcode} is not on Open Food Facts (remembered for a week)`)
      return { kind: 'unknown' }
    }

    const entry = offProductToEntry(barcode, result.product, this.deps.now())
    const photo = result.product.image_front_url ? await downloadOffImage(result.product.image_front_url, this.deps.off) : null
    const filename = photo ? await this.deps.ingestImage(photo) : null
    if (filename) {
      entry.image = `http://${host}/uploads/${filename}`
      entry.imageCredit = OFF_IMAGE_CREDIT
    }
    this.deps.catalogue.put(entry)
    console.log(`[barcodes] saved ${barcode} from Open Food Facts ("${entry.name.no}")`)
    return { kind: 'entry', entry }
  }

  /** Saves an entry staff typed in for a barcode nobody knew (or corrected), replacing any earlier one. */
  saveManual(entry: Omit<BarcodeEntry, 'updatedAt'>): BarcodeEntry {
    const saved: BarcodeEntry = { ...entry, updatedAt: this.deps.now().toISOString() }
    this.deps.catalogue.put(saved)
    return saved
  }
}
