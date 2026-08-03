import { Button } from '../../../components'
import { useLanguage } from '../../../i18n'
import './AssistantDraftQualityGate.scss'

interface AssistantDraftQualityGateProps {
  /** One line per staged record (already capped/truncated by the caller — see `AssistantPanel`'s "…og N til" handling for a batch of more than 5). */
  summaryLines: string[]
  fieldsNeedingReviewCount: number
  onSeeDetails: () => void
  onTryAgain: () => void
  onCancel: () => void
}

/**
 * Shown instead of the normal review form/batch review whenever a create/update draft was produced
 * under `'safe'` ingestion posture (see `AssistantIngestionPosture`) — a compact "is this draft even
 * worth reviewing?" checkpoint before dropping the admin into a full field-by-field form. Not a
 * "was this correct?" yes/no: the three actions below say what they do, keeping the admin in the
 * driver's seat rather than validating individual model claims one at a time.
 */
export function AssistantDraftQualityGate({ summaryLines, fieldsNeedingReviewCount, onSeeDetails, onTryAgain, onCancel }: AssistantDraftQualityGateProps) {
  const { t } = useLanguage()
  return (
    <div className="assistant-draft-quality-gate">
      <ul className="assistant-draft-quality-gate__summary">
        {summaryLines.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
      {fieldsNeedingReviewCount > 0 && (
        <p className="assistant-draft-quality-gate__count">{t('admin.assistant.ingest.gateFieldsNeedingReview', { count: fieldsNeedingReviewCount })}</p>
      )}
      <div className="assistant-panel__actions">
        <Button type="button" onClick={onSeeDetails}>
          {t('admin.assistant.ingest.gateSeeDetails')}
        </Button>
        <Button type="button" variant="secondary" onClick={onTryAgain}>
          {t('admin.assistant.ingest.gateTryAgain')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('admin.assistant.ingest.gateCancel')}
        </Button>
      </div>
    </div>
  )
}
