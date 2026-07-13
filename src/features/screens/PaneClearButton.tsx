import { useLanguage } from '../../i18n'
import './PaneCornerButton.scss'

interface PaneClearButtonProps {
  onClick: () => void
}

/**
 * Hover-revealed pill button in a pane's own top-left corner that resets its
 * content/background/text-size straight back to a fresh blank `ScreenSlot`
 * — independent of the pane arrangement itself, unlike `PaneDeleteButton`.
 * Shares `PaneEditButton`'s own touch-safety/pressed-state conventions (see
 * `PaneCornerButton.scss`).
 */
export function PaneClearButton({ onClick }: PaneClearButtonProps) {
  const { t } = useLanguage()

  return (
    <button
      type="button"
      className="pane-corner-button pane-corner-button--clear"
      aria-label={t('admin.screens.clearPaneButton')}
      title={t('admin.screens.clearPaneButton')}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      {t('admin.screens.clearPaneButton')}
    </button>
  )
}
