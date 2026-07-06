import { Alert, Card, TranslatedText } from '../../../components'
import { useLanguage } from '../../../i18n'
import './OrdersView.scss'

/** Placeholder Orders view — order management isn't implemented yet. */
export function OrdersView() {
  const { t } = useLanguage()

  return (
    <div className="orders-view">
      <TranslatedText as="h1" id="admin.orders.title" />
      <Card>
        <Alert variant="info">{t('admin.orders.comingSoon')}</Alert>
      </Card>
    </div>
  )
}
