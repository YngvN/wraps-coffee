import { useLanguage } from '../../i18n'
import './SlotEditButton.scss'

interface SlotEditButtonProps {
  onClick: () => void
}

/**
 * Small button revealed on hover over an individual slot's pane (in split
 * layout) or the currently visible slide (in slideshow layout), opening the
 * text-size editor scoped to just that slot. Its parent must set
 * `position: relative` (or already be positioned) and reveal it via a
 * `@media (hover: hover)` `:hover` rule, since it's hidden by default here.
 */
export function SlotEditButton({ onClick }: SlotEditButtonProps) {
  const { t } = useLanguage()

  return (
    <button
      type="button"
      className="slot-edit-button"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      {t('screenDisplay.editSlotSizes')}
    </button>
  )
}
