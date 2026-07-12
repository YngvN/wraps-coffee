import { Button } from '../../components'
import { useLanguage } from '../../i18n'
import './KeepEditPrompt.scss'

/** Which categories of a slot's fields (or, for `layout`, the screen's own arrangement dividers) changed during one editing session — see `ScreenDisplay`'s own diffing, which builds this by comparing the draft against the snapshot captured when the editor opened, or (for `layout`) the ratios captured when a divider drag first started. */
export interface SlotEditChanges {
  content: boolean
  textSizes: boolean
  backgroundColor: boolean
  backgroundImage: boolean
  /** Whether a pane's own language override changed. */
  language: boolean
  /** Whether a pane divider was dragged to a new position — set outside of any slot editor session, since resizing happens directly on the live view (see `ScreenDisplay`'s resize fallback prompt). */
  layout: boolean
}

interface KeepEditPromptProps {
  changes: SlotEditChanges
  /** Persists the edit at the currently active stage only — the default, pre-existing "Done" behavior. */
  onKeepHere: () => void
  /** Persists the edit at the currently active stage, then overwrites every later stage's own checkpoint for this same slot with the identical result. */
  onKeepForNextSteps: () => void
  /** Discards every change made this editing session, reverting to how the slot looked when it was opened. */
  onRemoveEdits: () => void
}

/**
 * Shown in place of `SlotEditor` once its "Done" is pressed on a slot with
 * more than one stage and at least one real change to report — asks whether
 * this edit should also overwrite every later stage's own settings for this
 * same pane, since a step is often meant to look the same as the ones after
 * it. `changes` drives a plain-language summary of what was actually
 * touched, so the choice isn't blind.
 */
export function KeepEditPrompt({ changes, onKeepHere, onKeepForNextSteps, onRemoveEdits }: KeepEditPromptProps) {
  const { t } = useLanguage()

  const summaryItems = [
    changes.content && t('screenDisplay.keepEditPrompt.summaryContent'),
    changes.textSizes && t('screenDisplay.keepEditPrompt.summaryTextSize'),
    changes.backgroundColor && t('screenDisplay.keepEditPrompt.summaryBackgroundColor'),
    changes.backgroundImage && t('screenDisplay.keepEditPrompt.summaryBackgroundImage'),
    changes.language && t('screenDisplay.keepEditPrompt.summaryLanguage'),
    changes.layout && t('screenDisplay.keepEditPrompt.summaryLayout'),
  ].filter((item): item is string => Boolean(item))

  return (
    <div className="keep-edit-prompt">
      <p className="keep-edit-prompt__intro">{t('screenDisplay.keepEditPrompt.intro')}</p>
      {summaryItems.length > 0 && (
        <ul className="keep-edit-prompt__summary">
          {summaryItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      <p className="keep-edit-prompt__question">{t('screenDisplay.keepEditPrompt.question')}</p>

      <div className="keep-edit-prompt__actions">
        <Button type="button" onClick={onKeepHere}>
          {t('screenDisplay.keepEditPrompt.keepHereButton')}
        </Button>
        <Button type="button" variant="secondary" onClick={onKeepForNextSteps}>
          {t('screenDisplay.keepEditPrompt.keepForNextStepsButton')}
        </Button>
        <Button type="button" variant="secondary" onClick={onRemoveEdits}>
          {t('screenDisplay.keepEditPrompt.removeEditsButton')}
        </Button>
      </div>
    </div>
  )
}
