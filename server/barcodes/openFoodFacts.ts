/**
 * Looks a barcode up on Open Food Facts (https://world.openfoodfacts.org), free and keyless. Their
 * terms ask every app to identify itself in the User-Agent with a way to reach its owner, and limit
 * product reads to 15 per minute per IP (going over can get the IP banned), so every call here goes
 * through one server-wide limiter set below that. Only ever called by the server — the kiosk page
 * never talks to Open Food Facts.
 *
 * Licences: the database is ODbL and its photos CC BY-SA, so a stored photo keeps its attribution
 * (`BarcodeEntry.imageCredit`).
 */
import type { BarcodeEntry } from '../../src/types/barcode'
import { mapOffAllergens } from './allergenMap'

/** The product endpoint, with only the fields we use. Confirmed working on 2026-09-25 (barcode 5449000000996 → status 1, "Coca-Cola"). */
const OFF_PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product'
const OFF_FIELDS = 'code,product_name,product_name_no,brands,quantity,image_front_url,allergens_tags,categories_tags'

/** Contact in the User-Agent, as their terms require: the café's public website. */
const OFF_CONTACT_URL = 'https://wrapstesting.netlify.app/'

/** Reads allowed per minute — below Open Food Facts' own limit of 15, leaving room for retries. */
export const OFF_READS_PER_MINUTE = 10

/** How long one lookup may take before it's treated as "unavailable". */
export const OFF_TIMEOUT_MS = 5_000

/** Largest photo downloaded from Open Food Facts. */
export const MAX_OFF_IMAGE_BYTES = 5 * 1024 * 1024

/** Hosts a photo may be downloaded from — never an arbitrary URL out of the response. */
const OFF_IMAGE_HOSTS = new Set(['images.openfoodfacts.org', 'static.openfoodfacts.org'])

/** The User-Agent sent with every request. `OFF_USER_AGENT` overrides it, like `WEATHER_USER_AGENT` does for MET. */
export function offUserAgent(appVersion: string): string {
  return process.env.OFF_USER_AGENT ?? `ADHDisplay/${appVersion} (+${OFF_CONTACT_URL})`
}

/** A sliding one-minute window of request times. The clock is injectable for tests. */
export class RateLimiter {
  private times: number[] = []
  private readonly max: number
  private readonly windowMs: number
  private readonly now: () => number

  constructor(max: number, windowMs: number, now: () => number = Date.now) {
    this.max = max
    this.windowMs = windowMs
    this.now = now
  }

  /** Takes one slot if one is free; otherwise says how long until the oldest frees up. */
  take(): { ok: true } | { ok: false; retryAfterMs: number } {
    const now = this.now()
    this.times = this.times.filter((time) => now - time < this.windowMs)
    if (this.times.length >= this.max) return { ok: false, retryAfterMs: this.windowMs - (now - this.times[0]) }
    this.times.push(now)
    return { ok: true }
  }
}

/** The fields we read from an Open Food Facts product. */
export interface OffProduct {
  code?: string
  product_name?: string
  product_name_no?: string
  brands?: string
  quantity?: string
  image_front_url?: string
  allergens_tags?: unknown
  categories_tags?: unknown
}

/** `found` and `notFound` are definite answers; `unavailable` is anything else (offline, timeout, 429, 5xx, our own limit) and must not be remembered as a miss. */
export type OffResult = { kind: 'found'; product: OffProduct } | { kind: 'notFound' } | { kind: 'unavailable'; retryAfterMs?: number }

/** What a lookup needs, injected so tests never reach the network. */
export interface OffClientDeps {
  fetch: typeof fetch
  userAgent: string
  limiter: RateLimiter
}

/** Asks Open Food Facts about one (already validated) barcode. */
export async function fetchOffProduct(barcode: string, deps: OffClientDeps): Promise<OffResult> {
  const slot = deps.limiter.take()
  if (!slot.ok) return { kind: 'unavailable', retryAfterMs: slot.retryAfterMs }
  try {
    const response = await deps.fetch(`${OFF_PRODUCT_URL}/${barcode}.json?fields=${OFF_FIELDS}`, {
      headers: { 'User-Agent': deps.userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(OFF_TIMEOUT_MS),
    })
    if (response.status === 429) return { kind: 'unavailable', retryAfterMs: 60_000 }
    // An unknown product comes back as 404 with `status: 0` in the body.
    if (response.status === 404) return { kind: 'notFound' }
    if (!response.ok) return { kind: 'unavailable' }
    const body = (await response.json()) as { status?: number; product?: OffProduct }
    return body.status === 1 && body.product ? { kind: 'found', product: body.product } : { kind: 'notFound' }
  } catch (error) {
    console.warn(`[barcodes] Open Food Facts lookup for ${barcode} failed:`, error instanceof Error ? error.message : error)
    return { kind: 'unavailable' }
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Turns an Open Food Facts product into a catalogue draft (without its photo, which is downloaded separately). */
export function offProductToEntry(barcode: string, product: OffProduct, now: Date): BarcodeEntry {
  const english = text(product.product_name)
  const norwegian = text(product.product_name_no) || english
  const { allergens, allergensToCheck } = mapOffAllergens(product.allergens_tags)
  const categoriesTags = Array.isArray(product.categories_tags) ? product.categories_tags.filter((tag): tag is string => typeof tag === 'string') : []
  const entry: BarcodeEntry = {
    barcode,
    source: 'openFoodFacts',
    name: { no: norwegian, en: english || norwegian },
    allergens,
    allergensToCheck,
    fetchedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
  const brand = text(product.brands).split(',')[0]?.trim()
  if (brand) entry.brand = brand
  if (text(product.quantity)) entry.quantity = text(product.quantity)
  if (categoriesTags.length > 0) entry.categoriesTags = categoriesTags
  return entry
}

/** Whether `url` is an https photo on one of Open Food Facts' own image hosts. */
export function isOffImageUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && OFF_IMAGE_HOSTS.has(parsed.hostname)
  } catch {
    return false
  }
}

/** Downloads an Open Food Facts photo, capped at `MAX_OFF_IMAGE_BYTES`. `null` on any failure — a missing photo never fails a lookup. */
export async function downloadOffImage(url: string, deps: Pick<OffClientDeps, 'fetch' | 'userAgent'>): Promise<Buffer | null> {
  if (!isOffImageUrl(url)) return null
  try {
    const response = await deps.fetch(url, { headers: { 'User-Agent': deps.userAgent }, signal: AbortSignal.timeout(OFF_TIMEOUT_MS * 2) })
    if (!response.ok) return null
    const declared = Number(response.headers.get('content-length'))
    if (declared > MAX_OFF_IMAGE_BYTES) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    return buffer.length <= MAX_OFF_IMAGE_BYTES ? buffer : null
  } catch {
    return null
  }
}
