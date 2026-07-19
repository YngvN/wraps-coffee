import { motion } from 'framer-motion'
import { LockIcon } from '../../components'
import { useLanguage } from '../../i18n'
import './PaneCornerButton.scss'
import './PaneLockButton.scss'

interface PaneLockButtonProps {
  locked: boolean
  onClick: () => void
}

/**
 * Toggles a pane's own lock (see `resolveSlotLocked`) — purely an
 * accidental-edit guard for an admin already in the editor, not a security
 * boundary, so unlocking is just this same button again, no confirmation or
 * PIN. While unlocked, renders as a small hover-revealed pill in the pane's
 * own bottom-left corner (the one free corner — top-left is
 * `PaneClearButton`, top-right is `PaneDeleteButton`), matching
 * `PaneDeleteButton`'s own icon-button convention. Once locked, every other
 * hover affordance on this pane is gone (see `LayoutTree.tsx`'s own
 * per-leaf gating), so this instead renders centered and bigger — still
 * only revealed on hovering the pane, same as every other button here, just
 * a much easier target once it's the only one left. `layout`
 * (framer-motion) animates the move between the two positions/sizes itself
 * — since both states are the exact same element, just re-classed, there's
 * nothing else to wire up for the slide.
 */
export function PaneLockButton({ locked, onClick }: PaneLockButtonProps) {
  const { t } = useLanguage()
  const label = t(locked ? 'admin.screens.unlockPaneButton' : 'admin.screens.lockPaneButton')

  return (
    <motion.button
      layout
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      type="button"
      className={locked ? 'pane-lock-button pane-lock-button--centered' : 'pane-corner-button pane-corner-button--lock'}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      <LockIcon locked={locked} />
    </motion.button>
  )
}
