/** A single stat tile's mock data: a current value, its change vs. last week, and a 7-day trend (Mon-first). */
export interface MockStat {
  value: number
  deltaPct: number
  trend: number[]
}

/** Placeholder cafe statistics — there's no real transactional backend yet, so these are static mock numbers. */
export const mockStats = {
  revenueToday: { value: 4280, deltaPct: 8.4, trend: [3200, 3400, 3100, 3900, 4000, 3950, 4280] } satisfies MockStat,
  ordersToday: { value: 62, deltaPct: -3.1, trend: [58, 70, 65, 60, 64, 59, 62] } satisfies MockStat,
  weeklyCustomers: { value: 410, deltaPct: 5.6, trend: [52, 48, 60, 55, 63, 66, 66] } satisfies MockStat,
}

/** Mock order counts for the top-selling items list, paired with real product IDs at render time. */
export const mockTopSellerOrderCounts = [58, 47, 39]
