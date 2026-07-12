import { useLanguage } from '../../i18n'
import './PaneEditButton.scss'

interface PaneEditButtonProps {
  onClick: () => void
}

/**
 * Invisible full-pane button, overlaid on one of `SplitLayout`'s own panes,
 * that opens the combined "Edit pane" panel scoped to just that pane —
 * tinting the whole pane on hover instead of revealing a small corner chip,
 * so the entire pane reads as the click target rather than one small spot on
 * it. A real `<button>`, not a `<div onClick>`, so Tab + Enter opens it the
 * same way a click does, for free. Its parent must set `position: relative`
 * (or already be positioned), since this fills it via `inset: 0`.
 */
export function PaneEditButton({ onClick }: PaneEditButtonProps) {
  const { t } = useLanguage()

  return (
    <button
      type="button"
      className="pane-edit-button"
      aria-label={t('screenDisplay.editSlot')}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    />
  )
}
