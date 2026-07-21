import { CheckIcon } from '../../components'
import { useLanguage } from '../../i18n'
import './PaneCornerButton.scss'

interface PaneSelectCheckboxProps {
  selected: boolean
  onToggle: () => void
}

/**
 * Hover-revealed pill toggle in a pane's own top-left corner (where
 * `PaneClearButton` used to sit — see `PaneCornerButton.scss`'s own
 * `--top-right` group it moved into) that checks/unchecks this pane for the
 * toolbar's own multi-pane actions ("Delete selected"/"Group" — see
 * `ScreenToolbar`). Shares `PaneEditButton`'s own touch-safety/pressed-state
 * conventions, same as every other corner button here.
 */
export function PaneSelectCheckbox({ selected, onToggle }: PaneSelectCheckboxProps) {
  const { t } = useLanguage()
  const label = t(selected ? 'admin.screens.deselectPaneButton' : 'admin.screens.selectPaneButton')

  return (
    <button
      type="button"
      className={`pane-corner-button pane-corner-button--select${selected ? ' pane-corner-button--select-active' : ''}`}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
    >
      {selected && <CheckIcon />}
    </button>
  )
}
