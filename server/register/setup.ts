/**
 * Builds the Register's server side — the electronic journal, staff and sign-in sessions, cash
 * registers, barcode lookup, payment providers and intents, and the route modules — from the few things only `server/index.ts` owns (the store, its
 * `applyUpdate`, sessions and screen resolution). `index.ts` calls `createRegisterServices` once and
 * hands every request to `handle` before its own routes.
 */
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { BarcodeEntry } from '../../src/types/barcode'
import type { Catalogue } from '../../src/types/category'
import type { OrderRecord, OrderStatus } from '../../src/types/order'
import type { CategoryPrices, Product } from '../../src/types/product'
import { DEFAULT_PRINTER_SETTINGS, DEFAULT_RAW_PRINTER_PORT, type PrinterSettings } from '../../src/types/printer'
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
import { registerForDevice, renameRegister, type CashRegister, type CashRegisterStore } from './registers'
import { readDataFile, writeDataFile } from '../dataFile'
import { openServerJournal } from '../journal/serverJournal'
import { reprintZ } from './zReprint'
import { addReturn, markReceipt } from './orderPatches'
import { productGroup } from './productGroups'
import { handleSaftRoute } from '../saft/routes'
import { handleTrainingRoute, trainingActive, trainingCheckout } from './training'
import type { RegisterAccess } from './access'
import { saleJournalInput } from './saleJournal'
import { StaffSessions } from './sessions'
import { handleSignInRoute } from './signInRoutes'
import { handleStaffAdminRoute } from './staffAdminRoutes'
import { handleReceiptRoute } from './receiptRoutes'
import { handleReturnRoute } from './returnRoutes'
import { handleCartEventRoute } from './cartEventRoutes'
import { floatCounted, handleReportRoute } from './reportRoutes'
import { readDrawerState } from '../printers/drawerStatus'
import { drawerPrinter } from './drawer'
import type { StoreSettings } from '../../src/types/storeSettings'
import { missingLegalDetails } from '../../src/utils/storeLegal'
import type { StaffMember, StaffStore } from './staff'

/** What the Register needs from `server/index.ts`. */
export interface RegisterHostDeps {
  appVersion: string
  readKey: <T>(
    key: 'admin.products' | 'admin.catalogues' | 'admin.categoryPrices' | 'admin.orders' | 'admin.registerOrders' | 'admin.screens' | 'admin.storeSettings' | 'admin.printers',
    fallback: T,
  ) => T
  /** `applyUpdate` — persists, broadcasts, reconciles stock for orders, and journals price changes with `actor`. */
  applyUpdate: (key: 'admin.registerOrders' | 'admin.products', value: unknown, actor?: string | null) => void
  /** Pushes a products change to the website (`neonBridge.pushIfRelevant`), like every other products write. */
  pushProductsToWebsite: (products: Product[]) => void
  isApprovedMachine: (deviceId: string) => boolean
  effectiveScreenId: (deviceId: string) => string | null
  /** Completes one website order through `setOrderStatus`; `false` if it vanished. */
  completeWebsiteOrder: (orderId: string) => Promise<boolean>
  /** Sets one register order's status through `setOrderStatus`; `false` if there's no such register order. */
  setRegisterOrderStatus: (orderId: string, status: OrderStatus) => Promise<boolean>
  sessionMay: (token: string, section: DashboardSection) => boolean
  /** The dashboard username behind a session token, for the journal. */
  sessionUser: (token: string) => string | null
  isFullAdmin: (token: string) => boolean
  /** Shows a problem in every open admin tab (`broadcastError`). */
  reportProblem: (message: string, detail?: string) => void
}

/** The Register's services, plus one request handler for all of its routes. */
export function createRegisterServices(host: RegisterHostDeps) {
  const { journal, health: journalHealth, verify: verifyJournal } = openServerJournal(host.reportProblem)
  const sessions = new StaffSessions()
  const staff: StaffStore = {
    read: () => readDataFile<StaffMember[]>('register-staff.json', []),
    write: (value) => writeDataFile('register-staff.json', value),
    now: () => new Date(),
    newId: randomUUID,
  }
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

  const cashRegisters: CashRegisterStore = {
    read: () => readDataFile<CashRegister[]>('cash-registers.json', []),
    write: (registers) => writeDataFile('cash-registers.json', registers),
    now: () => new Date(),
  }
  const cashRegister = (deviceId: string) => registerForDevice(cashRegisters, deviceId)
  const groupOf = (itemID: string) => productGroup(itemID, readProducts(), host.readKey<Catalogue[]>('admin.catalogues', []))
  const access: RegisterAccess = { deviceMayUseRegister, sessions, journal, cashRegister }

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
    journalSale: (order) => {
      const entry = journal.append(saleJournalInput(order, order.registerNumber ?? 0, order.staffId ?? null, groupOf))
      return { number: entry.receiptNumber ?? 0, journalSeq: entry.seq, at: entry.at }
    },
  }

  const writeProducts = (products: Product[], actor: string) => {
    host.applyUpdate('admin.products', products, actor)
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
  const readStoreSettings = () => host.readKey<StoreSettings>('admin.storeSettings', { name: '', logos: [] })
  /** Whether receipts can be printed: Settings → Store → Company details is complete. A sale is refused until it is. */
  const legalReady = () => missingLegalDetails(readStoreSettings()).length === 0
  /** Whether the drawer on the tablet's printer reports being open; `unknown` (no sensor, no answer) never blocks. */
  const drawerIsOpen = async (printerId: unknown) =>
    (await readDrawerState(
      drawerPrinter(host.readKey<PrinterSettings>('admin.printers', DEFAULT_PRINTER_SETTINGS), typeof printerId === 'string' ? printerId : undefined),
      DEFAULT_RAW_PRINTER_PORT,
    )) === 'open'
  const storeName = () => readStoreSettings().name ?? ''
  const isTraining = (register: number) => trainingActive(journal.read(), register)
  const orderPatches = { readOrders: () => orders.readOrders(), writeOrders: (value: OrderRecord[]) => host.applyUpdate('admin.registerOrders', value) }
  const receiptDeps = {
    ...access,
    readRegisterOrders: orders.readOrders,
    markReceipt: (orderId: string, patch: Partial<NonNullable<OrderRecord['receipt']>>) => markReceipt(orderPatches, orderId, patch),
    readStaff: staff.read,
    readStoreSettings,
    readPrinterSettings: () => host.readKey<PrinterSettings>('admin.printers', DEFAULT_PRINTER_SETTINGS),
    readCatalogue: orders.readCatalogue,
    printJob,
  }
  const reprintZReport = (seq: number, printedBy: string) =>
    reprintZ(seq, printedBy, {
      journal,
      readStoreSettings,
      readPrinterSettings: () => host.readKey<PrinterSettings>('admin.printers', DEFAULT_PRINTER_SETTINGS),
      readRegisters: cashRegisters.read,
      printJob,
    })

  /** Handles any Register, payment or register-admin route; `false` for everything else. */
  function handle(req: IncomingMessage, res: ServerResponse, url: URL, requestHost: string): boolean {
    return (
      handlePaymentRoute(req, res, url, { ...access, providers, intents, orders, storeName, legalReady, drawerIsOpen, isTraining, isFullAdmin: host.isFullAdmin }) ||
      handleDrawerRoute(req, res, url, {
        ...access,
        readRegisterOrders: () => host.readKey<OrderRecord[]>('admin.registerOrders', []),
        readPrinterSettings: () => host.readKey<PrinterSettings>('admin.printers', DEFAULT_PRINTER_SETTINGS),
        printJob,
      }) ||
      handleSignInRoute(req, res, url, { ...access, readStaff: staff.read }) ||
      handleReceiptRoute(req, res, url, receiptDeps) ||
      handleTrainingRoute(req, res, url, receiptDeps) ||
      handleReturnRoute(req, res, url, { ...receiptDeps, addReturn: (orderId, entry) => addReturn(orderPatches, orderId, entry), readProducts, writeProducts }) ||
      handleCartEventRoute(req, res, url, { ...access, readCatalogue: orders.readCatalogue }) ||
      handleSaftRoute(req, res, url, {
        sessionMay: host.sessionMay,
        journal,
        readStoreSettings,
        readRegisters: cashRegisters.read,
        readStaff: staff.read,
        readProducts,
        readCatalogues: () => host.readKey<Catalogue[]>('admin.catalogues', []),
        appVersion: host.appVersion,
        readPublicKeys: () => readDataFile<{ version: number; publicKeyPem: string }[]>('register-signing-keys.json', []).map(({ version, publicKeyPem }) => ({ version, publicKeyPem })),
      }) ||
      handleReportRoute(req, res, url, { ...receiptDeps, hasPendingPayment: (deviceId) => intents.hasPending(deviceId) }) ||
      handleStaffAdminRoute(req, res, url, { sessionMay: host.sessionMay, sessionUser: host.sessionUser, staff, sessions, journal, journalHealth, verifyJournal, reprintZReport }) ||
      handleRegisterAdminRoute(req, res, url, requestHost, {
        sessionMay: host.sessionMay,
        lookupBarcode,
        setRegisterOrderStatus: host.setRegisterOrderStatus,
        listCashRegisters: cashRegisters.read,
        renameCashRegister: (number, name) => renameRegister(cashRegisters, number, name),
      }) ||
      handleRegisterRoute(req, res, url, requestHost, {
        ...access,
        deviceMayScanPickups: (deviceId) => registerPane(deviceId)?.allowPickupScan !== false,
        orders,
        readWebsiteOrders: () => host.readKey<OrderRecord[]>('admin.orders', []),
        completeWebsiteOrder: host.completeWebsiteOrder,
        readProducts,
        readCatalogues: () => host.readKey<Catalogue[]>('admin.catalogues', []),
        writeProducts,
        readStaff: staff.read,
        legalReady,
        floatNeeded: (register) => !floatCounted(journal.read(), register),
        isTraining,
        trainingCheckout: (response, session, order, printerId) => trainingCheckout(response, receiptDeps, session, order, printerId),
        drawerIsOpen,
        lookupBarcode,
        linkBarcode,
        handleUpload: (req2, res2, uploadHost) => handleUpload(req2, res2, uploadHost),
        offeredProviders: () => offeredProviders(providers).map((provider) => ({ id: provider.id, method: provider.method })),
        newId: randomUUID,
      })
    )
  }

  return { handle, deviceMayUseRegister, journal }
}
