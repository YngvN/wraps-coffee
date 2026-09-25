import { availableLanguages, type LanguageCode } from '../../../i18n'
import { useDeviceSetting } from './useDeviceSetting'

/** A language code, or `'auto'` — follow the pane's own language (the screen's standard pane language, or this pane's override). */
export type OrdersLanguage = LanguageCode | 'auto'

/** The staff order board's language, picked from its ⚙ menu and remembered per device (see `useDeviceSetting`). A stored code that no longer exists in `languages.json` falls back to `'auto'`. */
export function useOrdersLanguage(): [OrdersLanguage, (language: OrdersLanguage) => void] {
  return useDeviceSetting<OrdersLanguage>(
    'ordersBoard.language',
    (stored) => (availableLanguages.some((option) => option.code === stored) ? (stored as LanguageCode) : 'auto'),
    'auto',
  )
}
