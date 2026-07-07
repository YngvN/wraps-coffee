import { useLanguage } from '../../i18n'
import './SlotSlideTabs.scss'

interface SlotSlideTabsProps {
  /** How many slide tabs to render, one per entry in the slot's own `contents` (regardless of which are actually active). */
  slideCount: number
  activeTab: 'global' | number
  onActiveTabChange: (tab: 'global' | number) => void
  onAddSlide: () => void
}

/**
 * Tab bar for one slideshow-enabled slot's own editing surface: a "Global"
 * tab for the slot's own shared settings (background color/image, and,
 * where shown, its shared text size), plus one tab per slide it rotates
 * through, and a trailing "+ Add slide" button. Shared by the on-screen
 * "Edit slot" panel and the admin dashboard's per-slot tab, so a slot looks
 * and works the same wherever it's configured from — mirroring the outer
 * "Global + one tab per slot" pattern the admin dashboard's screen form
 * already uses one level up, just nested one level deeper for a single
 * slot's own slides.
 */
export function SlotSlideTabs({ slideCount, activeTab, onActiveTabChange, onAddSlide }: SlotSlideTabsProps) {
  const { t } = useLanguage()

  return (
    <div className="slot-slide-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'global'}
        className={`slot-slide-tabs__tab${activeTab === 'global' ? ' slot-slide-tabs__tab--active' : ''}`}
        onClick={() => onActiveTabChange('global')}
      >
        {t('screenDisplay.textSizeEditor.slotGlobalTabLabel')}
      </button>
      {Array.from({ length: slideCount }, (_, index) => (
        <button
          key={index}
          type="button"
          role="tab"
          aria-selected={activeTab === index}
          className={`slot-slide-tabs__tab${activeTab === index ? ' slot-slide-tabs__tab--active' : ''}`}
          onClick={() => onActiveTabChange(index)}
        >
          {t('screenDisplay.textSizeEditor.slideTabLabel', { number: index + 1 })}
        </button>
      ))}
      <button type="button" className="slot-slide-tabs__tab slot-slide-tabs__tab--add" onClick={onAddSlide}>
        {t('admin.screens.addSlide')}
      </button>
    </div>
  )
}
