import { TrashIcon } from '../../screens/TrashIcon'
import { Button } from '../../../components'
import { useLanguage } from '../../../i18n'
import { EditIcon } from './EditIcon'

interface EditDeleteButtonsProps {
  onEdit: () => void
  onDelete: () => void
}

/**
 * The Edit/Delete action pair shared by every row across the catalogue,
 * category and product lists — a text label alongside its own icon on
 * regular screens, icon-only (the label hidden via `.products-view__button-label`'s
 * own media query) on narrow ones, where a full text button pair doesn't fit
 * comfortably next to a row's other content. The icon stays regardless, so
 * the action is still recognizable at a glance; `aria-label` keeps it
 * announced correctly either way.
 */
export function EditDeleteButtons({ onEdit, onDelete }: EditDeleteButtonsProps) {
  const { t } = useLanguage()
  return (
    <>
      <Button variant="secondary" className="products-view__icon-button" onClick={onEdit} aria-label={t('admin.common.edit')}>
        <EditIcon />
        <span className="products-view__button-label">{t('admin.common.edit')}</span>
      </Button>
      <Button variant="secondary" className="products-view__icon-button" onClick={onDelete} aria-label={t('admin.common.delete')}>
        <TrashIcon />
        <span className="products-view__button-label">{t('admin.common.delete')}</span>
      </Button>
    </>
  )
}
