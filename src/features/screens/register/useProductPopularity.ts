import { useMemo } from 'react'
import { useFoodoraOrders } from '../../../hooks/useFoodoraOrders'
import { useOrders } from '../../../hooks/useOrders'
import { useRegisterOrders } from '../../../hooks/useRegisterOrders'
import { useWoltOrders } from '../../../hooks/useWoltOrders'
import { productPopularity } from './productList'

/**
 * Units sold per product over the last 30 days, across counter sales, website, Wolt and Foodora orders —
 * for the register's "most popular" sort. Recalculated whenever the orders change, which keeps it
 * roughly current without a timer.
 */
export function useProductPopularity(): Map<string, number> {
  const [websiteOrders] = useOrders()
  const [registerOrders] = useRegisterOrders()
  const [woltOrders] = useWoltOrders()
  const [foodoraOrders] = useFoodoraOrders()
  return useMemo(
    () => productPopularity([...websiteOrders, ...registerOrders, ...woltOrders, ...foodoraOrders], new Date()),
    [websiteOrders, registerOrders, woltOrders, foodoraOrders],
  )
}
