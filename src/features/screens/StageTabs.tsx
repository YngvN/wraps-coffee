import { useLanguage } from '../../i18n'
import './StageTabs.scss'

interface StageTabsProps {
  stageCount: number
  activeStage: number
  onActiveStageChange: (stage: number) => void
}

/**
 * Tab bar for jumping between a screen's shared stages (1-`stageCount`) —
 * shared by the admin dashboard's screen form and the on-screen "Edit slot"
 * panel, so switching stages looks and works the same wherever it's done
 * from. Unlike the old per-slot slide tabs this replaces, there's no
 * "Global" tab (every stage is the same kind of thing) and no add/remove
 * button (the stage count itself is edited separately, in the screen's own
 * "Stages" settings) — this is purely a fixed `1..stageCount` picker.
 */
export function StageTabs({ stageCount, activeStage, onActiveStageChange }: StageTabsProps) {
  const { t } = useLanguage()

  return (
    <div className="stage-tabs" role="tablist">
      {Array.from({ length: stageCount }, (_, index) => {
        const stage = index + 1
        return (
          <button
            key={stage}
            type="button"
            role="tab"
            aria-selected={activeStage === stage}
            className={`stage-tabs__tab${activeStage === stage ? ' stage-tabs__tab--active' : ''}`}
            onClick={() => onActiveStageChange(stage)}
          >
            {t('screenDisplay.textSizeEditor.stageTabLabel', { number: stage })}
          </button>
        )
      })}
    </div>
  )
}
