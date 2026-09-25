import { useDeviceSetting } from './useDeviceSetting'

/** The staff board's own light/dark look — independent of the screen's colours and the app theme. */
export type OrdersTheme = 'light' | 'dark'

/** The staff order board's light/dark choice, picked from its own ⚙ menu and remembered per device (see `useDeviceSetting`). */
export function useOrdersTheme(): [OrdersTheme, (theme: OrdersTheme) => void] {
  return useDeviceSetting<OrdersTheme>('ordersBoard.theme', (stored) => (stored === 'dark' ? 'dark' : 'light'), 'light')
}
