import { motion } from 'framer-motion'
import { Card, TranslatedText } from '../../../components'
import { useProducts } from '../../../hooks/useProducts'
import { useLanguage } from '../../../i18n'
import { mockStats, mockTopSellerOrderCounts } from './mockStats'
import { StatTile } from './StatTile'
import './OverviewView.scss'

/** Cafe-relevant statistics for the owner: revenue, orders, weekly customers and top sellers. All values are mock/placeholder — there's no real transactional backend yet. */
export function OverviewView() {
  const { t, language } = useLanguage()
  const [products] = useProducts()
  const topItems = products.slice(0, mockTopSellerOrderCounts.length)

  return (
    <div className="overview-view">
      <TranslatedText as="h1" id="admin.overview.title" />
      <div className="overview-view__tiles">
        {[
          { label: t('admin.overview.revenueToday'), value: `${mockStats.revenueToday.value.toLocaleString(language)} kr`, stat: mockStats.revenueToday },
          { label: t('admin.overview.ordersToday'), value: mockStats.ordersToday.value.toLocaleString(language), stat: mockStats.ordersToday },
          { label: t('admin.overview.weeklyCustomers'), value: mockStats.weeklyCustomers.value.toLocaleString(language), stat: mockStats.weeklyCustomers },
        ].map((tile, index) => (
          <motion.div
            key={tile.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.05 }}
          >
            <StatTile label={tile.label} value={tile.value} deltaPct={tile.stat.deltaPct} trend={tile.stat.trend} />
          </motion.div>
        ))}
      </div>

      <Card title={t('admin.overview.topItems')} className="overview-view__top-items">
        <ol>
          {topItems.map((product, index) => (
            <li key={product.itemID}>
              <span>{product.name[language]}</span>
              <span>{mockTopSellerOrderCounts[index]}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}
