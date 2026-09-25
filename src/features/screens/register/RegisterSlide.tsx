import { AnimatePresence, MotionConfig } from 'framer-motion'
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { useCatalogues } from '../../../hooks/useCatalogues'
import { useCategoryPrices } from '../../../hooks/useCategoryPrices'
import { useClockFormatPreference } from '../../../hooks/useClockFormatPreference'
import { useProducts } from '../../../hooks/useProducts'
import { useLanguage } from '../../../i18n'
import { fetchRegisterConfig } from '../../../lib/registerApi'
import { priceCart } from '../../../lib/registerPricing'
import type { PaymentMethod, PaymentProviderId } from '../../../types/order'
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
import { RegisterLockDialog } from './RegisterLockDialog'
import { RegisterPayDialog } from './RegisterPayDialog'
import { RegisterPickupSheet } from './RegisterPickupSheet'
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
import { useRegisterUnlock } from './useRegisterUnlock'
import { useScanInput } from './useScanInput'
import './RegisterSlide.scss'

/** The pane's own settings (see the `'register'` kind in `src/types/screen.ts`). */
interface RegisterSlideProps {
  catalogueIds?: string[] | null
  autoPrintReceipt?: boolean | null
  allowPickupScan?: boolean | null
}

/**
 * The counter register for a `'register'` pane on the café tablet: product tiles and a cart; barcode
 * and pickup-QR scanning from a keyboard-wedge scanner or (behind a privacy switch) the camera, each
 * with a sound; Pay, recorded by hand until a payment provider is configured; and product editing
 * behind the staff PIN. Sales land on the order board by the placement rule in `registerPricing.ts`.
 *
 * Everything that changes data goes through the server's register routes, which only answer an
 * approved tablet showing this pane (`?deviceId=`); anywhere else (the admin preview) it's a
 * look-only preview. While the sync connection is down nothing can be sold.
 */
function Register({
  catalogueIds,
  autoPrintReceipt,
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
  const unlock = useRegisterUnlock(deviceId)
  const [theme, setTheme] = useOrdersTheme()
  const printing = useBoardPrinting(deviceId)
  const [providers, setProviders] = useState<{ id: PaymentProviderId; method: PaymentMethod }[]>([])
  const [editor, setEditor] = useState<EditorSubject | null>(null)
  const [typingPickup, setTypingPickup] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => {
    if (!deviceId || !online) return
    let alive = true
    fetchRegisterConfig(deviceId)
      .then((config) => {
        if (alive) setProviders(config.providers)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [deviceId, online])

  const addToCart = useCallback((productId: string, allowSoldOut: boolean) => dispatch({ type: 'add', productId, allowSoldOut }), [])
  const scans = useRegisterScans({ deviceId, products, allowPickupScan, online, soundOn: settings.soundOn, addToCart, openEditor: setEditor }, lang)
  const openDrawer = useCashDrawer(deviceId, printing.choice, scans.notify)
  const openDrawerByHand = async () => {
    const token = await unlock.requireUnlock()
    if (token) await openDrawer({ reason: 'manual', unlockToken: token })
  }
  const idle = !unlock.prompting
  useScanInput(scans.handleScan, deviceId !== null && idle)
  const camera = useCameraScanner(deviceId !== null && settings.cameraOn, settings.cameraPreview, scans.handleScan)

  const checkout = useRegisterCheckout({
    deviceId,
    onSold: (order) => {
      dispatch({ type: 'reset', clientOrderId: generateId() })
      if (order.payment?.method === 'cash') void openDrawer({ reason: 'sale', orderId: order.id })
      if (autoPrintReceipt === true && printing.available) printing.print(order)
    },
  })

  const onTile = (product: Product) => addToCart(product.itemID, isProductOutOfStock(product))

  const total = priced.ok ? priced.cart.totalPrice : 0
  let blockedReason: string | null = null
  if (!deviceId) blockedReason = t('screenDisplay.register.previewOnly')
  else if (!online) blockedReason = t('screenDisplay.register.offlineNoSale')
  else if (!priced.ok && priced.reason !== 'empty') {
    const product = products.find((candidate) => candidate.itemID === priced.productId)
    blockedReason = t(`screenDisplay.register.refused.${priced.reason}`, { name: product ? product.name[lang] || product.name.no : '' })
  } else if (cart.lines.length === 0) blockedReason = ''

  const checkoutRequest = { clientOrderId: cart.clientOrderId, lines: cart.lines, serving: cart.serving, expectedTotal: total, customerName: cart.customerName || undefined }
  const soldOrder = checkout.state?.phase === 'done' ? checkout.state.order : undefined

  return (
    // `reducedMotion="user"` turns every slide and scale below into an instant change when the OS asks for reduced motion.
    <MotionConfig reducedMotion="user">
      <div className="orders-board register" data-orders-theme={theme}>
        {offlineSince && <div className="orders-board__offline">{t('screenDisplay.register.offline', { time: formatClockTime(offlineSince, language, clockFormat) })}</div>}
        <RegisterTopBar
          settings={settings}
          camera={camera}
          unlocked={unlock.unlocked}
          onUnlock={() => void unlock.requireUnlock()}
          onLock={unlock.lock}
          onTypePickupCode={allowPickupScan && deviceId ? () => setTypingPickup(true) : undefined}
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenDrawer={deviceId ? () => void openDrawerByHand() : undefined}
          theme={theme}
          onThemeChange={setTheme}
          language={languageChoice}
          onLanguageChange={onLanguageChange}
          printing={deviceId ? printing : undefined}
        />
        <div className="register__body">
          <RegisterProductGrid
            catalogue={pricing}
            catalogues={shownCatalogues}
            serving={cart.serving}
            unlocked={unlock.unlocked}
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
            dispatch={dispatch}
            onPay={checkout.open}
            onClear={() => dispatch({ type: 'reset', clientOrderId: generateId() })}
          />
        </div>
        <RegisterScanNotice notice={scans.notice} onDismiss={scans.dismissNotice} onQuickAdd={(barcode) => setEditor({ mode: 'quickAdd', barcode })} />

        <AnimatePresence>
          {checkout.state && (
            <RegisterPayDialog
              key="pay"
              total={total || soldOrder?.totalPrice || 0}
              state={checkout.state}
              providers={providers}
              products={products}
              onPayByHand={(method) => void checkout.payByHand(checkoutRequest, method)}
              onPayWithProvider={(provider) => void checkout.payWithProvider(checkoutRequest, provider)}
              onRetry={checkout.retry}
              onPrint={soldOrder && printing.available ? () => printing.print(soldOrder) : undefined}
              onClose={checkout.close}
            />
          )}
          {deviceId && editor && (
            <RegisterProductEditor
              key="editor"
              subject={editor}
              deviceId={deviceId}
              catalogues={catalogues}
              requireUnlock={unlock.requireUnlock}
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
          {historyOpen && <RegisterHistorySheet key="history" printing={deviceId ? printing : undefined} onClose={() => setHistoryOpen(false)} />}
          {unlock.prompting && <RegisterLockDialog key="pin" onSubmit={unlock.submitPin} onCancel={unlock.cancelPrompt} />}
        </AnimatePresence>
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
