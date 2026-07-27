import { Button } from '../../../components'
import { useLanguage } from '../../../i18n'
import type { ReviewChangeRow } from './reviewChangeRows'
import './AssistantReviewSummary.scss'

interface AssistantReviewSummaryProps {
  rows: ReviewChangeRow[]
  onConfirm: () => void
  onEdit: () => void
  onCancel: () => void
}

/**
 * The default review UI for an AI-proposed create/update: a compact
 * `label: old → new` list instead of the full form — an "Edit" button drops
 * into the real form (unchanged, still mounted by `AssistantPanel.tsx`)
 * for whoever wants to hand-edit a value instead of just confirming. A row
 * with `oldValue: null` (a brand-new record, or one newly-appended item in
 * an append-only list like theme colors) renders without an arrow.
 */
export function AssistantReviewSummary({ rows, onConfirm, onEdit, onCancel }: AssistantReviewSummaryProps) {
  const { t } = useLanguage()
  return (
    <div className="assistant-review-summary">
      {rows.length === 0 ? (
        <p className="assistant-review-summary__empty">{t('admin.assistant.review.noChanges')}</p>
      ) : (
        <ul className="assistant-review-summary__list">
          {rows.map((row, index) => (
            <li key={index} className="assistant-review-summary__row">
              <span className="assistant-review-summary__label">{row.label}</span>
              <span className="assistant-review-summary__value">
                {row.oldValue !== null && (
                  <>
                    <span className="assistant-review-summary__old">{row.oldValue}</span>
                    <span className="assistant-review-summary__arrow" aria-hidden="true">
                      →
                    </span>
                  </>
                )}
                <span className="assistant-review-summary__new">{row.newValue}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="assistant-panel__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('admin.assistant.cancel')}
        </Button>
        <Button type="button" variant="secondary" onClick={onEdit}>
          {t('admin.common.edit')}
        </Button>
        <Button type="button" onClick={onConfirm}>
          {t('admin.assistant.confirmButton')}
        </Button>
      </div>
    </div>
  )
}
