import { Button } from '../../../components'
import { useLanguage } from '../../../i18n'
import { AssistantReviewSummary } from './AssistantReviewSummary'
import type { ReviewChangeRow } from './reviewChangeRows'
import './AssistantBatchReview.scss'

export interface AssistantBatchReviewCard {
  key: string
  rows: ReviewChangeRow[]
  hasBlockingIssues: boolean
  onConfirm: () => void
  onEdit: () => void
  onDelete: () => void
}

interface AssistantBatchReviewProps {
  cards: AssistantBatchReviewCard[]
  onConfirmAll: () => void
  onCancelAll: () => void
}

/**
 * The list-of-cards review for a 2+ record ingestion result (see `useAssistantFlow.ts`'s own
 * `'reviewingBatch'` state) — one `AssistantReviewSummary` per staged record, all shown together
 * (never sequential, same "batch every choice into one screen" posture the clarification UI
 * already has), each with its own Confirm/Edit/Delete, plus a batch-level "Confirm all"/"Cancel
 * all" pair. "Confirm all" is disabled whenever any card still has a blocking issue — a
 * deliberately stricter rule than a single record's own Confirm (never gated on issues at all),
 * since this is a bulk-approve shortcut rather than a considered one-at-a-time review.
 */
export function AssistantBatchReview({ cards, onConfirmAll, onCancelAll }: AssistantBatchReviewProps) {
  const { t } = useLanguage()
  const confirmAllDisabled = cards.some((card) => card.hasBlockingIssues)
  return (
    <div className="assistant-batch-review">
      <p className="assistant-batch-review__count">{t('admin.assistant.ingest.batchCount', { count: cards.length })}</p>
      <div className="assistant-batch-review__cards">
        {cards.map((card) => (
          <div key={card.key} className="assistant-batch-review__card">
            <AssistantReviewSummary rows={card.rows} onConfirm={card.onConfirm} onEdit={card.onEdit} onCancel={card.onDelete} cancelLabel={t('admin.assistant.ingest.batchRemoveOne')} />
          </div>
        ))}
      </div>
      <div className="assistant-panel__actions">
        <Button type="button" variant="secondary" onClick={onCancelAll}>
          {t('admin.assistant.ingest.batchCancelAll')}
        </Button>
        <Button
          type="button"
          onClick={onConfirmAll}
          disabled={confirmAllDisabled}
          title={confirmAllDisabled ? t('admin.assistant.ingest.batchConfirmAllDisabledHint') : undefined}
        >
          {t('admin.assistant.ingest.batchConfirmAll')}
        </Button>
      </div>
    </div>
  )
}
