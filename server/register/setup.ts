/**
 * Builds the Register's server side — unlock manager, barcode lookup, payment providers and intents,
 * and the three route modules — from the few things only `server/index.ts` owns (the store, its
 * `applyUpdate`, sessions and screen resolution). `index.ts` calls `createRegisterServices` once and
 * hands every request to `handle` before its own routes.
 */
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { BarcodeEntry } from '../../src/types/barcode'
import type { Catalogue } from '../../src/types/category'
import type { OrderRecord, OrderStatus } from '../../src/types/order'
import type { CategoryPrices, Product } from '../../src/types/product'
import { DEFAULT_PRINTER_SETTINGS, type PrinterSettings } from '../../src/types/printer'
import type { ScreenConfig } from '../../src/types/screen'
import type { DashboardSection } from '../../src/types/sync'
import { BarcodeCatalogue, fileCatalogueIO } from '../barcodes/catalogueStore'
import { BarcodeLookup } from '../barcodes/lookup'
import { RateLimiter, OFF_READS_PER_MINUTE, offUserAgent } from '../barcodes/openFoodFacts'
import { screenHasRegister } from '../orderStatus'
import { getVippsCredentials, getZettleCredentials } from '../payments/credentials'
import { PaymentIntents } from '../payments/intents'
import { offeredProviders } from '../payments/types'
import { handlePaymentRoute } from '../payments/routes'
import { createVippsProvider } from '../payments/vippsAdapter'
import { createZettleProvider } from '../payments/zettleAdapter'
import { printJob } from '../printers/routes'
import { handleUpload, ingestImageBuffer } from '../uploads'
import { handleRegisterAdminRoute } from './adminRoutes'
import type { RegisterOrderDeps } from './orders'
import { handleDrawerRoute } from './drawerRoute'
import { handleRegisterRoute } from './routes'
import { UnlockManager, readPinRecord, writePin } from './unlock'

/** What the Register needs from `server/index.ts`. */
export interface RegisterHostDeps {
  appVersion: string
  readKey: <T>(
    key: 'admin.products' | 'admin.catalogues' | 'admin.categoryPrices' | 'admin.orders' | 'admin.registerOrders' | 'admin.screens' | 'admin.storeSettings' | 'admin.printers',
    fallback: T,
  ) => T
  /** `applyUpdate` — persists, broadcasts, and (for orders) reconciles stock. */
  applyUpdate: (key: 'admin.registerOrders' | 'admin.products', value: unknown) => void
  /** Pushes a products change to the website (`neonBridge.pushIfRelevant`), like every other products write. */
  pushProductsToWebsite: (products: Product[]) => void
  isApprovedMachine: (deviceId: string) => boolean
  effectiveScreenId: (deviceId: string) => string | null
  /** Completes one website order through `setOrderStatus`; `false` if it vanished. */
  completeWebsiteOrder: (orderId: string) => Promise<boolean>
  /** Sets one register order's status through `setOrderStatus`; `false` if there's no such register order. */
  setRegisterOrderStatus: (orderId: string, status: OrderStatus) => Promise<boolean>
  sessionMay: (token: string, section: DashboardSection) => boolean
  isFullAdmin: (token: string) => boolean
}

/** The Register's services, plus one request handler for all of its routes. */
export function createRegisterServices(host: RegisterHostDeps) {
  const unlock = new UnlockManager()
  const catalogue = new BarcodeCatalogue(fileCatalogueIO)
  const readProducts = () => host.readKey<Product[]>('admin.products', [])
  const barcodes = new BarcodeLookup({
    catalogue,
    readProducts,
    off: { fetch, userAgent: offUserAgent(host.appVersion), limiter: new RateLimiter(OFF_READS_PER_MINUTE, 60_000) },
    ingestImage: (buffer) => ingestImageBuffer(buffer),
    now: () => new Date(),
  })
  const providers = [createZettleProvider(getZettleCredentials), createVippsProvider(getVippsCredentials)]
  const intents = new PaymentIntents()

  /** The Register pane content on the tablet's current screen, if any. */
  const registerPane = (deviceId: string) => {
    if (!host.isApprovedMachine(deviceId)) return undefined
    const screenId = host.effectiveScreenId(deviceId)
    const screen = host.readKey<ScreenConfig[]>('admin.screens', []).find((candidate) => candidate.screenID === screenId)
    if (!screenHasRegister(screen)) return undefined
    for (const slot of Object.values(screen?.paneSlots ?? {})) for (const content of Object.values(slot.content ?? {})) if (content?.kind === 'register') return content
    return undefined
  }
  const deviceMayUseRegister = (deviceId: string) => registerPane(deviceId) !== undefined

  const orders: RegisterOrderDeps = {
    readOrders: () => host.readKey<OrderRecord[]>('admin.registerOrders', []),
    writeOrders: (value) => host.applyUpdate('admin.registerOrders', value),
    readCatalogue: () => ({
      products: readProducts(),
      catalogues: host.readKey<Catalogue[]>('admin.catalogues', []),
      categoryPrices: host.readKey<CategoryPrices>('admin.categoryPrices', {}),
    }),
    now: () => new Date(),
    newId: randomUUID,
  }

  const writeProducts = (products: Product[]) => {
    host.applyUpdate('admin.products', products)
    host.pushProductsToWebsite(products)
  }

  /** Points a barcode's catalogue entry at its product, creating a staff entry from the product when the barcode had none. */
  const linkBarcode = (product: Product) => {
    if (!product.barcode) return
    const existing = catalogue.get(product.barcode)
    const entry: Omit<BarcodeEntry, 'updatedAt'> = existing
      ? { ...existing, productId: product.itemID }
      : { barcode: product.barcode, source: 'manual', name: product.name, image: product.image, allergens: product.allergens, allergensToCheck: [], productId: product.itemID }
    barcodes.saveManual(entry)
  }

  const lookupBarcode = (code: string, requestHost: string) => barcodes.lookup(code, requestHost)
  const storeName = () => host.readKey<{ name?: string }>('admin.storeSettings', {}).name ?? ''

  /** Handles any Register, payment or register-admin route; `false` for everything else. */
  function handle(req: IncomingMessage, res: ServerResponse, url: URL, requestHost: string): boolean {
    return (
      handlePaymentRoute(req, res, url, { deviceMayUseRegister, providers, intents, orders, storeName, isFullAdmin: host.isFullAdmin }) ||
      handleDrawerRoute(req, res, url, {
        deviceMayUseRegister,
        unlock,
        readRegisterOrders: () => host.readKey<OrderRecord[]>('admin.registerOrders', []),
        readPrinterSettings: () => host.readKey<PrinterSettings>('admin.printers', DEFAULT_PRINTER_SETTINGS),
        printJob,
      }) ||
      handleRegisterAdminRoute(req, res, url, requestHost, {
        sessionMay: host.sessionMay,
        readPin: readPinRecord,
        writePin,
        unlock,
        lookupBarcode,
        setRegisterOrderStatus: host.setRegisterOrderStatus,
      }) ||
      handleRegisterRoute(req, res, url, requestHost, {
        deviceMayUseRegister,
        deviceMayScanPickups: (deviceId) => registerPane(deviceId)?.allowPickupScan !== false,
        orders,
        readWebsiteOrders: () => host.readKey<OrderRecord[]>('admin.orders', []),
        completeWebsiteOrder: host.completeWebsiteOrder,
        readProducts,
        readCatalogues: () => host.readKey<Catalogue[]>('admin.catalogues', []),
        writeProducts,
        unlock,
        readPin: readPinRecord,
        lookupBarcode,
        linkBarcode,
        handleUpload: (req2, res2, uploadHost) => handleUpload(req2, res2, uploadHost),
        offeredProviders: () => offeredProviders(providers).map((provider) => ({ id: provider.id, method: provider.method })),
        newId: randomUUID,
      })
    )
  }

  return { handle, deviceMayUseRegister }
}
