import { TrashIcon } from '../../components'
import { useLanguage } from '../../i18n'
import './PaneCornerButton.scss'

interface PaneDeleteButtonProps {
  onClick: () => void
}

/**
 * Hover-revealed pill button in a pane's own top-right corner that deletes
 * it, handing its own freed space to its sibling subtree — never rendered
 * at all when the pane is the tree's only leaf (see `LayoutPane`'s own
 * `canDelete`). Shares `PaneEditButton`'s own touch-safety/pressed-state
 * conventions (see `PaneCornerButton.scss`).
 */
export function PaneDeleteButton({ onClick }: PaneDeleteButtonProps) {
  const { t } = useLanguage()

  return (
    <button
      type="button"
      className="pane-corner-button pane-corner-button--delete"
      aria-label={t('admin.screens.deletePaneButton')}
      title={t('admin.screens.deletePaneButton')}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      <TrashIcon />
    </button>
  )
}
