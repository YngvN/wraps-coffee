import { AnimatePresence, motion } from 'framer-motion'
import { TrashIcon } from '../../../components'
import { useLanguage } from '../../../i18n'
import type { Product } from '../../../types/product'
import { unitPriceFor, type PricingCatalogue } from '../../../lib/registerPricing'
import type { CartAction, CartState } from './cartReducer'

interface RegisterCartProps {
  cart: CartState
  catalogue: PricingCatalogue
  total: number
  /** Why the cart can't be paid right now (offline, empty, a line with no price), or `null` when it can. */
  blockedReason: string | null
  dispatch: (action: CartAction) => void
  onPay: () => void
  onClear: () => void
  /** Prints a pro forma ("Foreløpig kvittering") of the cart. Omitted where nothing can print. */
  onProForma?: () => void
}

/**
 * The current sale: Takeaway / Eat in, one row per product with − / + and remove, an optional name to
 * call out, the total, a pro forma ("Foreløpig") for a customer who wants to see the bill first, and a
 * big Pay button. Lines show the live price for the chosen serving; the
 * server prices the sale again at Pay and refuses it if the total no longer matches.
 */
export function RegisterCart({ cart, catalogue, total, blockedReason, dispatch, onPay, onClear, onProForma }: RegisterCartProps) {
  const { t, language } = useLanguage()
  const lang = language === 'en' ? 'en' : 'no'
  const productById = new Map<string, Product>(catalogue.products.map((product) => [product.itemID, product]))

  return (
    <section className="register__cart" aria-label={t('screenDisplay.register.cart')}>
      <div className="orders-settings__segmented register__serving">
        {(['takeaway', 'eatIn'] as const).map((serving) => (
          <button
            key={serving}
            type="button"
            aria-pressed={cart.serving === serving}
            className={cart.serving === serving ? 'orders-settings__option orders-settings__option--active' : 'orders-settings__option'}
            onClick={() => dispatch({ type: 'setServing', serving })}
          >
            {t(`screenDisplay.register.serving.${serving}`)}
          </button>
        ))}
      </div>

      <ul className="register__lines">
        <AnimatePresence initial={false}>
          {cart.lines.map((line) => {
            const product = productById.get(line.productId)
            const unit = product ? unitPriceFor(product, catalogue, cart.serving) : undefined
            return (
              <motion.li key={line.productId} className="register__line" layout initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
                <span className="register__line-name">
                  {product ? product.name[lang] || product.name.no : t('screenDisplay.register.missingProduct')}
                  {line.allowSoldOut && <span className="register__line-flag">{t('screenDisplay.register.soldOut')}</span>}
                </span>
                <div className="register__stepper">
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'setQuantity', productId: line.productId, quantity: line.quantity - 1 })}
                    disabled={line.quantity <= 1}
                    aria-label={t('screenDisplay.register.decrease')}
                  >
                    −
                  </button>
                  <span className="register__quantity">{line.quantity}</span>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'setQuantity', productId: line.productId, quantity: line.quantity + 1 })}
                    aria-label={t('screenDisplay.register.increase')}
                  >
                    +
                  </button>
                </div>
                <span className="register__line-price">{unit === undefined ? '–' : t('menu.price', { price: unit * line.quantity })}</span>
                <button
                  type="button"
                  className="register__line-remove"
                  onClick={() => dispatch({ type: 'remove', productId: line.productId })}
                  aria-label={t('screenDisplay.register.removeLine')}
                >
                  <TrashIcon />
                </button>
              </motion.li>
            )
          })}
        </AnimatePresence>
        {cart.lines.length === 0 && <li className="orders-board__muted register__empty">{t('screenDisplay.register.emptyCart')}</li>}
      </ul>

      <label className="register__name">
        <span>{t('screenDisplay.register.nameLabel')}</span>
        <input
          value={cart.customerName}
          maxLength={60}
          onChange={(event) => dispatch({ type: 'setCustomerName', name: event.target.value })}
          placeholder={t('screenDisplay.register.namePlaceholder')}
        />
      </label>

      <div className="register__total">
        <span>{t('screenDisplay.orders.total')}</span>
        <strong>{t('menu.price', { price: total })}</strong>
      </div>
      {blockedReason && <p className="register__blocked">{blockedReason}</p>}
      <div className={onProForma ? 'register__cart-actions register__cart-actions--three' : 'register__cart-actions'}>
        <button type="button" className="register__clear" onClick={onClear} disabled={cart.lines.length === 0}>
          {t('screenDisplay.register.clear')}
        </button>
        {onProForma && (
          <button type="button" className="register__clear" onClick={onProForma} disabled={blockedReason !== null}>
            {t('screenDisplay.register.proForma')}
          </button>
        )}
        <button type="button" className="register__pay" onClick={onPay} disabled={blockedReason !== null}>
          {t('screenDisplay.register.pay')}
        </button>
      </div>
    </section>
  )
}
