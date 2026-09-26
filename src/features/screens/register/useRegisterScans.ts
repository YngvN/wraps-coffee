import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReceiptRefusal } from '../../../lib/registerReceiptApi'
import type { BarcodeEntry } from '../../../types/barcode'
import type { Product } from '../../../types/product'
import { lookupBarcode, scanPickup, type PickupResult } from '../../../lib/registerApi'
import { isProductOutOfStock } from '../../../utils/productStock'
import { classifyScan } from './scanPayload'
import { playScanSound, type ScanSound } from './scanSound'

/** The short message shown after a barcode scan. */
export type ScanNotice =
  | { kind: 'added' | 'soldOutAdded'; name: string }
  | { kind: 'draft'; name: string }
  | { kind: 'unknownBarcode' | 'lookupUnavailable'; code: string }
  /** A barcode that isn't a product yet, scanned by someone who isn't a manager (only managers add products). */
  | { kind: 'managerNeeded'; code: string }
  | { kind: 'unreadable' | 'pickupDisabled' | 'offline' }
  /** Not scans, but shown the same way: the cash drawer opened, or why it didn't. */
  | { kind: 'drawerOpened' | 'drawerFailed' | 'drawerNoPrinter' }
  /** A legal receipt printed (see `useRegisterReceipts`), or why it didn't. */
  | { kind: 'receiptPrinted' | 'copyPrinted' | 'proFormaPrinted' | 'returnMade' | 'trainingPrinted' }
  | { kind: 'receiptRefused'; reason: ReceiptRefusal }

/** What the product editor should open for, after a scan it can't finish alone. */
export type EditorRequest = { mode: 'draft'; entry: BarcodeEntry } | { mode: 'quickAdd'; barcode: string }

/** A pickup scan's outcome, while its sheet is showing. `payload` is kept to confirm an early handover. */
export type PickupState = { payload: string; outcome: PickupResult; busy: boolean }

interface Options {
  deviceId: string | null
  products: Product[]
  allowPickupScan: boolean
  online: boolean
  soundOn: boolean
  addToCart: (productId: string, allowSoldOut: boolean) => void
  openEditor: (request: EditorRequest) => void
}

/** Display name of a product in the page's language. */
function nameOf(product: Product, language: 'no' | 'en'): string {
  return product.name[language] || product.name.no || product.name.en
}

/**
 * Turns every scan — wedge or camera — into what it means at the counter: a pickup QR completes the
 * customer's website order (with a sheet to confirm an early handover), a known barcode goes into the
 * cart, and a barcode we don't sell yet opens the product editor with whatever the server's catalogue
 * or Open Food Facts knew. Each outcome plays its scan sound (see `scanSound.ts`) unless muted.
 *
 * While the product editor is open, `setCapture` routes scans to it instead (its barcode field).
 */
export function useRegisterScans(options: Options, language: 'no' | 'en') {
  const [notice, setNotice] = useState<{ notice: ScanNotice; seq: number } | null>(null)
  const [pickup, setPickup] = useState<PickupState | null>(null)
  const capture = useRef<((code: string) => void) | null>(null)
  const seq = useRef(0)
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })

  const sound = (value: ScanSound) => {
    if (latest.current.soundOn) playScanSound(value)
  }
  const show = (value: ScanNotice) => setNotice({ notice: value, seq: ++seq.current })

  const runPickup = async (payload: string, force: boolean) => {
    const { deviceId } = latest.current
    if (!deviceId) return
    setPickup((current) => (current ? { ...current, busy: true } : current))
    try {
      const outcome = await scanPickup(deviceId, payload, force)
      setPickup({ payload, outcome, busy: false })
      sound(outcome.result === 'completed' ? 'ok' : outcome.result === 'alreadyCompleted' || outcome.result === 'notReady' ? 'attention' : 'error')
    } catch {
      setPickup(null)
      sound('error')
      show({ kind: 'offline' })
    }
  }

  const handleBarcode = async (code: string) => {
    const { deviceId, products, addToCart, openEditor } = latest.current
    const own = products.find((product) => product.barcode === code)
    if (own) {
      const soldOut = isProductOutOfStock(own)
      addToCart(own.itemID, soldOut)
      sound(soldOut ? 'attention' : 'ok')
      return show({ kind: soldOut ? 'soldOutAdded' : 'added', name: nameOf(own, language) })
    }
    if (!deviceId || !latest.current.online) {
      sound('error')
      return show({ kind: 'offline' })
    }
    try {
      const result = await lookupBarcode(deviceId, code)
      if (result.kind === 'product') {
        addToCart(result.product.itemID, isProductOutOfStock(result.product))
        sound('ok')
        return show({ kind: 'added', name: nameOf(result.product, language) })
      }
      if (result.kind === 'entry') {
        sound('attention')
        show({ kind: 'draft', name: result.entry.name[language] || result.entry.name.no })
        return openEditor({ mode: 'draft', entry: result.entry })
      }
      sound('error')
      if (result.kind === 'invalid') return show({ kind: 'unreadable' })
      show({ kind: result.kind === 'unknown' ? 'unknownBarcode' : 'lookupUnavailable', code })
      if (result.kind === 'unknown') openEditor({ mode: 'quickAdd', barcode: code })
    } catch {
      sound('error')
      show({ kind: 'offline' })
    }
  }

  const handleScan = useCallback((raw: string) => {
    const scan = classifyScan(raw)
    if (capture.current) {
      if (scan.kind === 'barcode') capture.current(scan.code)
      return
    }
    if (scan.kind === 'barcode') return void handleBarcode(scan.code)
    if (scan.kind === 'unknown') {
      sound('error')
      return show({ kind: 'unreadable' })
    }
    if (!latest.current.allowPickupScan) {
      sound('error')
      return show({ kind: 'pickupDisabled' })
    }
    if (!latest.current.online) {
      sound('error')
      return show({ kind: 'offline' })
    }
    void runPickup(scan.payload, false)
    // Everything read inside lives on `latest`/refs, so the handler never needs to change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    handleScan,
    notice,
    dismissNotice: () => setNotice(null),
    /** Shows a notice that didn't come from a scan (e.g. the cash drawer). */
    notify: show,
    pickup,
    /** Hands over an order that isn't ready yet, after staff confirmed. */
    confirmEarlyPickup: () => pickup && void runPickup(pickup.payload, true),
    /** Looks up a pickup code typed by hand (when a phone screen won't scan). */
    submitPickupCode: (code: string) => void runPickup(code, false),
    closePickup: () => setPickup(null),
    setCapture: (target: ((code: string) => void) | null) => {
      capture.current = target
    },
  }
}
