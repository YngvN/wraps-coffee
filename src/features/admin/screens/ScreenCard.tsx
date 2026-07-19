import { useState, type CSSProperties } from 'react'
import { Badge, CopyIcon, EditDeleteButtons } from '../../../components'
import { useLanguage, type LanguageCode } from '../../../i18n'
import { DEFAULT_SCREEN_BACKGROUND_COLOR, type ScreenConfig } from '../../../types/screen'
import { getScreenColorVars } from '../../../utils/screenColors'
import { getPersistedSlotTextSizes } from '../../../utils/screenStages'
import { resolveContentTextSizes } from '../../../utils/textSizeVars'
import { NextStepIcon } from '../../screens/NextStepIcon'
import { PreviousStepIcon } from '../../screens/PreviousStepIcon'
import { ScaledScreenPreview } from '../../screens/ScaledScreenPreview'
import { SplitLayout } from '../../screens/SplitLayout'
import './ScreenCard.scss'

interface ScreenCardProps {
  screen: ScreenConfig
  url: string
  editorUrl: string
  defaultPaneLanguage: LanguageCode
  slotCountLabel: string
  copied: boolean
  onCopy: () => void
  onOpen: () => void
  onOpenEditor: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}

/**
 * One screen's own card in the admin Screens list: a real, read-only
 * `SplitLayout` preview on top (the exact same live renderer the screen
 * editor's "Layout" tab uses — not an abstract diagram), letterboxed into a
 * fixed-size box via `ScaledScreenPreview`'s own `fit="contain"` mode so
 * every card is the same size regardless of the screen's own
 * `previewAspectRatio`. A screen with more than one step gets its own
 * previous/next stepper overlaid on the preview (local to this one card —
 * switching another card's step never affects this one) so a multi-step
 * screen's other steps can be glanced at without opening the editor. Below
 * the preview, a footer repeats the name/badges/URL, an "Editor" link (opens
 * the screen's own dedicated `/screens/editor/:screenId` display, the only
 * URL that ever offers the in-place editing toolbar — distinct from "Open,"
 * which opens the plain, always read-only `/screens/:screenId` URL and
 * additionally requests fullscreen/autoplay for a real kiosk deployment)
 * alongside it, and the Edit/Duplicate/Delete actions this list has always
 * had ("Edit" there opens this dashboard's own form, not the live display).
 */
export function ScreenCard({ screen, url, editorUrl, defaultPaneLanguage, slotCountLabel, copied, onCopy, onOpen, onOpenEditor, onEdit, onDuplicate, onDelete }: ScreenCardProps) {
  const { t } = useLanguage()
  const [previewStage, setPreviewStage] = useState(1)
  const stageCount = screen.stageCount ?? 1
  const hasMultipleStages = Boolean(screen.useStages) && stageCount > 1

  const goToPreviousStage = () => setPreviewStage((current) => (current === 1 ? stageCount : current - 1))
  const goToNextStage = () => setPreviewStage((current) => (current === stageCount ? 1 : current + 1))

  return (
    <div className="screen-card">
      <div className="screen-card__preview" style={getScreenColorVars(screen.backgroundColor ?? DEFAULT_SCREEN_BACKGROUND_COLOR) as CSSProperties}>
        <ScaledScreenPreview aspectRatio={screen.previewAspectRatio} fit="contain">
          <SplitLayout
            screen={screen}
            resolveTextSizes={(leafId, stage, content) => resolveContentTextSizes(content, getPersistedSlotTextSizes(screen, leafId, stage))}
            stage={hasMultipleStages ? previewStage : 1}
            defaultPaneLanguage={defaultPaneLanguage}
          />
        </ScaledScreenPreview>
        {hasMultipleStages && (
          <div className="screen-card__stage-stepper">
            <button type="button" className="screen-card__stage-button" onClick={goToPreviousStage} aria-label={t('screenDisplay.previousStage')} title={t('screenDisplay.previousStage')}>
              <PreviousStepIcon />
            </button>
            <span className="screen-card__stage-label">{t('screenDisplay.stageIndicator', { current: previewStage, total: stageCount })}</span>
            <button type="button" className="screen-card__stage-button" onClick={goToNextStage} aria-label={t('screenDisplay.nextStage')} title={t('screenDisplay.nextStage')}>
              <NextStepIcon />
            </button>
          </div>
        )}
      </div>
      <div className="screen-card__footer">
        <div className="screen-card__info">
          <span className="screen-card__name">{screen.name}</span>
          <Badge variant="info">{slotCountLabel}</Badge>
          {hasMultipleStages && <Badge variant="info">{t('admin.screens.stageCountBadge', { count: stageCount })}</Badge>}
        </div>
        <div className="screen-card__url">
          <button type="button" className="screen-card__url-code" onClick={onCopy}>
            <CopyIcon />
            <code>{url}</code>
          </button>
          {copied && <span className="screen-card__url-copied">{t('admin.screens.urlCopied')}</span>}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => {
              event.preventDefault()
              onOpen()
            }}
          >
            {t('admin.screens.openInNewTab')}
          </a>
          <a
            href={editorUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => {
              event.preventDefault()
              onOpenEditor()
            }}
          >
            {t('admin.screens.openEditorLink')}
          </a>
        </div>
        <div className="screen-card__actions">
          <EditDeleteButtons onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} />
        </div>
      </div>
    </div>
  )
}
