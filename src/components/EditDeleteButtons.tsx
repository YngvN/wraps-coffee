import { useLanguage } from '../i18n'
import { Button } from './Button'
import { CopyIcon } from './CopyIcon'
import { EditIcon } from './EditIcon'
import './EditDeleteButtons.scss'
import { TrashIcon } from './TrashIcon'

interface EditDeleteButtonsProps {
  onEdit: () => void
  /** Adds a "Duplicate" button between Edit and Delete — e.g. the Screens list, whose cards need a copy action the Products/Events lists don't. Omit (as they do) for a plain Edit/Delete pair. */
  onDuplicate?: () => void
  onDelete: () => void
}

/**
 * The Edit/(optionally Duplicate)/Delete action set shared by every
 * row-based admin list (the Products catalogue/category/product lists, the
 * Events list, the Screens list) — a text label alongside its own icon on
 * regular screens, icon-only (the label hidden via
 * `.edit-delete-buttons__label`'s own media query) on narrow ones, where a
 * full text button set doesn't fit comfortably next to a row's other
 * content. The icon stays regardless, so the action is still recognizable
 * at a glance; `aria-label` keeps it announced correctly either way.
 */
export function EditDeleteButtons({ onEdit, onDuplicate, onDelete }: EditDeleteButtonsProps) {
  const { t } = useLanguage()
  return (
    <>
      <Button variant="secondary" className="edit-delete-buttons__button" onClick={onEdit} aria-label={t('admin.common.edit')}>
        <EditIcon />
        <span className="edit-delete-buttons__label">{t('admin.common.edit')}</span>
      </Button>
      {onDuplicate && (
        <Button variant="secondary" className="edit-delete-buttons__button" onClick={onDuplicate} aria-label={t('admin.common.duplicate')}>
          <CopyIcon />
          <span className="edit-delete-buttons__label">{t('admin.common.duplicate')}</span>
        </Button>
      )}
      <Button variant="secondary" className="edit-delete-buttons__button" onClick={onDelete} aria-label={t('admin.common.delete')}>
        <TrashIcon />
        <span className="edit-delete-buttons__label">{t('admin.common.delete')}</span>
      </Button>
    </>
  )
}
