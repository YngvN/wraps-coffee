import { motion } from 'framer-motion'
import { Card, TranslatedText } from '../../../components'
import { useLanguage } from '../../../i18n'
import { StatTile } from './StatTile'
import './OverviewView.scss'

/** Cafe-relevant statistics for the owner: revenue, orders, and weekly customers. There's no real transactional backend yet to source these from, so every tile shows a real `0` with a "no data yet" footer instead of a fabricated delta/trend — see `StatTile`'s own `noDataLabel`. */
export function OverviewView() {
  const { t } = useLanguage()
  const noDataLabel = t('admin.overview.noDataYet')

  return (
    <div className="overview-view">
      <TranslatedText as="h1" id="admin.overview.title" />
      <TranslatedText as="p" id="admin.overview.description" className="admin-page-description" />
      <div className="overview-view__tiles">
        {[
          { label: t('admin.overview.revenueToday'), value: '0 kr' },
          { label: t('admin.overview.ordersToday'), value: '0' },
          { label: t('admin.overview.weeklyCustomers'), value: '0' },
        ].map((tile, index) => (
          <motion.div
            key={tile.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.05 }}
          >
            <StatTile label={tile.label} value={tile.value} noDataLabel={noDataLabel} />
          </motion.div>
        ))}
      </div>

      <Card title={t('admin.overview.topItems')} className="overview-view__top-items">
        <p className="overview-view__no-data">{t('admin.overview.noSalesData')}</p>
      </Card>
    </div>
  )
}
