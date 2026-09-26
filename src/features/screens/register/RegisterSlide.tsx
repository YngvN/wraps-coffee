import { AnimatePresence, MotionConfig } from 'framer-motion'
import { useCallback, useMemo, useReducer, useState } from 'react'
import { ScreenSaver } from '../../../components'
import { useIdleTimer } from '../../../hooks/useIdleTimer'
import { useCatalogues } from '../../../hooks/useCatalogues'
import { useCategoryPrices } from '../../../hooks/useCategoryPrices'
import { useClockFormatPreference } from '../../../hooks/useClockFormatPreference'
import { useProducts } from '../../../hooks/useProducts'
import { useLanguage } from '../../../i18n'
import { priceCart } from '../../../lib/registerPricing'
import type { OrderRecord } from '../../../types/order'
import type { Product } from '../../../types/product'
import { formatClockTime } from '../../../utils/clockFormat'
import { generateId } from '../../../utils/id'
import { isProductOutOfStock } from '../../../utils/productStock'
import { PaneLanguageScope } from '../PaneLanguageScope'
import { readDeviceId } from '../orders/readDeviceId'
import { useBoardPrinting } from '../orders/useBoardPrinting'
import { useOfflineSince } from '../orders/useOfflineSince'
import { useOrdersLanguage, type OrdersLanguage } from '../orders/useOrdersLanguage'
import { useOrdersTheme } from '../orders/useOrdersTheme'
import '../orders/OrdersBoard.scss'
import { RegisterCart } from './RegisterCart'
import { RegisterHistorySheet } from './RegisterHistorySheet'
import { RegisterLoginScreen } from './RegisterLoginScreen'
import { RegisterPayDialog } from './RegisterPayDialog'
import { isPracticeSale } from './practiceSale'
import { RegisterPickupSheet } from './RegisterPickupSheet'
import { RegisterReturnSheet } from './RegisterReturnSheet'
import { RegisterFloatSheet } from './RegisterFloatSheet'
import { RegisterReportSheet } from './RegisterReportSheet'
import { RegisterProductEditor } from './RegisterProductEditor'
import { RegisterProductGrid } from './RegisterProductGrid'
import { RegisterScanNotice } from './RegisterScanNotice'
import { RegisterTopBar } from './RegisterTopBar'
import { cartReducer, emptyCart } from './cartReducer'
import type { EditorSubject } from './registerProductDraft'
import { useCameraScanner } from './useCameraScanner'
import { useCashDrawer } from './useCashDrawer'
import { useProductPopularity } from './useProductPopularity'
import { useRegisterCheckout } from './useRegisterCheckout'
import { useRegisterScans } from './useRegisterScans'
import { useRegisterSettings } from './useRegisterSettings'
import { useRegisterConfig } from './useRegisterConfig'
import { useRegisterSession } from './useRegisterSession'
import { useRegisterReceipts } from './useRegisterReceipts'
import { useJournaledCart } from './useJournaledCart'
import { useScanInput } from './useScanInput'
import './RegisterSlide.scss'

/** The pane's own settings (see the `'register'` kind in `src/types/screen.ts`). */
interface RegisterSlideProps {
  catalogueIds?: string[] | null
  allowPickupScan?: boolean | null
}

/**
 * The counter register for a `'register'` pane on the café tablet: product tiles and a cart; barcode
 * and pickup-QR scanning from a keyboard-wedge scanner or (behind a privacy switch) the camera, each
 * with a sound; Pay, recorded by hand until a payment provider is configured; and product editing for
 * managers. Nothing works until a staff member signs in from the staff list (`RegisterLoginScreen`),
 * and after its idle time the register signs them out again and later shows a screensaver. Sales land
 * on the order board by the placement rule in `registerPricing.ts`, and in the server's journal.
 *
 * Everything that changes data goes through the server's register routes, which only answer an
 * approved tablet showing this pane (`?deviceId=`); anywhere else (the admin preview) it's a
 * look-only preview. While the sync connection is down nothing can be sold.
 */
function Register({
  catalogueIds,
  allowPickupScan: allowPickupSetting,
  language: languageChoice,
  onLanguageChange,
}: RegisterSlideProps & { language: OrdersLanguage; onLanguageChange: (language: OrdersLanguage) => void }) {
  // `!== false` rather than a default parameter: a pane saved with `null` (e.g. by the assistant) must
  // mean "on", exactly as the server reads it.
  const allowPickupScan = allowPickupSetting !== false
  const { t, language } = useLanguage()
  const lang = language === 'en' ? 'en' : 'no'
  const [clockFormat] = useClockFormatPreference()
  const [deviceId] = useState(readDeviceId)
  const [products] = useProducts()
  const [catalogues] = useCatalogues()
  const [categoryPrices] = useCategoryPrices()
  const pricing = useMemo(() => ({ products, catalogues, categoryPrices }), [products, catalogues, categoryPrices])
  const popularity = useProductPopularity()
  const shownCatalogues = useMemo(() => (catalogueIds?.length ? catalogues.filter((catalogue) => catalogueIds.includes(catalogue.id)) : catalogues), [catalogues, catalogueIds])
  const [cart, dispatch] = useReducer(cartReducer, undefined, () => emptyCart(generateId()))
  const priced = useMemo(() => priceCart(cart.lines, pricing, cart.serving), [cart.lines, cart.serving, pricing])
  const offlineSince = useOfflineSince()
  const online = offlineSince === null
  const settings = useRegisterSettings()
  const session = useRegisterSession(deviceId, settings, cart.lines.length)
  const signedIn = session.staff !== null
  const screensaver = useIdleTimer(settings.screensaverMinutes * 60_000, settings.screensaverMinutes > 0)
  const [theme, setTheme] = useOrdersTheme()
  const printing = useBoardPrinting(deviceId)
  const [editor, setEditor] = useState<EditorSubject | null>(null)
  const [typingPickup, setTypingPickup] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [returning, setReturning] = useState<OrderRecord | null>(null)
  // Product editing is off until a manager unlocks it with the lock button; tied to who unlocked it, so
  // it's off again as soon as someone else (or nobody) is signed in.
  const [editingFor, setEditingFor] = useState<string | null>(null)
  const editing = session.isManager && editingFor === session.staff?.id
  const [reportsOpen, setReportsOpen] = useState(false)
  // Asked once per sign-in while the float is still to be counted; closing it (or closing the day with a
  // Z report) waits for the next sign-in. Compared by the sign-in's own object, so the same person
  // signing in again is asked again.
  const [floatSkippedFor, setFloatSkippedFor] = useState<object | null>(null)
  const { config, refresh: refreshConfig } = useRegisterConfig(deviceId, online)

  const addToCart = useCallback((productId: string, allowSoldOut: boolean) => dispatch({ type: 'add', productId, allowSoldOut }), [])
  // Only a manager may add or change products; anyone else is told to fetch one.
  const openEditor = (request: EditorSubject & { mode: 'draft' | 'quickAdd' }) =>
    session.isManager ? setEditor(request) : scans.notify({ kind: 'managerNeeded', code: request.mode === 'quickAdd' ? request.barcode : request.entry.barcode })
  const scans = useRegisterScans({ deviceId, products, allowPickupScan, online, soundOn: settings.soundOn, addToCart, openEditor }, lang)
  const openDrawer = useCashDrawer(deviceId, printing.choice, scans.notify)
  // Nothing is scanned while nobody is signed in, and the camera stays off.
  useScanInput(scans.handleScan, deviceId !== null && signedIn)
  const camera = useCameraScanner(deviceId !== null && signedIn && settings.cameraOn, settings.cameraPreview, scans.handleScan)

  const receipts = useRegisterReceipts(deviceId, printing.choice, scans.notify)
  const journaledCart = useJournaledCart(deviceId, cart, dispatch)
  const checkout = useRegisterCheckout({
    deviceId,
    onSold: (order, training) => {
      dispatch({ type: 'reset', clientOrderId: generateId() })
      // A practice sale: its training receipt was printed with it, and there's no real sale or cash.
      if (training) return void receipts.finishTraining(training)
      if (order.payment?.method === 'cash') void openDrawer({ reason: 'sale', orderId: order.id })
      // Printing the receipt is part of the sale (kassasystemforskrifta); a failure shows as a notice,
      // and the original can then still be printed from History.
      void receipts.printSale(order)
    },
  })

  const onTile = (product: Product) => addToCart(product.itemID, isProductOutOfStock(product))

  const total = priced.ok ? priced.cart.totalPrice : 0
  let blockedReason: string | null = null
  if (!deviceId) blockedReason = t('screenDisplay.register.previewOnly')
  else if (!online) blockedReason = t('screenDisplay.register.offlineNoSale')
  else if (config && !config.legalReady) blockedReason = t('screenDisplay.register.legalDetailsMissing')
  else if (!priced.ok && priced.reason !== 'empty') {
    const product = products.find((candidate) => candidate.itemID === priced.productId)
    blockedReason = t(`screenDisplay.register.refused.${priced.reason}`, { name: product ? product.name[lang] || product.name.no : '' })
  } else if (cart.lines.length === 0) blockedReason = ''

  // `printerId`: the server checks that printer's drawer isn't open before it records the sale.
  const checkoutRequest = {
    clientOrderId: cart.clientOrderId,
    lines: cart.lines,
    serving: cart.serving,
    expectedTotal: total,
    customerName: cart.customerName || undefined,
    printerId: printing.choice,
  }
  const soldOrder = checkout.state?.phase === 'done' ? checkout.state.order : undefined

  return (
    // `reducedMotion="user"` turns every slide and scale below into an instant change when the OS asks for reduced motion.
    <MotionConfig reducedMotion="user">
      <div className="orders-board register" data-orders-theme={theme}>
        {config?.training && <div className="register__training">{t('screenDisplay.register.trainingBanner')}</div>}
        {offlineSince && <div className="orders-board__offline">{t('screenDisplay.register.offline', { time: formatClockTime(offlineSince, language, clockFormat) })}</div>}
        <RegisterTopBar
          settings={settings}
          camera={camera}
          staff={session.staff}
          onSignOut={session.signOut}
          editing={editing}
          onToggleEditing={session.isManager ? () => setEditingFor(editing ? null : (session.staff?.id ?? null)) : undefined}
          onOpenReports={session.isManager && deviceId ? () => setReportsOpen(true) : undefined}
          onTypePickupCode={allowPickupScan && deviceId ? () => setTypingPickup(true) : undefined}
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenDrawer={deviceId ? () => void openDrawer({ reason: 'manual' }) : undefined}
          theme={theme}
          onThemeChange={setTheme}
          language={languageChoice}
          onLanguageChange={onLanguageChange}
          printing={deviceId ? printing : undefined}
          cashRegister={config?.register}
        />
        {deviceId && !signedIn ? (
          <RegisterLoginScreen deviceId={deviceId} pinEveryTime={settings.pinEveryTime} online={online} onSignIn={session.signIn} />
        ) : (
          <div className="register__body">
            <RegisterProductGrid
              catalogue={pricing}
              catalogues={shownCatalogues}
              serving={cart.serving}
              canEdit={editing}
              onAdd={onTile}
              onEdit={(product) => setEditor({ mode: 'edit', product })}
              onCreate={() => setEditor({ mode: 'create' })}
              popularity={popularity}
              sort={settings.productSort}
              onSortChange={settings.setProductSort}
              onScan={scans.handleScan}
            />
            <RegisterCart
              cart={cart}
              catalogue={pricing}
              total={total}
              blockedReason={blockedReason}
              dispatch={journaledCart.dispatch}
              onPay={checkout.open}
              onClear={journaledCart.clear}
              onProForma={printing.available ? () => void receipts.printCartProForma({ lines: cart.lines, serving: cart.serving }) : undefined}
            />
          </div>
        )}
        <RegisterScanNotice notice={scans.notice} onDismiss={scans.dismissNotice} onQuickAdd={(barcode) => openEditor({ mode: 'quickAdd', barcode })} />

        <AnimatePresence>
          {checkout.state && (
            <RegisterPayDialog
              key="pay"
              total={total || soldOrder?.totalPrice || 0}
              state={checkout.state}
              providers={config?.providers ?? []}
              products={products}
              onPayByHand={(method) => void checkout.payByHand(checkoutRequest, method)}
              onPayWithProvider={(provider) => void checkout.payWithProvider(checkoutRequest, provider)}
              onRetry={checkout.retry}
              onPrint={soldOrder && printing.available && !isPracticeSale(soldOrder) ? () => void receipts.printSale(soldOrder) : undefined}
              onClose={checkout.close}
            />
          )}
          {deviceId && editor && (
            <RegisterProductEditor
              key="editor"
              subject={editor}
              deviceId={deviceId}
              catalogues={catalogues}
              setScanCapture={scans.setCapture}
              onSaved={(product, subject) => {
                setEditor(null)
                if (subject.mode === 'draft' || subject.mode === 'quickAdd') addToCart(product.itemID, false)
              }}
              onClose={() => setEditor(null)}
            />
          )}
          {(typingPickup || scans.pickup) && (
            <RegisterPickupSheet
              key="pickup"
              pickup={scans.pickup}
              onSubmitCode={scans.submitPickupCode}
              onConfirmEarly={scans.confirmEarlyPickup}
              onClose={() => {
                setTypingPickup(false)
                scans.closePickup()
              }}
            />
          )}
          {historyOpen && (
            <RegisterHistorySheet
              key="history"
              printing={deviceId ? printing : undefined}
              onPrintSale={(order) => void receipts.printSale(order)}
              onReturn={
                session.isManager
                  ? (order) => {
                      setHistoryOpen(false)
                      setReturning(order)
                    }
                  : undefined
              }
              onClose={() => setHistoryOpen(false)}
            />
          )}
          {reportsOpen && deviceId && (
            <RegisterReportSheet
              key="reports"
              deviceId={deviceId}
              printerChoice={printing.choice}
              training={config?.training === true}
              onTrainingChanged={refreshConfig}
              onClosedDay={() => {
                setFloatSkippedFor(session.staff)
                refreshConfig()
              }}
              onClose={() => setReportsOpen(false)}
            />
          )}
          {deviceId && signedIn && config?.floatNeeded && floatSkippedFor !== session.staff && (
            <RegisterFloatSheet key="float" deviceId={deviceId} onSaved={refreshConfig} onClose={() => setFloatSkippedFor(session.staff)} />
          )}
          {returning && (
            <RegisterReturnSheet
              key="return"
              order={returning}
              onReturn={async (request) => {
                const result = await receipts.returnSale(returning, request)
                if (result.ok && result.return.method === 'cash') void openDrawer({ reason: 'return', orderId: returning.id, returnNumber: result.return.number })
                return result
              }}
              onClose={() => setReturning(null)}
            />
          )}
        </AnimatePresence>
        {screensaver && <ScreenSaver text={t('screenDisplay.orders.touchToOpen')} subtext={config?.register.name} />}
      </div>
    </MotionConfig>
  )
}

/**
 * The register for a `'register'` pane — see `Register` above. Like the order board, it always renders
 * inside a `PaneLanguageScope` following the language picked in its ⚙ menu (shared with the board on
 * the same tablet), so switching language never remounts it and never loses the cart.
 */
export function RegisterSlide(props: RegisterSlideProps) {
  const { language: paneLanguage } = useLanguage()
  const [choice, setChoice] = useOrdersLanguage()
  return (
    <PaneLanguageScope language={choice === 'auto' ? paneLanguage : choice}>
      <Register {...props} language={choice} onLanguageChange={setChoice} />
    </PaneLanguageScope>
  )
}
